import { db } from '@/lib/db/client'
import { notificationSettings } from '@/lib/db/schema'

export type NotificationKind = 'tradeClosed' | 'robotOffline' | 'withdrawal'

// Fails silently by design — a WhatsApp delivery problem must never break
// the ingest/withdrawal flow that triggered it.
export async function sendWhatsApp(kind: NotificationKind, message: string) {
  try {
    const [settings] = await db.select().from(notificationSettings).limit(1)
    if (!settings?.fonnteToken || !settings?.recipientPhone) return
    if (kind === 'tradeClosed' && !settings.notifyTradeClosed) return
    if (kind === 'robotOffline' && !settings.notifyRobotOffline) return
    if (kind === 'withdrawal' && !settings.notifyWithdrawal) return

    await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: settings.fonnteToken, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ target: settings.recipientPhone, message }),
    })
  } catch (err) {
    console.error('WhatsApp notify failed', err)
  }
}
