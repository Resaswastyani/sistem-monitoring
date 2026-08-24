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
4. `npm install`
5. `npm start`
6. A QR code will print in the terminal. Open WhatsApp on the phone number you want to send from → **Settings → Linked Devices → Link a Device** → scan it.
7. Once you see `WhatsApp connected.`, leave it running.

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

## Testing it directly

```bash
curl -X POST http://localhost:3001/send \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{"phone":"628123456789","message":"Test from gateway"}'
```
