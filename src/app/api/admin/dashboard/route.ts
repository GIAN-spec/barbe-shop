/**
 * GET /api/admin/dashboard — Endpoint unificado del Resumen Operativo y badges del Sidebar
 * Combina en una sola consulta: citas de hoy, comparativas vs ayer y mes anterior,
 * serie de 7 días (servicios + tienda), pendientes por verificar, stock bajo y catálogos activos.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { getFechaLima, utcSqliteToFechaLima } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

function parseCitaTotal(precioBase: number, notas?: string | null): number {
  const base = Number(precioBase) || 15
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
  return base + extraSrvSum + productsTotal
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json(
      { error: auth.denied.message },
      { status: auth.denied.status, headers: NO_CACHE_HEADERS }
    )
  }

  const { searchParams } = new URL(request.url)
  const roleMode = (searchParams.get('barbero') || 'owner').trim() || 'owner'

  const hoy = getFechaLima(0)
  const ayer = getFechaLima(-1)
  const hace6 = getFechaLima(-6)
  const hace14 = getFechaLima(-14)
  const mes = hoy.slice(0, 7)
  const [yNum, mNum] = mes.split('-').map(Number)
  const prevMes = mNum === 1 ? `${yNum - 1}-12` : `${yNum}-${String(mNum - 1).padStart(2, '0')}`
  const minFechaQuery = `${prevMes}-01` < hace14 ? `${prevMes}-01` : hace14

  type CitaRow = {
    id: string
    nombre: string
    celular: string
    servicio: string
    servicioNombre: string
    servicioDur: number
    servicioPrecio: number
    barbero: string
    fecha: string
    hora: string
    metodo_pago: string
    ref_pago: string | null
    estado: 'pendiente' | 'confirmada' | 'completada' | 'rechazada' | 'pagado' | 'cancelada'
    notas: string | null
    leida: number
    created_at: string
  }

  type PedidoRow = {
    id: string
    cliente: string
    telefono: string
    entrega: string
    direccion: string | null
    items_json: string
    subtotal: number
    envio: number
    total: number
    metodo_pago: string
    ref_pago: string | null
    estado: 'pendiente' | 'pagado' | 'entregado' | 'cancelado'
    created_at: string
  }

  const [citasAll, pedidosAll, stockBajo, barberos, servicios, resenasPendRow] = await Promise.all([
    db.all<CitaRow>(`
      SELECT c.*,
             COALESCE(s.nombre, c.servicio) AS servicioNombre,
             COALESCE(s.dur, 35) AS servicioDur,
             COALESCE(s.precio, 15) AS servicioPrecio
      FROM citas c
      LEFT JOIN servicios s ON s.id = c.servicio
      WHERE c.fecha >= ?
      ORDER BY c.fecha ASC, c.hora ASC
    `, minFechaQuery),
    db.all<PedidoRow>('SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 200'),
    db.all<{ id: string; nombre: string; stock: number; presentacion: string }>(
      'SELECT id, nombre, stock, presentacion FROM productos WHERE activo = 1 AND stock <= 5 ORDER BY stock ASC, nombre ASC'
    ),
    db.all<{ id: string; nombre: string; rol: string; activo: number }>(
      'SELECT id, nombre, rol, activo FROM barberos WHERE activo = 1 ORDER BY rowid ASC'
    ),
    db.all<{ id: string; cat: string; nombre: string; dur: number; precio: number; activo: number }>(
      'SELECT id, cat, nombre, dur, precio, activo FROM servicios WHERE activo = 1 ORDER BY orden ASC, nombre ASC'
    ),
    db.get<{ n: number }>("SELECT COUNT(*) AS n FROM resenas WHERE COALESCE(estado, 'aprobada') = 'pendiente'"),
  ])

  const citasScope = roleMode === 'owner' ? citasAll : citasAll.filter(c => c.barbero === roleMode)
  const citasHoy = citasScope.filter(c => c.fecha === hoy)
  const citasAyer = citasScope.filter(c => c.fecha === ayer && !['cancelada', 'rechazada'].includes(c.estado))

  const pedidosConFecha = pedidosAll.map(p => ({
    ...p,
    fechaLima: utcSqliteToFechaLima(p.created_at),
  }))

  const esCitaIngreso = (c: CitaRow) => c.estado === 'completada' || c.estado === 'pagado'
  const esPedidoIngreso = (p: PedidoRow) => p.estado === 'pagado' || p.estado === 'entregado'

  const sumCitas = (list: CitaRow[]) => list.reduce((acc, c) => acc + parseCitaTotal(c.servicioPrecio, c.notas), 0)
  const sumPedidos = (list: PedidoRow[]) => list.reduce((acc, p) => acc + (Number(p.total) || 0), 0)

  const ingresosHoyServicios = sumCitas(citasHoy.filter(esCitaIngreso))
  const ingresosHoyTienda = roleMode === 'owner'
    ? sumPedidos(pedidosConFecha.filter(p => esPedidoIngreso(p) && p.fechaLima === hoy))
    : 0
  const ingresosHoy = ingresosHoyServicios + ingresosHoyTienda

  const ingresosAyerServicios = sumCitas(citasScope.filter(c => c.fecha === ayer && esCitaIngreso(c)))
  const ingresosAyerTienda = roleMode === 'owner'
    ? sumPedidos(pedidosConFecha.filter(p => esPedidoIngreso(p) && p.fechaLima === ayer))
    : 0
  const ingresosAyer = ingresosAyerServicios + ingresosAyerTienda

  const ingresosMesServicios = sumCitas(citasScope.filter(c => c.fecha.startsWith(mes) && esCitaIngreso(c)))
  const ingresosMesTienda = roleMode === 'owner'
    ? sumPedidos(pedidosConFecha.filter(p => esPedidoIngreso(p) && p.fechaLima.startsWith(mes)))
    : 0
  const ingresosMes = ingresosMesServicios + ingresosMesTienda

  const ingresosMesPrevServicios = sumCitas(citasScope.filter(c => c.fecha.startsWith(prevMes) && esCitaIngreso(c)))
  const ingresosMesPrevTienda = roleMode === 'owner'
    ? sumPedidos(pedidosConFecha.filter(p => esPedidoIngreso(p) && p.fechaLima.startsWith(prevMes)))
    : 0
  const ingresosMesPrev = ingresosMesPrevServicios + ingresosMesPrevTienda

  const serie7Dias = Array.from({ length: 7 }, (_, idx) => {
    const iso = shiftIso(hace6, idx)
    const citasDia = citasScope.filter(c => c.fecha === iso && !['cancelada', 'rechazada'].includes(c.estado))
    const srv = sumCitas(citasDia.filter(esCitaIngreso))
    const tnd = roleMode === 'owner'
      ? sumPedidos(pedidosConFecha.filter(p => esPedidoIngreso(p) && p.fechaLima === iso))
      : 0
    const label = new Date(iso + 'T12:00:00')
      .toLocaleDateString('es-PE', { weekday: 'short' })
      .replace('.', '')
      .slice(0, 3)
    return {
      iso,
      label,
      servicios: srv,
      tienda: tnd,
      total: srv + tnd,
      citas: citasDia.length,
    }
  })

  const citasPorVerificar = citasScope.filter(
    c =>
      c.fecha >= hace14 &&
      c.estado === 'pendiente' &&
      ['yape', 'plin'].includes((c.metodo_pago || '').toLowerCase())
  )
  const pedidosPendientes = roleMode === 'owner'
    ? pedidosAll.filter(p => p.estado === 'pendiente')
    : []

  const pagosPorVerificarTotal =
    citasPorVerificar.length +
    pedidosPendientes.filter(p => ['yape', 'plin'].includes((p.metodo_pago || '').toLowerCase())).length

  const citasPendientesHoy = citasHoy.filter(c => c.estado === 'pendiente').length

  return NextResponse.json(
    {
      hoy,
      ayer,
      citasHoy,
      citasAyerCount: citasAyer.length,
      ingresosHoy,
      ingresosHoyServicios,
      ingresosHoyTienda,
      ingresosAyer,
      ingresosMes,
      ingresosMesPrev,
      serie7Dias,
      citasPorVerificar,
      pedidosPendientes,
      stockBajo,
      counts: {
        citasPendientesHoy,
        pagosPorVerificar: pagosPorVerificarTotal,
        pedidosPendientes: pedidosPendientes.length,
        stockBajo: stockBajo.length,
        resenasPendientes: Number(resenasPendRow?.n ?? 0),
      },
      barberos,
      servicios,
    },
    { headers: NO_CACHE_HEADERS }
  )
}
