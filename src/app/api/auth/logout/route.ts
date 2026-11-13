/**
 * POST /api/auth/logout
 * Elimina la cookie de sesión.
 */
import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export async function POST() {
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
