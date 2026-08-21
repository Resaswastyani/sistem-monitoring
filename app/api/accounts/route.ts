import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const rows = await db.select().from(accounts)
  return NextResponse.json({ accounts: rows })
}

const createSchema = z.object({
  broker: z.string().min(1),
  accountNumber: z.string().min(1),
  vpsId: z.string().uuid().nullable().optional(),
  balance: z.coerce.number().nonnegative(),
})

export async function POST(req: Request) {
  const { response } = await requireUser()
  if (response) return response

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { broker, accountNumber, vpsId, balance } = parsed.data

  const [row] = await db.insert(accounts).values({
    label: `${broker} · ${accountNumber}`,
    broker,
    accountNumber,
    status: 'Active',
    equity: balance,
    balance,
    pnl: 0,
    trades: 0,
    winRate: 0,
    margin: 0,
    vpsId: vpsId ?? null,
  }).returning()

  return NextResponse.json({ account: row }, { status: 201 })
}
