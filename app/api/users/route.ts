import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireUser, requireRole } from '@/lib/auth/guard'
import { hashPassword } from '@/lib/auth/password'

export async function GET() {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    active: users.active,
    createdAt: users.createdAt,
  }).from(users)

  return NextResponse.json({ users: rows })
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['owner', 'admin', 'viewer']),
})

export async function POST(req: Request) {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { name, email, password, role } = parsed.data

  const passwordHash = await hashPassword(password)
  const [row] = await db.insert(users).values({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    active: true,
  }).returning({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt })
    .catch((err) => {
      if (String(err?.message ?? '').includes('unique')) throw new Error('DUPLICATE_EMAIL')
      throw err
    })

  return NextResponse.json({ user: row }, { status: 201 })
}
