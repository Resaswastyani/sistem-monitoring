import 'dotenv/config'
import { rm, readdir } from 'fs/promises'
import { join } from 'path'
import express from 'express'
import qrcodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'
import pino from 'pino'
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'

const PORT = process.env.PORT || 3001
const API_KEY = process.env.API_KEY || ''
const DASHBOARD_URL = (process.env.DASHBOARD_URL || '').replace(/\/$/, '')

if (!API_KEY) {
  console.error('Set API_KEY in .env before starting — it protects the /send endpoint from being used by anyone who finds the URL.')
  process.exit(1)
}
if (!DASHBOARD_URL) {
  console.warn('DASHBOARD_URL not set — incoming messages will not get an automatic reply.')
}

const logger = pino({ level: 'warn' })
let sock = null
let isReady = false
let latestQr = null

// ./auth_info is the mounted volume's mount point, so recursively rm-ing
// the directory itself always throws EBUSY (you can't rmdir a mount
// point) — clear its contents one entry at a time instead, and leave the
// directory itself alone.
async function wipeAuthInfo() {
  let entries
  try {
    entries = await readdir('./auth_info')
  } catch {
    return
  }
  for (const entry of entries) {
    try {
      await rm(join('./auth_info', entry), { recursive: true, force: true })
    } catch (err) {
      console.error(`Failed to remove ./auth_info/${entry}:`, err.message)
    }
  }
}

async function resetSession() {
  if (sock) {
    try { sock.end(undefined) } catch { /* ignore */ }
  }
  isReady = false
  latestQr = null
  // Give the just-closed socket a moment to release its file handles
  // before touching the same files, or the wipe below can no-op.
  await new Promise((r) => setTimeout(r, 500))
  await wipeAuthInfo()
  console.log('Session reset — auth_info cleared, starting a fresh pairing.')
  startSock()
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  // Auto-reply to incoming customer messages with account info looked up
  // by phone number. type:'notify' filters out the historical-sync batch
  // Baileys replays on every (re)connect, so old messages never get a reply.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' || !DASHBOARD_URL) return
    for (const m of messages) {
      try {
        if (m.key.fromMe) continue
        const jid = m.key.remoteJid
        if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || ''
        if (!text.trim()) continue

        const phone = jid.replace(/@.*/, '')
        const res = await fetch(`${DASHBOARD_URL}/api/bot/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
          body: JSON.stringify({ phone, message: text }),
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const { reply } = await res.json()
        if (reply) await sock.sendMessage(jid, { text: reply })
      } catch (err) {
        console.error('Auto-reply failed for an incoming message:', err)
      }
    }
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      latestQr = qr
      console.log('\nScan this QR code with WhatsApp (Settings > Linked Devices > Link a Device):\n')
      qrcodeTerminal.generate(qr, { small: true })
      console.log(`\nOr open /qr on this server in a browser to scan it as an image.`)
    }

    if (connection === 'open') {
      isReady = true
      latestQr = null
      console.log('WhatsApp connected.')
    }

    if (connection === 'close') {
      isReady = false
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log('Connection closed (code', statusCode, '). Reconnecting:', shouldReconnect)
      if (shouldReconnect) startSock()
      else {
        console.log('Logged out from WhatsApp (e.g. removed from Linked Devices). Not auto-reconnecting — call POST /reset when ready to pair again.')
      }
    }
  })
}

startSock()

const app = express()
app.use(express.json())

app.post('/send', async (req, res) => {
  const key = req.header('X-Api-Key')
  if (key !== API_KEY) return res.status(401).json({ error: 'Invalid API key' })
  if (!isReady || !sock) return res.status(503).json({ error: 'WhatsApp is not connected yet' })

  const { phone, message } = req.body || {}
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required' })

  try {
    const digits = String(phone).replace(/[^0-9]/g, '')
    const jid = `${digits}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: String(message) })
    res.json({ ok: true })
  } catch (err) {
    console.error('Send failed:', err)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

app.get('/health', (_req, res) => res.json({ connected: isReady }))

// Wipes the saved session and forces a fresh QR pairing. Useful when the
// session gets into a bad state (e.g. repeated "Bad MAC" decrypt errors
// after being reconnected many times) — cheaper than deleting the volume.
app.post('/reset', async (req, res) => {
  const key = req.header('X-Api-Key')
  if (key !== API_KEY) return res.status(401).json({ error: 'Invalid API key' })

  try {
    await resetSession()
    res.json({ ok: true })
  } catch (err) {
    console.error('Reset failed:', err)
    res.status(500).json({ error: 'Reset failed' })
  }
})

app.get('/qr', async (_req, res) => {
  res.set('Cache-Control', 'no-store')

  if (isReady) {
    return res.send('<!doctype html><meta charset="utf-8"><title>WhatsApp Gateway</title><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>&#9989; WhatsApp is already connected.</h2><p>No QR code needed.</p></body>')
  }

  if (!latestQr) {
    return res.send('<!doctype html><meta charset="utf-8"><title>WhatsApp Gateway</title><meta http-equiv="refresh" content="3"><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Waiting for QR code&hellip;</h2><p>This page refreshes automatically every 3 seconds.</p></body>')
  }

  try {
    const dataUrl = await QRCode.toDataURL(latestQr, { width: 320, margin: 2 })
    res.send(`<!doctype html><meta charset="utf-8"><title>Scan to connect WhatsApp</title><meta http-equiv="refresh" content="20"><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Scan with WhatsApp</h2><p>Settings &rsaquo; Linked Devices &rsaquo; Link a Device</p><img src="${dataUrl}" alt="WhatsApp QR code" style="width:320px;height:320px" /><p style="color:#666;font-size:13px">This page refreshes every 20s. The code expires and is replaced automatically until you scan it.</p></body>`)
  } catch (err) {
    console.error('Failed to render QR image:', err)
    res.status(500).send('Failed to render QR code')
  }
})

app.listen(PORT, () => console.log(`WhatsApp gateway listening on port ${PORT}`))
