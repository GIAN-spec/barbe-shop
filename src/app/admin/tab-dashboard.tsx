'use client'

/**
 * MÓDULO 1: RESUMEN EJECUTIVO — CHINO BARBERSHOP
 * - Consume el endpoint unificado GET /api/admin/dashboard
 * - 4 KPIs con comparativas reales (vs ayer / vs mes anterior)
 * - Gráfico SVG semanal de ingresos (Servicios + Tienda)
 * - Centro de atención: pagos por verificar, pedidos pendientes y alertas de stock bajo
 * - Agenda del día con drawer lateral y creación rápida con validación de horario
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
  fechaLarga,
  money,
  parseCitaExtras,
  formatPaymentInfo,
  formatHora12,
  syncBus,
  type Cita,
  type Barbero,
  type Servicio,
  type Pedido,
  type RoleMode,
} from './ui'

type SerieDia = {
  iso: string
  label: string
  servicios: number
  tienda: number
  total: number
  citas: number
}

type StockBajoItem = {
  id: string
  nombre: string
  stock: number
  presentacion: string
}

type DashboardPayload = {
  hoy: string
  ayer: string
  citasHoy: Cita[]
  citasAyerCount: number
  ingresosHoy: number
  ingresosHoyServicios: number
  ingresosHoyTienda: number
  ingresosAyer: number
  ingresosMes: number
  ingresosMesPrev: number
  serie7Dias: SerieDia[]
  citasPorVerificar: Cita[]
  pedidosPendientes: Pedido[]
  stockBajo: StockBajoItem[]
  barberos: Barbero[]
  servicios: Servicio[]
}

function DeltaBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous <= 0 && current <= 0) {
    return <span className="a-delta-flat">Sin mov. {label}</span>
  }
  if (previous <= 0 && current > 0) {
    return (
      <span className="a-delta-up">
        <ModIcon name="TrendingUp" className="h-3 w-3" />
        +{current > 100 ? '100' : Math.round(current)}% {label}
      </span>
    )
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) {
    return (
      <span className="a-delta-up">
        <ModIcon name="TrendingUp" className="h-3 w-3" />
        +{pct}% {label}
      </span>
    )
  }
  if (pct < 0) {
    return (
      <span className="a-delta-down">
        <ModIcon name="TrendingDown" className="h-3 w-3" />
        {pct}% {label}
      </span>
    )
  }
  return <span className="a-delta-flat">Igual {label}</span>
}

export default function TabDashboard({
  onGoTab,
  roleMode = 'owner',
}: {
  onGoTab: (tab: string) => void
  roleMode?: RoleMode
}) {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [hoverDay, setHoverDay] = useState<SerieDia | null>(null)
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null)
  const [openNewCita, setOpenNewCita] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  // Formulario Nueva Cita en Drawer
  const [fNombre, setFNombre] = useState('')
  const [fCelular, setFCelular] = useState('')
  const [fServicio, setFServicio] = useState('')
  const [fBarbero, setFBarbero] = useState('')
  const [fHora, setFHora] = useState('10:00')
  const [fMetodo, setFMetodo] = useState('efectivo')

  const hoy = data?.hoy ?? getFechaHoy()

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 2200)
  }

  async function cargarDatos() {
    try {
      const r = await fetch(`/api/admin/dashboard?barbero=${encodeURIComponent(roleMode)}`, { cache: 'no-store' })
      if (!r.ok) return
      const payload = (await r.json()) as DashboardPayload
      setData(payload)
      if (!fBarbero && payload.barberos?.[0]) setFBarbero(payload.barberos[0].id)
      if (!fServicio && payload.servicios?.[0]) setFServicio(payload.servicios[0].id)
    } catch {}
  }

  useEffect(() => {
    void cargarDatos()

    const unsub = syncBus.subscribe((ev) => {
      if (['cita_created', 'cita_updated', 'cita_deleted', 'pedido_created', 'pedido_updated', 'pago_updated'].includes(ev)) {
        void cargarDatos()
      }
    })

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargarDatos()
      }
    }, 12000)

    const onFocus = () => void cargarDatos()
    window.addEventListener('focus', onFocus)

    return () => {
      unsub()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [roleMode])

  const citasHoyRol = data?.citasHoy ?? []
  const barberos = data?.barberos ?? []
  const servicios = data?.servicios ?? []
  const citasPorVerificar = data?.citasPorVerificar ?? []
  const pedidosPendientes = data?.pedidosPendientes ?? []
  const stockBajo = data?.stockBajo ?? []
  const serie7Dias = data?.serie7Dias ?? []

  const citasActivasHoy = citasHoyRol.filter(c => c.estado !== 'cancelada' && c.estado !== 'rechazada')
  const citasCompletadasHoy = citasHoyRol.filter(c => c.estado === 'completada' || c.estado === 'pagado')

  const totalPendientesAtencion =
    citasPorVerificar.length +
    pedidosPendientes.length +
    (roleMode === 'owner' ? stockBajo.length : 0)

  const totalSemanal = serie7Dias.reduce((acc, d) => acc + d.total, 0)
  const maxDia = Math.max(...serie7Dias.map(d => d.total), 1)

  async function cambiarEstadoCita(id: string, estado: string) {
    const r = await fetch(`/api/admin/citas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (r.ok) {
      const resData = await r.json()
      notify(
        estado === 'completada'
          ? resData.selloSumado
            ? 'Cita atendida (+1 sello VIP sumado)'
            : 'Cita marcada como atendida'
          : `Estado actualizado a ${estado}`
      )
      setSelectedCita(null)
      syncBus.emit('cita_updated', { id, estado })
      await cargarDatos()
    } else {
      const j = await r.json().catch(() => ({}))
      notify(j.error ?? 'No se pudo actualizar la cita', 'err')
    }
  }

  async function crearCitaRapida(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: fNombre || 'Cliente Presencial',
        celular: fCelular || '999999999',
        servicio: fServicio,
        barbero: roleMode === 'owner' ? fBarbero : roleMode,
        fecha: hoy,
        hora: fHora,
        metodo_pago: fMetodo,
        estado: 'confirmada',
      }),
    })
    if (r.ok) {
      notify('Cita creada para hoy')
      setOpenNewCita(false)
      setFNombre(''); setFCelular('')
      syncBus.emit('cita_created')
      await cargarDatos()
    } else {
      const j = await r.json().catch(() => ({}))
      notify(j.error ?? 'Error al crear cita', 'err')
    }
  }

  const nombreBarbero = (id: string) => barberos.find(b => b.id === id)?.nombre.split(' ')[0] ?? id

  return (
    <div className="a-fade space-y-6">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Resumen"
        primaryAction={{
          label: 'Nueva cita',
          icon: 'Plus',
          onClick: () => setOpenNewCita(true),
        }}
      />

      {/* 1. 4 KPIs EJECUTIVOS CON COMPARATIVAS REALES */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={T.kpiCard}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider a-muted">Citas hoy</p>
            <span className="a-kpi-icon">
              <ModIcon name="Calendar" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">{citasActivasHoy.length}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs a-muted">{citasCompletadasHoy.length} atendidas</span>
            <DeltaBadge current={citasActivasHoy.length} previous={data?.citasAyerCount ?? 0} label="vs ayer" />
          </div>
        </div>

        <div className={T.kpiCard}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider a-muted">Ingresos hoy</p>
            <span className="a-kpi-icon">
              <ModIcon name="CreditCard" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">{money(data?.ingresosHoy ?? 0)}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs a-muted truncate">
              Serv. {money(data?.ingresosHoyServicios ?? 0)} · Tnd. {money(data?.ingresosHoyTienda ?? 0)}
            </span>
            <DeltaBadge current={data?.ingresosHoy ?? 0} previous={data?.ingresosAyer ?? 0} label="ayer" />
          </div>
        </div>

        <div className={T.kpiCard}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider a-muted">Ingresos del mes</p>
            <span className="a-kpi-icon">
              <ModIcon name="TrendingUp" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">{money(data?.ingresosMes ?? 0)}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs a-muted">Acumulado mensual</span>
            <DeltaBadge current={data?.ingresosMes ?? 0} previous={data?.ingresosMesPrev ?? 0} label="mes ant." />
          </div>
        </div>

        <div className={T.kpiCard}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider a-muted">Pendientes</p>
            <span className="a-kpi-icon">
              <ModIcon name="AlertCircle" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">
            {citasPorVerificar.length + pedidosPendientes.length}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs a-muted">
              {citasPorVerificar.length} pagos · {pedidosPendientes.length} pedidos
            </span>
            {roleMode === 'owner' && stockBajo.length > 0 && (
              <span className="a-delta-down">{stockBajo.length} stock bajo</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. CENTRO DE ATENCIÓN + GRÁFICO SVG 7 DÍAS */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className={`${T.panel} p-5 lg:col-span-6 flex flex-col justify-between`}>
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold a-txt">Requiere tu atención</h2>
              <span className="text-xs font-semibold a-muted">{totalPendientesAtencion} alertas</span>
            </div>

            {totalPendientesAtencion === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs a-muted">Sin alertas pendientes.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {citasPorVerificar.slice(0, 3).map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold a-txt truncate">
                        Pago {c.metodo_pago.toUpperCase()} por verificar · {c.nombre}
                      </p>
                      <p className="a-muted mt-0.5">
                        {fechaLarga(c.fecha)} {formatHora12(c.hora)} · {formatPaymentInfo(c.metodo_pago, c.ref_pago)}
                      </p>
                    </div>
                    <button type="button" onClick={() => setSelectedCita(c)} className={`${T.btnGhost} !py-1.5 !px-3 !text-xs`}>
                      Revisar →
                    </button>
                  </div>
                ))}

                {pedidosPendientes.slice(0, 3).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold a-txt truncate">
                        Pedido {p.id} ({p.entrega === 'delivery' ? 'Delivery Local' : 'Recojo'}) · {p.cliente}
                      </p>
                      <p className="a-muted mt-0.5">
                        {money(p.total)} · {formatPaymentInfo(p.metodo_pago, p.ref_pago)}
                      </p>
                    </div>
                    <button type="button" onClick={() => onGoTab('pedidos')} className={`${T.btnGhost} !py-1.5 !px-3 !text-xs`}>
                      Ver pedido →
                    </button>
                  </div>
                ))}

                {roleMode === 'owner' && stockBajo.slice(0, 3).map(pr => (
                  <div key={pr.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-lg border"
                        style={{
                          borderColor: pr.stock === 0 ? 'var(--danger-line)' : 'var(--warn-line)',
                          background: pr.stock === 0 ? 'var(--danger-bg)' : 'var(--warn-bg)',
                          color: pr.stock === 0 ? 'var(--danger)' : 'var(--warn)',
                        }}
                      >
                        <ModIcon name="Package" className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold a-txt truncate">{pr.nombre}</p>
                        <p className="a-muted mt-0.5">
                          {pr.stock === 0 ? 'Sin unidades disponibles' : `Stock crítico: ${pr.stock} unid. restantes`}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => onGoTab('productos')} className={`${T.btnGhost} !py-1.5 !px-3 !text-xs`}>
                      Reponer →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Gráfico SVG semanal de ingresos */}
        <div className={`${T.panel} p-5 lg:col-span-6 flex flex-col justify-between`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-bold a-txt">Ingresos últimos 7 días</h2>
              {hoverDay && (
                <p className="text-xs a-muted mt-0.5">
                  {fechaLarga(hoverDay.iso)}: Serv. {money(hoverDay.servicios)} · Tienda {money(hoverDay.tienda)} ({hoverDay.citas} citas)
                </p>
              )}
            </div>
            <p className="font-mono text-lg font-bold a-txt shrink-0">{money(totalSemanal)}</p>
          </div>

          <div className="w-full pt-2">
            <svg viewBox="0 0 420 175" className="w-full h-44 overflow-visible" role="img" aria-label="Ingresos últimos 7 días">
              {/* Líneas guía horizontales */}
              {[0.25, 0.5, 0.75, 1].map((frac, idx) => {
                const y = 138 - frac * 108
                return (
                  <g key={idx}>
                    <line x1="8" x2="412" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 3" strokeWidth="1" />
                  </g>
                )
              })}
              <line x1="8" x2="412" y1="138" y2="138" stroke="var(--line-2)" strokeWidth="1" />

              {serie7Dias.map((d, i) => {
                const slotW = 404 / Math.max(1, serie7Dias.length)
                const barW = 30
                const x = 12 + i * slotW + (slotW - barW) / 2
                const hPx = d.total > 0 ? Math.max(6, Math.round((d.total / maxDia) * 108)) : 3
                const y = 138 - hPx
                const esHoy = d.iso === hoy
                const isHover = hoverDay?.iso === d.iso
                const fill = esHoy ? 'var(--gold)' : isHover ? 'var(--acc)' : 'var(--line-2)'

                return (
                  <g
                    key={d.iso}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverDay(d)}
                    onMouseLeave={() => setHoverDay(null)}
                  >
                    <rect x={x - 6} y="16" width={barW + 12} height="150" fill="transparent" />
                    <rect x={x} y={y} width={barW} height={hPx} rx="5" fill={fill} style={{ transition: 'all .15s ease' }} />
                    {d.total > 0 && (
                      <text
                        x={x + barW / 2}
                        y={y - 6}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={esHoy ? 'var(--gold)' : 'var(--txt-2)'}
                        className="font-mono"
                      >
                        {Math.round(d.total)}
                      </text>
                    )}
                    <text
                      x={x + barW / 2}
                      y="156"
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={esHoy ? '700' : '500'}
                      fill={esHoy ? 'var(--txt)' : 'var(--mut)'}
                      style={{ textTransform: 'uppercase' }}
                    >
                      {d.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* 3. AGENDA DE HOY */}
      <div className={`${T.panel} overflow-hidden`}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <h2 className="text-sm font-bold a-txt">Agenda de hoy ({citasHoyRol.length})</h2>
          <button type="button" onClick={() => onGoTab('agenda')} className="text-xs font-semibold a-txt-2 hover:underline cursor-pointer">
            Ver agenda completa →
          </button>
        </div>

        {citasHoyRol.length === 0 ? (
          <EmptyState text="No hay citas registradas para hoy." actionLabel="Nueva cita" onAction={() => setOpenNewCita(true)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Barbero</th>
                  <th>Estado</th>
                  <th className="w-10 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {citasHoyRol.map(c => (
                  <tr key={c.id} onClick={() => setSelectedCita(c)} className="cursor-pointer">
                    <td data-label="Hora" className="font-mono font-semibold">{formatHora12(c.hora)}</td>
                    <td data-label="Cliente" className="font-medium">{c.nombre}</td>
                    <td data-label="Servicio" className="a-txt-2">{c.servicioNombre ?? c.servicio}</td>
                    <td data-label="Barbero" className="a-txt-2">{nombreBarbero(c.barbero)}</td>
                    <td data-label="Estado"><Pill estado={c.estado} /></td>
                    <td data-label="" className="text-right">
                      <RowMenu
                        actions={[
                          { label: 'Ver detalle', onClick: () => setSelectedCita(c) },
                          {
                            label: 'Marcar atendida (+1 VIP)',
                            disabled: c.estado === 'completada',
                            onClick: () => cambiarEstadoCita(c.id, 'completada'),
                          },
                          {
                            label: 'Confirmar cita',
                            disabled: c.estado !== 'pendiente',
                            onClick: () => cambiarEstadoCita(c.id, 'confirmada'),
                          },
                          {
                            label: 'Cancelar cita',
                            danger: true,
                            disabled: c.estado === 'cancelada',
                            onClick: () => cambiarEstadoCita(c.id, 'cancelada'),
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
      </div>

      {/* DRAWER DETALLE DE CITA */}
      <Drawer
        open={!!selectedCita}
        onClose={() => setSelectedCita(null)}
        title={selectedCita ? `Cita · ${selectedCita.nombre}` : 'Detalle de cita'}
        sub={selectedCita ? `${fechaLarga(selectedCita.fecha)} a las ${formatHora12(selectedCita.hora)}` : ''}
        footer={
          selectedCita && (
            <div className="flex flex-col gap-2">
              {selectedCita.estado !== 'completada' && selectedCita.estado !== 'cancelada' && (
                <button
                  type="button"
                  disabled={selectedCita.fecha > hoy}
                  onClick={() => cambiarEstadoCita(selectedCita.id, 'completada')}
                  className={`${T.btnPrimary} w-full`}
                >
                  <ModIcon name="Check" className="h-4 w-4" />
                  {selectedCita.fecha > hoy ? 'Disponible el día de la cita' : 'Marcar como Atendida (+1 sello VIP)'}
                </button>
              )}
              <div className="flex gap-2">
                {selectedCita.estado === 'pendiente' && (
                  <button type="button" onClick={() => cambiarEstadoCita(selectedCita.id, 'confirmada')} className={`${T.btnGhost} flex-1`}>
                    Confirmar
                  </button>
                )}
                {selectedCita.estado !== 'cancelada' && (
                  <button type="button" onClick={() => cambiarEstadoCita(selectedCita.id, 'cancelada')} className={`${T.btnDanger} flex-1`}>
                    Cancelar cita
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {selectedCita && (() => {
          const ex = parseCitaExtras(selectedCita)
          return (
            <>
              <div className="flex items-center justify-between">
                <Pill estado={selectedCita.estado} />
                <span className="font-mono text-sm font-bold a-txt">{money(ex.grandTotal)}</span>
              </div>

              <div className="rounded-lg border p-4 space-y-2 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
                <div className="flex justify-between">
                  <span className="a-muted">Cliente</span>
                  <span className="font-semibold a-txt">{selectedCita.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="a-muted">Teléfono</span>
                  <a
                    href={`https://wa.me/51${selectedCita.celular.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-semibold underline a-txt"
                  >
                    {selectedCita.celular} ↗
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="a-muted">Barbero</span>
                  <span className="font-semibold a-txt">{nombreBarbero(selectedCita.barbero)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="a-muted">Servicio</span>
                  <span className="font-semibold a-txt">{selectedCita.servicioNombre ?? selectedCita.servicio}</span>
                </div>
                {ex.productsText && (
                  <div className="flex justify-between">
                    <span className="a-muted">Productos</span>
                    <span className="font-semibold a-txt">{ex.productsText} (+{money(ex.productsTotal)})</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                  <span className="a-muted">Pago</span>
                  <span className="font-semibold a-txt">{formatPaymentInfo(selectedCita.metodo_pago, selectedCita.ref_pago)}</span>
                </div>
              </div>
            </>
          )
        })()}
      </Drawer>

      {/* DRAWER NUEVA CITA */}
      <Drawer
        open={openNewCita}
        onClose={() => setOpenNewCita(false)}
        title="Nueva cita"
        footer={
          <button type="submit" form="form-resumen-cita" className={`${T.btnPrimary} w-full`}>
            Guardar cita
          </button>
        }
      >
        <form id="form-resumen-cita" onSubmit={crearCitaRapida} className="space-y-4">
          <div>
            <label className={T.label}>Cliente</label>
            <input className={T.input} placeholder="Nombre completo" value={fNombre} onChange={e => setFNombre(e.target.value)} required />
          </div>
          <div>
            <label className={T.label}>Teléfono / WhatsApp</label>
            <input className={T.input} placeholder="999 888 777" value={fCelular} onChange={e => setFCelular(e.target.value)} required />
          </div>
          <div>
            <label className={T.label}>Servicio</label>
            <select className={T.input} value={fServicio} onChange={e => setFServicio(e.target.value)}>
              {servicios.map(s => (
                <option key={s.id} value={s.id}>{s.nombre} — S/ {s.precio}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={T.label}>Barbero</label>
              <select
                className={T.input}
                value={roleMode === 'owner' ? fBarbero : roleMode}
                disabled={roleMode !== 'owner'}
                onChange={e => setFBarbero(e.target.value)}
              >
                {barberos.map(b => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={T.label}>Hora</label>
              <input type="time" className={T.input} value={fHora} onChange={e => setFHora(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className={T.label}>Método de pago</label>
            <select className={T.input} value={fMetodo} onChange={e => setFMetodo(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
