/**
 * GET    /api/admin/barberos — lista completa (activos e inactivos)
 * POST   /api/admin/barberos — crear barbero
 * PATCH  /api/admin/barberos — editar datos, horarios, días libres y activar/desactivar
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '').slice(0, 24)

const SELECT_BARBERO = `
  SELECT id, nombre, rol, esp, exp, tags, foto, activo,
         COALESCE(comision, 50) AS comision,
         COALESCE(horario, 'Lun - Sáb · 09:00 - 21:00') AS horario,
         COALESCE(dias_libres, 'Domingo') AS dias_libres
  FROM barberos
`

export async function GET() {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }
  const barberos = db.prepare(`${SELECT_BARBERO} ORDER BY nombre ASC`).all()
  return NextResponse.json({ barberos })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const body = await request.json()
  const { nombre, rol, esp, exp, tags, foto, comision, horario, dias_libres } = body

  if (!nombre || String(nombre).trim().length < 3) {
    return NextResponse.json({ error: 'Nombre inválido (mínimo 3 caracteres).' }, { status: 400 })
  }
  let id = slug(String(nombre))
  let n = 1
  while (db.prepare('SELECT id FROM barberos WHERE id = ?').get(id)) {
    id = slug(String(nombre)) + '_' + (++n)
  }

  let tagsArr: string[] = []
  if (Array.isArray(tags)) tagsArr = tags.map((t: unknown) => String(t).trim()).filter(Boolean)
  else if (typeof tags === 'string') tagsArr = String(tags).split(',').map(t => t.trim()).filter(Boolean)

  const comPct = Math.max(0, Math.min(100, Number(comision) || 50))

  db.prepare(`
    INSERT INTO barberos (id, nombre, rol, esp, exp, tags, foto, activo, comision, horario, dias_libres)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    String(nombre).trim(),
    String(rol ?? '').trim() || 'Barbero & Estilista',
    String(esp ?? '').trim() || 'Variedad de cortes y estilos',
    String(exp ?? '').trim() || '3 años de exp.',
    JSON.stringify(tagsArr),
    String(foto ?? '').trim() || null,
    comPct,
    String(horario ?? '').trim() || 'Lun - Sáb · 09:00 - 21:00',
    String(dias_libres ?? '').trim() || 'Domingo',
  )

  const creado = db.prepare(`${SELECT_BARBERO} WHERE id = ?`).get(id)
  return NextResponse.json({ ok: true, barbero: creado }, { status: 201 })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const body = await request.json()
  const { id, nombre, rol, esp, exp, tags, foto, activo, horario, dias_libres } = body

  if (!id) {
    return NextResponse.json({ error: 'Id de barbero requerido.' }, { status: 400 })
  }
  const bar = db.prepare('SELECT id FROM barberos WHERE id = ?').get(id)
  if (!bar) {
    return NextResponse.json({ error: 'Barbero no encontrado.' }, { status: 404 })
  }

  const updates: string[] = []
  const values: unknown[] = []

  if (nombre !== undefined && String(nombre).trim().length >= 3) {
    updates.push('nombre = ?'); values.push(String(nombre).trim())
  }
  if (rol !== undefined && String(rol).trim()) {
    updates.push('rol = ?'); values.push(String(rol).trim())
  }
  if (esp !== undefined && String(esp).trim()) {
    updates.push('esp = ?'); values.push(String(esp).trim())
  }
  if (exp !== undefined && String(exp).trim()) {
    updates.push('exp = ?'); values.push(String(exp).trim())
  }
  if (horario !== undefined) {
    updates.push('horario = ?'); values.push(String(horario).trim())
  }
  if (dias_libres !== undefined) {
    updates.push('dias_libres = ?'); values.push(String(dias_libres).trim())
  }
  if (foto !== undefined) {
    if (String(foto).trim()) {
      updates.push('foto = ?'); values.push(String(foto).trim())
    } else {
      updates.push('foto = NULL')
    }
  }
  if (tags !== undefined) {
    let tagsArr: string[] = []
    if (Array.isArray(tags)) tagsArr = tags.map((t: unknown) => String(t).trim()).filter(Boolean)
    else if (typeof tags === 'string') tagsArr = tags.split(',').map(t => t.trim()).filter(Boolean)
    updates.push('tags = ?'); values.push(JSON.stringify(tagsArr))
  }
  if (activo !== undefined) {
    const a = activo === true || activo === 1 || activo === 'true' ? 1 : 0
    updates.push('activo = ?'); values.push(a)
  }
  if (body.comision !== undefined) {
    const c = Math.max(0, Math.min(100, Number(body.comision) || 50))
    updates.push('comision = ?'); values.push(c)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  values.push(id)
  db.prepare(`UPDATE barberos SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  const updated = db.prepare(`${SELECT_BARBERO} WHERE id = ?`).get(id)
  return NextResponse.json({ ok: true, barbero: updated })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const { searchParams } = new URL(request.url)
  let id = searchParams.get('id')
  if (!id) {
    try {
      const body = await request.json()
      id = body.id
    } catch {}
  }

  if (!id) {
    return NextResponse.json({ error: 'Id de barbero requerido.' }, { status: 400 })
  }

  db.prepare('DELETE FROM barberos WHERE id = ?').run(id)
  return NextResponse.json({ ok: true, deleted: id })
}
