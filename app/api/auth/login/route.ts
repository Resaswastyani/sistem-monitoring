import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { verifyPassword } from '@/lib/auth/password'
import { signSession, setSessionCookie } from '@/lib/auth/session'

const bodySchema = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { email, password } = parsed.data

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  if (!user || !user.active) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  const token = await signSession({ userId: user.id, role: user.role, name: user.name, email: user.email })
  await setSessionCookie(token)
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
}
