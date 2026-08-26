import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { requireUser, requireRole } from '@/lib/auth/guard'
import { sendDirect } from '@/lib/notify/whatsapp'

const bodySchema = z.object({
  phone: z.string().min(5).optional(),
  accountId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
}).refine((v) => v.phone || v.accountId, { message: 'phone or accountId is required' })

export async function POST(req: Request) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { message } = parsed.data

  let phone = parsed.data.phone
  if (!phone && parsed.data.accountId) {
    const [acc] = await db.select({ phone: accounts.customerPhone }).from(accounts).where(eq(accounts.id, parsed.data.accountId)).limit(1)
    if (!acc?.phone) return NextResponse.json({ error: 'Akun ini belum punya nomor WhatsApp customer' }, { status: 400 })
    phone = acc.phone
  }

  const result = await sendDirect(phone!, message)
  if (!result.ok) return NextResponse.json({ error: result.error || 'Gagal mengirim' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
