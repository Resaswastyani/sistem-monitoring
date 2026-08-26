import { NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, robots, withdrawals, notificationSettings } from '@/lib/db/schema'

// Called by the WhatsApp gateway (not the browser) whenever a customer
// messages the business number, so it can reply with live account info.
// Authenticated with the same shared secret already used the other way
// around (dashboard -> gateway /send), since both sides already have it.

function normalizePhone(p: string) {
  return p.replace(/[^0-9]/g, '')
}

type Intent = 'balance' | 'robot' | 'withdrawal' | 'deposit' | 'menu'

function classify(text: string): Intent {
  const t = text.toLowerCase()
  if (/\b(saldo|balance)\b/.test(t)) return 'balance'
  if (/\b(robot|status)\b/.test(t)) return 'robot'
  if (/\b(withdraw|wd|tarik)\b/.test(t)) return 'withdrawal'
  if (/\b(deposit|modal)\b/.test(t)) return 'deposit'
  return 'menu'
}

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key')
  const [settings] = await db.select().from(notificationSettings).limit(1)
  if (!settings?.gatewayApiKey || apiKey !== settings.gatewayApiKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { phone?: string; message?: string } | null
  if (!body?.phone || !body?.message) return NextResponse.json({ error: 'phone and message are required' }, { status: 400 })

  const phone = normalizePhone(body.phone)

  // Never auto-reply to the owner's own number chatting with the business line.
  if (settings.ownerPhone && normalizePhone(settings.ownerPhone) === phone) {
    return NextResponse.json({ reply: null })
  }

  const allAccounts = await db.select().from(accounts)
  const matches = allAccounts.filter((a) => a.customerPhone && normalizePhone(a.customerPhone) === phone)

  if (!matches.length) {
    return NextResponse.json({ reply: 'Halo, nomor Anda belum terdaftar di sistem kami. Silakan hubungi admin untuk bantuan lebih lanjut.' })
  }

  const intent = classify(body.message)
  const sections: string[] = []

  for (const acc of matches) {
    const prefix = matches.length > 1 ? `*${acc.label}*\n` : ''
    if (intent === 'balance') {
      sections.push(`${prefix}Balance: $${acc.balance.toFixed(2)}\nEquity: $${acc.equity.toFixed(2)}`)
    } else if (intent === 'robot') {
      const accountRobots = await db.select({ name: robots.name, status: robots.status }).from(robots).where(eq(robots.accountId, acc.id))
      const text = accountRobots.length
        ? accountRobots.map((r) => `${r.name}: ${r.status === 'Running' ? 'ON ✅' : 'OFF ⛔'}`).join('\n')
        : 'Belum ada robot terpasang.'
      sections.push(`${prefix}${text}`)
    } else if (intent === 'withdrawal') {
      const [last] = await db.select({ amount: withdrawals.amount, status: withdrawals.status })
        .from(withdrawals).where(eq(withdrawals.accountId, acc.id)).orderBy(desc(withdrawals.createdAt)).limit(1)
      const text = !last
        ? 'Belum ada riwayat withdrawal.'
        : `Withdrawal terakhir: $${last.amount.toFixed(2)} (${last.status === 'completed' ? 'selesai' : 'pending'})`
      sections.push(`${prefix}${text}`)
    } else if (intent === 'deposit') {
      sections.push(`${prefix}Total deposito: $${acc.initialDeposit.toFixed(2)}`)
    } else {
      sections.push(`${prefix}Akun: ${acc.label} (${acc.accountNumber})\nBalance: $${acc.balance.toFixed(2)}\nStatus: ${acc.status}`)
    }
  }

  const greeting = matches[0].customerName ? `Halo ${matches[0].customerName}! 👋` : 'Halo! 👋'
  let reply = `${greeting}\n\n${sections.join('\n\n')}`
  if (intent === 'menu') {
    reply += '\n\nBalas dengan salah satu kata kunci berikut untuk info spesifik:\n- *saldo* — balance & equity\n- *robot* — status robot\n- *withdraw* — status withdrawal\n- *deposit* — total deposito'
  }

  return NextResponse.json({ reply })
}
