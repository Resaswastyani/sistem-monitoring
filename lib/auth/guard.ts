import { NextResponse } from 'next/server'
import { getSession, type SessionPayload } from './session'

export async function requireUser() {
  const session = await getSession()
  if (!session) return { session: null as null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { session, response: null }
}

export function requireRole(session: SessionPayload, roles: SessionPayload['role'][]) {
  if (!roles.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}
