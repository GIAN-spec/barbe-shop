/**
 * POST /api/admin/citas/leer — Marca todas las notificaciones de nuevas
 * reservas como leídas (apaga el badge de la campana del dueño).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export async function POST() {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }
  const res = await db.run('UPDATE citas SET leida = 1 WHERE leida = 0')
  return NextResponse.json({ ok: true, marcadas: res.changes })
}
