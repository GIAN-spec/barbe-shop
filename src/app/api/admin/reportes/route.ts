/**
 * GET /api/admin/reportes — Cierre de caja, liquidación de barberos (50/50) y métricas
 * Parámetros:
 *  ?tipo=diario&fecha=YYYY-MM-DD
 *  ?tipo=semanal&fecha=YYYY-MM-DD
 *  ?tipo=mensual&mes=YYYY-MM
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { getFechaLima, toLocalDateISO } from '@/lib/dates'

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
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get('tipo') ?? 'diario'
  const fechaHoy = getFechaLima(0)
  const fecha = searchParams.get('fecha') ?? fechaHoy
  const mesParam = searchParams.get('mes') ?? fechaHoy.slice(0, 7)

  let desde = fecha
  let hasta = fecha

  if (tipo === 'semanal') {
    const d = new Date(fecha + 'T12:00:00')
    const day = d.getDay() // 0 = Dom, 1 = Lun...
    const diffToMonday = day === 0 ? -6 : 1 - day
    const monday = new Date(d)
    monday.setDate(d.getDate() + diffToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    desde = toLocalDateISO(monday)
    hasta = toLocalDateISO(sunday)
  } else if (tipo === 'mensual') {
    const [year, month] = mesParam.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    desde = `${mesParam}-01`
    hasta = `${mesParam}-${String(lastDay).padStart(2, '0')}`
  }

  type CitaRow = {
    id: string
    usuario_id: string | null
    nombre: string
    celular: string
    servicio: string
    barbero: string
    fecha: string
    hora: string
    metodo_pago: string
    ref_pago: string | null
    estado: string
    notas: string | null
    created_at: string
    servicioNombre: string
    servicioPrecio: number
    servicioDur: number
    barberoNombre: string
    barberoComision: number
  }

  const citas = db.prepare(`
    SELECT c.*,
           COALESCE(s.nombre, c.servicio) AS servicioNombre,
           COALESCE(s.precio, 0) AS servicioPrecio,
           COALESCE(s.dur, 30) AS servicioDur,
           COALESCE(b.nombre, c.barbero) AS barberoNombre,
           COALESCE(b.comision, 50) AS barberoComision
    FROM citas c
    LEFT JOIN servicios s ON s.id = c.servicio
    LEFT JOIN barberos b ON b.id = c.barbero
    WHERE c.fecha BETWEEN ? AND ?
    ORDER BY c.fecha ASC, c.hora ASC
  `).all(desde, hasta) as CitaRow[]

  // Resumen global y por barbero
  let totalRecaudado = 0
  let totalComisiones = 0
  let citasAtendidas = 0
  let citasPendientes = 0
  let citasCanceladas = 0

  const porMetodoPago = {
    efectivo: 0,
    yape: 0,
    plin: 0,
    tarjeta: 0,
  }

  type BarberoStat = {
    barberoId: string
    barberoNombre: string
    comisionPct: number
    totalCitas: number
    atendidas: number
    totalCobrado: number
    pagoBarbero: number
    gananciaLocal: number
  }

  const barberosMap = new Map<string, BarberoStat>()

  for (const c of citas) {
    const esValida = ['completada', 'pagado'].includes(c.estado)
    if (c.estado === 'pendiente' || c.estado === 'confirmada') citasPendientes++
    else if (c.estado === 'cancelada' || c.estado === 'rechazada') citasCanceladas++
    else if (esValida) citasAtendidas++

    if (!barberosMap.has(c.barbero)) {
      barberosMap.set(c.barbero, {
        barberoId: c.barbero,
        barberoNombre: c.barberoNombre || c.barbero,
        comisionPct: c.barberoComision ?? 50,
        totalCitas: 0,
        atendidas: 0,
        totalCobrado: 0,
        pagoBarbero: 0,
        gananciaLocal: 0,
      })
    }

    const bStat = barberosMap.get(c.barbero)!
    bStat.totalCitas++

    if (esValida) {
      const precio = Number(c.servicioPrecio) || 0
      const comPct = Number(c.barberoComision) || 50
      const pagoB = (precio * comPct) / 100
      const gananciaL = precio - pagoB

      totalRecaudado += precio
      totalComisiones += pagoB

      bStat.atendidas++
      bStat.totalCobrado += precio
      bStat.pagoBarbero += pagoB
      bStat.gananciaLocal += gananciaL

      const m = (c.metodo_pago ?? 'efectivo').toLowerCase()
      if (m.includes('yape')) porMetodoPago.yape += precio
      else if (m.includes('plin')) porMetodoPago.plin += precio
      else if (m.includes('tarjeta')) porMetodoPago.tarjeta += precio
      else porMetodoPago.efectivo += precio
    }
  }

  const gananciaBarberia = totalRecaudado - totalComisiones

  return NextResponse.json({
    rango: { tipo, desde, hasta, fecha, mes: mesParam },
    resumen: {
      totalCitas: citas.length,
      citasAtendidas,
      citasPendientes,
      citasCanceladas,
      totalRecaudado,
      totalComisiones,
      gananciaBarberia,
      porMetodoPago,
    },
    barberos: Array.from(barberosMap.values()).sort((a, b) => b.totalCobrado - a.totalCobrado),
    citas,
  })
}
