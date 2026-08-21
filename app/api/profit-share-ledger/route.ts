import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { profitShareLedger } from '@/lib/db/schema'

export async function GET() {
  const rows = await db.select().from(profitShareLedger)
  return NextResponse.json({ ledger: rows })
}
