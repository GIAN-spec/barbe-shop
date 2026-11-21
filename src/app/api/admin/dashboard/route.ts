/**
 * GET /api/admin/dashboard — Métricas para el dueño (BLOQUE 3.8 + panel pro)
 *  - Citas de hoy por estado y comparación vs ayer
 *  - Ingresos hoy / mes actual vs mes anterior
 *  - Series: citas y de ingresos últimos 14 días, ingresos 6 meses
 *  - Top 3 servicios, top barberos del mes
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

export async function GET() {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status, headers: NO_CACHE_HEADERS })
  }

  const hoy = getFechaLima(0)
  const ayer = getFechaLima(-1)
  const mes = hoy.slice(0, 8)
  const mesChunks = mes.split('-')
  const prevMesAno = Number(mesChunks[0]) - (mesChunks[1] === '01' ? 1 : 0)
  const prevMesNum = mesChunks[1] === '01' ? 12 : Number(mesChunks[1]) - 1
  const prevMes = `${prevMesAno}-${String(prevMesNum).padStart(2, '0')}`
  const hace30 = getFechaLima(-30)
  const hace14 = getFechaLima(-14)

  // Citas de hoy y ayer por estado
  const porEstado = (fecha: string) => db.all<{ estado: string; n: number }>(
    'SELECT estado, COUNT(*) AS n FROM citas WHERE fecha = ? GROUP BY estado',
    fecha
  )
  const activasDe = (rows: { estado: string; n: number }[]) =>
    rows.filter(r => !['cancelada', 'rechazada'].includes(r.estado)).reduce((a, r) => a + r.n, 0)
  const [citasHoy, citasAyer] = await Promise.all([porEstado(hoy), porEstado(ayer)])

  // Ingresos helper (pagadas o completadas con precio del catálogo)
  const ingresosDe = async (where: string, arg: string) => (await db.get<{ total: number }>(`
    SELECT COALESCE(SUM(s.precio), 0) AS total
    FROM citas c LEFT JOIN servicios s ON s.id = c.servicio
    WHERE ${where} AND c.estado IN ('pagado', 'completada')
  `, arg)) ?? { total: 0 }

  const [ingHoy, ingAyer, ingMes, ingMesPrev] = await Promise.all([
    ingresosDe("c.fecha = ?", hoy),
    ingresosDe("c.fecha = ?", ayer),
    ingresosDe("c.fecha LIKE ?", mes + '%'),
    ingresosDe("c.fecha LIKE ?", prevMes + '%'),
  ])
  const ingresosHoy = ingHoy.total
  const ingresosAyer = ingAyer.total
  const ingresosMes = ingMes.total
  const ingresosMesPrev = ingMesPrev.total

  // Serie 14 días: citas activas e ingresos por día
  const [serie14, ingresos6m, topServicios, nuevasRow, barberoTop] = await Promise.all([
    db.all<{ fecha: string; n: number; ingresos: number }>(`
      SELECT c.fecha,
             SUM(CASE WHEN c.estado NOT IN ('cancelada', 'rechazada') THEN 1 ELSE 0 END) AS n,
             SUM(CASE WHEN c.estado IN ('pagado', 'completada') THEN COALESCE(s.precio, 0) ELSE 0 END) AS ingresos
      FROM citas c LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.fecha >= ?
      GROUP BY c.fecha ORDER BY c.fecha ASC
    `, hace14),
    db.all<{ mes: string; total: number }>(`
      SELECT substr(c.fecha, 1, 7) AS mes,
             SUM(CASE WHEN c.estado IN ('pagado', 'completada') THEN COALESCE(s.precio, 0) ELSE 0 END) AS total
      FROM citas c LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.fecha >= ?
      GROUP BY substr(c.fecha, 1, 7) ORDER BY mes ASC
    `, hace14.slice(0, 8) + '01'),
    db.all<{ servicio: string; nombre: string | null; n: number }>(`
      SELECT c.servicio, s.nombre AS nombre, COUNT(*) AS n
      FROM citas c LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.fecha >= ? AND c.estado NOT IN ('cancelada', 'rechazada')
      GROUP BY c.servicio ORDER BY n DESC LIMIT 3
    `, hace30),
    db.get<{ n: number }>(`
      SELECT COUNT(*) AS n FROM citas WHERE leida = 0 AND estado NOT IN ('cancelada')
    `),
    db.get<{ barbero: string; n: number }>(`
      SELECT barbero, COUNT(*) AS n FROM citas
      WHERE fecha LIKE ? AND estado NOT IN ('cancelada', 'rechazada')
      GROUP BY barbero ORDER BY n DESC LIMIT 1
    `, mes + '%'),
  ])

  const total = citasHoy.reduce((a, r) => a + r.n, 0)
  const totalAyer = citasAyer.reduce((a, r) => a + r.n, 0)
  const nuevas = nuevasRow ?? { n: 0 }

  return NextResponse.json({
    fecha: hoy,
    nuevasReservas: nuevas.n,
    citasHoy: { total, activas: activasDe(citasHoy), porEstado: citasHoy },
    citasAyer: { total: totalAyer, activas: activasDe(citasAyer) },
    ingresosHoy, ingresosAyer, ingresosMes, ingresosMesPrev,
    serie14, ingresos6m, topServicios,
    servicioPopular: topServicios[0] ?? null,
    barberoTop: barberoTop ?? null,
  }, { headers: NO_CACHE_HEADERS })
}
