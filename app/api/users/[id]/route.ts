import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireUser, requireRole } from '@/lib/auth/guard'
import { hashPassword } from '@/lib/auth/password'

const patchSchema = z.object({
  role: z.enum(['owner', 'admin', 'viewer']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { password, ...rest } = parsed.data
  const values: Partial<typeof users.$inferInsert> = { ...rest }
  if (password) values.passwordHash = await hashPassword(password)

  const [row] = await db.update(users).set(values).where(eq(users.id, id))
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ user: row })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const { id } = await params
  if (id === session.userId) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })

  await db.delete(users).where(eq(users.id, id))
  return NextResponse.json({ ok: true })
}
