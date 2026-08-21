import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { robots } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  strategy: z.string().min(1).optional(),
  vpsId: z.string().uuid().nullable().optional(),
  status: z.enum(['Running', 'Paused', 'Stopped']).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const [row] = await db.update(robots).set(parsed.data).where(eq(robots.id, id)).returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ robot: row })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  await db.delete(robots).where(eq(robots.id, id))
  return NextResponse.json({ ok: true })
}
