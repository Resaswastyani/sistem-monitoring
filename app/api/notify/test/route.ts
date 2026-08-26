import { NextResponse } from 'next/server'
import { requireUser, requireRole } from '@/lib/auth/guard'
import { checkGatewayHealth } from '@/lib/notify/whatsapp'

export async function POST() {
  const { session, response } = await requireUser()
  if (response) return response
  const forbidden = requireRole(session, ['owner', 'admin'])
  if (forbidden) return forbidden

  const result = await checkGatewayHealth()
  return NextResponse.json(result)
}
