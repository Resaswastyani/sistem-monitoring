import { NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { trades } from '@/lib/db/schema'

export async function GET(req: Request) {
  const accountId = new URL(req.url).searchParams.get('accountId')
  if (!accountId) return NextResponse.json({ trades: [] })

  const rows = await db.select().from(trades).where(eq(trades.accountId, accountId)).orderBy(desc(trades.openedAt))
  return NextResponse.json({ trades: rows })
}
