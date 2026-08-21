import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, ne, lt, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { robots, accounts, trades } from '@/lib/db/schema'
import { sendWhatsApp } from '@/lib/notify/fonnte'

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
})

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'Missing X-Api-Key header' }, { status: 401 })

  const [robot] = await db.select().from(robots).where(eq(robots.apiKey, apiKey)).limit(1)
  if (!robot) return NextResponse.json({ error: 'Unknown API key' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  const { account, robot: robotPayload, trades: tradePayload } = parsed.data

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

  let inserted = 0
  let accountLabel: string | null = null
  for (const t of tradePayload ?? []) {
    const [existing] = await db.select({ id: trades.id }).from(trades)
      .where(and(eq(trades.accountId, robot.accountId), eq(trades.tradeRef, t.ticket)))
      .limit(1)
    if (existing) continue
    await db.insert(trades).values({
      accountId: robot.accountId,
      tradeRef: t.ticket,
      symbol: t.symbol,
      side: t.side,
      lots: t.lots,
      openPrice: t.openPrice,
      closePrice: t.closePrice,
      pnl: t.pnl,
      openedAt: t.closedAt ? new Date(t.closedAt) : new Date(),
    })
    inserted++

    if (accountLabel === null) {
      const [acc] = await db.select({ label: accounts.label }).from(accounts).where(eq(accounts.id, robot.accountId)).limit(1)
      accountLabel = acc?.label ?? robot.accountId
    }
    const resultLabel = t.pnl >= 0 ? '✅ WIN' : '❌ LOSS'
    await sendWhatsApp('tradeClosed',
      `${resultLabel} ${t.symbol} ${t.side} ${t.lots.toFixed(2)} lot\nP/L: ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}\nAkun: ${accountLabel}\nRobot: ${robot.name}`)
  }

  if (inserted > 0) {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      wins: sql<number>`count(*) filter (where ${trades.pnl} > 0)`,
    }).from(trades).where(eq(trades.accountId, robot.accountId))
    const total = Number(stats?.total ?? 0)
    const wins = Number(stats?.wins ?? 0)
    const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0
    await db.update(accounts).set({ trades: total, winRate }).where(eq(accounts.id, robot.accountId))
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
    await sendWhatsApp('robotOffline', `⚠️ Robot "${r.name}" belum lapor lebih dari 5 menit.\nTerakhir lapor: ${r.lastSeenAt?.toLocaleString('id-ID')}`)
  }

  return NextResponse.json({ ok: true, tradesInserted: inserted })
}
