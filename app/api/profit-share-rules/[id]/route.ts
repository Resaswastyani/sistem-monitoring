import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { profitShareRules } from '@/lib/db/schema'
import { requireUser, requireRole } from '@/lib/auth/guard'

const patchSchema = z.object({
  recipientName: z.string().min(1).optional(),
  percentage: z.coerce.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const [row] = await db.update(profitShareRules).set(parsed.data).where(eq(profitShareRules.id, id)).returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ rule: row })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const { id } = await params
  await db.delete(profitShareRules).where(eq(profitShareRules.id, id))
  return NextResponse.json({ ok: true })
}
