import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { withdrawals, profitShareRules, profitShareLedger, accounts } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { sendWhatsApp } from '@/lib/notify/fonnte'

const patchSchema = z.object({
  status: z.enum(['pending', 'completed']),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Neon's HTTP driver has no transaction support, so this runs as sequential
  // statements rather than an atomic transaction.
  const [withdrawal] = await db
    .update(withdrawals)
    .set({ status: parsed.data.status, completedAt: parsed.data.status === 'completed' ? new Date() : null })
    .where(eq(withdrawals.id, id))
    .returning()

  if (!withdrawal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let ledger: (typeof profitShareLedger.$inferSelect)[] = []
  if (parsed.data.status === 'completed') {
    const rules = await db.select().from(profitShareRules).where(eq(profitShareRules.active, true))
    if (rules.length) {
      ledger = await db.insert(profitShareLedger).values(
        rules.map((rule) => ({
          withdrawalId: withdrawal.id,
          ruleId: rule.id,
          recipientName: rule.recipientName,
          percentage: rule.percentage,
          amount: Math.round(withdrawal.amount * (rule.percentage / 100) * 100) / 100,
          status: 'pending' as const,
        }))
      ).returning()
    }

    const [acc] = await db.select({ label: accounts.label }).from(accounts).where(eq(accounts.id, withdrawal.accountId)).limit(1)
    let msg = `✅ Withdrawal selesai\nAkun: ${acc?.label ?? withdrawal.accountId}\nJumlah: $${withdrawal.amount.toFixed(2)}`
    if (ledger.length) {
      msg += '\nSplit profit-sharing:\n' + ledger.map((l) => `- ${l.recipientName}: $${l.amount.toFixed(2)} (${l.percentage}%)`).join('\n')
    }
    await sendWhatsApp('withdrawal', msg)
  }

  return NextResponse.json({ withdrawal, ledger })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireUser()
  if (response) return response

  const { id } = await params
  await db.delete(withdrawals).where(and(eq(withdrawals.id, id), eq(withdrawals.status, 'pending')))
  return NextResponse.json({ ok: true })
}
