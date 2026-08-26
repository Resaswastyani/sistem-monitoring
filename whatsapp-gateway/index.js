import 'dotenv/config'
import express from 'express'
import qrcodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'
import pino from 'pino'
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'

const PORT = process.env.PORT || 3001
const API_KEY = process.env.API_KEY || ''

if (!API_KEY) {
  console.error('Set API_KEY in .env before starting — it protects the /send endpoint from being used by anyone who finds the URL.')
  process.exit(1)
}

const logger = pino({ level: 'warn' })
let sock = null
let isReady = false
let latestQr = null

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
        latestQr = null
        console.log('Logged out from WhatsApp. Delete the auth_info folder and restart to pair again.')
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
