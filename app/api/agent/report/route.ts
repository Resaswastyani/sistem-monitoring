import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, ne, lt, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { robots, accounts, trades, withdrawals } from '@/lib/db/schema'
import { notifyEvent, accountContext } from '@/lib/notify/whatsapp'
import { computeProfitShareLedger } from '@/lib/withdrawals/profit-share'

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000

// Machine-to-machine endpoint: an EA (or its VPS agent) reports account and
// robot status here, authenticated with the per-robot API key from the
// dashboard instead of a browser session cookie (see middleware.ts).

const tradeSchema = z.object({
  ticket: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  lots: z.coerce.number().positive(),
  openPrice: z.coerce.number(),
  closePrice: z.coerce.number(),
  pnl: z.coerce.number(),
  closedAt: z.string().optional(),
})

const balanceEventSchema = z.object({
  ticket: z.string().min(1),
  type: z.enum(['withdrawal', 'deposit']),
  amount: z.coerce.number().positive(),
  time: z.string().optional(),
})

const bodySchema = z.object({
  account: z.object({
    balance: z.coerce.number(),
    equity: z.coerce.number(),
    margin: z.coerce.number().optional(),
    profit: z.coerce.number().optional(),
  }),
  robot: z.object({
    active: z.boolean(),
    openPositions: z.coerce.number().int().nonnegative().default(0),
    message: z.string().max(500).optional(),
  }),
  trades: z.array(tradeSchema).max(50).optional(),
  manualTrades: z.array(tradeSchema).max(50).optional(),
  balanceEvents: z.array(balanceEventSchema).max(50).optional(),
})

async function insertTrades(list: z.infer<typeof tradeSchema>[], accountId: string, source: 'robot' | 'manual') {
  let count = 0
  for (const t of list) {
    const [existing] = await db.select({ id: trades.id }).from(trades)
      .where(and(eq(trades.accountId, accountId), eq(trades.tradeRef, t.ticket)))
      .limit(1)
    if (existing) continue
    await db.insert(trades).values({
      accountId,
      tradeRef: t.ticket,
      symbol: t.symbol,
      side: t.side,
      lots: t.lots,
      openPrice: t.openPrice,
      closePrice: t.closePrice,
      pnl: t.pnl,
      source,
      openedAt: t.closedAt ? new Date(t.closedAt) : new Date(),
    })
    count++
  }
  return count
}

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'Missing X-Api-Key header' }, { status: 401 })

  const [robot] = await db.select().from(robots).where(eq(robots.apiKey, apiKey)).limit(1)
  if (!robot) return NextResponse.json({ error: 'Unknown API key' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  const { account, robot: robotPayload, trades: tradePayload, manualTrades: manualPayload, balanceEvents: balancePayload } = parsed.data

  // Robot came back online (or connected for the first time ever) if it was
  // previously flagged offline, or never had a lastSeenAt at all.
  const isRecovery = robot.offlineNotified || robot.lastSeenAt === null

  // Receiving a report at all already proves the EA is attached and alive,
  // whether or not it currently has a position open — "active" only tells
  // us whether it's flat or in a trade, which stays visible via the status
  // message instead. "Stopped" is reserved for a robot that hasn't reported
  // in a while (surfaced client-side from lastSeenAt), not the flat state.
  await db.update(robots).set({
    status: 'Running',
    orders: robotPayload.openPositions,
    lastSeenAt: new Date(),
    lastMessage: robotPayload.message ?? null,
    offlineNotified: false,
  }).where(eq(robots.id, robot.id))

  await db.update(accounts).set({
    balance: account.balance,
    equity: account.equity,
    margin: account.margin ?? 0,
    pnl: account.profit ?? 0,
  }).where(eq(accounts.id, robot.accountId))

  if (isRecovery) {
    await notifyEvent('robot_status', `🟢 Robot "${robot.name}" ONLINE\n${await accountContext(robot.accountId)}`, { accountId: robot.accountId })
  }

  const inserted = await insertTrades(tradePayload ?? [], robot.accountId, 'robot')
  for (const t of tradePayload ?? []) {
    const resultLabel = t.pnl >= 0 ? '✅ WIN' : '❌ LOSS'
    await notifyEvent('trade_closed',
      `${resultLabel} ${t.symbol} ${t.side} ${t.lots.toFixed(2)} lot\nP/L: ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}\nRobot: ${robot.name}\n${await accountContext(robot.accountId)}`,
      { accountId: robot.accountId })
  }

  const manualInserted = await insertTrades(manualPayload ?? [], robot.accountId, 'manual')
  for (const t of manualPayload ?? []) {
    await notifyEvent('manual_trade',
      `⚠️ MANUAL trade terdeteksi (bukan dari robot)\n${t.symbol} ${t.side} ${t.lots.toFixed(2)} lot\nP/L: ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}\n${await accountContext(robot.accountId)}`,
      { accountId: robot.accountId })
  }

  if (inserted > 0) {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      wins: sql<number>`count(*) filter (where ${trades.pnl} > 0)`,
    }).from(trades).where(and(eq(trades.accountId, robot.accountId), eq(trades.source, 'robot')))
    const total = Number(stats?.total ?? 0)
    const wins = Number(stats?.wins ?? 0)
    const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0
    await db.update(accounts).set({ trades: total, winRate }).where(eq(accounts.id, robot.accountId))
  }

  // Balance operations booked directly on the Exness account (withdrawals
  // the client made themselves, outside this dashboard) — recorded as
  // already-completed withdrawals so profit-share still gets computed.
  for (const b of (balancePayload ?? []).filter((e) => e.type === 'withdrawal')) {
    const [existing] = await db.select({ id: withdrawals.id }).from(withdrawals)
      .where(and(eq(withdrawals.accountId, robot.accountId), eq(withdrawals.externalRef, b.ticket)))
      .limit(1)
    if (existing) continue

    const completedAt = b.time ? new Date(b.time) : new Date()
    const [withdrawal] = await db.insert(withdrawals).values({
      accountId: robot.accountId,
      amount: b.amount,
      method: 'Exness (auto-detected)',
      status: 'completed',
      source: 'exness_detected',
      externalRef: b.ticket,
      completedAt,
    }).returning()

    const ledger = await computeProfitShareLedger(withdrawal.id, withdrawal.amount)
    let msg = `🏧 Withdrawal terdeteksi langsung dari Exness\nJumlah: $${b.amount.toFixed(2)}`
    if (ledger.length) {
      msg += '\nSplit profit-sharing:\n' + ledger.map((l) => `- ${l.recipientName}: $${l.amount.toFixed(2)} (${l.percentage}%)`).join('\n')
    }
    msg += `\n${await accountContext(robot.accountId)}`
    await notifyEvent('withdrawal', msg, { accountId: robot.accountId })
  }

  // Piggyback offline detection on incoming reports rather than a cron job:
  // any robot that's gone quiet gets flagged (once) whenever another robot
  // reports in. Won't catch every robot going dark at the same time, but
  // needs no extra infrastructure.
  const staleCutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS)
  const staleRobots = await db.select().from(robots).where(and(
    ne(robots.id, robot.id),
    eq(robots.offlineNotified, false),
    isNotNull(robots.lastSeenAt),
    lt(robots.lastSeenAt, staleCutoff),
  ))
  for (const r of staleRobots) {
    await db.update(robots).set({ offlineNotified: true }).where(eq(robots.id, r.id))
    await notifyEvent('robot_status',
      `🔴 Robot "${r.name}" OFFLINE — belum lapor lebih dari 5 menit.\nTerakhir lapor: ${r.lastSeenAt?.toLocaleString('id-ID')}\n${await accountContext(r.accountId)}`,
      { accountId: r.accountId })
  }

  return NextResponse.json({ ok: true, tradesInserted: inserted, manualTradesInserted: manualInserted })
}
