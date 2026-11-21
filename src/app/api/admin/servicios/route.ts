/**
 * GET    /api/admin/servicios — lista completa (activos e inactivos)
 * POST   /api/admin/servicios — crear servicio: { nombre, cat?, desc?, dur?, precio?, foto? }
 * PATCH  /api/admin/servicios — editar precio, duración, nombre/desc, categoría, activo
 * Body PATCH: { id, precio?, dur?, nombre?, desc?, foto?, cat?, activo?, orden? }
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '').slice(0, 24)

export async function GET() {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }
  const servicios = await db.all(`
    SELECT id, cat, nombre, desc, dur, precio, foto, orden, activo
    FROM servicios ORDER BY orden ASC, precio ASC
  `)
  return NextResponse.json({ servicios })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const body = await request.json()
  const { nombre, cat, desc, dur, precio, foto } = body

  if (!nombre || String(nombre).trim().length < 3) {
    return NextResponse.json({ error: 'Nombre inválido (mínimo 3 caracteres).' }, { status: 400 })
  }
  const catLimpia = slug(String(cat ?? 'corte')) || 'corte'
  const durN = Number(dur ?? 30)
  if (!(durN >= 10 && durN <= 180)) {
    return NextResponse.json({ error: 'Duración inválida (10-180 min).' }, { status: 400 })
  }
  const precioN = Number(precio ?? 15)
  if (!(precioN > 0)) {
    return NextResponse.json({ error: 'Precio inválido.' }, { status: 400 })
  }

  let id = slug(String(nombre))
  // Id único: si existe, se agrega sufijo numérico
  let n = 1
  while (await db.get('SELECT id FROM servicios WHERE id = ?', id)) {
    id = slug(String(nombre)) + '_' + (++n)
  }

  const maxOrden = (await db.get<{ m: number }>('SELECT COALESCE(MAX(orden), 0) m FROM servicios')) ?? { m: 0 }

  await db.run(`INSERT INTO servicios (id, cat, nombre, desc, dur, precio, foto, orden, activo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    id,
    catLimpia,
    String(nombre).trim(),
    (String(desc ?? '').trim() || 'Servicio de la casa.'),
    durN,
    precioN,
    (String(foto ?? '').trim() || null),
    maxOrden.m + 1,
  )

  const creado = await db.get('SELECT id, cat, nombre, desc, dur, precio, foto, orden, activo FROM servicios WHERE id = ?', id)
  return NextResponse.json({ ok: true, servicio: creado }, { status: 201 })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const body = await request.json()
  const { id, precio, dur, nombre, desc, foto, cat, activo, orden } = body

  if (!id) {
    return NextResponse.json({ error: 'Id de servicio requerido.' }, { status: 400 })
  }
  const svc = await db.get('SELECT id FROM servicios WHERE id = ?', id)
  if (!svc) {
    return NextResponse.json({ error: 'Servicio no encontrado.' }, { status: 404 })
  }

  const updates: string[] = []
  const values: unknown[] = []

  if (precio !== undefined) {
    const p = Number(precio)
    if (!(p > 0)) return NextResponse.json({ error: 'Precio inválido.' }, { status: 400 })
    updates.push('precio = ?'); values.push(p)
  }
  if (dur !== undefined) {
    const d = Number(dur)
    if (!(d >= 10 && d <= 180)) return NextResponse.json({ error: 'Duración inválida (10-180 min).' }, { status: 400 })
    updates.push('dur = ?'); values.push(d)
  }
  if (nombre !== undefined && String(nombre).trim().length >= 3) {
    updates.push('nombre = ?'); values.push(String(nombre).trim())
  }
  if (desc !== undefined && String(desc).trim().length >= 3) {
    updates.push('desc = ?'); values.push(String(desc).trim())
  }
  // foto: null o '' limpia la foto del servicio
  if (foto !== undefined) {
    const f = String(foto ?? '').trim()
    updates.push('foto = ?'); values.push(f || null)
  }
  // cat: categoría a la que queda enlazado el servicio (el filtro de la web la usa)
  if (cat !== undefined) {
    const c = String(cat).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '').slice(0, 24)
    if (c.length < 2) return NextResponse.json({ error: 'Categoría inválida (mínimo 2 caracteres).' }, { status: 400 })
    updates.push('cat = ?'); values.push(c)
  }
  if (activo !== undefined) {
    const a = activo === true || activo === 1 || activo === 'true' ? 1 : 0
    updates.push('activo = ?'); values.push(a)
  }
  if (orden !== undefined) {
    const o = Number(orden)
    if (!(o >= 1 && o <= 99)) return NextResponse.json({ error: 'Orden inválido (1-99).' }, { status: 400 })
    updates.push('orden = ?'); values.push(o)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  values.push(id)
  await db.run(`UPDATE servicios SET ${updates.join(', ')} WHERE id = ?`, ...values)

  const updated = await db.get('SELECT * FROM servicios WHERE id = ?', id)
  return NextResponse.json({ ok: true, servicio: updated })
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
    return NextResponse.json({ error: 'Id de servicio requerido.' }, { status: 400 })
  }

  const svc = await db.get('SELECT id, nombre FROM servicios WHERE id = ?', id)
  if (!svc) {
    return NextResponse.json({ error: 'Servicio no encontrado.' }, { status: 404 })
  }

  await db.run('DELETE FROM servicios WHERE id = ?', id)
  return NextResponse.json({ ok: true, deleted: id })
}
