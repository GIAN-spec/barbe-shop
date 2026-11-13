'use client'

/**
 * SHELL PRINCIPAL DEL PANEL ADMINISTRATIVO SAAS — CHINO BARBER
 * - Modo Claro Neutro por defecto (cero colores marrones/crema)
 * - Sidebar colapsable con las 5 categorías y 11 pantallas
 * - Selector de Rol (Dueño: acceso total | Barbero: su agenda y clientes)
 * - Responsive en móvil y tablet (menú hamburguesa deslizable)
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

const NAV_ITEMS: NavItem[] = [
  { id: 'resumen',   label: 'Resumen',   icon: 'LayoutDashboard', group: 'principal', barberAllowed: true },
  { id: 'agenda',    label: 'Agenda',    icon: 'Calendar',        group: 'operacion', barberAllowed: true },
  { id: 'pedidos',   label: 'Pedidos',   icon: 'ShoppingBag',     group: 'operacion', barberAllowed: false },
  { id: 'pagos',     label: 'Pagos',     icon: 'CreditCard',      group: 'operacion', barberAllowed: false },
  { id: 'clientes',  label: 'Clientes',  icon: 'Users',           group: 'clientes',  barberAllowed: true },
  { id: 'resenas',   label: 'Reseñas',   icon: 'Star',            group: 'clientes',  barberAllowed: false },
  { id: 'servicios', label: 'Servicios', icon: 'Scissors',        group: 'catalogo',  barberAllowed: false },
  { id: 'productos', label: 'Productos', icon: 'Package',         group: 'catalogo',  barberAllowed: false },
  { id: 'barberos',  label: 'Barberos',  icon: 'UserCheck',       group: 'catalogo',  barberAllowed: false },
  { id: 'galeria',   label: 'Galería',   icon: 'Image',           group: 'catalogo',  barberAllowed: false },
  { id: 'negocio',   label: 'Negocio',   icon: 'Settings',        group: 'ajustes',   barberAllowed: false },
]

export default function AdminDashboard() {
  const [tab, setTab] = useState<TabKey>('resumen')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [roleMode, setRoleMode] = useState<RoleMode>('owner')
  const [liveToast, setLiveToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    const unsub = syncBus.subscribe((ev, payload: any) => {
      if (ev === 'cita_created') {
        playLuxuryChime()
        const cli = payload?.cliente ? ` (${payload.cliente})` : ''
        setLiveToast({ msg: `🔔 ¡Nueva Cita Agendada en Tiempo Real${cli}!`, tone: 'ok' })
        setTimeout(() => setLiveToast(null), 3500)
      } else if (ev === 'pedido_created') {
        playLuxuryChime()
        const cli = payload?.cliente ? ` (${payload.cliente})` : ''
        setLiveToast({ msg: `🛍️ ¡Nuevo Pedido de Tienda en Tiempo Real${cli}!`, tone: 'ok' })
        setTimeout(() => setLiveToast(null), 3500)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('cbs_admin_saas_theme') as 'light' | 'dark' | null
    if (saved === 'dark' || saved === 'light') setTheme(saved)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('cbs_admin_saas_theme', next)
  }

  // Si cambia a rol Barbero y estaba en una pestaña exclusiva del Dueño, redirigir a Agenda
  const handleRoleChange = (nextRole: RoleMode) => {
    setRoleMode(nextRole)
    if (nextRole !== 'owner') {
      const item = NAV_ITEMS.find(n => n.id === tab)
      if (item && !item.barberAllowed) setTab('agenda')
    }
  }

  const visibleItems = NAV_ITEMS.filter(n => roleMode === 'owner' || n.barberAllowed)
  const activeMeta = NAV_ITEMS.find(n => n.id === tab) ?? NAV_ITEMS[0]

  const renderGroup = (groupKey: NavItem['group'], title?: string) => {
    const groupItems = visibleItems.filter(n => n.group === groupKey)
    if (groupItems.length === 0) return null
    return (
      <div className="mb-2">
        {title && !collapsed && <p className="a-nav-group-title">{title}</p>}
        <div className="space-y-0.5">
          {groupItems.map(t => {
            const active = tab === t.id
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
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div data-theme={theme} className="admin-root flex min-h-screen">
      {/* BACKDROP MÓVIL */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR COLAPSABLE */}
      <aside
        className={`a-sidebar fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-200 lg:sticky lg:top-0 lg:h-screen ${
          collapsed ? 'w-[68px]' : 'w-60'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Marca */}
        <div className="flex h-14 items-center justify-between border-b a-sb-line px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="grid size-8 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold text-white shadow-sm"
              style={{ background: 'var(--acc)' }}
            >
              CB
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-white">Chino Barber</p>
                <p className="text-xs text-slate-400">Admin Suite</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden grid size-8 place-items-center rounded-md text-slate-400 hover:text-white"
            aria-label="Cerrar menú"
          >
            <ModIcon name="X" className="h-4 w-4" />
          </button>
        </div>

        {/* Navegación estructurada */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {renderGroup('principal')}
          {renderGroup('operacion', 'Operación')}
          {renderGroup('clientes', 'Clientes')}
          {renderGroup('catalogo', 'Catálogo')}
          {renderGroup('ajustes', 'Ajustes')}
        </nav>

        {/* Pie del Sidebar: Colapsar */}
        <div className="hidden lg:flex border-t a-sb-line p-2.5">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="a-nav-item justify-center text-xs text-slate-400 hover:text-white"
          >
            {collapsed ? '»' : '« Colapsar barra'}
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Toast msg={liveToast?.msg ?? ''} tone={liveToast?.tone ?? 'ok'} />
        {/* TOPBAR */}
        <header
          className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-7 backdrop-blur-md"
          style={{
            borderColor: 'var(--line)',
            background: theme === 'dark' ? 'rgba(9, 9, 11, 0.88)' : 'rgba(255, 255, 255, 0.9)',
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
              <span className="a-muted hidden sm:inline">Panel</span>
              <span className="a-muted hidden sm:inline">/</span>
              <span className="font-semibold a-txt">{activeMeta.label}</span>
            </div>
          </div>

          {/* Controles derechos: Rol (Dueño / Barbero) + Tema + Web */}
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
                <option value="owner">Rol: Dueño (Total)</option>
                <option value="chino">Barbero: Chino</option>
                <option value="diego">Barbero: Diego</option>
                <option value="marco">Barbero: Marco</option>
              </select>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="grid size-8 place-items-center rounded-lg border transition hover:bg-[var(--hover)]"
              style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label="Cambiar tema"
            >
              <ModIcon name={theme === 'dark' ? 'Sun' : 'Moon'} className="h-4 w-4" />
            </button>

            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--hover)]"
              style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--txt)' }}
            >
              <span className="hidden sm:inline">Web pública</span>
              <ModIcon name="ExternalLink" className="h-3.5 w-3.5" />
            </a>
          </div>
        </header>

        {/* ÁREA DE TRABAJO CON ESPACIO EN BLANCO GENEROSO */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
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
  )
}
