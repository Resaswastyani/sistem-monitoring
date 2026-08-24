import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { notificationSettings, notificationRules, accounts } from '@/lib/db/schema'

export type EventType = 'trade_closed' | 'manual_trade' | 'withdrawal' | 'robot_status'

// Shared "who/what account" block included in every notification message,
// per the requirement that messages show client name, account, and deposit.
export async function accountContext(accountId: string) {
  const [acc] = await db.select({
    label: accounts.label,
    customerName: accounts.customerName,
    balance: accounts.balance,
  }).from(accounts).where(eq(accounts.id, accountId)).limit(1)
  if (!acc) return ''
  return `Klien: ${acc.customerName ?? '-'}\nAkun: ${acc.label}\nDeposit: $${acc.balance.toFixed(2)}`
}

async function sendTo(gatewayUrl: string, gatewayApiKey: string, phone: string, message: string) {
  try {
    await fetch(`${gatewayUrl.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': gatewayApiKey },
      body: JSON.stringify({ phone, message }),
    })
  } catch (err) {
    console.error('WhatsApp gateway send failed', err)
  }
}

// Fails silently by design — a WhatsApp delivery problem must never break
// the ingest/withdrawal flow that triggered it. Routes to the owner and/or
// the account's customer depending on the event's notification_rules row.
export async function notifyEvent(eventType: EventType, message: string, opts: { accountId?: string } = {}) {
  try {
    const [settings] = await db.select().from(notificationSettings).limit(1)
    if (!settings?.gatewayUrl || !settings?.gatewayApiKey) return

    const [rule] = await db.select().from(notificationRules).where(eq(notificationRules.eventType, eventType)).limit(1)
    if (rule && !rule.active) return
    const notifyOwner = rule ? rule.notifyOwner : true
    const notifyClient = rule ? rule.notifyClient : true

    if (notifyOwner && settings.ownerPhone) {
      await sendTo(settings.gatewayUrl, settings.gatewayApiKey, settings.ownerPhone, message)
    }

    if (notifyClient && opts.accountId) {
      const [acc] = await db.select({ phone: accounts.customerPhone }).from(accounts).where(eq(accounts.id, opts.accountId)).limit(1)
      if (acc?.phone) {
        await sendTo(settings.gatewayUrl, settings.gatewayApiKey, acc.phone, message)
      }
    }
  } catch (err) {
    console.error('notifyEvent failed', err)
  }
}
