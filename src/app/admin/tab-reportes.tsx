'use client'

/**
 * MÓDULO 4: PAGOS, CAJA Y LIQUIDACIÓN DE COMISIONES (SaaS)
 * - Pestaña 1: Liquidación de Barberos & Comisiones (Filtros por período, barbero, detalle de cortes, WhatsApp e impresión)
 * - Pestaña 2: Auditoría de Pagos & Caja (Paginación limpia, verificación de transferencias Yape / Plin / POS)
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
  barbero: string
  barberoNombre: string
  barberoComision: number
  metodo_pago: string
  ref_pago: string | null
  estado: string
}

export default function TabPagos() {
  // Pestañas principales superiores (para no tener que scrollear hasta el fondo)
  const [subTab, setSubTab] = useState<'liquidacion' | 'pagos'>('liquidacion')

  // Datos globales
  const [pagos, setPagos] = useState<PagoItem[]>([])
  const [barberosLiq, setBarberosLiq] = useState<BarberoStat[]>([])
  const [reporteCitas, setReporteCitas] = useState<ReporteCita[]>([])
  const [loading, setLoading] = useState(false)

  // Filtros de Liquidación
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

  // Drawer de verificación de pagos
  const [selectedPago, setSelectedPago] = useState<PagoItem | null>(null)
  const [editRef, setEditRef] = useState('')
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1800)
  }

  // Cargar liquidación según el período seleccionado
  async function cargarLiquidacion() {
    const hoy = getFechaHoy()
    let urlRep = `/api/admin/reportes?tipo=mensual&mes=${mesSeleccionado}`

    if (periodoTipo === 'semana') {
      urlRep = `/api/admin/reportes?tipo=semanal&fecha=${hoy}`
    } else if (periodoTipo === 'hoy') {
      urlRep = `/api/admin/reportes?tipo=diario&fecha=${hoy}`
    } else if (periodoTipo === 'mes_anterior') {
      const prevDate = new Date(hoy + 'T12:00:00')
      prevDate.setMonth(prevDate.getMonth() - 1)
      const prevMes = prevDate.toISOString().slice(0, 7)
      urlRep = `/api/admin/reportes?tipo=mensual&mes=${prevMes}`
    }

    try {
      setLoading(true)
      const res = await fetch(urlRep, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setBarberosLiq(data.barberos ?? [])
        setReporteCitas(data.citas ?? [])
      }
    } catch {
      notify('Error al cargar liquidación de barberos', 'err')
    } finally {
      setLoading(false)
    }
  }

  // Cargar lista de pagos para auditoría
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
          lista.push({
            uid: `ped_${p.id}`,
            origen: 'pedido',
            rawId: p.id,
            fecha: (p.created_at || '').slice(0, 16),
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
      notify('Error al cargar pagos', 'err')
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
    }, 4000)

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
        notify(accion === 'verificar' ? 'Pago de tienda verificado' : 'Pago rechazado')
        setSelectedPago(null)
        syncBus.emit('pago_updated')
        syncBus.emit('pedido_updated', { id: item.rawId, estado: nuevoEstado })
        await cargarPagos()
      }
    }
  }

  // Enviar liquidación por WhatsApp al barbero
  function enviarWhatsAppBarbero(b: BarberoStat) {
    const periodoLabel =
      periodoTipo === 'mes'
        ? `Mes ${mesSeleccionado}`
        : periodoTipo === 'mes_anterior'
          ? 'Mes Anterior'
          : periodoTipo === 'semana'
            ? 'Esta Semana'
            : 'Hoy'

    const msg = `💈 *LIQUIDACIÓN DE COMISIONES — CHINO BARBER SHOP* 💈\n\n👤 *Barbero:* ${b.barberoNombre}\n📅 *Período:* ${periodoLabel}\n✂️ *Cortes Atendidos:* ${b.atendidas}\n💰 *Total Facturado:* ${money(b.totalCobrado)}\n💵 *Tu Comisión a Cobrar (${b.comisionPct}%):* ${money(b.pagoBarbero)}\n🏦 *Neto Barbería:* ${money(b.gananciaLocal)}\n\n¡Gracias por tu compromiso y excelente atención a nuestros clientes!`

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  // Exportar datos a Excel / CSV con compatibilidad Windows UTF-8
  function exportarReporteActual() {
    if (subTab === 'liquidacion') {
      const columnas = [
        'Barbero',
        'Cortes Atendidos',
        'Total Facturado (S/)',
        'Comisión (%)',
        'Pago a Barbero (S/)',
        'Ganancia Local (S/)',
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
        'TOTAL GENERAL',
        totalCortesLiq,
        totalRecaudadoLiq.toFixed(2),
        '—',
        totalComisionesLiq.toFixed(2),
        totalNetoLocalLiq.toFixed(2),
      ])
      descargarCSV(`liquidacion_comisiones_${periodoTipo}_${getFechaHoy()}`, columnas, filas)
      notify('Reporte de liquidación exportado en Excel (CSV) con éxito')
    } else {
      const columnas = [
        'ID Transacción',
        'Fecha',
        'Hora',
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
        p.fecha.slice(11, 16) || '—',
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
      notify('Auditoría de caja exportada en Excel (CSV) con éxito')
    }
  }

  // Filtrado de barberos para liquidación
  const barberosFiltrados = barberosLiq.filter(b => {
    const okBarbero = filtroBarbero === 'todos' || b.barberoId === filtroBarbero || b.barberoNombre === filtroBarbero
    const q = busquedaBarbero.trim().toLowerCase()
    const okTxt = !q || b.barberoNombre.toLowerCase().includes(q)
    return okBarbero && okTxt
  })

  // Totales de Liquidación en el período
  const totalRecaudadoLiq = barberosFiltrados.reduce((acc, b) => acc + b.totalCobrado, 0)
  const totalComisionesLiq = barberosFiltrados.reduce((acc, b) => acc + b.pagoBarbero, 0)
  const totalNetoLocalLiq = barberosFiltrados.reduce((acc, b) => acc + b.gananciaLocal, 0)
  const totalCortesLiq = barberosFiltrados.reduce((acc, b) => acc + b.atendidas, 0)

  // Filtrado y paginación de pagos
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

  // Citas del barbero seleccionado en el Drawer de detalle
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
        title="Liquidación y Control de Pagos"
        sub="Calcula las comisiones de tu equipo de barberos y audita las transferencias de caja en un solo lugar"
        primaryAction={{
          label: 'Imprimir Reporte',
          onClick: () => window.print(),
        }}
      />

      {/* Sub-navegación Superior (Para ir directo a la liquidación sin scrollear al final) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--line)' }}>
        <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border" style={{ borderColor: 'var(--line)' }}>
          <button
            type="button"
            onClick={() => setSubTab('liquidacion')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'liquidacion'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="text-sm">💈</span>
            <span>Liquidación de Barberos & Comisiones</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('pagos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'pagos'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="text-sm">💳</span>
            <span>Auditoría de Pagos & Caja</span>
            {totalPorVerificar > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950">
                {totalPorVerificar}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportarReporteActual}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-emerald-600/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Descargar datos en formato Excel compatible (.csv UTF-8)"
          >
            <span className="text-sm">📥</span>
            <span>Exportar a Excel (CSV)</span>
          </button>
          <div className="hidden sm:block text-xs a-muted font-medium">
            {subTab === 'liquidacion' ? (
              <span>Período: <b className="a-txt capitalize">{periodoTipo.replace('_', ' ')}</b></span>
            ) : (
              <span><b className="a-txt">{pagosFiltrados.length}</b> registros</span>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          VISTA 1: LIQUIDACIÓN DE BARBEROS Y COMISIONES (ACCESO INMEDIATO)
          ========================================================= */}
      {subTab === 'liquidacion' && (
        <div className="space-y-4 a-fade">
          {/* Barra de Filtros de Período y Búsqueda de Barbero */}
          <div className="rounded-2xl border p-4 bg-white dark:bg-slate-900 shadow-sm space-y-3" style={{ borderColor: 'var(--line)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Chips Rápidos de Período */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider a-muted mr-1">Período:</span>
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('mes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    periodoTipo === 'mes'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'border text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  style={{ borderColor: 'var(--line)' }}
                >
                  📅 Este Mes
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('mes_anterior')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    periodoTipo === 'mes_anterior'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'border text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  style={{ borderColor: 'var(--line)' }}
                >
                  Mes Pasado
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('semana')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    periodoTipo === 'semana'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'border text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  style={{ borderColor: 'var(--line)' }}
                >
                  Esta Semana
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodoTipo('hoy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    periodoTipo === 'hoy'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'border text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  style={{ borderColor: 'var(--line)' }}
                >
                  Hoy
                </button>
              </div>

              {/* Selector de Mes Específico */}
              <div className="flex items-center gap-2">
                <span className="text-xs a-muted font-medium">Elegir mes:</span>
                <input
                  type="month"
                  value={mesSeleccionado}
                  onChange={e => {
                    setMesSeleccionado(e.target.value)
                    setPeriodoTipo('mes')
                  }}
                  className={`${T.input} !w-auto !py-1 text-xs font-medium`}
                />
              </div>
            </div>

            {/* Búsqueda por Barbero y Filtro Dropdown */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
              <div className="a-search-box max-w-xs flex-1">
                <span className="a-search-icon">
                  <ModIcon name="Search" className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="Filtrar por nombre de barbero..."
                  value={busquedaBarbero}
                  onChange={e => setBusquedaBarbero(e.target.value)}
                  className={`${T.input} a-search-input text-xs`}
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filtroBarbero}
                  onChange={e => setFiltroBarbero(e.target.value)}
                  className={`${T.input} !w-auto text-xs`}
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
          </div>

          {/* Tarjetas KPI de Cierre de Liquidación */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border p-4 bg-white dark:bg-slate-900" style={{ borderColor: 'var(--line)' }}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Facturado</span>
              <p className="mt-1 font-mono text-2xl font-black text-slate-900 dark:text-white">{money(totalRecaudadoLiq)}</p>
              <span className="text-xs text-slate-400">En servicios completados</span>
            </div>
            <div className="rounded-xl border p-4 bg-emerald-50/60 dark:bg-emerald-950/20" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Comisiones a Barberos</span>
              <p className="mt-1 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">{money(totalComisionesLiq)}</p>
              <span className="text-xs text-emerald-600/70">Monto total a liquidar</span>
            </div>
            <div className="rounded-xl border p-4 bg-amber-50/60 dark:bg-amber-950/20" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Margen Neto Barbería</span>
              <p className="mt-1 font-mono text-2xl font-black text-amber-600 dark:text-amber-400">{money(totalNetoLocalLiq)}</p>
              <span className="text-xs text-amber-600/70">Ganancia neta del local</span>
            </div>
            <div className="rounded-xl border p-4 bg-white dark:bg-slate-900" style={{ borderColor: 'var(--line)' }}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cortes Atendidos</span>
              <p className="mt-1 font-mono text-2xl font-black text-slate-900 dark:text-white">{totalCortesLiq}</p>
              <span className="text-xs text-slate-400">En el período consultado</span>
            </div>
          </div>

          {/* Tabla Ejecutiva de Liquidación por Barbero */}
          <div className={`${T.panel} overflow-hidden shadow-sm`}>
            {loading ? (
              <div className="p-8 text-center text-sm a-muted">Cargando liquidaciones del período...</div>
            ) : barberosFiltrados.length === 0 ? (
              <EmptyState text="No hay registros de liquidación para el período o barbero seleccionado." />
            ) : (
              <div className="overflow-x-auto">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>Barbero</th>
                      <th>Cortes Atendidos</th>
                      <th>Total Recaudado</th>
                      <th>Comisión Barbero</th>
                      <th>Neto Barbería</th>
                      <th className="text-right">Acciones Rápidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barberosFiltrados.map(b => (
                      <tr key={b.barberoId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-bold text-amber-600 text-xs flex-shrink-0">
                              {b.barberoNombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold a-txt text-sm leading-tight">{b.barberoNombre}</p>
                              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                Comisión: {b.comisionPct}%
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="font-mono text-sm font-semibold">{b.atendidas} citas</td>
                        <td className="font-mono text-sm">{money(b.totalCobrado)}</td>
                        <td>
                          <span className="font-mono text-base font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                            {money(b.pagoBarbero)}
                          </span>
                        </td>
                        <td className="font-mono text-sm a-muted">{money(b.gananciaLocal)}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setBarberoSeleccionadoDetalle(b)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold border hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5"
                              style={{ borderColor: 'var(--line)' }}
                              title="Ver el detalle de cada corte realizado"
                            >
                              <ModIcon name="Search" className="h-3.5 w-3.5" />
                              <span>Ver Cortes</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => enviarWhatsAppBarbero(b)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all flex items-center gap-1.5"
                              title="Enviar comprobante de liquidación por WhatsApp"
                            >
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                                <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3.2-.5 0-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3c-.6.6-.9 1.4-.9 2.3.1 1.5.8 2.9 1.8 4 1.9 2.3 4.4 3.3 5.4 3 .4-.1 1.1-.5 1.3-1 .1-.4.1-.7.1-.8-.1-.1-.2-.1-.4-.2z"/>
                              </svg>
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

      {/* =========================================================
          VISTA 2: AUDITORÍA DE PAGOS, CAJA Y TRANSFERENCIAS (CON PAGINACIÓN)
          ========================================================= */}
      {subTab === 'pagos' && (
        <div className="space-y-4 a-fade">
          {/* Búsqueda y Filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="a-search-box max-w-xs flex-1">
              <span className="a-search-icon">
                <ModIcon name="Search" className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="Buscar cliente, servicio o N.º de operación..."
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

          {/* Tabla Paginada de Transacciones */}
          <div className={`${T.panel} overflow-hidden shadow-sm`}>
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
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <td className="font-mono text-xs a-txt-2">{fechaLarga(p.fecha.slice(0, 10))}</td>
                        <td>
                          <p className="font-medium a-txt">{p.cliente}</p>
                          <p className="text-[11px] a-muted truncate max-w-[200px]">{p.concepto}</p>
                        </td>
                        <td className="text-xs font-medium">{formatPaymentInfo(p.metodo, p.refPago)}</td>
                        <td className="font-mono font-semibold">{money(p.monto)}</td>
                        <td><Pill estado={p.estado} /></td>
                        <td className="text-right">
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

            {/* Paginador Inferior */}
            {pagosFiltrados.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50 dark:bg-slate-900/50" style={{ borderColor: 'var(--line)' }}>
                <span className="text-xs a-muted font-medium">
                  Página <b className="a-txt">{pagoPage}</b> de <b className="a-txt">{totalPaginasPagos}</b> ({pagosFiltrados.length} pagos)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pagoPage === 1}
                    onClick={() => setPagoPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-lg text-xs font-bold border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    disabled={pagoPage >= totalPaginasPagos}
                    onClick={() => setPagoPage(p => Math.min(totalPaginasPagos, p + 1))}
                    className="px-3 py-1 rounded-lg text-xs font-bold border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          DRAWER 1: DETALLE DE CORTES ATENDIDOS POR BARBERO
          ========================================================= */}
      <Drawer
        open={!!barberoSeleccionadoDetalle}
        onClose={() => setBarberoSeleccionadoDetalle(null)}
        title={barberoSeleccionadoDetalle ? `Cortes de ${barberoSeleccionadoDetalle.barberoNombre}` : 'Detalle de Cortes'}
        sub={barberoSeleccionadoDetalle ? `Comisión pactada: ${barberoSeleccionadoDetalle.comisionPct}% · Total citas: ${citasDelBarbero.length}` : ''}
        footer={
          barberoSeleccionadoDetalle && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => enviarWhatsAppBarbero(barberoSeleccionadoDetalle)}
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3.2-.5 0-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3c-.6.6-.9 1.4-.9 2.3.1 1.5.8 2.9 1.8 4 1.9 2.3 4.4 3.3 5.4 3 .4-.1 1.1-.5 1.3-1 .1-.4.1-.7.1-.8-.1-.1-.2-.1-.4-.2z"/>
                </svg>
                Enviar Resumen por WhatsApp
              </button>
            </div>
          )
        }
      >
        {barberoSeleccionadoDetalle && (
          <div className="space-y-4">
            {/* Resumen compacto del barbero */}
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl border bg-slate-50/70 dark:bg-slate-800/40 text-xs" style={{ borderColor: 'var(--line)' }}>
              <div>
                <span className="a-muted block">Total Facturado</span>
                <b className="font-mono text-sm a-txt">{money(barberoSeleccionadoDetalle.totalCobrado)}</b>
              </div>
              <div>
                <span className="a-muted block">Comisión a Pagar</span>
                <b className="font-mono text-sm text-emerald-600 dark:text-emerald-400">{money(barberoSeleccionadoDetalle.pagoBarbero)}</b>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider a-muted">Citas Atendidas en el Período</span>
              {citasDelBarbero.length === 0 ? (
                <p className="text-xs a-muted text-center py-6">No hay citas registradas para este barbero en el período.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {citasDelBarbero.map(c => {
                    const comisionCita = (Number(c.servicioPrecio || 0) * (barberoSeleccionadoDetalle.comisionPct || 50)) / 100
                    return (
                      <div
                        key={c.id}
                        className="p-3 rounded-xl border bg-white dark:bg-slate-900 text-xs space-y-1.5 shadow-xs"
                        style={{ borderColor: 'var(--line)' }}
                      >
                        <div className="flex items-center justify-between">
                          <b className="a-txt text-sm">{c.servicioNombre}</b>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{money(comisionCita)}</span>
                        </div>
                        <div className="flex items-center justify-between a-muted text-[11px]">
                          <span>Cliente: <b className="a-txt">{c.nombre}</b></span>
                          <span>{fechaLarga(c.fecha)} · {formatHora12(c.hora)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
                          <span>Cobro: {money(c.servicioPrecio)}</span>
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

      {/* =========================================================
          DRAWER 2: VERIFICAR O RECHAZAR PAGO (AUDITORÍA DE CAJA)
          ========================================================= */}
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
                  className="rounded-lg border px-3 py-2 text-xs font-medium"
                  style={{ borderColor: 'var(--warn-line)', background: 'var(--warn-bg)', color: 'var(--warn)' }}
                >
                  🔒 Cita programada para el <strong>{selectedPago.fecha.slice(0, 10)}</strong>. Solo se puede verificar y aprobar el pago el mismo día de la cita o fechas anteriores.
                </div>
              )}
              <button
                type="button"
                disabled={esCitaFutura(selectedPago)}
                onClick={() => resolverPago(selectedPago, 'verificar')}
                className={`${T.btnPrimary} w-full disabled:opacity-45 disabled:cursor-not-allowed`}
              >
                <ModIcon name="Check" className="h-4 w-4" />
                {esCitaFutura(selectedPago) ? 'Disponible el día de la cita' : 'Verificar y Aprobar Pago'}
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
              <span className="font-mono text-xl font-black a-txt">{money(selectedPago.monto)}</span>
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
