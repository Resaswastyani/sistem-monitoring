import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { robots } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const rows = await db.select().from(robots)
  return NextResponse.json({ robots: rows })
}

const createSchema = z.object({
  name: z.string().min(1),
  strategy: z.string().min(1),
  accountId: z.string().uuid(),
  vpsId: z.string().uuid().nullable().optional(),
})

export async function POST(req: Request) {
  const { response } = await requireUser()
  if (response) return response

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { name, strategy, accountId, vpsId } = parsed.data

  const [row] = await db.insert(robots).values({
    name,
    strategy,
    status: 'Stopped',
    accountId,
    vpsId: vpsId ?? null,
    orders: 0,
    execution: 0,
    risk: 'Moderate',
  }).returning()

  return NextResponse.json({ robot: row }, { status: 201 })
}
