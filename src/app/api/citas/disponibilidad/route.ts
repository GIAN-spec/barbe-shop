/**
 * GET /api/citas/disponibilidad?fecha=YYYY-MM-DD&barbero=chino
 * Devuelve los slots ocupados para una fecha y barbero dados.
 * No requiere autenticación (público, para el calendario de reservas).
 *
 * BLOQUE 3.7: si la fecha tiene un bloqueo de día completo, se devuelve
 * todo ocupado; si el bloqueo es por hora puntual, ese slot se agrega.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fecha = searchParams.get('fecha')
  const barbero = searchParams.get('barbero')

  if (!fecha) {
    return NextResponse.json({ error: 'Parámetro "fecha" requerido.' }, { status: 400, headers: NO_CACHE_HEADERS })
  }

  // Bloqueos para la fecha
  const bloqueos = db.prepare(`
    SELECT hora, motivo FROM bloqueos WHERE fecha = ?
  `).all(fecha) as { hora: string | null; motivo: string }[]

  const bloqueoCompleto = bloqueos.find(b => b.hora === null)
  if (bloqueoCompleto) {
    // Día entero bloqueado (feriado, vacaciones, mantenimiento)
    return NextResponse.json({
      fecha,
      bloqueado: true,
      motivo: bloqueoCompleto.motivo,
      ocupados: [],
    }, { headers: NO_CACHE_HEADERS })
  }

  let rawCitas: { hora: string; barbero: string; dur: number }[]
  if (barbero && barbero !== 'any') {
    rawCitas = db.prepare(`
      SELECT c.hora, c.barbero, COALESCE(s.dur, 30) as dur
      FROM citas c
      LEFT JOIN servicios s ON c.servicio = s.id
      WHERE c.fecha = ? AND c.barbero = ? AND c.estado != 'cancelada'
    `).all(fecha, barbero) as { hora: string; barbero: string; dur: number }[]
  } else {
    rawCitas = db.prepare(`
      SELECT c.hora, c.barbero, COALESCE(s.dur, 30) as dur
      FROM citas c
      LEFT JOIN servicios s ON c.servicio = s.id
      WHERE c.fecha = ? AND c.estado != 'cancelada'
    `).all(fecha) as { hora: string; barbero: string; dur: number }[]
  }

  // Expandir slots ocupados para servicios que duran más de 30 minutos (evita solapamientos)
  const citas: { hora: string; barbero: string }[] = []
  for (const c of rawCitas) {
    citas.push({ hora: c.hora, barbero: c.barbero })
    // Bloqueamos todos los slots de 30 min que abarca el servicio
    const [h, m] = c.hora.split(':').map(Number)
    const startMinutes = h * 60 + m
    const extraSlots = Math.floor(c.dur / 30) // ej: 60min → 2 slots, 90min → 3 slots
    for (let i = 1; i < extraSlots; i++) {
      const nextMinutes = startMinutes + i * 30
      const nextH = Math.floor(nextMinutes / 60)
      const nextM = nextMinutes % 60
      const nextSlot = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`
      citas.push({ hora: nextSlot, barbero: c.barbero })
    }
  }

  // Bloqueos por hora puntual: slots inválidos para TODOS los barberos
  const horasBloqueadas = bloqueos.filter(b => b.hora).map(b => b.hora as string)

  return NextResponse.json({
    fecha,
    bloqueado: false,
    ocupados: citas,
    horasBloqueadas,
  }, { headers: NO_CACHE_HEADERS })
}
