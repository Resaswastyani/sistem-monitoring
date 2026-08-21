import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { profitShareRules } from '@/lib/db/schema'
import { requireUser, requireRole } from '@/lib/auth/guard'

export async function GET() {
  const rows = await db.select().from(profitShareRules)
  return NextResponse.json({ rules: rows })
}

const createSchema = z.object({
  recipientName: z.string().min(1),
  percentage: z.coerce.number().min(0).max(100),
})

export async function POST(req: Request) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const [row] = await db.insert(profitShareRules).values({
    recipientName: parsed.data.recipientName,
    percentage: parsed.data.percentage,
    active: true,
  }).returning()

  return NextResponse.json({ rule: row }, { status: 201 })
}
