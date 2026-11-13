/**
 * GET    /api/admin/bloqueos — lista de bloqueos (futuros + últimos)
 * POST   /api/admin/bloqueos — { fecha, hora?, motivo } → bloquea día entero u hora puntual
 * DELETE /api/admin/bloqueos?id=... — quita un bloqueo
 */
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }
  const bloqueos = db.prepare(`
    SELECT * FROM bloqueos
    WHERE fecha >= date('now')
    ORDER BY fecha ASC
  `).all()
  return NextResponse.json({ bloqueos })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const body = await request.json()
  const { fecha, hora, motivo } = body

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD).' }, { status: 400 })
  }
  if (hora && !/^\d{2}:\d{2}$/.test(hora)) {
    return NextResponse.json({ error: 'Hora inválida (HH:MM).' }, { status: 400 })
  }
  if (!motivo || String(motivo).trim().length < 3) {
    return NextResponse.json({ error: 'Motivo requerido (mín. 3 caracteres).' }, { status: 400 })
  }

  // No duplicar el mismo bloqueo exacto
  const dup = db.prepare('SELECT id FROM bloqueos WHERE fecha = ? AND (hora IS ? OR hora = ?)')
    .get(fecha, hora ?? null, hora ?? '') as { id: string } | undefined
  if (dup) {
    return NextResponse.json({ error: 'Ese bloqueo ya existe para esa fecha/hora.' }, { status: 409 })
  }

  const id = 'blq_' + randomUUID().replace(/-/g, '').slice(0, 16)
  db.prepare('INSERT INTO bloqueos (id, fecha, hora, motivo) VALUES (?, ?, ?, ?)')
    .run(id, fecha, hora ?? null, String(motivo).trim())

  return NextResponse.json({ ok: true, bloqueo: db.prepare('SELECT * FROM bloqueos WHERE id = ?').get(id) }, { status: 201 })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id requerido.' }, { status: 400 })
  }
  const res = db.prepare('DELETE FROM bloqueos WHERE id = ?').run(id)
  if (res.changes === 0) {
    return NextResponse.json({ error: 'Bloqueo no encontrado.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
