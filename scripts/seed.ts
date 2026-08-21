import { randomBytes } from 'crypto'
import { db } from '../lib/db/client'
import { users, vps, accounts } from '../lib/db/schema'
import { hashPassword } from '../lib/auth/password'
import { eq } from 'drizzle-orm'

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase()
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (existing) {
    console.log(`Admin user already exists: ${email}`)
  } else {
    const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url')
    const passwordHash = await hashPassword(password)
    await db.insert(users).values({
      name: 'Owner',
      email,
      passwordHash,
      role: 'owner',
      active: true,
    })
    console.log('Created owner user:')
    console.log(`  email:    ${email}`)
    console.log(`  password: ${password}`)
    console.log('Save this password now, it will not be shown again. Change it after first login.')
  }

  const [existingVps] = await db.select().from(vps).limit(1)
  let vpsId: string
  if (existingVps) {
    vpsId = existingVps.id
  } else {
    const [row] = await db.insert(vps).values({
      name: 'Primary VPS',
      region: 'Singapore',
      host: 'pending-setup',
      status: 'Online',
      latency: 20,
    }).returning()
    vpsId = row.id
    console.log('Created starter VPS entry.')
  }

  const [existingAccount] = await db.select().from(accounts).limit(1)
  if (!existingAccount) {
    await db.insert(accounts).values({
      label: 'Exness · (belum diisi)',
      broker: 'Exness',
      accountNumber: '00000000',
      status: 'Active',
      equity: 0,
      balance: 0,
      pnl: 0,
      trades: 0,
      winRate: 0,
      margin: 0,
      vpsId,
    })
    console.log('Created starter Exness account entry (edit real numbers from the dashboard).')
  }

  console.log('Seed complete.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
