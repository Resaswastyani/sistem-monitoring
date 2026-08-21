import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { vps } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const rows = await db.select().from(vps)
  return NextResponse.json({ vps: rows })
}

const createSchema = z.object({
  name: z.string().min(1),
  region: z.string().min(1),
  host: z.string().min(1),
  status: z.enum(['Online', 'Degraded', 'Offline']).optional(),
})

export async function POST(req: Request) {
  const { response } = await requireUser()
  if (response) return response

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { name, region, host, status } = parsed.data

  const [row] = await db.insert(vps).values({
    name,
    region,
    host,
    status: status ?? 'Online',
    latency: Math.round(15 + Math.random() * 40),
  }).returning()

  return NextResponse.json({ vps: row }, { status: 201 })
}
