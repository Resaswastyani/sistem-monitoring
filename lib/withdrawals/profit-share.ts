import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { profitShareRules, profitShareLedger } from '@/lib/db/schema'

export async function computeProfitShareLedger(withdrawalId: string, amount: number) {
  const rules = await db.select().from(profitShareRules).where(eq(profitShareRules.active, true))
  if (!rules.length) return []
  return db.insert(profitShareLedger).values(
    rules.map((rule) => ({
      withdrawalId,
      ruleId: rule.id,
      recipientName: rule.recipientName,
      percentage: rule.percentage,
      amount: Math.round(amount * (rule.percentage / 100) * 100) / 100,
      status: 'pending' as const,
    }))
  ).returning()
}
