'use client'

/**
 * SHELL PRINCIPAL DEL PANEL ADMINISTRATIVO — CHINO BARBERSHOP
 * - Identidad carbón + bronce/dorado coherente con el estudio
 * - Sidebar colapsable con contadores en vivo + bloque de sesión y Cerrar sesión
 * - Selector de rol dinámico (Dueño o cualquier barbero activo en BD)
 */
import { useEffect, useState } from 'react'
import './admin.css'
import { ModIcon, Toast, syncBus, playLuxuryChime, type IconName, type RoleMode } from './ui'
import TabDashboard from './tab-dashboard'
import TabAgenda from './tab-agenda'
import TabPedidos from './tab-tienda'
import TabPagos from './tab-reportes'
import { TabClientes, TabResenas } from './tab-clientes'
import { TabServicios, TabProductos, TabBarberos, TabGaleria } from './tab-catalogos'
import TabNegocio from './tab-bloqueos'

export type TabKey =
  | 'resumen'
  | 'agenda'
  | 'pedidos'
  | 'pagos'
  | 'clientes'
  | 'resenas'
  | 'servicios'
  | 'productos'
  | 'barberos'
  | 'galeria'
  | 'negocio'

type NavItem = {
  id: TabKey
  label: string
  icon: IconName
  group: 'principal' | 'operacion' | 'clientes' | 'catalogo' | 'ajustes'
  barberAllowed?: boolean
}

type NavCounts = {
  citasPendientesHoy: number
  pagosPorVerificar: number
  pedidosPendientes: number
  stockBajo: number
  resenasPendientes: number
}

const NAV_ITEMS: NavItem[] = [
  { id: 'resumen',   label: 'Resumen',   icon: 'LayoutDashboard', group: 'principal', barberAllowed: true },
  { id: 'agenda',    label: 'Agenda',    icon: 'Calendar',        group: 'operacion', barberAllowed: true },
  { id: 'pedidos',   label: 'Pedidos',   icon: 'ShoppingBag',     group: 'operacion', barberAllowed: false },
  { id: 'pagos',     label: 'Caja y Pagos', icon: 'CreditCard',   group: 'operacion', barberAllowed: false },
  { id: 'clientes',  label: 'Clientes',  icon: 'Users',           group: 'clientes',  barberAllowed: true },
  { id: 'resenas',   label: 'Reseñas',   icon: 'Star',            group: 'clientes',  barberAllowed: false },
  { id: 'servicios', label: 'Servicios', icon: 'Scissors',        group: 'catalogo',  barberAllowed: false },
  { id: 'productos', label: 'Productos', icon: 'Package',         group: 'catalogo',  barberAllowed: false },
  { id: 'barberos',  label: 'Barberos',  icon: 'UserCheck',       group: 'catalogo',  barberAllowed: false },
  { id: 'galeria',   label: 'Galería',   icon: 'Image',           group: 'catalogo',  barberAllowed: false },
  { id: 'negocio',   label: 'Negocio',   icon: 'Settings',        group: 'ajustes',   barberAllowed: false },
]

export default function AdminDashboard({
  adminUser,
}: {
  adminUser?: { nombre: string; email: string }
}) {
  const [tab, setTab] = useState<TabKey>('resumen')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [roleMode, setRoleMode] = useState<RoleMode>('owner')
  const [barberosList, setBarberosList] = useState<Array<{ id: string; nombre: string }>>([])
  const [counts, setCounts] = useState<NavCounts>({
    citasPendientesHoy: 0,
    pagosPorVerificar: 0,
    pedidosPendientes: 0,
    stockBajo: 0,
    resenasPendientes: 0,
  })
  const [loggingOut, setLoggingOut] = useState(false)
  const [liveToast, setLiveToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  async function cargarMeta(rolActual: RoleMode = roleMode) {
    try {
      const r = await fetch(`/api/admin/dashboard?barbero=${encodeURIComponent(rolActual)}`, { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      if (Array.isArray(d.barberos)) setBarberosList(d.barberos)
      if (d.counts) setCounts(d.counts)
    } catch {}
  }

  useEffect(() => {
    void cargarMeta(roleMode)
    const unsub = syncBus.subscribe((ev, payload: any) => {
      if (ev === 'cita_created') {
        playLuxuryChime()
        const cli = payload?.cliente ? ` (${payload.cliente})` : ''
        setLiveToast({ msg: `Nueva cita agendada${cli}`, tone: 'ok' })
        setTimeout(() => setLiveToast(null), 3500)
      } else if (ev === 'pedido_created') {
        playLuxuryChime()
        const cli = payload?.cliente ? ` (${payload.cliente})` : ''
        setLiveToast({ msg: `Nuevo pedido recibido${cli}`, tone: 'ok' })
        setTimeout(() => setLiveToast(null), 3500)
      }
      if (['cita_created', 'cita_updated', 'cita_deleted', 'pedido_created', 'pedido_updated', 'pago_updated'].includes(ev)) {
        void cargarMeta(roleMode)
      }
    })
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargarMeta(roleMode)
      }
    }, 20000)
    return () => {
      unsub()
      clearInterval(timer)
    }
  }, [roleMode])

  useEffect(() => {
    const saved = localStorage.getItem('cbs_admin_saas_theme') as 'light' | 'dark' | null
    if (saved === 'dark' || saved === 'light') setTheme(saved)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('cbs_admin_saas_theme', next)
  }

  const handleRoleChange = (nextRole: RoleMode) => {
    setRoleMode(nextRole)
    if (nextRole !== 'owner') {
      const item = NAV_ITEMS.find(n => n.id === tab)
      if (item && !item.barberAllowed) setTab('agenda')
    }
  }

  async function cerrarSesion() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    window.location.href = '/index.html?v=4.0'
  }

  const badgeForTab = (id: TabKey): { n: number; alert?: boolean } => {
    if (id === 'agenda') return { n: counts.citasPendientesHoy }
    if (id === 'pedidos') return { n: counts.pedidosPendientes }
    if (id === 'pagos') return { n: counts.pagosPorVerificar, alert: true }
    if (id === 'productos') return { n: counts.stockBajo, alert: true }
    if (id === 'resenas') return { n: counts.resenasPendientes }
    return { n: 0 }
  }

  const visibleItems = NAV_ITEMS.filter(n => roleMode === 'owner' || n.barberAllowed)
  const activeMeta = NAV_ITEMS.find(n => n.id === tab) ?? NAV_ITEMS[0]
  const ownerDisplayName = adminUser?.nombre || 'Administrador'
  const ownerInitials = ownerDisplayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || 'CB'

  const renderGroup = (groupKey: NavItem['group'], title?: string) => {
    const groupItems = visibleItems.filter(n => n.group === groupKey)
    if (groupItems.length === 0) return null
    return (
      <div className="mb-2">
        {title && !collapsed && <p className="a-nav-group-title">{title}</p>}
        <div className="space-y-0.5">
          {groupItems.map(t => {
            const active = tab === t.id
            const badge = badgeForTab(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id)
                  setMobileMenuOpen(false)
                }}
                title={t.label}
                className={`a-nav-item ${active ? 'active' : ''}`}
              >
                <ModIcon name={t.icon} className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t.label}</span>}
                {!collapsed && badge.n > 0 && (
                  <span className={`a-nav-badge ${badge.alert ? 'a-nav-badge-alert' : ''}`}>
                    {badge.n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div data-theme={theme} className="admin-root flex h-dvh max-h-dvh w-full overflow-hidden">
      {/* BACKDROP MÓVIL */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`a-sidebar fixed inset-y-0 left-0 z-40 flex h-dvh max-h-dvh flex-col transition-all duration-200 lg:static lg:z-20 shrink-0 ${
          collapsed ? 'w-[70px]' : 'w-60'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Marca */}
        <div className="flex h-14 items-center justify-between border-b a-sb-line px-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo.png?v=3"
              alt="Logo Chino Barbershop"
              className="size-10 shrink-0 object-contain"
            />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-white">Chino Barbershop</p>
                <p className="text-[11px] text-zinc-300">Gestión del estudio</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden grid size-8 place-items-center rounded-md text-zinc-400 hover:text-white"
            aria-label="Cerrar menú"
          >
            <ModIcon name="X" className="h-4 w-4" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {renderGroup('principal')}
          {renderGroup('operacion', 'Operación')}
          {renderGroup('clientes', 'Clientes')}
          {renderGroup('catalogo', 'Catálogo')}
          {renderGroup('ajustes', 'Ajustes')}
        </nav>

        {/* Sesión activa + Cerrar sesión + Colapsar */}
        <div className="border-t a-sb-line p-2.5 space-y-1.5 shrink-0">
          {!collapsed ? (
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-white/[0.04]">
              <div
                className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                style={{ background: 'rgba(212, 175, 55, 0.18)', color: '#f5df9d', border: '1px solid rgba(212, 175, 55, 0.35)' }}
              >
                {ownerInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{ownerDisplayName}</p>
                {adminUser?.email && (
                  <p className="truncate text-[11px] text-zinc-300">{adminUser.email}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-1" title={ownerDisplayName}>
              <div
                className="grid size-8 place-items-center rounded-full text-xs font-bold"
                style={{ background: 'rgba(212, 175, 55, 0.18)', color: '#f5df9d', border: '1px solid rgba(212, 175, 55, 0.35)' }}
              >
                {ownerInitials}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={cerrarSesion}
            disabled={loggingOut}
            title="Cerrar sesión"
            className="a-nav-item text-xs text-zinc-300 hover:text-white"
          >
            <ModIcon name="LogOut" className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{loggingOut ? 'Saliendo...' : 'Cerrar sesión'}</span>}
          </button>

          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="hidden lg:flex a-nav-item justify-center text-xs text-zinc-400 hover:text-white"
          >
            {collapsed ? '»' : '« Colapsar barra'}
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex h-dvh max-h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <Toast msg={liveToast?.msg ?? ''} tone={liveToast?.tone ?? 'ok'} />

        {/* TOPBAR */}
        <header
          className="shrink-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-7 backdrop-blur-md"
          style={{
            borderColor: 'var(--line)',
            background: theme === 'dark' ? 'rgba(12, 13, 16, 0.9)' : 'rgba(255, 255, 255, 0.92)',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="grid size-9 place-items-center rounded-lg border lg:hidden a-txt"
              style={{ borderColor: 'var(--line)' }}
              aria-label="Abrir menú"
            >
              <ModIcon name="Menu" className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="a-muted hidden sm:inline">Estudio</span>
              <span className="a-muted hidden sm:inline">/</span>
              <span className="font-semibold a-txt">{activeMeta.label}</span>
            </div>
          </div>

          {/* Controles derechos */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="hidden md:inline text-[11px] font-medium a-muted">Vista:</span>
              <select
                value={roleMode}
                onChange={e => handleRoleChange(e.target.value)}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold a-txt"
                style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
                aria-label="Cambiar rol de vista"
              >
                <option value="owner">Dueño (Vista total)</option>
                {barberosList.map(b => (
                  <option key={b.id} value={b.id}>
                    Barbero: {b.nombre.split(' ')[0]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="grid size-8 place-items-center rounded-lg border transition hover:bg-[var(--hover)] cursor-pointer"
              style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label="Cambiar tema"
            >
              <ModIcon name={theme === 'dark' ? 'Sun' : 'Moon'} className="h-4 w-4" />
            </button>

            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/index.html?v=4.0"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--hover)]"
              style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--txt)' }}
            >
              <span className="hidden sm:inline">Web pública</span>
              <ModIcon name="ExternalLink" className="h-3.5 w-3.5" />
            </a>
          </div>
        </header>

        {/* ÁREA DE TRABAJO */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-5 sm:px-6 lg:px-8 sm:py-7">
            {tab === 'resumen'   && <TabDashboard onGoTab={t => setTab(t as TabKey)} roleMode={roleMode} />}
            {tab === 'agenda'    && <TabAgenda roleMode={roleMode} />}
            {tab === 'pedidos'   && <TabPedidos />}
            {tab === 'pagos'     && <TabPagos />}
            {tab === 'clientes'  && <TabClientes />}
            {tab === 'resenas'   && <TabResenas />}
            {tab === 'servicios' && <TabServicios />}
            {tab === 'productos' && <TabProductos />}
            {tab === 'barberos'  && <TabBarberos />}
            {tab === 'galeria'   && <TabGaleria />}
            {tab === 'negocio'   && <TabNegocio />}
          </main>
        </div>
      </div>
    </div>
  )
}
