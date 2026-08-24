import 'dotenv/config'
import express from 'express'
import qrcode from 'qrcode-terminal'
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
      console.log('\nScan this QR code with WhatsApp (Settings > Linked Devices > Link a Device):\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      isReady = true
      console.log('WhatsApp connected.')
    }

    if (connection === 'close') {
      isReady = false
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log('Connection closed (code', statusCode, '). Reconnecting:', shouldReconnect)
      if (shouldReconnect) startSock()
      else console.log('Logged out from WhatsApp. Delete the auth_info folder and restart to pair again.')
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

app.listen(PORT, () => console.log(`WhatsApp gateway listening on port ${PORT}`))
