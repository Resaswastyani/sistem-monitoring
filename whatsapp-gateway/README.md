# WhatsApp gateway (Baileys)

Small always-on service that sends WhatsApp messages on behalf of the
Forex For Better Living dashboard. It must run on a VPS you control (a
plain Ubuntu VPS from Hetzner/Contabo/Vultr/DigitalOcean etc.) — it
**cannot run on Vercel**, because it holds a live WhatsApp Web connection
that needs to stay open continuously, and Vercel's serverless functions
are stateless and shut down between requests.

## Setup (on your VPS)

1. Install Node.js 20+ on the VPS (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`).
2. Copy this whole `whatsapp-gateway/` folder to the VPS.
3. `cp .env.example .env`, then edit `.env`:
   - `API_KEY` — make up a long random string. You'll paste this same value into the dashboard's Settings page later.
   - `PORT` — leave as 3001 unless it conflicts with something else.
   - `DASHBOARD_URL` — your deployed dashboard's URL (e.g. `https://your-app.vercel.app`). Enables auto-reply to incoming customer messages (see below). Leave blank to skip that feature.
4. `npm install`
5. `npm start`
6. A QR code will print in the terminal. Open WhatsApp on the phone number you want to send from → **Settings → Linked Devices → Link a Device** → scan it.
   - If you're not on a real terminal (e.g. deploying to Railway/a PaaS and only have a web log viewer), the ASCII QR in the logs is often unscannable because the viewer breaks the character alignment. Instead open `https://YOUR_GATEWAY_URL/qr` in a browser — it renders the same QR as a real scannable image and auto-refreshes until you scan it.
7. Once you see `WhatsApp connected.`, leave it running.

## Deploying on Railway

1. Create a service from this repo, with **Root Directory** set to `whatsapp-gateway`.
2. Add one environment variable: `API_KEY` = a long random string (Railway sets `PORT` itself; the app already respects `process.env.PORT`).
3. **Attach a Volume** and mount it at `/app/auth_info` (Settings → Volumes → New Volume). This is required — without it, Railway's filesystem is wiped on every redeploy/restart, so the paired WhatsApp session would be lost and you'd have to re-scan the QR every time.
4. Deploy. Once the deploy is "Active", open `https://YOUR_RAILWAY_URL/qr` in a browser and scan it with WhatsApp (Settings → Linked Devices → Link a Device).
5. Confirm it worked by visiting `https://YOUR_RAILWAY_URL/health` — it should return `{"connected":true}`.

## Keep it running permanently

Don't just leave the `npm start` terminal open — use a process manager so it survives reboots and crashes:

```bash
npm install -g pm2
pm2 start index.js --name wa-gateway
pm2 save
pm2 startup   # follow the printed instructions to enable on boot
```

Session credentials are saved to `./auth_info` after the first QR scan — you won't need to re-scan on restart unless that folder is deleted or WhatsApp logs the device out.

## Making it reachable from the dashboard

The Vercel-hosted dashboard needs to reach `http://YOUR_VPS_IP:3001` (or a domain pointed at it) over the internet. Options, from simplest to most secure:

- **Open the port directly**: allow inbound TCP on the port in the VPS's firewall (`ufw allow 3001`). Fine for getting started, but the `/send` endpoint is then exposed to the internet — the `API_KEY` check is what protects it, so make sure it's a long random value.
- **Put a reverse proxy with HTTPS in front of it** (nginx + Let's Encrypt, or Caddy) on a subdomain — recommended once this is in real use, since it also gets you a proper HTTPS URL.

Once reachable, go to the dashboard's **Settings** page and fill in:
- **Gateway URL**: `http://YOUR_VPS_IP:3001` (or your HTTPS domain)
- **Gateway API key**: the same `API_KEY` from `.env`
- **Nomor WA owner**: your own WhatsApp number, to receive owner-side notifications

## Auto-reply to customer messages

When `DASHBOARD_URL` is set, any incoming WhatsApp message from a number that
matches an account's "Customer WhatsApp" field gets an automatic reply with
live account info, looked up from the dashboard by keyword:

- `saldo` / `balance` — current balance & equity
- `robot` / `status` — each robot's on/off status
- `withdraw` / `wd` / `tarik` — latest withdrawal status
- `deposit` / `modal` — total deposited
- anything else — a short account summary + the list of keywords above

Messages from an unrecognized number get a generic "not registered" reply.
Messages from the owner's own number (set in the dashboard's Settings) never
get an auto-reply, so the owner can use that number normally. The dashboard
does the actual lookup (`/api/bot/query`), authenticated with the same
`API_KEY` — nothing extra to configure beyond `DASHBOARD_URL`.

## Testing it directly

```bash
curl -X POST http://localhost:3001/send \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{"phone":"628123456789","message":"Test from gateway"}'
```
