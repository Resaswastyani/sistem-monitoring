import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { notificationSettings } from '@/lib/db/schema'
import { requireUser, requireRole } from '@/lib/auth/guard'
import { eq } from 'drizzle-orm'

export async function GET() {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const [row] = await db.select().from(notificationSettings).limit(1)
  return NextResponse.json({
    settings: row ?? {
      fonnteToken: '',
      recipientPhone: '',
      notifyTradeClosed: true,
      notifyRobotOffline: true,
      notifyWithdrawal: true,
    },
  })
}

const patchSchema = z.object({
  fonnteToken: z.string().optional(),
  recipientPhone: z.string().optional(),
  notifyTradeClosed: z.boolean().optional(),
  notifyRobotOffline: z.boolean().optional(),
  notifyWithdrawal: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const [existing] = await db.select({ id: notificationSettings.id }).from(notificationSettings).limit(1)
  const values = { ...parsed.data, updatedAt: new Date() }

  const [row] = existing
    ? await db.update(notificationSettings).set(values).where(eq(notificationSettings.id, existing.id)).returning()
    : await db.insert(notificationSettings).values(values).returning()

  return NextResponse.json({ settings: row })
}
