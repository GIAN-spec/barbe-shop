'use client'

/**
 * MÓDULO 3: PEDIDOS DE TIENDA (SaaS)
 * - Tabla de máximo 5 columnas: Orden · Cliente · Entrega · Total · Estado
 * - Sincroniza órdenes desde localStorage ('cbs_shop_orders') hacia SQLite
 * - Drawer lateral para ver productos del pedido, dirección delivery y verificar/entregar
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
  money,
  formatPaymentInfo,
  syncBus,
  type Pedido,
  type Producto,
} from './ui'

export default function TabPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [selected, setSelected] = useState<Pedido | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  // Nuevo pedido manual
  const [pCliente, setPCliente] = useState('')
  const [pTel, setPTel] = useState('')
  const [pProdId, setPProdId] = useState('')
  const [pCant, setPCant] = useState(1)
  const [pEntrega, setPEntrega] = useState<'recojo' | 'delivery'>('recojo')
  const [pMetodo, setPMetodo] = useState('efectivo')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargarPedidos() {
    // 1. Si hay órdenes nuevas en localStorage creadas desde la web pública con datos válidos, migrarlas a SQLite
    try {
      const raw = localStorage.getItem('cbs_shop_orders')
      if (raw) {
        const localOrders = JSON.parse(raw) as Array<Record<string, unknown>>
        for (const o of localOrders) {
          const cliName = String(o.customerName ?? '').trim()
          // Evitar reinsertar datos simulados de pruebas
          if (!cliName || cliName.toLowerCase() === 'cliente web' || cliName.toLowerCase().includes('test')) {
            continue
          }
          await fetch('/api/admin/saas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mod: 'pedido',
              id: o.id,
              cliente: cliName,
              telefono: o.customerPhone ?? '999999999',
              entrega: o.deliveryMode === 'delivery' ? 'delivery' : 'recojo',
              direccion: o.address ? `${o.district ?? ''} - ${o.address}` : '',
              items: o.items ?? [],
              subtotal: o.subtotal ?? o.total ?? 0,
              envio: o.shipping ?? 0,
              total: o.total ?? 0,
              metodo_pago: o.payMethod ?? 'yape',
              ref_pago: o.payRef ?? '',
              estado: o.status === 'entregado' ? 'entregado' : o.status === 'pagado' ? 'pagado' : 'pendiente',
            }),
          })
        }
      }
    } catch {}

    const [rPed, rProd] = await Promise.all([
      fetch('/api/admin/saas?mod=pedidos', { cache: 'no-store' }),
      fetch('/api/admin/saas?mod=productos', { cache: 'no-store' }),
    ])
    if (rPed.ok) setPedidos((await rPed.json()).pedidos ?? [])
    if (rProd.ok) {
      const list = (await rProd.json()).productos ?? []
      setProductos(list)
      if (!pProdId && list[0]) setPProdId(list[0].id)
    }
  }

  useEffect(() => {
    void cargarPedidos()

    const unsub = syncBus.subscribe((ev) => {
      if (['pedido_created', 'pedido_updated', 'pago_updated'].includes(ev)) {
        void cargarPedidos()
      }
    })

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargarPedidos()
      }
    }, 4000)

    const onFocus = () => void cargarPedidos()
    window.addEventListener('focus', onFocus)

    return () => {
      unsub()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  async function cambiarEstado(id: string, estado: Pedido['estado']) {
    const r = await fetch('/api/admin/saas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'pedido', id, estado }),
    })
    if (r.ok) {
      notify(`Pedido actualizado a ${estado}`)
      setSelected(null)
      syncBus.emit('pedido_updated', { id, estado })
      await cargarPedidos()
    } else {
      notify('Error al actualizar pedido', 'err')
    }
  }

  async function crearPedidoManual(e: React.FormEvent) {
    e.preventDefault()
    const prod = productos.find(x => x.id === pProdId)
    if (!prod) return
    const subtotal = prod.precio * pCant
    const envio = pEntrega === 'delivery' ? 8 : 0
    const r = await fetch('/api/admin/saas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mod: 'pedido',
        cliente: pCliente || 'Cliente Mostrador',
        telefono: pTel || '999999999',
        entrega: pEntrega,
        items: [{ name: prod.nombre, qty: pCant, price: prod.precio }],
        subtotal,
        envio,
        total: subtotal + envio,
        metodo_pago: pMetodo,
        estado: 'pagado',
      }),
    })
    if (r.ok) {
      notify('Pedido registrado')
      setOpenNew(false)
      setPCliente(''); setPTel('')
      syncBus.emit('pedido_created')
      await cargarPedidos()
    }
  }

  const filtrados = pedidos.filter(p => {
    const okEst = filtroEstado === 'todos' || p.estado === filtroEstado
    const q = busqueda.trim().toLowerCase()
    const okTxt = !q || p.id.toLowerCase().includes(q) || p.cliente.toLowerCase().includes(q) || p.telefono.includes(q)
    return okEst && okTxt
  })

  const parseItems = (json: string): Array<{ name: string; qty: number; price: number }> => {
    try { return JSON.parse(json) } catch { return [] }
  }

  return (
    <div className="a-fade space-y-5">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Pedidos"
        primaryAction={{
          label: 'Nuevo pedido',
          icon: 'Plus',
          onClick: () => setOpenNew(true),
        }}
      />

      {/* Búsqueda y Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="a-search-box max-w-xs">
          <span className="a-search-icon">
            <ModIcon name="Search" className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar orden o cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className={`${T.input} a-search-input`}
          />
        </div>

        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className={`${T.input} !w-auto`}
        >
          <option value="todos">Estado: Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
          <option value="entregado">Entregado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* Tabla de 5 columnas */}
      <div className={`${T.panel} overflow-hidden`}>
        {filtrados.length === 0 ? (
          <EmptyState
            text="No hay pedidos registrados."
            actionLabel="Nuevo pedido"
            onAction={() => setOpenNew(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Cliente</th>
                  <th>Entrega</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th className="w-10 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer">
                    <td className="font-mono font-semibold">{p.id}</td>
                    <td className="font-medium">{p.cliente}</td>
                    <td className="a-txt-2">{p.entrega === 'delivery' ? 'Delivery Lima' : 'Recojo en local'}</td>
                    <td className="font-mono font-semibold">{money(p.total)}</td>
                    <td><Pill estado={p.estado} /></td>
                    <td className="text-right">
                      <RowMenu
                        actions={[
                          { label: 'Ver detalle', onClick: () => setSelected(p) },
                          {
                            label: 'Verificar pago',
                            disabled: p.estado !== 'pendiente',
                            onClick: () => cambiarEstado(p.id, 'pagado'),
                          },
                          {
                            label: 'Marcar entregado',
                            disabled: p.estado === 'entregado',
                            onClick: () => cambiarEstado(p.id, 'entregado'),
                          },
                          {
                            label: 'Cancelar pedido',
                            danger: true,
                            disabled: p.estado === 'cancelado',
                            onClick: () => cambiarEstado(p.id, 'cancelado'),
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

      {/* DRAWER DETALLE DE PEDIDO */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Pedido ${selected.id}` : 'Detalle'}
        sub={selected ? selected.cliente : ''}
        footer={
          selected && (
            <div className="flex flex-col gap-2">
              {selected.estado === 'pendiente' && (
                <button
                  type="button"
                  onClick={() => cambiarEstado(selected.id, 'pagado')}
                  className={`${T.btnPrimary} w-full`}
                >
                  Verificar pago y confirmar
                </button>
              )}
              {selected.estado !== 'entregado' && selected.estado !== 'cancelado' && (
                <button
                  type="button"
                  onClick={() => cambiarEstado(selected.id, 'entregado')}
                  className={`${selected.estado === 'pagado' ? T.btnPrimary : T.btnGhost} w-full`}
                >
                  Marcar como Entregado
                </button>
              )}
            </div>
          )
        }
      >
        {selected && (
          <>
            <div className="flex items-center justify-between">
              <Pill estado={selected.estado} />
              <span className="font-mono text-base font-bold a-txt">{money(selected.total)}</span>
            </div>

            <div className="rounded-lg border p-4 space-y-2 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
              <div className="flex justify-between">
                <span className="a-muted">Cliente</span>
                <span className="font-semibold a-txt">{selected.cliente}</span>
              </div>
              <div className="flex justify-between">
                <span className="a-muted">Teléfono</span>
                <a
                  href={`https://wa.me/51${selected.telefono.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-semibold underline a-txt"
                >
                  {selected.telefono} ↗
                </a>
              </div>
              <div className="flex justify-between">
                <span className="a-muted">Modalidad</span>
                <span className="font-semibold a-txt">
                  {selected.entrega === 'delivery' ? 'Delivery Lima (+S/ 8)' : 'Recojo en Local'}
                </span>
              </div>
              {selected.direccion && (
                <div className="flex justify-between">
                  <span className="a-muted">Dirección</span>
                  <span className="font-semibold a-txt text-right max-w-[200px]">{selected.direccion}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                <span className="a-muted">Pago</span>
                <span className="font-semibold a-txt">{formatPaymentInfo(selected.metodo_pago, selected.ref_pago)}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider a-muted mb-2">Productos en la orden</h4>
              <div className="rounded-lg border divide-y text-xs" style={{ borderColor: 'var(--line)' }}>
                {parseItems(selected.items_json).map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <span className="a-txt font-medium">{it.qty}x {it.name}</span>
                    <span className="font-mono font-semibold a-txt">{money(it.price * it.qty)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Drawer>

      {/* DRAWER NUEVO PEDIDO */}
      <Drawer
        open={openNew}
        onClose={() => setOpenNew(false)}
        title="Nuevo pedido"
        sub="Venta directa de productos"
        footer={
          <button type="submit" form="form-nuevo-pedido" className={`${T.btnPrimary} w-full`}>
            Registrar pedido
          </button>
        }
      >
        <form id="form-nuevo-pedido" onSubmit={crearPedidoManual} className="space-y-4">
          <div>
            <label className={T.label}>Cliente</label>
            <input className={T.input} value={pCliente} onChange={e => setPCliente(e.target.value)} placeholder="Nombre del cliente" required />
          </div>
          <div>
            <label className={T.label}>Teléfono</label>
            <input className={T.input} value={pTel} onChange={e => setPTel(e.target.value)} placeholder="999 888 777" required />
          </div>
          <div>
            <label className={T.label}>Producto</label>
            <select className={T.input} value={pProdId} onChange={e => setPProdId(e.target.value)}>
              {productos.map(pr => (
                <option key={pr.id} value={pr.id}>{pr.nombre} — S/ {pr.precio}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={T.label}>Cantidad</label>
              <input type="number" min={1} className={T.input} value={pCant} onChange={e => setPCant(Number(e.target.value))} />
            </div>
            <div>
              <label className={T.label}>Entrega</label>
              <select className={T.input} value={pEntrega} onChange={e => setPEntrega(e.target.value as 'recojo' | 'delivery')}>
                <option value="recojo">Recojo en local</option>
                <option value="delivery">Delivery (+S/ 8)</option>
              </select>
            </div>
          </div>
          <div>
            <label className={T.label}>Método de pago</label>
            <select className={T.input} value={pMetodo} onChange={e => setPMetodo(e.target.value)}>
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
