import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const patchSchema = z.object({
  status: z.enum(['Active', 'Paused']).optional(),
  label: z.string().min(1).optional(),
  broker: z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  balance: z.coerce.number().nonnegative().optional(),
  equity: z.coerce.number().nonnegative().optional(),
  vpsId: z.string().uuid().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const [current] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1)
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const values: Partial<typeof accounts.$inferInsert> = { ...parsed.data }
  if ((parsed.data.broker !== undefined || parsed.data.accountNumber !== undefined) && parsed.data.label === undefined) {
    const broker = parsed.data.broker ?? current.broker
    const accountNumber = parsed.data.accountNumber ?? current.accountNumber
    values.label = `${broker} · ${accountNumber}`
  }

  const [row] = await db.update(accounts).set(values).where(eq(accounts.id, id)).returning()
  return NextResponse.json({ account: row })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  await db.delete(accounts).where(eq(accounts.id, id))
  return NextResponse.json({ ok: true })
}
