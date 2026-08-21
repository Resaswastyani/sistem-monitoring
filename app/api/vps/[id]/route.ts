import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { vps } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  status: z.enum(['Online', 'Degraded', 'Offline']).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const [row] = await db.update(vps).set(parsed.data).where(eq(vps.id, id)).returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ vps: row })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  await db.delete(vps).where(eq(vps.id, id))
  return NextResponse.json({ ok: true })
}
