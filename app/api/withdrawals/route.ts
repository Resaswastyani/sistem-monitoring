import { NextResponse } from 'next/server'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { withdrawals } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { notifyEvent, accountContext } from '@/lib/notify/whatsapp'

export async function GET() {
  const rows = await db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt))
  return NextResponse.json({ withdrawals: rows })
}

const createSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.string().min(1).optional(),
})

export async function POST(req: Request) {
  const { session, response } = await requireUser()
  if (response) return response

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { accountId, amount, method } = parsed.data

  const [row] = await db.insert(withdrawals).values({
    accountId,
    amount,
    method: method ?? 'Bank transfer',
    status: 'pending',
    requestedByUserId: session.userId,
  }).returning()

  await notifyEvent('withdrawal', `🆕 Withdrawal baru diminta\nJumlah: $${amount.toFixed(2)}\nMetode: ${row.method}\n${await accountContext(accountId)}`, { accountId })

  return NextResponse.json({ withdrawal: row }, { status: 201 })
}
