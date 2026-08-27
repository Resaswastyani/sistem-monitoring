import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { notificationSettings, notificationRules, accounts, robots, withdrawals } from '@/lib/db/schema'

export type EventType = 'trade_closed' | 'manual_trade' | 'withdrawal' | 'robot_status'

// Shared "who/what account" block included in every notification message:
// client name, account number, deposit, current balance, robot on/off, and
// whether there's an open withdrawal.
export async function accountContext(accountId: string) {
  const [acc] = await db.select({
    label: accounts.label,
    accountNumber: accounts.accountNumber,
    customerName: accounts.customerName,
    initialDeposit: accounts.initialDeposit,
    balance: accounts.balance,
  }).from(accounts).where(eq(accounts.id, accountId)).limit(1)
  if (!acc) return ''

  const accountRobots = await db.select({ name: robots.name, status: robots.status }).from(robots).where(eq(robots.accountId, accountId))
  const robotText = accountRobots.length
    ? accountRobots.map(r => `${r.name}: ${r.status === 'Running' ? 'ON' : 'OFF'}`).join(', ')
    : '-'

  const [lastWithdrawal] = await db.select({ amount: withdrawals.amount, status: withdrawals.status })
    .from(withdrawals).where(eq(withdrawals.accountId, accountId)).orderBy(desc(withdrawals.createdAt)).limit(1)
  const withdrawalText = !lastWithdrawal
    ? 'Tidak ada'
    : lastWithdrawal.status === 'completed'
      ? `Sudah selesai ($${lastWithdrawal.amount.toFixed(2)})`
      : `Pending ($${lastWithdrawal.amount.toFixed(2)})`

  return [
    `Klien: ${acc.customerName ?? '-'}`,
    `Akun: ${acc.label} (${acc.accountNumber})`,
    `Deposito: $${acc.initialDeposit.toFixed(2)}`,
    `Balance: $${acc.balance.toFixed(2)}`,
    `Robot: ${robotText}`,
    `Withdrawal: ${withdrawalText}`,
  ].join('\n')
}

async function sendTo(gatewayUrl: string, gatewayApiKey: string, phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': gatewayApiKey },
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: body.error || `Gateway returned ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.error('WhatsApp gateway send failed', err)
    return { ok: false, error: 'Tidak bisa menghubungi gateway' }
  }
}

// Ad-hoc send for the "manual message" panel — unlike notifyEvent, this
// surfaces real success/failure back to the caller instead of failing silently.
export async function sendDirect(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const [settings] = await db.select().from(notificationSettings).limit(1)
  if (!settings?.gatewayUrl || !settings?.gatewayApiKey) return { ok: false, error: 'Gateway belum dikonfigurasi' }
  return sendTo(settings.gatewayUrl, settings.gatewayApiKey, phone, message)
}

export async function checkGatewayHealth(): Promise<{ ok: boolean; connected?: boolean; error?: string }> {
  const [settings] = await db.select().from(notificationSettings).limit(1)
  if (!settings?.gatewayUrl) return { ok: false, error: 'Gateway URL belum diisi' }
  try {
    const res = await fetch(`${settings.gatewayUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { ok: false, error: `Gateway returned ${res.status}` }
    const body = await res.json().catch(() => ({}))
    return { ok: true, connected: !!body.connected }
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi gateway' }
  }
}

// Fails silently by design — a WhatsApp delivery problem must never break
// the ingest/withdrawal flow that triggered it. Routes to the owner and/or
// the account's customer depending on the event's notification_rules row.
// Clears the gateway's saved WhatsApp session and forces a fresh QR pairing
// — used after a logout (e.g. removed from Linked Devices) since the
// gateway no longer auto-retries that on its own, to avoid hammering
// WhatsApp's servers with a reconnect loop.
export async function resetGateway(): Promise<{ ok: boolean; error?: string }> {
  const [settings] = await db.select().from(notificationSettings).limit(1)
  if (!settings?.gatewayUrl || !settings?.gatewayApiKey) return { ok: false, error: 'Gateway belum dikonfigurasi' }
  try {
    const res = await fetch(`${settings.gatewayUrl.replace(/\/$/, '')}/reset`, {
      method: 'POST',
      headers: { 'X-Api-Key': settings.gatewayApiKey },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: body.error || `Gateway returned ${res.status}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi gateway' }
  }
}

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
