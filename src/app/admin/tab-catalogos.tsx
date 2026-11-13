'use client'

/**
 * MÓDULOS DE CATÁLOGO (SaaS):
 * 7. Servicios: Tarjetas visuales con foto, duración, características, precio y botones de edición
 * 8. Productos: Tarjetas con foto real, marca, presentación, descripción, control de stock y edición
 * 9. Barberos: Fichas profesionales con foto, especialidad, tags, horario, días libres, comisión y edición
 * 10. Galería: Lookbook visual con categoría, estado y botones rápidos
 */
import { useEffect, useState } from 'react'
import {
  T,
  ModIcon,
  Drawer,
  RowMenu,
  AccordionSection,
  EmptyState,
  ScreenHeader,
  Toast,
  ToneBadge,
  money,
  type Servicio,
  type Producto,
  type Barbero,
  type FotoGaleria,
} from './ui'

async function subirFoto(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/admin/upload', { method: 'POST', body: fd })
  if (!r.ok) return null
  const j = await r.json()
  return j.url ?? null
}

function StatusBadge({ active, labelActive = 'Activo', labelInactive = 'Oculto' }: { active: boolean; labelActive?: string; labelInactive?: string }) {
  return <ToneBadge tone={active ? 'ok' : 'neutral'}>{active ? labelActive : labelInactive}</ToneBadge>
}

/* ==========================================================================
   MÓDULO 7: SERVICIOS (Con Imagen, Características y Botones de Edición)
   ========================================================================== */
export function TabServicios() {
  const [items, setItems] = useState<Servicio[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('todas')
  const [vista, setVista] = useState<'tarjetas' | 'tabla'>('tarjetas')
  const [editing, setEditing] = useState<Servicio | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargar() {
    const r = await fetch('/api/admin/servicios', { cache: 'no-store' })
    if (r.ok) setItems((await r.json()).servicios ?? [])
  }

  useEffect(() => { void cargar() }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const method = isNew ? 'POST' : 'PATCH'
    const r = await fetch('/api/admin/servicios', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    if (r.ok) {
      notify(isNew ? 'Servicio creado' : 'Servicio actualizado')
      setEditing(null)
      await cargar()
    } else {
      notify('No se pudo guardar el servicio', 'err')
    }
  }

  async function toggleActivo(s: Servicio) {
    const r = await fetch('/api/admin/servicios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, activo: s.activo ? 0 : 1 }),
    })
    if (r.ok) {
      notify(s.activo ? 'Servicio ocultado de la web' : 'Servicio activado en la web')
      await cargar()
    }
  }

  async function eliminar(id: string) {
    if (!window.confirm('¿Eliminar este servicio definitivamente?')) return
    const r = await fetch(`/api/admin/servicios?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (r.ok) {
      notify('Servicio eliminado')
      setEditing(null)
      await cargar()
    }
  }

  const categorias = [...new Set(items.map(x => x.cat))].sort()
  const filtrados = items.filter(s => {
    const okCat = catFiltro === 'todas' || s.cat.toLowerCase() === catFiltro.toLowerCase()
    const q = busqueda.trim().toLowerCase()
    const okTxt = !q || s.nombre.toLowerCase().includes(q) || (s.desc || '').toLowerCase().includes(q)
    return okCat && okTxt
  })

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Catálogo de Servicios"
        sub={`${items.length} servicios configurados con precios, tiempos y características`}
        extraRight={
          <div className="a-seg">
            <button type="button" onClick={() => setVista('tarjetas')} className={`a-seg-btn ${vista === 'tarjetas' ? 'active' : ''}`}>
              Tarjetas
            </button>
            <button type="button" onClick={() => setVista('tabla')} className={`a-seg-btn ${vista === 'tabla' ? 'active' : ''}`}>
              Tabla
            </button>
          </div>
        }
        primaryAction={{
          label: 'Nuevo servicio',
          icon: 'Plus',
          onClick: () => {
            setIsNew(true)
            setEditing({
              id: '',
              nombre: '',
              cat: 'corte',
              dur: 35,
              precio: 20,
              desc: '',
              foto: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80',
              activo: 1,
            })
          },
        }}
      />

      {/* Barra de búsqueda y filtro por categoría */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="a-search-box max-w-sm">
          <span className="a-search-icon"><ModIcon name="Search" className="h-4 w-4" /></span>
          <input
            type="text"
            placeholder="Buscar por nombre o característica..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className={`${T.input} a-search-input`}
          />
        </div>
        <div className="a-seg">
          <button
            type="button"
            onClick={() => setCatFiltro('todas')}
            className={`a-seg-btn ${catFiltro === 'todas' ? 'active' : ''}`}
          >
            Todos ({items.length})
          </button>
          {categorias.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFiltro(c)}
              className={`a-seg-btn capitalize ${catFiltro === c ? 'active' : ''}`}
            >
              {c} ({items.filter(x => x.cat === c).length})
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState text="No se encontraron servicios con ese criterio." />
      ) : vista === 'tarjetas' ? (
        /* VISTA DE TARJETAS ORGANIZADAS CON FOTO, CARACTERÍSTICAS Y BOTONES */
        <div className="grid gap-4 md:grid-cols-2">
          {filtrados.map(s => (
            <div key={s.id} className="a-card-interactive flex flex-col justify-between p-5">
              <div className="flex items-start gap-4">
                {s.foto ? (
                  <img
                    src={s.foto}
                    alt={s.nombre}
                    className="size-24 shrink-0 rounded-xl border object-cover"
                    style={{ borderColor: 'var(--line)' }}
                  />
                ) : (
                  <div
                    className="grid size-24 shrink-0 place-items-center rounded-xl border"
                    style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                  >
                    <ModIcon name="Scissors" className="h-7 w-7 a-muted" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="a-chip uppercase">{s.cat}</span>
                    <span className="a-chip">
                      <ModIcon name="Clock" className="h-3 w-3" /> {s.dur} min
                    </span>
                    <StatusBadge active={!!s.activo} />
                  </div>

                  <h3 className="text-base font-bold a-txt leading-snug">{s.nombre}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed a-muted">
                    {s.desc || 'Servicio profesional personalizado con productos de barbería.'}
                  </p>
                </div>
              </div>

              <div
                className="mt-4 flex items-center justify-between border-t pt-3.5"
                style={{ borderColor: 'var(--line)' }}
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider a-muted block">Tarifa</span>
                  <span className="font-mono text-lg font-bold a-txt">{money(s.precio)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActivo(s)}
                    className={`${T.btnGhost} !py-1.5 !px-3 !text-xs`}
                  >
                    {s.activo ? 'Ocultar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsNew(false); setEditing({ ...s }) }}
                    className={`${T.btnPrimary} !py-1.5 !px-3.5 !text-xs`}
                  >
                    <ModIcon name="Pencil" className="h-3.5 w-3.5" /> Editar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* VISTA TABLA COMPACTA (5 COLUMNAS) */
        <div className={`${T.panel} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Categoría</th>
                  <th>Duración</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th className="w-10 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(s => (
                  <tr key={s.id} onClick={() => { setIsNew(false); setEditing({ ...s }) }} className="cursor-pointer">
                    <td>
                      <div className="flex items-center gap-3">
                        {s.foto && <img src={s.foto} alt={s.nombre} className="size-10 rounded-lg object-cover border" style={{ borderColor: 'var(--line)' }} />}
                        <div>
                          <p className="font-semibold a-txt">{s.nombre}</p>
                          <p className="text-xs a-muted truncate max-w-xs">{s.desc}</p>
                        </div>
                      </div>
                    </td>
                    <td className="capitalize a-txt-2">{s.cat}</td>
                    <td className="font-mono text-xs a-txt-2">{s.dur} min</td>
                    <td className="font-mono font-semibold">{money(s.precio)}</td>
                    <td><StatusBadge active={!!s.activo} /></td>
                    <td className="text-right">
                      <RowMenu
                        actions={[
                          { label: 'Editar servicio', onClick: () => { setIsNew(false); setEditing({ ...s }) } },
                          { label: s.activo ? 'Ocultar' : 'Activar', onClick: () => toggleActivo(s) },
                          { label: 'Eliminar', danger: true, onClick: () => eliminar(s.id) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DRAWER LATERAL: EDITAR / CREAR SERVICIO */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Nuevo servicio' : `Editar · ${editing?.nombre}`}
        sub="Configura imagen, precio, duración y características"
        footer={
          editing && (
            <div className="flex gap-2">
              {!isNew && (
                <button type="button" onClick={() => eliminar(editing.id)} className={T.btnDanger}>
                  <ModIcon name="Trash2" className="h-4 w-4" /> Eliminar
                </button>
              )}
              <button type="submit" form="form-servicio" className={`${T.btnPrimary} flex-1`}>
                Guardar cambios
              </button>
            </div>
          )
        }
      >
        {editing && (
          <form id="form-servicio" onSubmit={guardar} className="space-y-4">
            {editing.foto && (
              <img
                src={editing.foto}
                alt={editing.nombre}
                className="h-36 w-full rounded-xl border object-cover"
                style={{ borderColor: 'var(--line)' }}
              />
            )}
            <div>
              <label className={T.label}>Nombre del servicio</label>
              <input
                className={T.input}
                value={editing.nombre}
                onChange={e => setEditing({ ...editing, nombre: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T.label}>Precio (S/)</label>
                <input
                  type="number"
                  className={T.input}
                  value={editing.precio}
                  onChange={e => setEditing({ ...editing, precio: Number(e.target.value) })}
                  required
                />
              </div>
              <div>
                <label className={T.label}>Duración (min)</label>
                <input
                  type="number"
                  className={T.input}
                  value={editing.dur}
                  onChange={e => setEditing({ ...editing, dur: Number(e.target.value) })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T.label}>Categoría</label>
                <select
                  className={T.input}
                  value={editing.cat}
                  onChange={e => setEditing({ ...editing, cat: e.target.value })}
                >
                  <option value="corte">Corte</option>
                  <option value="barba">Barba</option>
                  <option value="combo">Combo</option>
                </select>
              </div>
              <div>
                <label className={T.label}>Estado en web</label>
                <select
                  className={T.input}
                  value={editing.activo ? '1' : '0'}
                  onChange={e => setEditing({ ...editing, activo: Number(e.target.value) })}
                >
                  <option value="1">Activo</option>
                  <option value="0">Oculto</option>
                </select>
              </div>
            </div>
            <div>
              <label className={T.label}>Características / Descripción</label>
              <textarea
                rows={3}
                className={T.input}
                value={editing.desc}
                onChange={e => setEditing({ ...editing, desc: e.target.value })}
              />
            </div>
            <div>
              <label className={T.label}>Imagen (URL o subir archivo)</label>
              <div className="flex gap-2">
                <input
                  className={T.input}
                  value={editing.foto ?? ''}
                  onChange={e => setEditing({ ...editing, foto: e.target.value })}
                  placeholder="https://..."
                />
                <label className={`${T.btnGhost} cursor-pointer shrink-0`}>
                  Subir
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const u = await subirFoto(f)
                      if (u) setEditing({ ...editing, foto: u })
                    }}
                  />
                </label>
              </div>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  )
}

/* ==========================================================================
   MÓDULO 8: PRODUCTOS (Con Foto Real, Marca, Características, Stock y Botones)
   ========================================================================== */
export function TabProductos() {
  const [items, setItems] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [catFiltro, setCatFiltro] = useState('todas')
  const [vista, setVista] = useState<'tarjetas' | 'tabla'>('tarjetas')
  const [editing, setEditing] = useState<Producto | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargar() {
    const r = await fetch('/api/admin/saas?mod=productos', { cache: 'no-store' })
    if (r.ok) setItems((await r.json()).productos ?? [])
  }

  useEffect(() => { void cargar() }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const method = isNew ? 'POST' : 'PATCH'
    const r = await fetch('/api/admin/saas', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'producto', ...editing }),
    })
    if (r.ok) {
      notify(isNew ? 'Producto creado' : 'Producto actualizado')
      setEditing(null)
      await cargar()
    }
  }

  async function ajustarStockRapido(p: Producto, delta: number) {
    const nextStock = Math.max(0, (p.stock || 0) + delta)
    await fetch('/api/admin/saas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'producto', id: p.id, stock: nextStock }),
    })
    setItems(prev => prev.map(x => x.id === p.id ? { ...x, stock: nextStock } : x))
    notify(`Stock: ${nextStock} unid.`)
  }

  async function toggleActivo(p: Producto) {
    await fetch('/api/admin/saas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'producto', id: p.id, activo: p.activo ? 0 : 1 }),
    })
    notify(p.activo ? 'Producto ocultado' : 'Producto activado')
    await cargar()
  }

  async function eliminar(id: string) {
    if (!window.confirm('¿Eliminar este producto del catálogo?')) return
    await fetch(`/api/admin/saas?mod=producto&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    notify('Producto eliminado')
    setEditing(null)
    await cargar()
  }

  const categorias = [...new Set(items.map(x => x.cat))]
  const filtrados = items.filter(p => {
    const okCat = catFiltro === 'todas' || p.cat === catFiltro
    const q = busqueda.trim().toLowerCase()
    const okTxt = !q || p.nombre.toLowerCase().includes(q) || (p.marca || '').toLowerCase().includes(q)
    return okCat && okTxt
  })

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Catálogo de Productos"
        sub={`${items.length} productos oficiales en inventario para venta online y en local`}
        extraRight={
          <div className="a-seg">
            <button type="button" onClick={() => setVista('tarjetas')} className={`a-seg-btn ${vista === 'tarjetas' ? 'active' : ''}`}>
              Tarjetas
            </button>
            <button type="button" onClick={() => setVista('tabla')} className={`a-seg-btn ${vista === 'tabla' ? 'active' : ''}`}>
              Tabla
            </button>
          </div>
        }
        primaryAction={{
          label: 'Nuevo producto',
          icon: 'Plus',
          onClick: () => {
            setIsNew(true)
            setEditing({
              id: '',
              nombre: '',
              cat: 'Cabello & Styling',
              marca: 'American Crew · Reserve',
              presentacion: '85 g',
              desc: '',
              precio: 38,
              stock: 15,
              img: '/productos/prod-01.jpg',
              badge: 'Destacado',
              activo: 1,
            })
          },
        }}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="a-search-box max-w-sm">
          <span className="a-search-icon"><ModIcon name="Search" className="h-4 w-4" /></span>
          <input
            type="text"
            placeholder="Buscar producto o marca..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className={`${T.input} a-search-input`}
          />
        </div>
        <div className="a-seg flex-wrap">
          <button
            type="button"
            onClick={() => setCatFiltro('todas')}
            className={`a-seg-btn ${catFiltro === 'todas' ? 'active' : ''}`}
          >
            Todos ({items.length})
          </button>
          {categorias.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFiltro(c)}
              className={`a-seg-btn ${catFiltro === c ? 'active' : ''}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState text="No hay productos para mostrar." />
      ) : vista === 'tarjetas' ? (
        /* VISTA TARJETAS DE PRODUCTOS CON IMAGEN, CARACTERÍSTICAS, STOCK Y EDICIÓN */
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map(p => (
            <div key={p.id} className="a-card-interactive flex flex-col justify-between overflow-hidden">
              <div>
                {/* Cabecera con Foto del Producto */}
                <div
                  className="relative flex h-48 items-center justify-center border-b p-4"
                  style={{ background: 'var(--panel-2)', borderColor: 'var(--line)' }}
                >
                  {p.badge && (
                    <span className="a-chip absolute left-3 top-3">{p.badge}</span>
                  )}
                  <div className="absolute right-3 top-3">
                    <StatusBadge
                      active={!!p.activo && p.stock > 0}
                      labelActive={`${p.stock} en stock`}
                      labelInactive={p.stock <= 0 ? 'Agotado' : 'Oculto'}
                    />
                  </div>
                  {p.img ? (
                    <img
                      src={p.img}
                      alt={p.nombre}
                      className="max-h-36 w-auto object-contain transition-transform duration-200 hover:scale-105"
                    />
                  ) : (
                    <ModIcon name="Package" className="h-12 w-12 a-muted" />
                  )}
                </div>

                {/* Cuerpo con Marca, Presentación y Características */}
                <div className="p-5 pb-3">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold a-muted mb-1">
                    <span className="truncate">{p.marca || p.cat}</span>
                    {p.presentacion && <span className="font-mono shrink-0">{p.presentacion}</span>}
                  </div>
                  <h3 className="text-sm font-bold a-txt leading-snug line-clamp-1">{p.nombre}</h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed a-muted">
                    {p.desc || `Categoría: ${p.cat}. Producto profesional garantizado.`}
                  </p>
                </div>
              </div>

              {/* Pie con Precio, Control Rápido de Stock y Botón Editar */}
              <div className="px-5 pb-5 pt-2">
                <div
                  className="flex items-center justify-between rounded-xl border px-3 py-2 mb-3"
                  style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                >
                  <span className="text-xs font-semibold a-muted">Stock disponible</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => ajustarStockRapido(p, -1)}
                      className="grid size-6 place-items-center rounded border text-xs font-bold hover:bg-[var(--hover)]"
                      style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
                    >
                      −
                    </button>
                    <span className="font-mono text-xs font-bold w-6 text-center a-txt">{p.stock}</span>
                    <button
                      type="button"
                      onClick={() => ajustarStockRapido(p, 1)}
                      className="grid size-6 place-items-center rounded border text-xs font-bold hover:bg-[var(--hover)]"
                      style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-bold a-txt">{money(p.precio)}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleActivo(p)}
                      className={`${T.btnGhost} !py-1.5 !px-2.5 !text-xs`}
                    >
                      {p.activo ? 'Ocultar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsNew(false); setEditing({ ...p }) }}
                      className={`${T.btnPrimary} !py-1.5 !px-3.5 !text-xs`}
                    >
                      <ModIcon name="Pencil" className="h-3.5 w-3.5" /> Editar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* VISTA TABLA DE 5 COLUMNAS */
        <div className={`${T.panel} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Stock</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th className="w-10 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} onClick={() => { setIsNew(false); setEditing({ ...p }) }} className="cursor-pointer">
                    <td>
                      <div className="flex items-center gap-3">
                        {p.img && <img src={p.img} alt={p.nombre} className="size-10 rounded-lg object-contain border p-1" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }} />}
                        <div>
                          <p className="font-semibold a-txt">{p.nombre}</p>
                          <p className="text-xs a-muted">{p.marca} · {p.presentacion}</p>
                        </div>
                      </div>
                    </td>
                    <td className="a-txt-2">{p.cat}</td>
                    <td className="font-mono font-semibold">{p.stock} unid.</td>
                    <td className="font-mono font-semibold">{money(p.precio)}</td>
                    <td><StatusBadge active={!!p.activo && p.stock > 0} /></td>
                    <td className="text-right">
                      <RowMenu
                        actions={[
                          { label: 'Editar producto', onClick: () => { setIsNew(false); setEditing({ ...p }) } },
                          { label: p.activo ? 'Ocultar' : 'Activar', onClick: () => toggleActivo(p) },
                          { label: 'Eliminar', danger: true, onClick: () => eliminar(p.id) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DRAWER EDITAR / CREAR PRODUCTO */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Nuevo producto' : `Editar · ${editing?.nombre}`}
        sub="Actualiza foto, precio, stock y características"
        footer={
          editing && (
            <div className="flex gap-2">
              {!isNew && (
                <button type="button" onClick={() => eliminar(editing.id)} className={T.btnDanger}>
                  <ModIcon name="Trash2" className="h-4 w-4" /> Eliminar
                </button>
              )}
              <button type="submit" form="form-producto" className={`${T.btnPrimary} flex-1`}>
                Guardar cambios
              </button>
            </div>
          )
        }
      >
        {editing && (
          <form id="form-producto" onSubmit={guardar} className="space-y-4">
            {editing.img && (
              <div className="flex h-36 items-center justify-center rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
                <img src={editing.img} alt={editing.nombre} className="max-h-28 object-contain" />
              </div>
            )}
            <div>
              <label className={T.label}>Nombre del producto</label>
              <input
                className={T.input}
                value={editing.nombre}
                onChange={e => setEditing({ ...editing, nombre: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T.label}>Marca</label>
                <input
                  className={T.input}
                  value={editing.marca ?? ''}
                  onChange={e => setEditing({ ...editing, marca: e.target.value })}
                />
              </div>
              <div>
                <label className={T.label}>Presentación</label>
                <input
                  className={T.input}
                  value={editing.presentacion ?? ''}
                  onChange={e => setEditing({ ...editing, presentacion: e.target.value })}
                  placeholder="Ej. 85 g / 150 ml"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T.label}>Precio (S/)</label>
                <input
                  type="number"
                  className={T.input}
                  value={editing.precio}
                  onChange={e => setEditing({ ...editing, precio: Number(e.target.value) })}
                  required
                />
              </div>
              <div>
                <label className={T.label}>Stock disponible</label>
                <input
                  type="number"
                  min={0}
                  className={T.input}
                  value={editing.stock}
                  onChange={e => setEditing({ ...editing, stock: Number(e.target.value) })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T.label}>Categoría</label>
                <select
                  className={T.input}
                  value={editing.cat}
                  onChange={e => setEditing({ ...editing, cat: e.target.value })}
                >
                  <option value="Cabello & Styling">Cabello & Styling</option>
                  <option value="Cuidado de Barba">Cuidado de Barba</option>
                  <option value="Afeitado & Cuidado">Afeitado & Cuidado</option>
                  <option value="Packs & Accesorios">Packs & Accesorios</option>
                </select>
              </div>
              <div>
                <label className={T.label}>Etiqueta / Badge</label>
                <input
                  className={T.input}
                  value={editing.badge ?? ''}
                  onChange={e => setEditing({ ...editing, badge: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={T.label}>Características / Descripción</label>
              <textarea
                rows={3}
                className={T.input}
                value={editing.desc ?? ''}
                onChange={e => setEditing({ ...editing, desc: e.target.value })}
              />
            </div>
            <div>
              <label className={T.label}>Imagen del producto</label>
              <div className="flex gap-2">
                <input
                  className={T.input}
                  value={editing.img ?? ''}
                  onChange={e => setEditing({ ...editing, img: e.target.value })}
                />
                <label className={`${T.btnGhost} cursor-pointer shrink-0`}>
                  Subir
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const u = await subirFoto(f)
                      if (u) setEditing({ ...editing, img: u })
                    }}
                  />
                </label>
              </div>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  )
}

/* ==========================================================================
   MÓDULO 9: BARBEROS (Fichas con Foto, Especialidad, Horario y Comisión)
   ========================================================================== */
export function TabBarberos() {
  const [items, setItems] = useState<Barbero[]>([])
  const [editing, setEditing] = useState<Barbero | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargar() {
    const r = await fetch('/api/admin/barberos', { cache: 'no-store' })
    if (r.ok) setItems((await r.json()).barberos ?? [])
  }

  useEffect(() => { void cargar() }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const method = isNew ? 'POST' : 'PATCH'
    const r = await fetch('/api/admin/barberos', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    if (r.ok) {
      notify(isNew ? 'Barbero incorporado' : 'Ficha de barbero actualizada')
      setEditing(null)
      await cargar()
    }
  }

  async function toggleActivo(b: Barbero) {
    await fetch('/api/admin/barberos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, activo: b.activo ? 0 : 1 }),
    })
    notify(b.activo ? 'Barbero marcado como inactivo' : 'Barbero habilitado en reservas')
    await cargar()
  }

  async function eliminar(id: string) {
    if (!window.confirm('¿Eliminar a este barbero del equipo?')) return
    await fetch(`/api/admin/barberos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    notify('Barbero eliminado')
    setEditing(null)
    await cargar()
  }

  const parseTags = (raw: string): string[] => {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
    }
  }

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Equipo de Barberos"
        sub="Perfiles profesionales, especialidades, horarios de trabajo, días libres y comisión"
        primaryAction={{
          label: 'Incorporar barbero',
          icon: 'Plus',
          onClick: () => {
            setIsNew(true)
            setEditing({
              id: '',
              nombre: '',
              rol: 'Senior Barber',
              esp: 'Fades de precisión, corte clásico a tijera y ritual de barba',
              exp: '5 años de exp.',
              tags: '["Skin Fade","Tijera Clásica","Barba"]',
              foto: '/barberos/chino.jpg',
              activo: 1,
              comision: 50,
              horario: 'Lun - Sáb · 09:00 - 21:00',
              dias_libres: 'Domingo',
            })
          },
        }}
      />

      {/* GRILLA DE FICHAS PROFESIONALES DE BARBEROS */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map(b => {
          const tags = parseTags(b.tags)
          return (
            <div key={b.id} className="a-card-interactive flex flex-col justify-between p-5">
              <div>
                {/* Cabecera con Foto y Cargo */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative shrink-0">
                    {b.foto ? (
                      <img
                        src={b.foto}
                        alt={b.nombre}
                        className="size-20 rounded-2xl border object-cover"
                        style={{ borderColor: 'var(--line-2)' }}
                      />
                    ) : (
                      <div
                        className="grid size-20 place-items-center rounded-2xl border"
                        style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                      >
                        <ModIcon name="UserCheck" className="h-7 w-7 a-muted" />
                      </div>
                    )}
                    <span
                      className="absolute -bottom-1 -right-1 size-4 rounded-full border-2"
                      style={{
                        borderColor: 'var(--panel)',
                        backgroundColor: b.activo ? '#16a34a' : '#94a3b8',
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="a-chip mb-1">{b.exp || 'Experiencia Pro'}</span>
                    <h3 className="truncate text-base font-extrabold a-txt">{b.nombre}</h3>
                    <p className="text-xs font-medium a-muted truncate">{b.rol}</p>
                  </div>
                </div>

                {/* Especialidad y Tags */}
                <p className="text-xs leading-relaxed a-txt-2 mb-3">
                  {b.esp}
                </p>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {tags.map((tg, i) => (
                      <span key={i} className="a-chip">{tg}</span>
                    ))}
                  </div>
                )}

                {/* Resumen de Horario, Día Libre y Comisión */}
                <div
                  className="rounded-xl border p-3.5 space-y-2 text-xs mb-4"
                  style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="a-muted">Horario</span>
                    <span className="font-semibold a-txt">{b.horario || 'Lun - Sáb · 09:00 - 21:00'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="a-muted">Día libre</span>
                    <span className="font-semibold a-txt">{b.dias_libres || 'Domingo'}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                    <span className="a-muted">Comisión por corte</span>
                    <span className="font-mono font-bold a-txt">{b.comision ?? 50}%</span>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-between border-t pt-3.5" style={{ borderColor: 'var(--line)' }}>
                <StatusBadge
                  active={!!b.activo}
                  labelActive="Disponible"
                  labelInactive="No disponible"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActivo(b)}
                    className={`${T.btnGhost} !py-1.5 !px-3 !text-xs`}
                  >
                    {b.activo ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsNew(false); setEditing({ ...b }) }}
                    className={`${T.btnPrimary} !py-1.5 !px-3.5 !text-xs`}
                  >
                    <ModIcon name="Pencil" className="h-3.5 w-3.5" /> Editar ficha
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* DRAWER EDITAR / CREAR BARBERO */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Incorporar barbero' : `Editar · ${editing?.nombre}`}
        sub="Perfil, foto, comisión y horarios de atención"
        footer={
          editing && (
            <div className="flex gap-2">
              {!isNew && (
                <button type="button" onClick={() => eliminar(editing.id)} className={T.btnDanger}>
                  <ModIcon name="Trash2" className="h-4 w-4" /> Eliminar
                </button>
              )}
              <button type="submit" form="form-barbero" className={`${T.btnPrimary} flex-1`}>
                Guardar cambios
              </button>
            </div>
          )
        }
      >
        {editing && (
          <form id="form-barbero" onSubmit={guardar} className="space-y-4">
            <div className="flex items-center gap-3">
              {editing.foto && (
                <img
                  src={editing.foto}
                  alt={editing.nombre}
                  className="size-16 rounded-2xl border object-cover"
                  style={{ borderColor: 'var(--line)' }}
                />
              )}
              <div className="flex-1">
                <label className={T.label}>Foto de perfil</label>
                <div className="flex gap-2">
                  <input
                    className={T.input}
                    value={editing.foto ?? ''}
                    onChange={e => setEditing({ ...editing, foto: e.target.value })}
                    placeholder="/barberos/chino.jpg"
                  />
                  <label className={`${T.btnGhost} cursor-pointer shrink-0`}>
                    Subir
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        const u = await subirFoto(f)
                        if (u) setEditing({ ...editing, foto: u })
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className={T.label}>Nombre completo</label>
              <input
                className={T.input}
                value={editing.nombre}
                onChange={e => setEditing({ ...editing, nombre: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T.label}>Cargo / Rol</label>
                <input
                  className={T.input}
                  value={editing.rol}
                  onChange={e => setEditing({ ...editing, rol: e.target.value })}
                />
              </div>
              <div>
                <label className={T.label}>Experiencia</label>
                <input
                  className={T.input}
                  value={editing.exp}
                  onChange={e => setEditing({ ...editing, exp: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className={T.label}>Especialidad principal</label>
              <input
                className={T.input}
                value={editing.esp}
                onChange={e => setEditing({ ...editing, esp: e.target.value })}
              />
            </div>

            <AccordionSection title="Horarios, días libres y comisión" defaultOpen={true}>
              <div>
                <label className={T.label}>Horario semanal</label>
                <input
                  className={T.input}
                  value={editing.horario ?? 'Lun - Sáb · 09:00 - 21:00'}
                  onChange={e => setEditing({ ...editing, horario: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={T.label}>Día(s) libre(s)</label>
                  <input
                    className={T.input}
                    value={editing.dias_libres ?? 'Domingo'}
                    onChange={e => setEditing({ ...editing, dias_libres: e.target.value })}
                  />
                </div>
                <div>
                  <label className={T.label}>Comisión (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className={T.input}
                    value={editing.comision ?? 50}
                    onChange={e => setEditing({ ...editing, comision: Number(e.target.value) })}
                  />
                </div>
              </div>
            </AccordionSection>
          </form>
        )}
      </Drawer>
    </div>
  )
}

/* ==========================================================================
   MÓDULO 10: GALERÍA LOOKBOOK (Con Imagen, Categoría y Botones de Edición)
   ========================================================================== */
export function TabGaleria() {
  const [fotos, setFotos] = useState<FotoGaleria[]>([])
  const [editing, setEditing] = useState<FotoGaleria | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargar() {
    const r = await fetch('/api/admin/saas?mod=galeria', { cache: 'no-store' })
    if (r.ok) setFotos((await r.json()).galeria ?? [])
  }

  useEffect(() => { void cargar() }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const method = isNew ? 'POST' : 'PATCH'
    const r = await fetch('/api/admin/saas', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'galeria', ...editing }),
    })
    if (r.ok) {
      notify(isNew ? 'Foto añadida al Lookbook' : 'Foto actualizada')
      setEditing(null)
      await cargar()
    }
  }

  async function toggleActivo(f: FotoGaleria) {
    await fetch('/api/admin/saas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'galeria', id: f.id, activo: f.activo ? 0 : 1 }),
    })
    notify(f.activo ? 'Foto ocultada' : 'Foto visible')
    await cargar()
  }

  async function eliminar(id: string) {
    if (!window.confirm('¿Eliminar esta foto del Lookbook?')) return
    await fetch(`/api/admin/saas?mod=galeria&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    notify('Foto eliminada')
    setEditing(null)
    await cargar()
  }

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Galería Lookbook"
        sub="Trabajos reales exhibidos en la sección de galería de la web pública"
        primaryAction={{
          label: 'Subir foto',
          icon: 'Plus',
          onClick: () => {
            setIsNew(true)
            setEditing({ id: '', titulo: '', cat: 'Fade', url: '', orden: 1, activo: 1 })
          },
        }}
      />

      {fotos.length === 0 ? (
        <EmptyState text="No hay fotos en la galería." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {fotos.map(f => (
            <div key={f.id} className="a-card-interactive overflow-hidden flex flex-col justify-between">
              <div className="relative">
                <img src={f.url} alt={f.titulo} className="h-52 w-full object-cover" />
                <span className="a-chip absolute left-3 top-3">{f.cat}</span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold a-txt truncate">{f.titulo}</h3>
                  <StatusBadge active={!!f.activo} />
                </div>
                <div className="flex items-center justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                  <button
                    type="button"
                    onClick={() => toggleActivo(f)}
                    className={`${T.btnGhost} !py-1 !px-2.5 !text-xs`}
                  >
                    {f.activo ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsNew(false); setEditing({ ...f }) }}
                    className={`${T.btnPrimary} !py-1 !px-3 !text-xs`}
                  >
                    <ModIcon name="Pencil" className="h-3.5 w-3.5" /> Editar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Subir foto al Lookbook' : 'Editar foto'}
        footer={
          editing && (
            <div className="flex gap-2">
              {!isNew && (
                <button type="button" onClick={() => eliminar(editing.id)} className={T.btnDanger}>
                  <ModIcon name="Trash2" className="h-4 w-4" /> Eliminar
                </button>
              )}
              <button type="submit" form="form-galeria" className={`${T.btnPrimary} flex-1`}>
                Guardar
              </button>
            </div>
          )
        }
      >
        {editing && (
          <form id="form-galeria" onSubmit={guardar} className="space-y-4">
            {editing.url && (
              <img src={editing.url} alt={editing.titulo} className="h-44 w-full rounded-xl object-cover border" style={{ borderColor: 'var(--line)' }} />
            )}
            <div>
              <label className={T.label}>Título del corte / trabajo</label>
              <input
                className={T.input}
                value={editing.titulo}
                onChange={e => setEditing({ ...editing, titulo: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={T.label}>Categoría</label>
                <select
                  className={T.input}
                  value={editing.cat}
                  onChange={e => setEditing({ ...editing, cat: e.target.value })}
                >
                  <option value="Fade">Fade</option>
                  <option value="Clásico">Clásico</option>
                  <option value="Barba">Barba</option>
                  <option value="Textura">Textura</option>
                </select>
              </div>
              <div>
                <label className={T.label}>Visibilidad</label>
                <select
                  className={T.input}
                  value={editing.activo ? '1' : '0'}
                  onChange={e => setEditing({ ...editing, activo: Number(e.target.value) })}
                >
                  <option value="1">Visible</option>
                  <option value="0">Oculta</option>
                </select>
              </div>
            </div>
            <div>
              <label className={T.label}>Imagen (URL o subir archivo)</label>
              <div className="flex gap-2">
                <input
                  className={T.input}
                  value={editing.url}
                  onChange={e => setEditing({ ...editing, url: e.target.value })}
                  required
                />
                <label className={`${T.btnGhost} cursor-pointer shrink-0`}>
                  Subir
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const u = await subirFoto(f)
                      if (u) setEditing({ ...editing, url: u })
                    }}
                  />
                </label>
              </div>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  )
}
