import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { notificationRules } from '@/lib/db/schema'
import { requireUser, requireRole } from '@/lib/auth/guard'

const DEFAULTS: { eventType: typeof notificationRules.$inferInsert['eventType']; notifyOwner: boolean; notifyClient: boolean }[] = [
  { eventType: 'trade_closed', notifyOwner: true, notifyClient: true },
  { eventType: 'manual_trade', notifyOwner: true, notifyClient: false },
  { eventType: 'withdrawal', notifyOwner: true, notifyClient: true },
  { eventType: 'robot_status', notifyOwner: true, notifyClient: false },
]

export async function GET() {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const rows = await db.select().from(notificationRules)
  const byType = new Map(rows.map((r) => [r.eventType, r]))
  const merged = DEFAULTS.map((d) => byType.get(d.eventType) ?? { id: d.eventType, active: true, ...d })

  return NextResponse.json({ rules: merged })
}

const patchSchema = z.object({
  eventType: z.enum(['trade_closed', 'manual_trade', 'withdrawal', 'robot_status']),
  active: z.boolean().optional(),
  notifyOwner: z.boolean().optional(),
  notifyClient: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { eventType, ...values } = parsed.data

  const [existing] = await db.select({ id: notificationRules.id }).from(notificationRules).where(eq(notificationRules.eventType, eventType)).limit(1)
  const fallback = DEFAULTS.find((d) => d.eventType === eventType)!

  const [row] = existing
    ? await db.update(notificationRules).set(values).where(eq(notificationRules.id, existing.id)).returning()
    : await db.insert(notificationRules).values({ ...fallback, ...values }).returning()

  return NextResponse.json({ rule: row })
}
