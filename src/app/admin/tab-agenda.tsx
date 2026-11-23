'use client'

/**
 * MÓDULO 2: AGENDA DEL ESTUDIO
 * - Vistas: Lista · Día por Columnas de Barbero · Semana
 * - Filtros: Búsqueda, Barbero y Estado
 * - Crear, Reprogramar, WhatsApp, Ticket Térmico y Marcar Atendida (+1 sello VIP)
 */
import { useEffect, useState } from 'react'
import {
  T,
  Pill,
  ModIcon,
  Drawer,
  RowMenu,
  AccordionSection,
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
  TicketTermicoModal,
  abrirWhatsAppRecordatorio,
  type Cita,
  type Barbero,
  type Servicio,
  type RoleMode,
} from './ui'

const HORAS_DIA = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
]

export default function TabAgenda({ roleMode = 'owner' }: { roleMode?: RoleMode }) {
  const [citas, setCitas] = useState<Cita[]>([])
  const [barberos, setBarberos] = useState<Barbero[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [fecha, setFecha] = useState(getFechaHoy())
  const [vista, setVista] = useState<'lista' | 'dia' | 'semana'>('lista')
  const [filtroBarbero, setFiltroBarbero] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null)
  const [ticketCita, setTicketCita] = useState<Cita | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  // Campos Reprogramación en Drawer
  const [repFecha, setRepFecha] = useState('')
  const [repHora, setRepHora] = useState('')
  const [repBarbero, setRepBarbero] = useState('')

  // Campos Nueva Cita en Drawer
  const [nNombre, setNNombre] = useState('')
  const [nCelular, setNCelular] = useState('')
  const [nServicio, setNServicio] = useState('')
  const [nBarbero, setNBarbero] = useState('')
  const [nFecha, setNFecha] = useState(getFechaHoy())
  const [nHora, setNHora] = useState('10:00')
  const [nMetodo, setNMetodo] = useState('efectivo')
  const [nEstado, setNEstado] = useState('confirmada')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 2200)
  }

  async function cargarCatalogos() {
    const [rB, rS] = await Promise.all([
      fetch('/api/admin/barberos', { cache: 'no-store' }),
      fetch('/api/admin/servicios', { cache: 'no-store' }),
    ])
    if (rB.ok) {
      const b = ((await rB.json()).barberos ?? []).filter((x: Barbero) => x.activo !== 0)
      setBarberos(b)
      if (!nBarbero && b[0]) setNBarbero(b[0].id)
    }
    if (rS.ok) {
      const s = ((await rS.json()).servicios ?? []).filter((x: Servicio) => x.activo !== 0)
      setServicios(s)
      if (!nServicio && s[0]) setNServicio(s[0].id)
    }
  }

  async function cargarCitas() {
    if (vista === 'semana') {
      const fin = shiftFecha(fecha, 6)
      const r = await fetch(`/api/admin/citas?desde=${fecha}&hasta=${fin}`, { cache: 'no-store' })
      if (r.ok) setCitas((await r.json()).citas ?? [])
    } else {
      const r = await fetch(`/api/admin/citas?fecha=${fecha}`, { cache: 'no-store' })
      if (r.ok) setCitas((await r.json()).citas ?? [])
    }
  }

  useEffect(() => {
    void cargarCatalogos()
  }, [])

  useEffect(() => {
    void cargarCitas()

    const unsub = syncBus.subscribe((ev) => {
      if (['cita_created', 'cita_updated', 'cita_deleted', 'pago_updated'].includes(ev)) {
        void cargarCitas()
      }
    })

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargarCitas()
      }
    }, 12000)

    const onFocus = () => void cargarCitas()
    window.addEventListener('focus', onFocus)

    return () => {
      unsub()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [fecha, vista])

  const barberoEfectivo = roleMode === 'owner' ? filtroBarbero : roleMode

  const citasFiltradas = citas.filter(c => {
    const okBarb = barberoEfectivo === 'todos' || c.barbero === barberoEfectivo
    const okEst = filtroEstado === 'todos' || c.estado === filtroEstado
    const q = busqueda.trim().toLowerCase()
    const okTxt = !q || c.nombre.toLowerCase().includes(q) || c.celular.includes(q)
    return okBarb && okEst && okTxt
  })

  const barberosColumnas = barberos.filter(b =>
    barberoEfectivo === 'todos' ? true : b.id === barberoEfectivo
  )

  function abrirDetalle(c: Cita) {
    setSelectedCita(c)
    setRepFecha(c.fecha)
    setRepHora(c.hora)
    setRepBarbero(c.barbero)
  }

  async function actualizarCita(id: string, patch: Record<string, unknown>, successMsg: string) {
    const r = await fetch(`/api/admin/citas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r.ok) {
      const data = await r.json()
      notify(data.selloSumado ? `${successMsg} (+1 sello VIP)` : successMsg)
      setSelectedCita(null)
      syncBus.emit('cita_updated', { id, ...patch })
      await cargarCitas()
    } else {
      const j = await r.json().catch(() => ({}))
      notify(j.error ?? 'Error al actualizar cita', 'err')
    }
  }

  async function crearCita(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nNombre || 'Cliente Presencial',
        celular: nCelular || '999999999',
        servicio: nServicio,
        barbero: roleMode === 'owner' ? nBarbero : roleMode,
        fecha: nFecha,
        hora: nHora,
        metodo_pago: nMetodo,
        estado: nEstado,
      }),
    })
    if (r.ok) {
      notify('Cita registrada en la agenda')
      setOpenNew(false)
      setNNombre(''); setNCelular('')
      syncBus.emit('cita_created')
      await cargarCitas()
    } else {
      const j = await r.json().catch(() => ({}))
      notify(j.error ?? 'No se pudo registrar la cita', 'err')
    }
  }

  const nombreBarbero = (id: string) => barberos.find(b => b.id === id)?.nombre.split(' ')[0] ?? id
  const diasSemana = Array.from({ length: 7 }, (_, i) => shiftFecha(fecha, i))
  const hoyLima = getFechaHoy()

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Agenda"
        sub="Vista en lista, columnas simultáneas por barbero y calendario semanal"
        primaryAction={{
          label: 'Nueva cita',
          icon: 'Plus',
          onClick: () => {
            setNFecha(fecha)
            setOpenNew(true)
          },
        }}
      />

      {/* BARRA DE BÚSQUEDA, FILTROS Y NAVEGACIÓN DE FECHA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="a-search-box max-w-xs">
            <span className="a-search-icon">
              <ModIcon name="Search" className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar cliente o teléfono..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className={`${T.input} a-search-input`}
            />
          </div>

          {roleMode === 'owner' && (
            <select
              value={filtroBarbero}
              onChange={e => setFiltroBarbero(e.target.value)}
              className={`${T.input} !w-auto`}
              aria-label="Filtrar por barbero"
            >
              <option value="todos">Barbero: Todos</option>
              {barberos.map(b => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          )}

          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className={`${T.input} !w-auto`}
            aria-label="Filtrar por estado"
          >
            <option value="todos">Estado: Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="completada">Atendida</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
            <button
              type="button"
              onClick={() => setFecha(shiftFecha(fecha, vista === 'semana' ? -7 : -1))}
              className="grid size-7 place-items-center rounded hover:bg-[var(--hover)] cursor-pointer"
              aria-label="Día anterior"
            >
              <ModIcon name="ChevronLeft" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setFecha(getFechaHoy())}
              className="px-2.5 text-xs font-semibold a-txt capitalize cursor-pointer"
            >
              {fecha === hoyLima ? `Hoy, ${fechaLarga(fecha)}` : fechaLarga(fecha)}
            </button>
            <button
              type="button"
              onClick={() => setFecha(shiftFecha(fecha, vista === 'semana' ? 7 : 1))}
              className="grid size-7 place-items-center rounded hover:bg-[var(--hover)] cursor-pointer"
              aria-label="Día siguiente"
            >
              <ModIcon name="ChevronRight" className="h-4 w-4" />
            </button>
          </div>

          <div className="a-seg">
            <button type="button" onClick={() => setVista('lista')} className={`a-seg-btn ${vista === 'lista' ? 'active' : ''}`}>
              Lista
            </button>
            <button type="button" onClick={() => setVista('dia')} className={`a-seg-btn ${vista === 'dia' ? 'active' : ''}`}>
              <ModIcon name="Columns" className="h-3.5 w-3.5" />
              Sillones
            </button>
            <button type="button" onClick={() => setVista('semana')} className={`a-seg-btn ${vista === 'semana' ? 'active' : ''}`}>
              Semana
            </button>
          </div>
        </div>
      </div>

      {/* VISTA 1: LISTA */}
      {vista === 'lista' && (
        <div className={`${T.panel} overflow-hidden`}>
          {citasFiltradas.length === 0 ? (
            <EmptyState
              text="No hay citas para los filtros seleccionados."
              actionLabel="Nueva cita"
              onAction={() => setOpenNew(true)}
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
                  {citasFiltradas.map(c => (
                    <tr key={c.id} onClick={() => abrirDetalle(c)} className="cursor-pointer">
                      <td data-label="Hora" className="font-mono font-semibold">{formatHora12(c.hora)}</td>
                      <td data-label="Cliente" className="font-medium">{c.nombre}</td>
                      <td data-label="Servicio" className="a-txt-2">{c.servicioNombre ?? c.servicio}</td>
                      <td data-label="Barbero" className="a-txt-2">{nombreBarbero(c.barbero)}</td>
                      <td data-label="Estado"><Pill estado={c.estado} /></td>
                      <td data-label="" className="text-right">
                        <RowMenu
                          actions={[
                            { label: 'Ver / Reprogramar', onClick: () => abrirDetalle(c) },
                            { label: 'Imprimir ticket térmico', onClick: () => setTicketCita(c) },
                            { label: 'Recordatorio WhatsApp', onClick: () => abrirWhatsAppRecordatorio(c, 'recordatorio') },
                            {
                              label: c.fecha > hoyLima ? 'Atendida (solo el día de la cita)' : 'Marcar atendida (+1 VIP)',
                              disabled: c.estado === 'completada' || c.fecha > hoyLima,
                              onClick: () => actualizarCita(c.id, { estado: 'completada' }, 'Cita atendida'),
                            },
                            {
                              label: 'Confirmar cita',
                              disabled: c.estado !== 'pendiente',
                              onClick: () => actualizarCita(c.id, { estado: 'confirmada' }, 'Cita confirmada'),
                            },
                            {
                              label: 'Cancelar cita',
                              danger: true,
                              disabled: c.estado === 'cancelada',
                              onClick: () => actualizarCita(c.id, { estado: 'cancelada' }, 'Cita cancelada'),
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
      )}

      {/* VISTA 2: SILLONES EN PARALELO (Columnas por Barbero) */}
      {vista === 'dia' && (
        <div className={`${T.panel} overflow-x-auto`}>
          {barberosColumnas.length === 0 ? (
            <EmptyState text="No hay barberos activos para mostrar." />
          ) : (
            <div className="a-cal-grid">
              {/* Cabecera de columnas */}
              <div
                className="grid border-b"
                style={{
                  gridTemplateColumns: `84px repeat(${barberosColumnas.length}, minmax(190px, 1fr))`,
                  borderColor: 'var(--line)',
                  background: 'var(--panel-2)',
                }}
              >
                <div className="px-3 py-3 text-xs font-bold uppercase tracking-wider a-muted flex items-center">
                  Hora
                </div>
                {barberosColumnas.map(b => {
                  const totalDiaBarb = citasFiltradas.filter(
                    c => c.barbero === b.id && c.estado !== 'cancelada' && c.estado !== 'rechazada'
                  ).length
                  return (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 border-l px-3.5 py-3"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <span className="text-xs font-bold a-txt truncate">{b.nombre}</span>
                      <span className="a-chip">{totalDiaBarb} citas</span>
                    </div>
                  )
                })}
              </div>

              {/* Filas horarias */}
              <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {HORAS_DIA.map(h => (
                  <div
                    key={h}
                    className="grid items-stretch"
                    style={{ gridTemplateColumns: `84px repeat(${barberosColumnas.length}, minmax(190px, 1fr))` }}
                  >
                    <div className="px-3 py-2.5 flex items-center font-mono text-xs font-semibold a-muted">
                      {formatHora12(h)}
                    </div>
                    {barberosColumnas.map(b => {
                      const slotCitas = citasFiltradas.filter(c => c.hora === h && c.barbero === b.id)
                      return (
                        <div
                          key={b.id}
                          className="border-l p-1.5 flex flex-col gap-1.5 justify-center"
                          style={{ borderColor: 'var(--line)' }}
                        >
                          {slotCitas.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setNFecha(fecha)
                                setNHora(h)
                                setNBarbero(b.id)
                                setOpenNew(true)
                              }}
                              className="a-cal-slot-btn"
                              title={`Agendar a las ${formatHora12(h)} con ${b.nombre}`}
                            >
                              + Libre
                            </button>
                          ) : (
                            slotCitas.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => abrirDetalle(c)}
                                className="a-cal-card space-y-1"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="font-semibold text-xs a-txt truncate">{c.nombre}</span>
                                  <Pill estado={c.estado} />
                                </div>
                                <p className="text-[11px] a-muted truncate">
                                  {c.servicioNombre ?? c.servicio}
                                </p>
                              </button>
                            ))
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VISTA 3: SEMANA */}
      {vista === 'semana' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {diasSemana.map(iso => {
            const delDia = citasFiltradas.filter(c => c.fecha === iso)
            const esHoy = iso === hoyLima
            return (
              <div key={iso} className={`${T.panel} p-3 flex flex-col gap-2 min-h-[220px]`}>
                <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--line)' }}>
                  <span className={`text-xs capitalize ${esHoy ? 'font-bold a-txt' : 'font-medium a-txt-2'}`}>
                    {fechaLarga(iso)}
                  </span>
                  <span className="font-mono text-[11px] a-muted">{delDia.length}</span>
                </div>
                {delDia.length === 0 ? (
                  <p className="text-[11px] a-muted py-6 text-center">Sin citas</p>
                ) : (
                  <div className="space-y-1.5">
                    {delDia.map(c => (
                      <div
                        key={c.id}
                        onClick={() => abrirDetalle(c)}
                        className="cursor-pointer rounded-md border p-2 text-[11px] transition hover:bg-[var(--hover)]"
                        style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                      >
                        <div className="flex items-center justify-between font-mono font-bold a-txt">
                          <span>{formatHora12(c.hora)}</span>
                          <span>{nombreBarbero(c.barbero)}</span>
                        </div>
                        <p className="font-semibold a-txt truncate mt-0.5">{c.nombre}</p>
                        <p className="a-muted truncate">{c.servicioNombre ?? c.servicio}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* DRAWER DETALLE Y REPROGRAMACIÓN */}
      <Drawer
        open={!!selectedCita}
        onClose={() => setSelectedCita(null)}
        title={selectedCita ? `Cita · ${selectedCita.nombre}` : 'Detalle'}
        sub={selectedCita ? `${fechaLarga(selectedCita.fecha)} · ${formatHora12(selectedCita.hora)}` : ''}
        footer={
          selectedCita && (
            <div className="flex flex-col gap-2">
              {selectedCita.estado !== 'completada' && selectedCita.estado !== 'cancelada' && (
                <>
                  {selectedCita.fecha > hoyLima && (
                    <div
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
                      style={{ borderColor: 'var(--warn-line)', background: 'var(--warn-bg)', color: 'var(--warn)' }}
                    >
                      <ModIcon name="Lock" className="h-4 w-4 shrink-0" />
                      <span>Cita futura ({selectedCita.fecha}). Solo se puede atender o aprobar pago el mismo día.</span>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={selectedCita.fecha > hoyLima}
                    onClick={() => actualizarCita(selectedCita.id, { estado: 'completada' }, 'Cita atendida')}
                    className={`${T.btnPrimary} w-full disabled:opacity-45 disabled:cursor-not-allowed`}
                  >
                    <ModIcon name="Check" className="h-4 w-4" />
                    {selectedCita.fecha > hoyLima ? 'Disponible el día de la cita' : 'Marcar como Atendida (+1 sello VIP)'}
                  </button>
                </>
              )}
              {selectedCita.estado === 'completada' && (
                <div className="flex flex-col gap-2">
                  <div
                    className="flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs font-medium"
                    style={{ borderColor: 'var(--ok-line)', background: 'var(--ok-bg)', color: 'var(--ok)' }}
                  >
                    <span className="font-semibold flex items-center gap-1.5">
                      <ModIcon name="Check" className="h-4 w-4" />
                      Atención completada con éxito
                    </span>
                    <span className="font-mono text-[11px]">+1 sello VIP</span>
                  </div>
                  <button type="button" onClick={() => setSelectedCita(null)} className={`${T.btnGhost} w-full`}>
                    Volver a la agenda
                  </button>
                </div>
              )}
              {selectedCita.estado === 'cancelada' && (
                <div className="flex flex-col gap-2">
                  <div
                    className="flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium"
                    style={{ borderColor: 'var(--danger-line)', background: 'var(--danger-bg)', color: 'var(--danger)' }}
                  >
                    <ModIcon name="AlertCircle" className="h-4 w-4 shrink-0" />
                    <span>Esta cita se encuentra cancelada.</span>
                  </div>
                  <button type="button" onClick={() => setSelectedCita(null)} className={`${T.btnGhost} w-full`}>
                    Volver a la agenda
                  </button>
                </div>
              )}
              {selectedCita.estado !== 'completada' && selectedCita.estado !== 'cancelada' && (
                <div className="flex gap-2">
                  {selectedCita.estado === 'pendiente' && (
                    <button
                      type="button"
                      onClick={() => actualizarCita(selectedCita.id, { estado: 'confirmada' }, 'Cita confirmada')}
                      className={`${T.btnGhost} flex-1`}
                    >
                      Confirmar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => actualizarCita(selectedCita.id, { estado: 'cancelada' }, 'Cita cancelada')}
                    className={`${T.btnDanger} flex-1`}
                  >
                    Cancelar cita
                  </button>
                </div>
              )}
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
                <span className="font-mono text-base font-bold a-txt">{money(ex.grandTotal)}</span>
              </div>

              <div className="rounded-lg border p-4 space-y-2.5 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
                <div className="flex justify-between">
                  <span className="a-muted">Cliente</span>
                  <span className="font-semibold a-txt">{selectedCita.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="a-muted">WhatsApp</span>
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
                  <span className="a-muted">Servicio</span>
                  <span className="font-semibold a-txt">{selectedCita.servicioNombre ?? selectedCita.servicio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="a-muted">Barbero</span>
                  <span className="font-semibold a-txt">{nombreBarbero(selectedCita.barbero)}</span>
                </div>
                {ex.productsText && (
                  <div className="flex justify-between">
                    <span className="a-muted">Productos adicionales</span>
                    <span className="font-semibold a-txt">{ex.productsText}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                  <span className="a-muted">Método de pago</span>
                  <span className="font-semibold a-txt">
                    {formatPaymentInfo(selectedCita.metodo_pago, selectedCita.ref_pago)}
                  </span>
                </div>
              </div>

              {/* Avisos por WhatsApp */}
              <div className="rounded-xl border p-3.5 space-y-2.5" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
                <div className="flex items-center justify-between text-xs font-semibold a-txt">
                  <span className="flex items-center gap-1.5">
                    <ModIcon name="MessageCircle" className="h-3.5 w-3.5" />
                    <span>Avisos por WhatsApp</span>
                  </span>
                  <span className="text-[11px] a-muted font-normal">1 clic</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => abrirWhatsAppRecordatorio(selectedCita, 'recordatorio')}
                    className={`${T.btnGhost} !min-h-[36px] !text-xs`}
                    title="Enviar recordatorio de fecha y hora"
                  >
                    <ModIcon name="Clock" className="h-3.5 w-3.5" />
                    <span>Recordatorio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirWhatsAppRecordatorio(selectedCita, 'confirmacion')}
                    className={`${T.btnGhost} !min-h-[36px] !text-xs`}
                    title="Confirmar reserva al cliente"
                  >
                    <ModIcon name="Check" className="h-3.5 w-3.5" />
                    <span>Confirmación</span>
                  </button>
                </div>
                {selectedCita.estado === 'completada' && (
                  <button
                    type="button"
                    onClick={() => abrirWhatsAppRecordatorio(selectedCita, 'agradecimiento')}
                    className={`${T.btnGhost} w-full !min-h-[36px] !text-xs`}
                    style={{ color: 'var(--ok)', borderColor: 'var(--ok-line)' }}
                  >
                    <ModIcon name="Star" className="h-3.5 w-3.5" />
                    <span>Pedir reseña y agradecer visita</span>
                  </button>
                )}
              </div>

              {/* Ticket Térmico */}
              <button
                type="button"
                onClick={() => setTicketCita(selectedCita)}
                className={`${T.btnGhost} w-full`}
                style={{ borderColor: 'var(--gold-line)', background: 'var(--gold-soft)', color: 'var(--gold)' }}
              >
                <ModIcon name="Printer" className="h-4 w-4" />
                <span>Imprimir Ticket Térmico (80mm)</span>
              </button>

              {/* Reprogramar */}
              <AccordionSection title="Reprogramar fecha, hora o barbero" defaultOpen={false}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={T.label}>Nueva fecha</label>
                    <input type="date" className={T.input} value={repFecha} onChange={e => setRepFecha(e.target.value)} />
                  </div>
                  <div>
                    <label className={T.label}>Nueva hora</label>
                    <input type="time" className={T.input} value={repHora} onChange={e => setRepHora(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={T.label}>Barbero</label>
                  <select className={T.input} value={repBarbero} onChange={e => setRepBarbero(e.target.value)}>
                    {barberos.map(b => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    actualizarCita(
                      selectedCita.id,
                      { fecha: repFecha, hora: repHora, barbero: repBarbero },
                      'Cita reprogramada'
                    )
                  }
                  className={`${T.btnGhost} w-full`}
                >
                  Guardar nuevo horario
                </button>
              </AccordionSection>
            </>
          )
        })()}
      </Drawer>

      {/* DRAWER NUEVA CITA */}
      <Drawer
        open={openNew}
        onClose={() => setOpenNew(false)}
        title="Nueva cita"
        sub="Registra una reserva o atención presencial"
        footer={
          <button type="submit" form="form-agenda-nueva" className={`${T.btnPrimary} w-full`}>
            Registrar cita
          </button>
        }
      >
        <form id="form-agenda-nueva" onSubmit={crearCita} className="space-y-4">
          <div>
            <label className={T.label}>Nombre del cliente</label>
            <input
              className={T.input}
              placeholder="Ej. Carlos Mendoza"
              value={nNombre}
              onChange={e => setNNombre(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={T.label}>Teléfono</label>
            <input
              className={T.input}
              placeholder="999 888 777"
              value={nCelular}
              onChange={e => setNCelular(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={T.label}>Servicio</label>
            <select className={T.input} value={nServicio} onChange={e => setNServicio(e.target.value)}>
              {servicios.map(s => (
                <option key={s.id} value={s.id}>{s.nombre} — S/ {s.precio}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={T.label}>Fecha</label>
              <input type="date" className={T.input} value={nFecha} onChange={e => setNFecha(e.target.value)} required />
            </div>
            <div>
              <label className={T.label}>Hora</label>
              <input type="time" className={T.input} value={nHora} onChange={e => setNHora(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={T.label}>Barbero</label>
              <select
                className={T.input}
                value={roleMode === 'owner' ? nBarbero : roleMode}
                disabled={roleMode !== 'owner'}
                onChange={e => setNBarbero(e.target.value)}
              >
                {barberos.map(b => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={T.label}>Método de pago</label>
              <select className={T.input} value={nMetodo} onChange={e => setNMetodo(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>
          </div>
          <div>
            <label className={T.label}>Estado inicial</label>
            <select className={T.input} value={nEstado} onChange={e => setNEstado(e.target.value)}>
              <option value="confirmada">Confirmada</option>
              <option value="completada">Atendida (+1 sello VIP)</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
        </form>
      </Drawer>

      {/* MODAL TICKET TÉRMICO */}
      <TicketTermicoModal
        open={!!ticketCita}
        onClose={() => setTicketCita(null)}
        cita={ticketCita}
      />
    </div>
  )
}
