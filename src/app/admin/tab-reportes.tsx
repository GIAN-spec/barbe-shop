'use client'

/**
 * MÓDULO 4: CIERRE DE CAJA, AUDITORÍA DE PAGOS Y LIQUIDACIÓN DE BARBEROS
 * - Usa 100% los tokens CSS de admin.css (compatible con modo claro y oscuro)
 * - Cierre unificado: Servicios + Tienda y desglose por Efectivo / Yape / Plin / Tarjeta
 * - Exportación CSV UTF-8, WhatsApp de liquidación y auditoría paginada
 */
import { useEffect, useState } from 'react'
import {
  T,
  Pill,
  ModIcon,
  Drawer,
  RowMenu,
  EmptyState,
  ScreenHeader,
  Toast,
  getFechaHoy,
  shiftFecha,
  fechaLarga,
  money,
  parseCitaExtras,
  formatPaymentInfo,
  formatHora12,
  syncBus,
  descargarCSV,
  utcToFechaLimaClient,
  printReporteCaja,
  type Cita,
  type Pedido,
} from './ui'

type PagoItem = {
  uid: string
  origen: 'cita' | 'pedido'
  rawId: string
  fecha: string
  cliente: string
  telefono: string
  concepto: string
  metodo: string
  refPago: string
  monto: number
  estado: string
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

type ReporteCita = {
  id: string
  fecha: string
  hora: string
  nombre: string
  celular: string
  servicioNombre: string
  servicioPrecio: number
  servicioTotal?: number
  barbero: string
  barberoNombre: string
  barberoComision: number
  metodo_pago: string
  ref_pago: string | null
  estado: string
}

type ResumenCaja = {
  ingresosServicios: number
  ingresosTienda: number
  pedidosPagados: number
  totalRecaudado: number
  totalComisiones: number
  gananciaBarberia: number
  porMetodoPago: {
    efectivo: number
    yape: number
    plin: number
    tarjeta: number
  }
}

export default function TabPagos() {
  const [subTab, setSubTab] = useState<'liquidacion' | 'pagos'>('liquidacion')

  const [pagos, setPagos] = useState<PagoItem[]>([])
  const [barberosLiq, setBarberosLiq] = useState<BarberoStat[]>([])
  const [reporteCitas, setReporteCitas] = useState<ReporteCita[]>([])
  const [resumenCaja, setResumenCaja] = useState<ResumenCaja>({
    ingresosServicios: 0,
    ingresosTienda: 0,
    pedidosPagados: 0,
    totalRecaudado: 0,
    totalComisiones: 0,
    gananciaBarberia: 0,
    porMetodoPago: { efectivo: 0, yape: 0, plin: 0, tarjeta: 0 },
  })
  const [loading, setLoading] = useState(false)

  // Filtros de Liquidación y Cierre
  const [periodoTipo, setPeriodoTipo] = useState<'mes' | 'mes_anterior' | 'semana' | 'hoy'>('mes')
  const [mesSeleccionado, setMesSeleccionado] = useState(() => getFechaHoy().slice(0, 7))
  const [filtroBarbero, setFiltroBarbero] = useState('todos')
  const [busquedaBarbero, setBusquedaBarbero] = useState('')
  const [barberoSeleccionadoDetalle, setBarberoSeleccionadoDetalle] = useState<BarberoStat | null>(null)

  // Filtros de Pagos / Transacciones
  const [busquedaPago, setBusquedaPago] = useState('')
  const [filtroMetodo, setFiltroMetodo] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [pagoPage, setPagoPage] = useState(1)
  const ITEMS_PER_PAGE = 15

  const [selectedPago, setSelectedPago] = useState<PagoItem | null>(null)
  const [editRef, setEditRef] = useState('')
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 2200)
  }

  async function cargarLiquidacion() {
    const hoy = getFechaHoy()
    let urlRep = `/api/admin/reportes?tipo=mensual&mes=${mesSeleccionado}`

    if (periodoTipo === 'semana') {
      urlRep = `/api/admin/reportes?tipo=semanal&fecha=${hoy}`
    } else if (periodoTipo === 'hoy') {
      urlRep = `/api/admin/reportes?tipo=diario&fecha=${hoy}`
    } else if (periodoTipo === 'mes_anterior') {
      const [yNum, mNum] = hoy.slice(0, 7).split('-').map(Number)
      const prevMes = mNum === 1 ? `${yNum - 1}-12` : `${yNum}-${String(mNum - 1).padStart(2, '0')}`
      urlRep = `/api/admin/reportes?tipo=mensual&mes=${prevMes}`
    }

    try {
      setLoading(true)
      const res = await fetch(urlRep, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setBarberosLiq(data.barberos ?? [])
        setReporteCitas(data.citas ?? [])
        if (data.resumen) {
          setResumenCaja({
            ingresosServicios: Number(data.resumen.ingresosServicios) || 0,
            ingresosTienda: Number(data.resumen.ingresosTienda) || 0,
            pedidosPagados: Number(data.resumen.pedidosPagados) || 0,
            totalRecaudado: Number(data.resumen.totalRecaudado) || 0,
            totalComisiones: Number(data.resumen.totalComisiones) || 0,
            gananciaBarberia: Number(data.resumen.gananciaBarberia) || 0,
            porMetodoPago: {
              efectivo: Number(data.resumen.porMetodoPago?.efectivo) || 0,
              yape: Number(data.resumen.porMetodoPago?.yape) || 0,
              plin: Number(data.resumen.porMetodoPago?.plin) || 0,
              tarjeta: Number(data.resumen.porMetodoPago?.tarjeta) || 0,
            },
          })
        }
      }
    } catch {
      notify('Error al cargar liquidación y cierre de caja', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function cargarPagos() {
    const hoy = getFechaHoy()
    const desde = shiftFecha(hoy, -60)
    const fin = shiftFecha(hoy, 14)

    try {
      const [rCitas, rPed] = await Promise.all([
        fetch(`/api/admin/citas?desde=${desde}&hasta=${fin}`, { cache: 'no-store' }),
        fetch('/api/admin/saas?mod=pedidos', { cache: 'no-store' }),
      ])

      const lista: PagoItem[] = []

      if (rCitas.ok) {
        const citas: Cita[] = (await rCitas.json()).citas ?? []
        for (const c of citas) {
          const ex = parseCitaExtras(c)
          lista.push({
            uid: `cita_${c.id}`,
            origen: 'cita',
            rawId: c.id,
            fecha: `${c.fecha} ${formatHora12(c.hora)}`,
            cliente: c.nombre,
            telefono: c.celular,
            concepto: `Cita: ${c.servicioNombre ?? c.servicio}`,
            metodo: (c.metodo_pago || 'efectivo').toLowerCase(),
            refPago: c.ref_pago || '',
            monto: ex.grandTotal,
            estado: c.estado,
          })
        }
      }

      if (rPed.ok) {
        const pedidos: Pedido[] = (await rPed.json()).pedidos ?? []
        for (const p of pedidos) {
          const fechaLima = utcToFechaLimaClient(p.created_at)
          lista.push({
            uid: `ped_${p.id}`,
            origen: 'pedido',
            rawId: p.id,
            fecha: fechaLima || (p.created_at || '').slice(0, 16),
            cliente: p.cliente,
            telefono: p.telefono,
            concepto: `Tienda: ${p.id}`,
            metodo: (p.metodo_pago || 'yape').toLowerCase(),
            refPago: p.ref_pago || '',
            monto: Number(p.total || 0),
            estado: p.estado,
          })
        }
      }

      lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
      setPagos(lista)
    } catch {
      notify('Error al cargar auditoría de pagos', 'err')
    }
  }

  useEffect(() => {
    void cargarLiquidacion()
    void cargarPagos()

    const unsub = syncBus.subscribe((ev) => {
      if (['cita_created', 'cita_updated', 'cita_deleted', 'pedido_created', 'pedido_updated', 'pago_updated'].includes(ev)) {
        void cargarLiquidacion()
        void cargarPagos()
      }
    })

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargarLiquidacion()
        void cargarPagos()
      }
    }, 15000)

    const onFocus = () => {
      void cargarLiquidacion()
      void cargarPagos()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      unsub()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [periodoTipo, mesSeleccionado])

  function esCitaFutura(item: PagoItem): boolean {
    if (item.origen !== 'cita') return false
    const fechaIso = item.fecha.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(fechaIso) && fechaIso > getFechaHoy()
  }

  async function resolverPago(item: PagoItem, accion: 'verificar' | 'rechazar') {
    if (accion === 'verificar' && esCitaFutura(item)) {
      notify(`No se puede aprobar el pago de una cita futura (${item.fecha.slice(0, 10)}). Disponible solo el día de la cita.`, 'err')
      return
    }
    if (item.origen === 'cita') {
      const nuevoEstado = accion === 'verificar' ? 'confirmada' : 'rechazada'
      const r = await fetch(`/api/admin/citas/${item.rawId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado, ref_pago: editRef || item.refPago, verificarPago: accion === 'verificar' }),
      })
      if (r.ok) {
        notify(accion === 'verificar' ? 'Pago verificado correctamente' : 'Pago rechazado')
        setSelectedPago(null)
        syncBus.emit('pago_updated')
        syncBus.emit('cita_updated', { id: item.rawId, estado: nuevoEstado })
        await cargarPagos()
      } else {
        const j = await r.json().catch(() => ({}))
        notify(j.error || 'No se pudo actualizar el pago', 'err')
      }
    } else {
      const nuevoEstado = accion === 'verificar' ? 'pagado' : 'cancelado'
      const r = await fetch('/api/admin/saas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mod: 'pedido', id: item.rawId, estado: nuevoEstado, ref_pago: editRef || item.refPago }),
      })
      if (r.ok) {
        notify(accion === 'verificar' ? 'Pago de tienda verificado' : 'Pago rechazado (stock repuesto)')
        setSelectedPago(null)
        syncBus.emit('pago_updated')
        syncBus.emit('pedido_updated', { id: item.rawId, estado: nuevoEstado })
        await cargarPagos()
      }
    }
  }

  function enviarWhatsAppBarbero(b: BarberoStat) {
    const periodoLabel =
      periodoTipo === 'mes'
        ? `Mes ${mesSeleccionado}`
        : periodoTipo === 'mes_anterior'
          ? 'Mes Anterior'
          : periodoTipo === 'semana'
            ? 'Esta Semana'
            : 'Hoy'

    const msgWa = `💈 *LIQUIDACIÓN DE COMISIONES — CHINO BARBERSHOP* 💈\n\n👤 *Barbero:* ${b.barberoNombre}\n📅 *Período:* ${periodoLabel}\n✂️ *Cortes Atendidos:* ${b.atendidas}\n💰 *Total Facturado:* ${money(b.totalCobrado)}\n💵 *Tu Comisión (${b.comisionPct}%):* ${money(b.pagoBarbero)}\n🏦 *Neto Barbería:* ${money(b.gananciaLocal)}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msgWa)}`, '_blank', 'noopener')
  }

  function exportarReporteActual() {
    if (subTab === 'liquidacion') {
      const columnas = [
        'Barbero',
        'Cortes Atendidos',
        'Total Facturado Servicios (S/)',
        'Comisión (%)',
        'Pago a Barbero (S/)',
        'Ganancia Servicios Local (S/)',
      ]
      const filas = barberosFiltrados.map(b => [
        b.barberoNombre,
        b.atendidas,
        b.totalCobrado.toFixed(2),
        `${b.comisionPct}%`,
        b.pagoBarbero.toFixed(2),
        b.gananciaLocal.toFixed(2),
      ])
      filas.push([
        'TOTAL SERVICIOS',
        totalCortesLiq,
        totalRecaudadoLiq.toFixed(2),
        '—',
        totalComisionesLiq.toFixed(2),
        totalNetoServLiq.toFixed(2),
      ])
      filas.push([
        'VENTAS TIENDA',
        resumenCaja.pedidosPagados,
        resumenCaja.ingresosTienda.toFixed(2),
        '—',
        '0.00',
        resumenCaja.ingresosTienda.toFixed(2),
      ])
      descargarCSV(`cierre_caja_comisiones_${periodoTipo}_${getFechaHoy()}`, columnas, filas)
      notify('Cierre de caja exportado en CSV')
    } else {
      const columnas = [
        'ID Transacción',
        'Fecha',
        'Tipo',
        'Cliente',
        'Teléfono',
        'Concepto',
        'Método de Pago',
        'N° Operación',
        'Monto (S/)',
        'Estado',
      ]
      const filas = pagosFiltrados.map(p => [
        p.rawId,
        p.fecha.slice(0, 10),
        p.origen === 'cita' ? 'Cita Presencial' : 'Venta Tienda',
        p.cliente,
        p.telefono,
        p.concepto,
        p.metodo.toUpperCase(),
        p.refPago || '—',
        p.monto.toFixed(2),
        p.estado.toUpperCase(),
      ])
      descargarCSV(`auditoria_pagos_caja_${getFechaHoy()}`, columnas, filas)
      notify('Auditoría de pagos exportada en CSV')
    }
  }

  const barberosFiltrados = barberosLiq.filter(b => {
    const okBarbero = filtroBarbero === 'todos' || b.barberoId === filtroBarbero || b.barberoNombre === filtroBarbero
    const q = busquedaBarbero.trim().toLowerCase()
    const okTxt = !q || b.barberoNombre.toLowerCase().includes(q)
    return okBarbero && okTxt
  })

  const totalRecaudadoLiq = barberosFiltrados.reduce((acc, b) => acc + b.totalCobrado, 0)
  const totalComisionesLiq = barberosFiltrados.reduce((acc, b) => acc + b.pagoBarbero, 0)
  const totalNetoServLiq = barberosFiltrados.reduce((acc, b) => acc + b.gananciaLocal, 0)
  const totalCortesLiq = barberosFiltrados.reduce((acc, b) => acc + b.atendidas, 0)

  const sinFiltroBarbero = filtroBarbero === 'todos' && !busquedaBarbero.trim()
  const totalCajaPeriodo = sinFiltroBarbero ? resumenCaja.totalRecaudado : totalRecaudadoLiq
  const netoLocalPeriodo = sinFiltroBarbero ? resumenCaja.gananciaBarberia : totalNetoServLiq

  const pagosFiltrados = pagos.filter(p => {
    const okMet =
      filtroMetodo === 'todos' ||
      (filtroMetodo === 'yape_plin' ? ['yape', 'plin'].includes(p.metodo) : p.metodo === filtroMetodo)
    const okEst =
      filtroEstado === 'todos' ||
      (filtroEstado === 'por_verificar'
        ? p.estado === 'pendiente'
        : filtroEstado === 'verificados'
          ? ['confirmada', 'completada', 'pagado', 'entregado'].includes(p.estado)
          : ['rechazada', 'cancelada', 'cancelado'].includes(p.estado))
    const q = busquedaPago.trim().toLowerCase()
    const okTxt = !q || p.cliente.toLowerCase().includes(q) || p.refPago.toLowerCase().includes(q) || p.concepto.toLowerCase().includes(q)
    return okMet && okEst && okTxt
  })

  const totalPorVerificar = pagos.filter(p => p.estado === 'pendiente').length
  const totalPaginasPagos = Math.max(1, Math.ceil(pagosFiltrados.length / ITEMS_PER_PAGE))
  const pagosPaginados = pagosFiltrados.slice((pagoPage - 1) * ITEMS_PER_PAGE, pagoPage * ITEMS_PER_PAGE)

  const citasDelBarbero = barberoSeleccionadoDetalle
    ? reporteCitas.filter(c =>
        ['completada', 'pagado'].includes(c.estado) &&
        (c.barbero === barberoSeleccionadoDetalle.barberoId || c.barberoNombre === barberoSeleccionadoDetalle.barberoNombre)
      )
    : []

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Caja, Pagos y Liquidación"
        sub="Cierre consolidado de servicios y tienda por método de pago, comisiones del equipo y auditoría"
        extraRight={
          <button type="button" onClick={exportarReporteActual} className={T.btnGhost}>
            <ModIcon name="Download" className="h-4 w-4" />
            <span>Exportar CSV</span>
          </button>
        }
        primaryAction={{
          label: 'Imprimir cierre',
          icon: 'Printer',
          onClick: () => {
            const periodoLabel =
              periodoTipo === 'mes'
                ? `Mes ${mesSeleccionado}`
                : periodoTipo === 'mes_anterior'
                  ? 'Mes anterior'
                  : periodoTipo === 'semana'
                    ? 'Esta semana'
                    : `Hoy (${getFechaHoy()})`
            printReporteCaja({
              subTab,
              periodoLabel,
              resumen: resumenCaja,
              barberos: barberosFiltrados,
              pagos: pagosFiltrados,
            })
          },
        }}
      />

      {/* Sub-navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="a-seg">
          <button
            type="button"
            onClick={() => setSubTab('liquidacion')}
            className={`a-seg-btn ${subTab === 'liquidacion' ? 'active' : ''}`}
          >
            <ModIcon name="Scissors" className="h-3.5 w-3.5" />
            <span>Cierre y Liquidación</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('pagos')}
            className={`a-seg-btn ${subTab === 'pagos' ? 'active' : ''}`}
          >
            <ModIcon name="CreditCard" className="h-3.5 w-3.5" />
            <span>Auditoría de Pagos</span>
            {totalPorVerificar > 0 && (
              <span
                className="ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold"
                style={{ background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn-line)' }}
              >
                {totalPorVerificar}
              </span>
            )}
          </button>
        </div>

        <span className="text-xs a-muted font-medium">
          {subTab === 'liquidacion' ? (
            <>Período activo: <b className="a-txt capitalize">{periodoTipo.replace('_', ' ')}</b></>
          ) : (
            <><b className="a-txt">{pagosFiltrados.length}</b> movimientos</>
          )}
        </span>
      </div>

      {/* VISTA 1: CIERRE DE CAJA Y LIQUIDACIÓN */}
      {subTab === 'liquidacion' && (
        <div className="space-y-4 a-fade">
          {/* Filtros de Período y Barbero */}
          <div className={`${T.panel} p-4 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="a-seg">
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('mes')}
                  className={`a-seg-btn ${periodoTipo === 'mes' ? 'active' : ''}`}
                >
                  <ModIcon name="Calendar" className="h-3.5 w-3.5" />
                  Este mes
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('mes_anterior')}
                  className={`a-seg-btn ${periodoTipo === 'mes_anterior' ? 'active' : ''}`}
                >
                  Mes pasado
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('semana')}
                  className={`a-seg-btn ${periodoTipo === 'semana' ? 'active' : ''}`}
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('hoy')}
                  className={`a-seg-btn ${periodoTipo === 'hoy' ? 'active' : ''}`}
                >
                  Hoy
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs a-muted font-medium">Mes:</span>
                <input
                  type="month"
                  value={mesSeleccionado}
                  onChange={e => {
                    setMesSeleccionado(e.target.value)
                    setPeriodoTipo('mes')
                  }}
                  className={`${T.input} !w-auto !min-h-[36px] !py-1 text-xs font-medium`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
              <div className="a-search-box max-w-xs flex-1">
                <span className="a-search-icon">
                  <ModIcon name="Search" className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="Filtrar por barbero..."
                  value={busquedaBarbero}
                  onChange={e => setBusquedaBarbero(e.target.value)}
                  className={`${T.input} a-search-input !min-h-[38px] text-xs`}
                />
              </div>

              <select
                value={filtroBarbero}
                onChange={e => setFiltroBarbero(e.target.value)}
                className={`${T.input} !w-auto !min-h-[38px] text-xs`}
              >
                <option value="todos">Todos los barberos ({barberosLiq.length})</option>
                {barberosLiq.map(b => (
                  <option key={b.barberoId} value={b.barberoId}>
                    {b.barberoNombre} ({b.comisionPct}%)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4 KPIs de Cierre */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={T.kpiCard}>
              <span className="text-xs font-semibold uppercase tracking-wider a-muted">Total Caja</span>
              <p className="mt-1.5 font-mono text-2xl font-bold a-txt">{money(totalCajaPeriodo)}</p>
              <span className="text-xs a-muted">
                {sinFiltroBarbero
                  ? `Serv. ${money(resumenCaja.ingresosServicios)} + Tnd. ${money(resumenCaja.ingresosTienda)}`
                  : `${totalCortesLiq} servicios del barbero`}
              </span>
            </div>

            <div className={T.kpiCard}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ok)' }}>
                Comisiones Equipo
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold" style={{ color: 'var(--ok)' }}>
                {money(totalComisionesLiq)}
              </p>
              <span className="text-xs a-muted">{totalCortesLiq} cortes liquidables</span>
            </div>

            <div className={T.kpiCard}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>
                Margen Neto Local
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold" style={{ color: 'var(--gold)' }}>
                {money(netoLocalPeriodo)}
              </p>
              <span className="text-xs a-muted">Después de comisiones</span>
            </div>

            <div className={T.kpiCard}>
              <span className="text-xs font-semibold uppercase tracking-wider a-muted">Ventas Tienda</span>
              <p className="mt-1.5 font-mono text-2xl font-bold a-txt">{money(resumenCaja.ingresosTienda)}</p>
              <span className="text-xs a-muted">{resumenCaja.pedidosPagados} pedidos pagados/entregados</span>
            </div>
          </div>

          {/* Desglose por Método de Pago (Servicios + Tienda) */}
          <div className={`${T.panel} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider a-muted">
                Cierre por método de pago (Servicios + Tienda)
              </h3>
              <span className="text-xs font-mono font-semibold a-txt">
                Total arqueo: {money(resumenCaja.totalRecaudado)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ['Efectivo', resumenCaja.porMetodoPago.efectivo],
                  ['Yape', resumenCaja.porMetodoPago.yape],
                  ['Plin', resumenCaja.porMetodoPago.plin],
                  ['Tarjeta', resumenCaja.porMetodoPago.tarjeta],
                ] as const
              ).map(([label, amount]) => (
                <div
                  key={label}
                  className="rounded-xl border px-3.5 py-2.5"
                  style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                >
                  <span className="text-xs a-muted block">{label}</span>
                  <span className="font-mono text-base font-bold a-txt">{money(amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla Ejecutiva de Liquidación por Barbero */}
          <div className={`${T.panel} overflow-hidden`}>
            {loading ? (
              <div className="p-8 text-center text-sm a-muted">Cargando liquidaciones del período...</div>
            ) : barberosFiltrados.length === 0 ? (
              <EmptyState text="No hay registros de liquidación para el período seleccionado." />
            ) : (
              <div className="overflow-x-auto">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>Barbero</th>
                      <th>Cortes Atendidos</th>
                      <th>Facturado Servicios</th>
                      <th>Comisión Barbero</th>
                      <th>Neto Barbería</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barberosFiltrados.map(b => (
                      <tr key={b.barberoId}>
                        <td data-label="Barbero">
                          <div className="flex items-center gap-3">
                            <div
                              className="size-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border"
                              style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-line)', color: 'var(--gold)' }}
                            >
                              {b.barberoNombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold a-txt text-sm leading-tight">{b.barberoNombre}</p>
                              <span className="a-chip mt-0.5">Comisión: {b.comisionPct}%</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Cortes" className="font-mono text-sm font-semibold">{b.atendidas} citas</td>
                        <td data-label="Facturado" className="font-mono text-sm">{money(b.totalCobrado)}</td>
                        <td data-label="Comisión">
                          <span
                            className="inline-block font-mono text-sm font-bold px-2.5 py-1 rounded-lg border"
                            style={{ color: 'var(--ok)', background: 'var(--ok-bg)', borderColor: 'var(--ok-line)' }}
                          >
                            {money(b.pagoBarbero)}
                          </span>
                        </td>
                        <td data-label="Neto local" className="font-mono text-sm a-muted">{money(b.gananciaLocal)}</td>
                        <td data-label="" className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setBarberoSeleccionadoDetalle(b)}
                              className={`${T.btnGhost} !min-h-[34px] !py-1.5 !px-2.5 !text-xs`}
                              title="Ver el detalle de cada corte realizado"
                            >
                              <ModIcon name="Search" className="h-3.5 w-3.5" />
                              <span>Ver cortes</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => enviarWhatsAppBarbero(b)}
                              className={`${T.btnGhost} !min-h-[34px] !py-1.5 !px-2.5 !text-xs`}
                              style={{ color: 'var(--ok)', borderColor: 'var(--ok-line)' }}
                              title="Enviar comprobante de liquidación por WhatsApp"
                            >
                              <ModIcon name="MessageCircle" className="h-3.5 w-3.5" />
                              <span>WhatsApp</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA 2: AUDITORÍA DE PAGOS Y CAJA */}
      {subTab === 'pagos' && (
        <div className="space-y-4 a-fade">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="a-search-box max-w-xs flex-1">
              <span className="a-search-icon">
                <ModIcon name="Search" className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="Buscar cliente, concepto u operación..."
                value={busquedaPago}
                onChange={e => {
                  setBusquedaPago(e.target.value)
                  setPagoPage(1)
                }}
                className={`${T.input} a-search-input text-xs`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filtroMetodo}
                onChange={e => {
                  setFiltroMetodo(e.target.value)
                  setPagoPage(1)
                }}
                className={`${T.input} !w-auto text-xs`}
              >
                <option value="todos">Método: Todos</option>
                <option value="yape_plin">Yape / Plin</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
              </select>

              <select
                value={filtroEstado}
                onChange={e => {
                  setFiltroEstado(e.target.value)
                  setPagoPage(1)
                }}
                className={`${T.input} !w-auto text-xs`}
              >
                <option value="todos">Estado: Todos</option>
                <option value="por_verificar">Por verificar</option>
                <option value="verificados">Verificados / Pagados</option>
                <option value="rechazados">Rechazados / Cancelados</option>
              </select>
            </div>
          </div>

          <div className={`${T.panel} overflow-hidden`}>
            {pagosPaginados.length === 0 ? (
              <EmptyState text="No se encontraron pagos para los filtros seleccionados." />
            ) : (
              <div className="overflow-x-auto">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Método / Op.</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th className="w-10 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagosPaginados.map(p => (
                      <tr
                        key={p.uid}
                        onClick={() => { setSelectedPago(p); setEditRef(p.refPago) }}
                        className="cursor-pointer"
                      >
                        <td data-label="Fecha" className="font-mono text-xs a-txt-2">{fechaLarga(p.fecha.slice(0, 10))}</td>
                        <td data-label="Cliente">
                          <p className="font-medium a-txt">{p.cliente}</p>
                          <p className="text-[11px] a-muted truncate max-w-[200px]">{p.concepto}</p>
                        </td>
                        <td data-label="Método" className="text-xs font-medium">{formatPaymentInfo(p.metodo, p.refPago)}</td>
                        <td data-label="Monto" className="font-mono font-semibold">{money(p.monto)}</td>
                        <td data-label="Estado"><Pill estado={p.estado} /></td>
                        <td data-label="" className="text-right">
                          <RowMenu
                            actions={[
                              { label: 'Revisar operación', onClick: () => { setSelectedPago(p); setEditRef(p.refPago) } },
                              {
                                label: esCitaFutura(p) ? 'Verificar pago (solo el día de la cita)' : 'Verificar pago',
                                disabled: esCitaFutura(p),
                                onClick: () => resolverPago(p, 'verificar'),
                              },
                              {
                                label: 'Rechazar pago',
                                danger: true,
                                onClick: () => resolverPago(p, 'rechazar'),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pagosFiltrados.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
                <span className="text-xs a-muted font-medium">
                  Página <b className="a-txt">{pagoPage}</b> de <b className="a-txt">{totalPaginasPagos}</b> ({pagosFiltrados.length} pagos)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pagoPage === 1}
                    onClick={() => setPagoPage(p => Math.max(1, p - 1))}
                    className={`${T.btnGhost} !min-h-[32px] !px-3 !py-1 !text-xs`}
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    disabled={pagoPage >= totalPaginasPagos}
                    onClick={() => setPagoPage(p => Math.min(totalPaginasPagos, p + 1))}
                    className={`${T.btnGhost} !min-h-[32px] !px-3 !py-1 !text-xs`}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRAWER DETALLE DE CORTES DEL BARBERO */}
      <Drawer
        open={!!barberoSeleccionadoDetalle}
        onClose={() => setBarberoSeleccionadoDetalle(null)}
        title={barberoSeleccionadoDetalle ? `Cortes de ${barberoSeleccionadoDetalle.barberoNombre}` : 'Detalle de Cortes'}
        sub={barberoSeleccionadoDetalle ? `Comisión pactada: ${barberoSeleccionadoDetalle.comisionPct}% · ${citasDelBarbero.length} citas` : ''}
        footer={
          barberoSeleccionadoDetalle && (
            <button
              type="button"
              onClick={() => enviarWhatsAppBarbero(barberoSeleccionadoDetalle)}
              className={`${T.btnPrimary} w-full`}
            >
              <ModIcon name="MessageCircle" className="h-4 w-4" />
              Enviar resumen por WhatsApp
            </button>
          )
        }
      >
        {barberoSeleccionadoDetalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-xl border text-xs" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
              <div>
                <span className="a-muted block">Total Facturado</span>
                <b className="font-mono text-sm a-txt">{money(barberoSeleccionadoDetalle.totalCobrado)}</b>
              </div>
              <div>
                <span className="a-muted block">Comisión a Pagar</span>
                <b className="font-mono text-sm" style={{ color: 'var(--ok)' }}>
                  {money(barberoSeleccionadoDetalle.pagoBarbero)}
                </b>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider a-muted">Citas atendidas en el período</span>
              {citasDelBarbero.length === 0 ? (
                <p className="text-xs a-muted text-center py-6">No hay citas registradas para este barbero en el período.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {citasDelBarbero.map(c => {
                    const montoBase = Number(c.servicioTotal ?? c.servicioPrecio ?? 0)
                    const comisionCita = (montoBase * (barberoSeleccionadoDetalle.comisionPct || 50)) / 100
                    return (
                      <div
                        key={c.id}
                        className="p-3 rounded-xl border text-xs space-y-1.5"
                        style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <b className="a-txt text-sm truncate">{c.servicioNombre}</b>
                          <span className="font-mono font-bold shrink-0" style={{ color: 'var(--ok)' }}>
                            +{money(comisionCita)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between a-muted text-[11px]">
                          <span>Cliente: <b className="a-txt">{c.nombre}</b></span>
                          <span>{fechaLarga(c.fecha)} · {formatHora12(c.hora)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t" style={{ borderColor: 'var(--line)' }}>
                          <span>Cobro: {money(montoBase)}</span>
                          <span className="uppercase">{c.metodo_pago}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* DRAWER VERIFICAR / RECHAZAR PAGO */}
      <Drawer
        open={!!selectedPago}
        onClose={() => setSelectedPago(null)}
        title={selectedPago ? `Pago · ${selectedPago.cliente}` : 'Verificar pago'}
        sub={selectedPago ? selectedPago.concepto : ''}
        footer={
          selectedPago && (
            <div className="flex flex-col gap-2">
              {esCitaFutura(selectedPago) && (
                <div
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
                  style={{ borderColor: 'var(--warn-line)', background: 'var(--warn-bg)', color: 'var(--warn)' }}
                >
                  <ModIcon name="Lock" className="h-4 w-4 shrink-0" />
                  <span>Cita programada para el <strong>{selectedPago.fecha.slice(0, 10)}</strong>. Disponible solo el día de la cita.</span>
                </div>
              )}
              <button
                type="button"
                disabled={esCitaFutura(selectedPago)}
                onClick={() => resolverPago(selectedPago, 'verificar')}
                className={`${T.btnPrimary} w-full disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                <ModIcon name="Check" className="h-4 w-4" />
                {esCitaFutura(selectedPago) ? 'Disponible el día de la cita' : 'Verificar y aprobar pago'}
              </button>
              <button
                type="button"
                onClick={() => resolverPago(selectedPago, 'rechazar')}
                className={`${T.btnDanger} w-full`}
              >
                Rechazar operación
              </button>
            </div>
          )
        }
      >
        {selectedPago && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Pill estado={selectedPago.estado} />
              <span className="font-mono text-xl font-bold a-txt">{money(selectedPago.monto)}</span>
            </div>

            <div className="rounded-xl border p-4 space-y-2 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
              <div className="flex justify-between">
                <span className="a-muted">Cliente</span>
                <span className="font-semibold a-txt">{selectedPago.cliente}</span>
              </div>
              <div className="flex justify-between">
                <span className="a-muted">Teléfono</span>
                <span className="font-mono font-semibold a-txt">{selectedPago.telefono}</span>
              </div>
              <div className="flex justify-between">
                <span className="a-muted">Método</span>
                <span className="font-semibold uppercase a-txt">{selectedPago.metodo}</span>
              </div>
            </div>

            <div>
              <label className={T.label}>Código de operación (Yape / Plin / POS)</label>
              <input
                className={T.input}
                placeholder="Ej. 984120"
                value={editRef}
                onChange={e => setEditRef(e.target.value)}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
