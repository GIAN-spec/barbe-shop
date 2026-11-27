'use client'

/**
 * MÓDULO 5: CLIENTES Y TARJETA DE FIDELIDAD VIP
 * MÓDULO 6: RESEÑAS (Aprobar, ocultar y responder)
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
  VipStampsControl,
  Toast,
  fechaLarga,
  money,
  type ClienteFicha,
  type ResenaItem,
} from './ui'

/* ==========================================================================
   MÓDULO 5: CLIENTES (Búsqueda, historial y sellos VIP editables)
   ========================================================================== */
export function TabClientes() {
  const [clientes, setClientes] = useState<ClienteFicha[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [selected, setSelected] = useState<ClienteFicha | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  // Edición en Drawer
  const [editSellos, setEditSellos] = useState(0)
  const [editNotas, setEditNotas] = useState('')

  // Nuevo cliente
  const [nNombre, setNNombre] = useState('')
  const [nCelular, setNCelular] = useState('')
  const [nEmail, setNEmail] = useState('')
  const [nSellos, setNSellos] = useState(0)

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargarClientes() {
    const r = await fetch('/api/admin/saas?mod=clientes', { cache: 'no-store' })
    if (r.ok) {
      const data = await r.json()
      setClientes(data.clientes ?? [])
    }
  }

  useEffect(() => {
    void cargarClientes()
  }, [])

  function abrirFicha(c: ClienteFicha) {
    setSelected(c)
    setEditSellos(c.sellos_vip ?? 0)
    setEditNotas(c.notas ?? '')
  }

  async function guardarFicha() {
    if (!selected) return
    const r = await fetch('/api/admin/saas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mod: 'cliente',
        id: selected.id,
        nombre: selected.nombre,
        celular: selected.celular,
        sellos_vip: editSellos,
        notas: editNotas,
      }),
    })
    if (r.ok) {
      const data = await r.json()
      setClientes(data.clientes ?? [])
      notify('Ficha y sellos VIP actualizados')
      setSelected(null)
    } else {
      notify('Error al actualizar cliente', 'err')
    }
  }

  async function crearCliente(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/saas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mod: 'cliente',
        nombre: nNombre,
        celular: nCelular,
        email: nEmail,
        sellos_vip: nSellos,
      }),
    })
    if (r.ok) {
      const data = await r.json()
      setClientes(data.clientes ?? [])
      setOpenNew(false)
      setNNombre(''); setNCelular(''); setNEmail(''); setNSellos(0)
      notify('Cliente registrado')
    }
  }

  const filtrados = clientes.filter(c => {
    const q = busqueda.trim().toLowerCase()
    return !q || c.nombre.toLowerCase().includes(q) || c.celular.includes(q) || c.email.toLowerCase().includes(q)
  })

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Clientes"
        primaryAction={{
          label: 'Nuevo cliente',
          icon: 'Plus',
          onClick: () => setOpenNew(true),
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="a-search-box max-w-sm">
          <span className="a-search-icon">
            <ModIcon name="Search" className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className={`${T.input} a-search-input`}
          />
        </div>
        <span className="text-xs font-medium a-muted">{filtrados.length} clientes</span>
      </div>

      {/* Tabla de 5 columnas */}
      <div className={`${T.panel} overflow-hidden`}>
        {filtrados.length === 0 ? (
          <EmptyState
            text="No hay clientes que coincidan con tu búsqueda."
            actionLabel="Nuevo cliente"
            onAction={() => setOpenNew(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Visitas</th>
                  <th>Sellos VIP</th>
                  <th>Última cita</th>
                  <th className="w-10 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => (
                  <tr key={c.id + c.celular} onClick={() => abrirFicha(c)} className="cursor-pointer">
                    <td className="font-medium">{c.nombre}</td>
                    <td className="font-mono text-xs a-txt-2">{c.celular}</td>
                    <td className="font-mono">{c.visitas}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold">
                        {'●'.repeat(Math.min(5, c.sellos_vip || 0))}
                        {'○'.repeat(Math.max(0, 5 - (c.sellos_vip || 0)))}
                        <span className="ml-1 a-muted">({c.sellos_vip || 0}/5)</span>
                      </span>
                    </td>
                    <td className="text-xs a-txt-2">{c.ultimaCita ? fechaLarga(c.ultimaCita) : '—'}</td>
                    <td className="text-right">
                      <RowMenu
                        actions={[
                          { label: 'Ver ficha e historial', onClick: () => abrirFicha(c) },
                          {
                            label: 'Sumar +1 sello VIP',
                            onClick: async () => {
                              const next = Math.min(5, (c.sellos_vip || 0) + 1)
                              await fetch('/api/admin/saas', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  mod: 'cliente',
                                  id: c.id,
                                  nombre: c.nombre,
                                  celular: c.celular,
                                  sellos_vip: next,
                                }),
                              })
                              notify(`Sellos VIP: ${next}/5`)
                              void cargarClientes()
                            },
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

      {/* DRAWER FICHA DE CLIENTE + EDITOR DE SELLOS VIP */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? selected.nombre : 'Ficha de cliente'}
        sub={selected ? `Tel: ${selected.celular} · ${selected.visitas} visitas completadas` : ''}
        footer={
          <button type="button" onClick={guardarFicha} className={`${T.btnPrimary} w-full`}>
            Guardar cambios
          </button>
        }
      >
        {selected && (
          <>
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold a-txt">Tarjeta de Fidelidad VIP (5.º corte gratis)</span>
                {editSellos === 5 && (
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                    Corte Gratis Disponible
                  </span>
                )}
              </div>
              <VipStampsControl value={editSellos} onChange={setEditSellos} />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditSellos(Math.min(5, editSellos + 1))}
                  className={`${T.btnGhost} !py-1 !px-2.5 !text-xs`}
                >
                  +1 Sello
                </button>
                <button
                  type="button"
                  onClick={() => setEditSellos(0)}
                  className={`${T.btnGhost} !py-1 !px-2.5 !text-xs`}
                >
                  Reiniciar (Canjear 5.º corte)
                </button>
              </div>
            </div>

            <div>
              <label className={T.label}>Notas de preferencias del cliente</label>
              <textarea
                rows={2}
                className={T.input}
                placeholder="Ej. Prefiere navaja baja, bebida café negro..."
                value={editNotas}
                onChange={e => setEditNotas(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider a-muted">
                  Historial de citas ({selected.historial.length})
                </h4>
                <span className="font-mono text-xs font-semibold a-txt">
                  Total: {money(selected.totalGastado)}
                </span>
              </div>

              {selected.historial.length === 0 ? (
                <p className="text-xs a-muted py-4 text-center">Sin citas previas registradas.</p>
              ) : (
                <div className="rounded-lg border divide-y text-xs" style={{ borderColor: 'var(--line)' }}>
                  {selected.historial.map(h => (
                    <div key={h.id} className="flex items-center justify-between px-3 py-2.5">
                      <div>
                        <p className="font-semibold a-txt">{h.servicioNombre}</p>
                        <p className="a-muted text-[11px]">{fechaLarga(h.fecha)} · {h.hora}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{money(h.precio)}</span>
                        <Pill estado={h.estado} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Drawer>

      {/* DRAWER NUEVO CLIENTE */}
      <Drawer
        open={openNew}
        onClose={() => setOpenNew(false)}
        title="Nuevo cliente"
        footer={
          <button type="submit" form="form-nuevo-cliente" className={`${T.btnPrimary} w-full`}>
            Guardar cliente
          </button>
        }
      >
        <form id="form-nuevo-cliente" onSubmit={crearCliente} className="space-y-4">
          <div>
            <label className={T.label}>Nombre completo</label>
            <input className={T.input} value={nNombre} onChange={e => setNNombre(e.target.value)} required />
          </div>
          <div>
            <label className={T.label}>Teléfono / WhatsApp</label>
            <input className={T.input} value={nCelular} onChange={e => setNCelular(e.target.value)} required />
          </div>
          <div>
            <label className={T.label}>Correo electrónico (opcional)</label>
            <input type="email" className={T.input} value={nEmail} onChange={e => setNEmail(e.target.value)} />
          </div>
          <div>
            <label className={T.label}>Sellos VIP iniciales</label>
            <VipStampsControl value={nSellos} onChange={setNSellos} />
          </div>
        </form>
      </Drawer>
    </div>
  )
}

/* ==========================================================================
   MÓDULO 6: RESEÑAS (Aprobar, ocultar y responder)
   ========================================================================== */
export function TabResenas() {
  const [resenas, setResenas] = useState<ResenaItem[]>([])
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [selected, setSelected] = useState<ResenaItem | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargarResenas() {
    const r = await fetch('/api/admin/saas?mod=resenas', { cache: 'no-store' })
    if (r.ok) setResenas((await r.json()).resenas ?? [])
  }

  useEffect(() => {
    void cargarResenas()
  }, [])

  async function actualizarResena(id: string, patch: { estado?: string; respuesta?: string }, okMsg: string) {
    const r = await fetch('/api/admin/saas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'resena', id, ...patch }),
    })
    if (r.ok) {
      notify(okMsg)
      setSelected(null)
      await cargarResenas()
    } else {
      notify('Error al actualizar reseña', 'err')
    }
  }

  const filtradas = resenas.filter(r => filtroEstado === 'todas' || r.estado === filtroEstado)

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader title="Reseñas" />

      <div className="flex items-center justify-between gap-3">
        <div className="a-seg">
          <button type="button" onClick={() => setFiltroEstado('todas')} className={`a-seg-btn ${filtroEstado === 'todas' ? 'active' : ''}`}>
            Todas ({resenas.length})
          </button>
          <button type="button" onClick={() => setFiltroEstado('aprobada')} className={`a-seg-btn ${filtroEstado === 'aprobada' ? 'active' : ''}`}>
            Aprobadas
          </button>
          <button type="button" onClick={() => setFiltroEstado('oculta')} className={`a-seg-btn ${filtroEstado === 'oculta' ? 'active' : ''}`}>
            Ocultas
          </button>
        </div>
      </div>

      {/* Tabla de 5 columnas */}
      <div className={`${T.panel} overflow-hidden`}>
        {filtradas.length === 0 ? (
          <EmptyState text="No hay reseñas en esta categoría." />
        ) : (
          <div className="overflow-x-auto">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Calificación</th>
                  <th>Comentario</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th className="w-10 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => { setSelected(r); setRespuesta(r.respuesta ?? '') }}
                    className="cursor-pointer"
                  >
                    <td className="font-medium">{r.cliente_nombre}</td>
                    <td className="font-mono text-xs font-bold">{'★'.repeat(r.calificacion)}</td>
                    <td className="max-w-xs truncate a-txt-2">{r.comentario}</td>
                    <td className="text-xs a-muted">{fechaLarga((r.created_at || '').slice(0, 10))}</td>
                    <td><Pill estado={r.estado || 'aprobada'} /></td>
                    <td className="text-right">
                      <RowMenu
                        actions={[
                          { label: 'Responder / Ver', onClick: () => { setSelected(r); setRespuesta(r.respuesta ?? '') } },
                          {
                            label: 'Aprobar en web',
                            disabled: r.estado === 'aprobada',
                            onClick: () => actualizarResena(r.id, { estado: 'aprobada' }, 'Reseña visible en web'),
                          },
                          {
                            label: 'Ocultar reseña',
                            disabled: r.estado === 'oculta',
                            onClick: () => actualizarResena(r.id, { estado: 'oculta' }, 'Reseña ocultada'),
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

      {/* DRAWER DETALLE Y RESPUESTA A RESEÑA */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Reseña de ${selected.cliente_nombre}` : 'Reseña'}
        sub={selected ? `${selected.calificacion} estrellas` : ''}
        footer={
          selected && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => actualizarResena(selected.id, { respuesta, estado: 'aprobada' }, 'Respuesta guardada y reseña aprobada')}
                className={`${T.btnPrimary} w-full`}
              >
                Guardar respuesta y aprobar
              </button>
              <button
                type="button"
                onClick={() =>
                  actualizarResena(
                    selected.id,
                    { estado: selected.estado === 'oculta' ? 'aprobada' : 'oculta' },
                    selected.estado === 'oculta' ? 'Reseña visible' : 'Reseña ocultada'
                  )
                }
                className={`${T.btnGhost} w-full`}
              >
                {selected.estado === 'oculta' ? 'Mostrar en la web' : 'Ocultar de la web'}
              </button>
            </div>
          )
        }
      >
        {selected && (
          <>
            <div className="rounded-lg border p-4 space-y-2 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
              <div className="flex items-center justify-between">
                <span className="font-bold a-txt">{'★'.repeat(selected.calificacion)}</span>
                <Pill estado={selected.estado || 'aprobada'} />
              </div>
              <p className="a-txt leading-relaxed">{selected.comentario}</p>
            </div>

            <div>
              <label className={T.label}>Respuesta pública de la barbería</label>
              <textarea
                rows={3}
                className={T.input}
                placeholder="Escribe una respuesta cordial para el cliente..."
                value={respuesta}
                onChange={e => setRespuesta(e.target.value)}
              />
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}
