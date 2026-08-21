import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { SESSION_COOKIE } from '@/lib/auth/session'

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/auth')) return NextResponse.next()
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET!))
    return NextResponse.next()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export const config = {
  matcher: ['/api/:path*'],
}
