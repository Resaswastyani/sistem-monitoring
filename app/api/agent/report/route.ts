import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { robots, accounts, trades } from '@/lib/db/schema'

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

  await db.update(robots).set({
    status: robotPayload.active ? 'Running' : 'Stopped',
    orders: robotPayload.openPositions,
    lastSeenAt: new Date(),
    lastMessage: robotPayload.message ?? null,
  }).where(eq(robots.id, robot.id))

  await db.update(accounts).set({
    balance: account.balance,
    equity: account.equity,
    margin: account.margin ?? 0,
    pnl: account.profit ?? 0,
  }).where(eq(accounts.id, robot.accountId))

  let inserted = 0
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

  return NextResponse.json({ ok: true, tradesInserted: inserted })
}
