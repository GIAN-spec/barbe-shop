/**
 * GET /api/admin/citas — Agenda para el dueño (BLOQUE 3.2 y 3.3)
 *
 * Modos:
 *  ?fecha=YYYY-MM-DD                      → agenda del día, ordenada por hora
 *  ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD    → rango (semana), agrupable por barbero
 * Sin parámetros → próximas 7 días.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { getFechaLima } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status, headers: NO_CACHE_HEADERS })
  }

  const { searchParams } = new URL(request.url)
  const fecha = searchParams.get('fecha')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  let citas
  if (fecha) {
    citas = await db.all(`
      SELECT c.*,
             s.nombre AS servicioNombre, s.dur AS servicioDur, s.precio AS servicioPrecio
      FROM citas c
      LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.fecha = ?
      ORDER BY c.hora ASC
    `, fecha)
  } else if (desde && hasta) {
    citas = await db.all(`
      SELECT c.*,
             s.nombre AS servicioNombre, s.dur AS servicioDur, s.precio AS servicioPrecio
      FROM citas c
      LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.fecha BETWEEN ? AND ?
      ORDER BY c.fecha ASC, c.hora ASC
    `, desde, hasta)
  } else {
    const hoy = getFechaLima(0)
    citas = await db.all(`
      SELECT c.*,
             s.nombre AS servicioNombre, s.dur AS servicioDur, s.precio AS servicioPrecio
      FROM citas c
      LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.fecha >= ?
      ORDER BY c.fecha ASC, c.hora ASC
      LIMIT 200
    `, hoy)
  }

  return NextResponse.json({ citas }, { headers: NO_CACHE_HEADERS })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  try {
    const body = await request.json()
    const { nombre, celular, servicio, barbero, fecha, hora, metodo_pago, estado, notas } = body

    if (!servicio) {
      return NextResponse.json({ error: 'Debes seleccionar un servicio.' }, { status: 400 })
    }
    if (!barbero) {
      return NextResponse.json({ error: 'Debes seleccionar un barbero.' }, { status: 400 })
    }
    if (!fecha || !hora) {
      return NextResponse.json({ error: 'Fecha y hora requeridas.' }, { status: 400 })
    }

    const id = `cita_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const clientName = String(nombre ?? '').trim() || 'Cliente Presencial'
    const clientPhone = String(celular ?? '').trim() || '999999999'
    const status = String(estado ?? 'completada')
    const payment = String(metodo_pago ?? 'efectivo')
    const note = String(notas ?? '').trim() || 'Atendido en local (Walk-in)'

    await db.run(`
      INSERT INTO citas (id, usuario_id, nombre, celular, servicio, barbero, fecha, hora, metodo_pago, ref_pago, estado, notas, leida)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)
    `, id, clientName, clientPhone, servicio, barbero, fecha, hora, payment, status, note)

    const creada = await db.get(`
      SELECT c.*,
             s.nombre AS servicioNombre, s.dur AS servicioDur, s.precio AS servicioPrecio
      FROM citas c
      LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.id = ?
    `, id)

    return NextResponse.json({ ok: true, cita: creada }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error al registrar cita.' }, { status: 500 })
  }
}
