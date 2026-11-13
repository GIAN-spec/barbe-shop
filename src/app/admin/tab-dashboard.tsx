'use client'

/**
 * MÓDULO 1: RESUMEN GENERAL (SaaS Dashboard)
 * - 4 KPIs (Citas hoy, Ingresos hoy, Pedidos pendientes, Pagos por verificar)
 * - Bloque "Requiere tu atención" + Gráfico de ingresos semanales
 * - Tabla "Agenda de Hoy" (máx. 5 columnas + menú ⋯ + Drawer lateral de detalle)
 * - Una sola acción primaria en pantalla: "+ Nueva cita"
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
  syncBus,
  type Cita,
  type Barbero,
  type Servicio,
  type Pedido,
  type RoleMode,
} from './ui'

export default function TabDashboard({
  onGoTab,
  roleMode = 'owner',
}: {
  onGoTab: (tab: string) => void
  roleMode?: RoleMode
}) {
  const [citasHoy, setCitasHoy] = useState<Cita[]>([])
  const [citasSemana, setCitasSemana] = useState<Cita[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [barberos, setBarberos] = useState<Barbero[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
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

  const hoy = getFechaHoy()

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargarDatos() {
    const hace6Dias = shiftFecha(hoy, -6)
    const [rHoy, rSem, rSaas, rBarb, rServ] = await Promise.all([
      fetch(`/api/admin/citas?fecha=${hoy}`, { cache: 'no-store' }),
      fetch(`/api/admin/citas?desde=${hace6Dias}&hasta=${hoy}`, { cache: 'no-store' }),
      fetch('/api/admin/saas?mod=pedidos', { cache: 'no-store' }),
      fetch('/api/admin/barberos', { cache: 'no-store' }),
      fetch('/api/admin/servicios', { cache: 'no-store' }),
    ])
    if (rHoy.ok) setCitasHoy((await rHoy.json()).citas ?? [])
    if (rSem.ok) setCitasSemana((await rSem.json()).citas ?? [])
    if (rSaas.ok) setPedidos((await rSaas.json()).pedidos ?? [])
    if (rBarb.ok) {
      const bList = (await rBarb.json()).barberos ?? []
      setBarberos(bList)
      if (!fBarbero && bList[0]) setFBarbero(bList[0].id)
    }
    if (rServ.ok) {
      const sList = (await rServ.json()).servicios ?? []
      setServicios(sList)
      if (!fServicio && sList[0]) setFServicio(sList[0].id)
    }
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
    }, 4000)

    const onFocus = () => void cargarDatos()
    window.addEventListener('focus', onFocus)

    return () => {
      unsub()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Filtrado por rol (Dueño ve todo; Barbero ve solo su agenda)
  const citasHoyRol = roleMode === 'owner' ? citasHoy : citasHoy.filter(c => c.barbero === roleMode)
  const citasSemanaRol = roleMode === 'owner' ? citasSemana : citasSemana.filter(c => c.barbero === roleMode)

  // KPI 1: Citas Hoy
  const citasActivasHoy = citasHoyRol.filter(c => c.estado !== 'cancelada' && c.estado !== 'rechazada')
  const citasCompletadasHoy = citasHoyRol.filter(c => c.estado === 'completada' || c.estado === 'pagado')

  // KPI 2: Ingresos Hoy (Servicios atendidos/pagados + Pedidos pagados/entregados hoy)
  const ingresosCitasHoy = citasCompletadasHoy.reduce((acc, c) => acc + parseCitaExtras(c).grandTotal, 0)
  const ingresosPedidosHoy = roleMode === 'owner'
    ? pedidos
        .filter(p => (p.estado === 'pagado' || p.estado === 'entregado') && (p.created_at || '').startsWith(hoy))
        .reduce((acc, p) => acc + Number(p.total || 0), 0)
    : 0
  const ingresosHoyTotal = ingresosCitasHoy + ingresosPedidosHoy

  // KPI 3: Pedidos pendientes
  const pedidosPendientes = pedidos.filter(p => p.estado === 'pendiente')

  // KPI 4: Pagos por verificar (citas o pedidos con Yape/Plin en estado pendiente)
  const citasPorVerificar = citasSemanaRol.filter(
    c => c.estado === 'pendiente' && ['yape', 'plin'].includes((c.metodo_pago || '').toLowerCase())
  )
  const pedidosPorVerificar = roleMode === 'owner'
    ? pedidos.filter(p => p.estado === 'pendiente' && ['yape', 'plin'].includes((p.metodo_pago || '').toLowerCase()))
    : []
  const totalPagosPorVerificar = citasPorVerificar.length + pedidosPorVerificar.length

  // Gráfico de ingresos semanales (últimos 7 días)
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const iso = shiftFecha(hoy, -(6 - i))
    const totalDia = citasSemanaRol
      .filter(c => c.fecha === iso && (c.estado === 'completada' || c.estado === 'pagado'))
      .reduce((acc, c) => acc + parseCitaExtras(c).grandTotal, 0)
    const label = new Date(iso + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short' }).slice(0, 2)
    return { iso, label, totalDia }
  })
  const maxDia = Math.max(...diasSemana.map(d => d.totalDia), 1)
  const totalSemanal = diasSemana.reduce((acc, d) => acc + d.totalDia, 0)

  async function cambiarEstadoCita(id: string, estado: string) {
    const r = await fetch(`/api/admin/citas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (r.ok) {
      const data = await r.json()
      notify(
        estado === 'completada'
          ? data.selloSumado
            ? 'Cita atendida (+1 sello VIP sumado)'
            : 'Cita marcada como atendida'
          : `Estado actualizado a ${estado}`
      )
      setSelectedCita(null)
      syncBus.emit('cita_updated', { id, estado })
      await cargarDatos()
    } else {
      notify('No se pudo actualizar la cita', 'err')
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
      notify('Error al crear cita', 'err')
    }
  }

  const nombreBarbero = (id: string) => barberos.find(b => b.id === id)?.nombre.split(' ')[0] ?? id

  return (
    <div className="a-fade space-y-6">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Resumen Operativo"
        sub="Métricas en tiempo real, alertas de operación y agenda del día"
        primaryAction={{
          label: 'Nueva cita',
          icon: 'Plus',
          onClick: () => setOpenNewCita(true),
        }}
      />

      {/* 1. LOS 4 KPIs EJECUTIVOS CON COLOR Y JERARQUÍA */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${T.kpiCard} a-kpi-1`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider a-muted">Citas hoy</p>
            <span className="a-kpi-icon">
              <ModIcon name="Calendar" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">{citasActivasHoy.length}</p>
          <p className="mt-1 text-xs a-muted">{citasCompletadasHoy.length} atendidas hoy</p>
        </div>

        <div className={`${T.kpiCard} a-kpi-2`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider a-muted">Ingresos hoy</p>
            <span className="a-kpi-icon">
              <ModIcon name="CreditCard" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">{money(ingresosHoyTotal)}</p>
          <p className="mt-1 text-xs a-muted">Servicios y tienda</p>
        </div>

        <div className={`${T.kpiCard} a-kpi-3`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider a-muted">Pedidos pendientes</p>
            <span className="a-kpi-icon">
              <ModIcon name="ShoppingBag" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">{pedidosPendientes.length}</p>
          <p className="mt-1 text-xs a-muted">En cola de entrega</p>
        </div>

        <div className={`${T.kpiCard} a-kpi-4`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider a-muted">Pagos por verificar</p>
            <span className="a-kpi-icon">
              <ModIcon name="AlertCircle" className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2.5 font-mono text-2xl font-bold a-txt">{totalPagosPorVerificar}</p>
          <p className="mt-1 text-xs a-muted">Operaciones Yape / Plin</p>
        </div>
      </div>

      {/* 2. REQUIERE TU ATENCIÓN + INGRESOS SEMANALES */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className={`${T.panel} p-5 lg:col-span-7 flex flex-col justify-between`}>
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold a-txt">Requiere tu atención</h2>
              <span className="text-xs font-semibold a-muted">
                {citasPorVerificar.length + pedidosPendientes.length} pendientes
              </span>
            </div>

            {citasPorVerificar.length === 0 && pedidosPendientes.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs a-muted">Todo al día. No hay pagos ni pedidos pendientes de revisión.</p>
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
                        {fechaLarga(c.fecha)} {c.hora} · {formatPaymentInfo(c.metodo_pago, c.ref_pago)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCita(c)}
                      className={`${T.btnGhost} !py-1.5 !px-3 !text-xs`}
                    >
                      Revisar →
                    </button>
                  </div>
                ))}

                {pedidosPendientes.slice(0, 3).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold a-txt truncate">
                        Pedido {p.id} ({p.entrega === 'delivery' ? 'Delivery' : 'Recojo'}) · {p.cliente}
                      </p>
                      <p className="a-muted mt-0.5">
                        {money(p.total)} · {formatPaymentInfo(p.metodo_pago, p.ref_pago)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onGoTab('pedidos')}
                      className={`${T.btnGhost} !py-1.5 !px-3 !text-xs`}
                    >
                      Revisar →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Gráfico de Ingresos Semanales */}
        <div className={`${T.panel} p-5 lg:col-span-5 flex flex-col justify-between`}>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold a-txt">Ingresos semanales</h2>
              <p className="text-xs a-muted">Últimos 7 días</p>
            </div>
            <p className="font-mono text-lg font-bold a-txt">{money(totalSemanal)}</p>
          </div>

          <div className="grid grid-cols-7 items-end gap-2 pt-4" style={{ height: 140 }}>
            {diasSemana.map(d => {
              const hPct = Math.max(8, Math.round((d.totalDia / maxDia) * 100))
              const esHoy = d.iso === hoy
              return (
                <div key={d.iso} className="flex h-full flex-col items-center justify-end gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      title={`${fechaLarga(d.iso)}: ${money(d.totalDia)}`}
                      className="w-full rounded-t transition-all"
                      style={{
                        height: `${hPct}%`,
                        background: esHoy ? 'var(--txt)' : 'var(--line-2)',
                      }}
                    />
                  </div>
                  <span className={`font-mono text-[10px] uppercase ${esHoy ? 'font-bold a-txt' : 'a-muted'}`}>
                    {d.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 3. AGENDA DE HOY (Máximo 5 columnas + menú ⋯) */}
      <div className={`${T.panel} overflow-hidden`}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <h2 className="text-sm font-bold a-txt">Agenda de hoy ({citasHoyRol.length})</h2>
          <button
            type="button"
            onClick={() => onGoTab('agenda')}
            className="text-xs font-semibold a-txt-2 hover:underline"
          >
            Ver agenda completa →
          </button>
        </div>

        {citasHoyRol.length === 0 ? (
          <EmptyState
            text="No hay citas registradas para hoy."
            actionLabel="Nueva cita"
            onAction={() => setOpenNewCita(true)}
          />
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
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCita(c)}
                    className="cursor-pointer"
                  >
                    <td className="font-mono font-semibold">{c.hora}</td>
                    <td className="font-medium">{c.nombre}</td>
                    <td className="a-txt-2">{c.servicioNombre ?? c.servicio}</td>
                    <td className="a-txt-2">{nombreBarbero(c.barbero)}</td>
                    <td><Pill estado={c.estado} /></td>
                    <td className="text-right">
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
        sub={selectedCita ? `${fechaLarga(selectedCita.fecha)} a las ${selectedCita.hora}` : ''}
        footer={
          selectedCita && (
            <div className="flex flex-col gap-2">
              {selectedCita.estado !== 'completada' && selectedCita.estado !== 'cancelada' && (
                <button
                  type="button"
                  onClick={() => cambiarEstadoCita(selectedCita.id, 'completada')}
                  className={`${T.btnPrimary} w-full`}
                >
                  <ModIcon name="Check" className="h-4 w-4" />
                  Marcar como Atendida (+1 sello VIP)
                </button>
              )}
              <div className="flex gap-2">
                {selectedCita.estado === 'pendiente' && (
                  <button
                    type="button"
                    onClick={() => cambiarEstadoCita(selectedCita.id, 'confirmada')}
                    className={`${T.btnGhost} flex-1`}
                  >
                    Confirmar
                  </button>
                )}
                {selectedCita.estado !== 'cancelada' && (
                  <button
                    type="button"
                    onClick={() => cambiarEstadoCita(selectedCita.id, 'cancelada')}
                    className={`${T.btnDanger} flex-1`}
                  >
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
                  <span className="font-semibold a-txt">
                    {formatPaymentInfo(selectedCita.metodo_pago, selectedCita.ref_pago)}
                  </span>
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
        sub={`Para hoy (${fechaLarga(hoy)})`}
        footer={
          <button type="submit" form="form-resumen-cita" className={`${T.btnPrimary} w-full`}>
            Guardar cita
          </button>
        }
      >
        <form id="form-resumen-cita" onSubmit={crearCitaRapida} className="space-y-4">
          <div>
            <label className={T.label}>Cliente</label>
            <input
              className={T.input}
              placeholder="Nombre completo"
              value={fNombre}
              onChange={e => setFNombre(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={T.label}>Teléfono / WhatsApp</label>
            <input
              className={T.input}
              placeholder="999 888 777"
              value={fCelular}
              onChange={e => setFCelular(e.target.value)}
              required
            />
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
