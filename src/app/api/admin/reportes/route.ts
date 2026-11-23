/**
 * GET /api/admin/reportes — Cierre de caja unificado (Servicios + Tienda) y liquidación de barberos
 * Parámetros:
 *  ?tipo=diario&fecha=YYYY-MM-DD
 *  ?tipo=semanal&fecha=YYYY-MM-DD
 *  ?tipo=mensual&mes=YYYY-MM
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { getFechaLima, toLocalDateISO, utcSqliteToFechaLima } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

function parseServiceAndProducts(precioBase: number, notas?: string | null): { serviceTotal: number; productsTotal: number } {
  const base = Number(precioBase) || 0
  const text = notas || ''
  let extraSrvSum = 0
  const srvMatch = text.match(/\[Servicios:\s*([^\]]+)\]/i)
  if (srvMatch) {
    const prices = [...srvMatch[1].matchAll(/S\/\s*(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]))
    if (prices.length > 0) {
      extraSrvSum = Math.max(0, prices.reduce((a, b) => a + b, 0) - base)
    }
  }
  let productsTotal = 0
  const prodMatch = text.match(/\[Productos en Bolsa:\s*([^\]]+?)\s*\(\+S\/\s*(\d+(?:\.\d+)?)\)\]/i)
  if (prodMatch) {
    productsTotal = Number(prodMatch[2]) || 0
  }
  return { serviceTotal: base + extraSrvSum, productsTotal }
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status, headers: NO_CACHE_HEADERS })
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

  type PedidoRow = {
    id: string
    total: number
    metodo_pago: string
    estado: string
    created_at: string
  }

  const [citasRaw, pedidosRaw] = await Promise.all([
    db.all<CitaRow>(`
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
    `, desde, hasta),
    db.all<PedidoRow>(`
      SELECT id, total, metodo_pago, estado, created_at
      FROM pedidos
      WHERE estado IN ('pagado', 'entregado')
    `),
  ])

  let ingresosServicios = 0
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

  const sumMetodo = (metodo: string | null | undefined, monto: number) => {
    const m = (metodo ?? 'efectivo').toLowerCase()
    if (m.includes('yape')) porMetodoPago.yape += monto
    else if (m.includes('plin')) porMetodoPago.plin += monto
    else if (m.includes('tarjeta')) porMetodoPago.tarjeta += monto
    else porMetodoPago.efectivo += monto
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

  const citas = citasRaw.map(c => {
    const { serviceTotal } = parseServiceAndProducts(c.servicioPrecio, c.notas)
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
      const comPct = Number(c.barberoComision) || 50
      const pagoB = (serviceTotal * comPct) / 100
      const gananciaL = serviceTotal - pagoB

      ingresosServicios += serviceTotal
      totalComisiones += pagoB

      bStat.atendidas++
      bStat.totalCobrado += serviceTotal
      bStat.pagoBarbero += pagoB
      bStat.gananciaLocal += gananciaL

      sumMetodo(c.metodo_pago, serviceTotal)
    }

    return {
      ...c,
      servicioTotal: serviceTotal,
    }
  })

  let ingresosTienda = 0
  let pedidosPagados = 0
  for (const p of pedidosRaw) {
    const fLima = utcSqliteToFechaLima(p.created_at)
    if (fLima >= desde && fLima <= hasta) {
      const monto = Number(p.total) || 0
      ingresosTienda += monto
      pedidosPagados++
      sumMetodo(p.metodo_pago, monto)
    }
  }

  const totalRecaudado = ingresosServicios + ingresosTienda
  const gananciaBarberia = ingresosServicios - totalComisiones + ingresosTienda

  return NextResponse.json(
    {
      rango: { tipo, desde, hasta, fecha, mes: mesParam },
      resumen: {
        totalCitas: citas.length,
        citasAtendidas,
        citasPendientes,
        citasCanceladas,
        ingresosServicios,
        ingresosTienda,
        pedidosPagados,
        totalRecaudado,
        totalComisiones,
        gananciaBarberia,
        porMetodoPago,
      },
      barberos: Array.from(barberosMap.values()).sort((a, b) => b.totalCobrado - a.totalCobrado),
      citas,
    },
    { headers: NO_CACHE_HEADERS }
  )
}
