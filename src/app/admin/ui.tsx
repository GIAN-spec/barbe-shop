'use client'

/**
 * Primitivas UI del Panel Admin SaaS — Chino Barber
 * Incluye: Drawer lateral, Menú ⋯, Badges sobrios, Acordeón colapsable,
 * Tooltips (sin textos explicativos permanentes) y Estados vacíos limpios.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const T = {
  panel: 'a-panel',
  panel2: 'a-panel-2',
  kpiCard: 'a-kpi-card',
  input: 'a-input',
  label: 'a-label',
  btn: 'a-btn',
  btnPrimary: 'a-btn a-btn-primary',
  btnGhost: 'a-btn a-btn-ghost',
  btnDanger: 'a-btn a-btn-danger',
} as const

export type RoleMode = 'owner' | string // 'owner' o ID de barbero ('chino', 'diego', 'marco')

export type Cita = {
  id: string
  nombre: string
  celular: string
  servicio: string
  servicioNombre?: string
  servicioDur?: number
  servicioPrecio?: number
  barbero: string
  fecha: string
  hora: string
  metodo_pago: string
  ref_pago?: string | null
  estado: 'pendiente' | 'confirmada' | 'completada' | 'rechazada' | 'pagado' | 'cancelada'
  notas?: string | null
  leida?: number
  created_at?: string
}

export type Servicio = {
  id: string
  cat: string
  nombre: string
  desc: string
  dur: number
  precio: number
  foto: string | null
  orden?: number
  activo: number
}

export type Barbero = {
  id: string
  nombre: string
  rol: string
  esp: string
  exp: string
  tags: string
  foto: string | null
  activo: number
  comision?: number
  horario?: string
  dias_libres?: string
}

export type Bloqueo = { id: string; fecha: string; hora: string | null; motivo: string }

export type Producto = {
  id: string
  nombre: string
  cat: string
  marca?: string
  presentacion?: string
  desc?: string
  precio: number
  stock: number
  img?: string
  badge?: string
  activo: number
}

export type Pedido = {
  id: string
  cliente: string
  telefono: string
  entrega: string
  direccion?: string
  items_json: string
  subtotal: number
  envio: number
  total: number
  metodo_pago: string
  ref_pago?: string
  estado: 'pendiente' | 'pagado' | 'entregado' | 'cancelado'
  created_at: string
}

export type ClienteFicha = {
  id: string
  nombre: string
  email: string
  celular: string
  sellos_vip: number
  notas: string
  visitas: number
  totalGastado: number
  ultimaCita: string
  historial: Array<{
    id: string
    fecha: string
    hora: string
    estado: string
    barbero: string
    servicioNombre: string
    precio: number
  }>
}

export type ResenaItem = {
  id: string
  cliente_nombre: string
  barbero_id?: string
  servicio_id?: string
  calificacion: number
  comentario: string
  estado: 'aprobada' | 'pendiente' | 'oculta'
  respuesta?: string
  created_at: string
}

export type FotoGaleria = {
  id: string
  titulo: string
  cat: string
  url: string
  orden: number
  activo: number
}

export type NegocioAjustes = {
  nombre: string
  telefono: string
  whatsapp: string
  direccion: string
  horarioApertura: string
  horarioCierre: string
  diasAtencion: string
  yapeNumero: string
  yapeTitular: string
  yapeQrUrl: string
  aceptaYape: boolean
  aceptaTarjeta: boolean
  aceptaEfectivo: boolean
  deliveryActivo: boolean
  deliveryTarifa: number
  metaSellosVip: number
}

export function getFechaHoy(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function shiftFecha(iso: string, dias: number): string {
  const f = new Date(iso + 'T12:00:00')
  f.setDate(f.getDate() + dias)
  const y = f.getFullYear()
  const m = String(f.getMonth() + 1).padStart(2, '0')
  const d = String(f.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fechaLarga(iso: string): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export const money = (n: number) => `S/ ${Number(n || 0).toFixed(2)}`

export function formatPaymentInfo(metodo?: string | null, ref?: string | null): string {
  const m = (metodo || 'efectivo').toUpperCase()
  const r = (ref || '').trim()
  if (!r || r.toUpperCase() === m || r.toUpperCase() === 'LOCAL' || r.toUpperCase() === 'EFECTIVO') {
    return m
  }
  return `${m} · Op: ${r}`
}

export function parseCitaExtras(c: Cita): {
  serviceTotal: number
  productsTotal: number
  grandTotal: number
  productsText: string | null
  extraServicesText: string | null
} {
  const baseService = Number(c.servicioPrecio) || 15
  const notas = c.notas || ''

  let extraSrvSum = 0
  const srvMatch = notas.match(/\[Servicios:\s*([^\]]+)\]/i)
  if (srvMatch) {
    const prices = [...srvMatch[1].matchAll(/S\/\s*(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]))
    if (prices.length > 0) {
      extraSrvSum = prices.reduce((a, b) => a + b, 0) - baseService
      if (extraSrvSum < 0) extraSrvSum = 0
    }
  }

  let productsTotal = 0
  let productsText: string | null = null
  const prodMatch = notas.match(/\[Productos en Bolsa:\s*([^\]]+?)\s*\(\+S\/\s*(\d+(?:\.\d+)?)\)\]/i)
  if (prodMatch) {
    productsText = prodMatch[1].trim()
    productsTotal = Number(prodMatch[2]) || 0
  }

  const serviceTotal = baseService + extraSrvSum
  return {
    serviceTotal,
    productsTotal,
    grandTotal: serviceTotal + productsTotal,
    productsText,
    extraServicesText: srvMatch ? srvMatch[1].trim() : null,
  }
}

/* ==========================================================================
   BADGE DE ESTADO SOBRIO (Punto de color + etiqueta limpia)
   ========================================================================== */
export type Tone = 'ok' | 'warn' | 'info' | 'danger' | 'neutral' | 'violet'

const ESTADO_TONE: Record<string, Tone> = {
  pendiente: 'warn',
  confirmada: 'info',
  pagado: 'ok',
  aprobada: 'ok',
  entregado: 'ok',
  completada: 'violet',
  rechazada: 'danger',
  cancelada: 'neutral',
  cancelado: 'neutral',
  oculta: 'neutral',
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  pagado: 'Pagado',
  completada: 'Atendida',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  cancelado: 'Cancelado',
  entregado: 'Entregado',
  aprobada: 'Aprobada',
  oculta: 'Oculta',
}

/** Badge de estado con tinte suave por tipo (texto AA sobre fondo suave) */
export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{
        color: `var(--${tone})`,
        background: `var(--${tone}-bg)`,
        borderColor: tone === 'violet' ? 'transparent' : `var(--${tone}-line)`,
      }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'currentColor' }} />
      {children}
    </span>
  )
}

export function Pill({ estado }: { estado: string }) {
  return <ToneBadge tone={ESTADO_TONE[estado] ?? 'neutral'}>{ESTADO_LABEL[estado] ?? estado}</ToneBadge>
}

/* ==========================================================================
   ICONOS VECTORIALES LIMPIOS
   ========================================================================== */
export type IconName =
  | 'LayoutDashboard'
  | 'Calendar'
  | 'ShoppingBag'
  | 'CreditCard'
  | 'Users'
  | 'Star'
  | 'Scissors'
  | 'Package'
  | 'UserCheck'
  | 'Image'
  | 'Settings'
  | 'Plus'
  | 'Search'
  | 'MoreHorizontal'
  | 'X'
  | 'Check'
  | 'ChevronDown'
  | 'ChevronLeft'
  | 'ChevronRight'
  | 'ExternalLink'
  | 'Sun'
  | 'Moon'
  | 'Menu'
  | 'AlertCircle'
  | 'HelpCircle'
  | 'Trash2'
  | 'Pencil'
  | 'Clock'
  | 'Eye'
  | 'LogOut'
  | 'Printer'
  | 'Download'
  | 'MessageCircle'
  | 'Lock'
  | 'AlertTriangle'
  | 'TrendingUp'
  | 'TrendingDown'
  | 'Columns'

export function ModIcon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const p = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  }
  switch (name) {
    case 'LayoutDashboard':
      return <svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
    case 'Calendar':
      return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
    case 'ShoppingBag':
      return <svg {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
    case 'CreditCard':
      return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
    case 'Users':
      return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    case 'Star':
      return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    case 'Scissors':
      return <svg {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" /></svg>
    case 'Package':
      return <svg {...p}><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>
    case 'UserCheck':
      return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>
    case 'Image':
      return <svg {...p}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
    case 'Settings':
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
    case 'Plus':
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>
    case 'Search':
      return <svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
    case 'MoreHorizontal':
      return <svg {...p}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
    case 'X':
      return <svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
    case 'Check':
      return <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>
    case 'ChevronDown':
      return <svg {...p}><path d="m6 9 6 6 6-6" /></svg>
    case 'ChevronLeft':
      return <svg {...p}><path d="m15 18-6-6 6-6" /></svg>
    case 'ChevronRight':
      return <svg {...p}><path d="m9 18 6-6-6-6" /></svg>
    case 'ExternalLink':
      return <svg {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
    case 'Sun':
      return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
    case 'Moon':
      return <svg {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
    case 'Menu':
      return <svg {...p}><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
    case 'AlertCircle':
      return <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
    case 'HelpCircle':
      return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
    case 'Trash2':
      return <svg {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
    case 'Pencil':
      return <svg {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
    case 'Clock':
      return <svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
    case 'Eye':
      return <svg {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
    case 'LogOut':
      return <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
    case 'Printer':
      return <svg {...p}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect width="12" height="8" x="6" y="14" /></svg>
    case 'Download':
      return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
    case 'MessageCircle':
      return <svg {...p}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
    case 'Lock':
      return <svg {...p}><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
    case 'AlertTriangle':
      return <svg {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
    case 'TrendingUp':
      return <svg {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
    case 'TrendingDown':
      return <svg {...p}><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></svg>
    case 'Columns':
      return <svg {...p}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18M15 3v18" /></svg>
  }
}

/* ==========================================================================
   DRAWER LATERAL DERECHO (Para ver detalles y formularios sin saturar tablas)
   ========================================================================== */
export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  sub?: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-between sm:justify-end bg-black/65 backdrop-blur-sm transition-all duration-200 cursor-pointer"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Indicador visible en PC para indicar que es un modal superpuesto */}
      <div className="hidden lg:flex items-center gap-2 self-start mt-5 ml-6 px-3.5 py-1.5 rounded-full bg-black/70 text-white text-xs font-medium border border-white/20 backdrop-blur-md shadow-lg pointer-events-none select-none">
        <ModIcon name="X" className="h-3.5 w-3.5" />
        <span>Clic en el fondo o presiona Esc para volver</span>
      </div>

      <aside
        onClick={e => e.stopPropagation()}
        className="a-drawer-panel flex h-dvh max-h-dvh w-full sm:max-w-md lg:max-w-lg flex-col border-l shadow-2xl relative z-10 cursor-default animate-in slide-in-from-right duration-200"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <header className="flex items-center justify-between gap-3 border-b px-6 py-4 shrink-0" style={{ borderColor: 'var(--line)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-bold a-txt truncate">{title}</h3>
            {sub && <p className="text-xs a-muted mt-0.5 truncate">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold a-txt-2 hover:bg-[var(--hover)] hover:text-white cursor-pointer transition-colors shadow-sm shrink-0"
            style={{ borderColor: 'var(--line)' }}
            aria-label="Cerrar panel y volver"
          >
            <ModIcon name="X" className="h-4 w-4" />
            <span>Cerrar</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {children}
        </div>

        {footer && (
          <footer className="border-t px-6 py-4 shrink-0" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
            {footer}
          </footer>
        )}
      </aside>
    </div>
  )
}

/* ==========================================================================
   MENÚ CONTEXTUAL FLOTANTE (⋯) PARA ACCIONES SECUNDARIAS
   Renderizado via Portal en document.body con detección inteligente de espacio
   (auto-flip hacia arriba si está cerca del fondo) para que nunca se corte ni
   fuerce scroll en tablas o tarjetas de ningún módulo.
   ========================================================================== */
export function RowMenu({
  actions,
}: {
  actions: Array<{ label: string; onClick: () => void; danger?: boolean; disabled?: boolean }>
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<{
    openUpwards: boolean
    top?: number
    bottom?: number
    right: number
    maxHeight: number
  } | null>(null)

  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const updatePosition = () => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    // Espacio aproximado requerido por la lista de acciones (cada acción ~38px + padding)
    const approxHeight = Math.max(90, actions.length * 38 + 16)
    const spaceBelow = vh - rect.bottom
    const spaceAbove = rect.top
    // Si abajo queda menos del espacio requerido o menos de 190px, y arriba hay más espacio, abrir hacia ARRIBA
    const openUpwards = (spaceBelow < approxHeight + 12 || spaceBelow < 190) && spaceAbove > spaceBelow

    const right = Math.max(12, vw - rect.right)

    if (openUpwards) {
      setPos({
        openUpwards: true,
        bottom: Math.max(8, vh - rect.top + 6),
        right,
        maxHeight: Math.max(120, Math.min(spaceAbove - 16, 380)),
      })
    } else {
      setPos({
        openUpwards: false,
        top: Math.max(8, rect.bottom + 6),
        right,
        maxHeight: Math.max(120, Math.min(spaceBelow - 16, 380)),
      })
    }
  }

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!open) {
      updatePosition()
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return

    const handleResize = () => updatePosition()

    const handleScroll = (e: Event) => {
      // Si el scroll ocurre dentro del propio menú emergente, permitirlo
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return
      setOpen(false)
    }

    const handleDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('touchstart', handleDown)
    window.addEventListener('keydown', handleKey)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('touchstart', handleDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, actions.length])

  return (
    <div className="relative inline-block text-left" onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`grid size-8 place-items-center rounded-lg border transition ${
          open ? 'ring-2 ring-[var(--gold)]/50 bg-[var(--hover)]' : 'hover:bg-[var(--hover)]'
        }`}
        style={{ borderColor: 'var(--line)', color: 'var(--txt-2)' }}
        aria-label="Más acciones"
        aria-expanded={open}
      >
        <ModIcon name="MoreHorizontal" className="h-4 w-4" />
      </button>

      {open && mounted && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={e => e.stopPropagation()}
          className="fixed z-[99999] min-w-[200px] rounded-xl border p-1.5 shadow-2xl backdrop-blur-md a-fade a-floating-menu"
          style={{
            background: 'var(--panel)',
            borderColor: 'var(--line)',
            boxShadow: '0 16px 38px -6px rgba(0, 0, 0, 0.38), 0 0 0 1px var(--line)',
            right: `${pos.right}px`,
            ...(pos.openUpwards ? { bottom: `${pos.bottom}px` } : { top: `${pos.top}px` }),
            maxHeight: `${pos.maxHeight}px`,
            overflowY: 'auto',
          }}
        >
          {actions.map((a, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={e => {
                e.stopPropagation()
                setOpen(false)
                a.onClick()
              }}
              className={`flex w-full items-center px-3.5 py-2.5 text-left text-xs font-semibold rounded-lg transition disabled:opacity-35 disabled:cursor-not-allowed ${
                a.danger
                  ? 'text-red-500 hover:bg-red-500/10'
                  : 'a-txt hover:bg-[var(--hover)]'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

/* ==========================================================================
   SECCIÓN COLAPSABLE (ACORDEÓN) PARA FORMULARIOS LARGOS Y AJUSTES
   ========================================================================== */
export function AccordionSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider a-txt"
      >
        <span>{title}</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <ModIcon name="ChevronDown" className="h-4 w-4 a-muted" />
        </span>
      </button>
      {open && (
        <div className="border-t px-4 py-4 space-y-3.5" style={{ borderColor: 'var(--line)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
   TOOLTIP DISCRETO (Reemplaza textos explicativos permanentes)
   ========================================================================== */
export function Hint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle cursor-help">
      <ModIcon name="HelpCircle" className="h-3.5 w-3.5 a-muted" />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-52 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-[11px] font-normal leading-snug shadow-md group-hover:block"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--txt)' }}
      >
        {text}
      </span>
    </span>
  )
}

/* ==========================================================================
   ESTADO VACÍO LIMPIO (Una frase + Un botón)
   ========================================================================== */
export function EmptyState({
  text,
  actionLabel,
  onAction,
}: {
  text: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <p className="text-sm a-muted mb-3">{text}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className={T.btnPrimary}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/* ==========================================================================
   TOAST RÁPIDO (1.4s)
   ========================================================================== */
export function Toast({ msg, tone = 'ok' }: { msg: string; tone?: 'ok' | 'err' }) {
  if (!msg) return null
  return (
    <div
      className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold shadow-md a-fade"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--line-2)',
        color: 'var(--txt)',
      }}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: tone === 'ok' ? '#16a34a' : '#dc2626' }}
      />
      <span>{msg}</span>
    </div>
  )
}

/* ==========================================================================
   CONTENEDOR DE PANTALLA (Título + 1 sola Acción Primaria)
   ========================================================================== */
export function ScreenHeader({
  title,
  sub,
  extraRight,
  primaryAction,
}: {
  title: string
  sub?: string
  extraRight?: ReactNode
  primaryAction?: { label: string; onClick: () => void; icon?: IconName }
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight a-txt">{title}</h1>
        {sub && <p className="text-xs a-muted mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        {extraRight}
        {primaryAction && (
          <button type="button" onClick={primaryAction.onClick} className={T.btnPrimary}>
            {primaryAction.icon && <ModIcon name={primaryAction.icon} className="h-4 w-4" />}
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   SELECTOR VISUAL DE SELLOS VIP (0 a 5 sellos)
   ========================================================================== */
export function VipStampsControl({
  value,
  onChange,
}: {
  value: number
  onChange?: (next: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = n <= value
        return (
          <button
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange && onChange(value === n ? n - 1 : n)}
            className={`grid size-8 place-items-center rounded-full border text-xs font-bold transition ${
              filled
                ? 'bg-[var(--acc)] text-[var(--acc-contrast)] border-[var(--acc)]'
                : 'bg-[var(--panel-2)] a-muted border-[var(--line)]'
            }`}
            title={`Sello ${n} de 5`}
          >
            {n === 5 ? '★' : n}
          </button>
        )
      })}
      <span className="ml-1.5 text-xs font-semibold a-txt-2">{value}/5</span>
    </div>
  )
}

/* Compatibilidad con componentes previos */
export function ConfirmBtn({
  label,
  confirm = '¿Confirmar?',
  className = '',
  onConfirm,
}: {
  label: ReactNode
  confirm?: string
  className?: string
  onConfirm: () => void | Promise<void>
}) {
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    if (!ask) return
    const t = setTimeout(() => setAsk(false), 2500)
    return () => clearTimeout(t)
  }, [ask])
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (!ask) { setAsk(true); return }
        setAsk(false)
        void onConfirm()
      }}
    >
      {ask ? confirm : label}
    </button>
  )
}

export function TabPage({
  title,
  right,
  children,
}: {
  title: string
  sub?: string
  icon?: IconName
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="a-fade">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight a-txt">{title}</h1>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * BUS DE SINCRONIZACIÓN EN TIEMPO REAL (Cross-tab y Cross-device)
 * Sincroniza al instante (0ms) citas, pedidos y cobros entre la web y el admin
 */
export function playLuxuryChime() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.7)
  } catch {}
}

export const syncBus = {
  emit(event: string, payload?: unknown) {
    if (typeof window === 'undefined') return
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('cbs_realtime_sync')
        bc.postMessage({ event, payload, timestamp: Date.now() })
        bc.close()
      }
      localStorage.setItem('cbs_last_sync_event', JSON.stringify({ event, payload, timestamp: Date.now() }))
    } catch {}
  },
  subscribe(callback: (event: string, payload?: unknown) => void) {
    if (typeof window === 'undefined') return () => {}
    let bc: BroadcastChannel | null = null
    const handleBc = (e: MessageEvent) => {
      if (e.data && e.data.event) {
        callback(e.data.event, e.data.payload)
      }
    }
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel('cbs_realtime_sync')
      bc.addEventListener('message', handleBc)
    }
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'cbs_last_sync_event' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          callback(parsed.event, parsed.payload)
        } catch {}
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      bc?.removeEventListener('message', handleBc)
      bc?.close()
      window.removeEventListener('storage', handleStorage)
    }
  }
}

export function formatHora12(hora?: string | null): string {
  if (!hora) return '—'
  const raw = String(hora).trim()
  if (/\b(am|pm)\b/i.test(raw)) return raw
  const m = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return raw
  const h24 = Number(m[1])
  const mins = m[2]
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mins} ${period}`
}

/* ==========================================================================
   RECORDATORIOS Y MENSAJES RÁPIDOS POR WHATSAPP (1 Clic)
   ========================================================================== */
export function generarWhatsAppRecordatorio(
  cita: Cita,
  tipo: 'recordatorio' | 'confirmacion' | 'agradecimiento' = 'recordatorio'
): string {
  const cel = cita.celular.replace(/\D/g, '')
  const hora12 = formatHora12(cita.hora)
  const fecha = fechaLarga(cita.fecha)
  const barbero = cita.barbero.split(' ')[0]
  const servicio = cita.servicioNombre ?? cita.servicio

  let texto = ''
  if (tipo === 'confirmacion') {
    texto = `💈 *CHINO BARBER SHOP — CITA CONFIRMADA* 💈\n\nHola *${cita.nombre}*, confirmamos tu cita con éxito:\n\n📅 *Fecha:* ${fecha}\n⏰ *Hora:* ${hora12}\n✂️ *Servicio:* ${servicio}\n👤 *Barbero:* ${barbero}\n\n📍 Te esperamos en nuestro local. Recuerda llegar 5 minutos antes. ¡Gracias por tu preferencia!`
  } else if (tipo === 'agradecimiento') {
    texto = `💈 *CHINO BARBER SHOP — ¡GRACIAS POR TU VISITA!* 💈\n\nHola *${cita.nombre}*, fue un gusto atenderte hoy con *${barbero}*.\n\n⭐ Te invitamos a calificar tu experiencia aquí: https://chinobarber.vercel.app\n\n¡Suma sellos VIP y obtén tu 6to corte gratis! ¡Hasta la próxima!`
  } else {
    texto = `💈 *RECORDATORIO DE CITA — CHINO BARBER SHOP* 💈\n\nHola *${cita.nombre}*, te recordamos tu cita de barbería:\n\n📅 *Fecha:* ${fecha}\n⏰ *Hora:* ${hora12}\n✂️ *Servicio:* ${servicio}\n👤 *Barbero:* ${barbero}\n\n📍 Te esperamos puntualmente. Si necesitas reprogramar, avísanos con anticipación por este medio. ¡Nos vemos!`
  }

  return `https://wa.me/51${cel}?text=${encodeURIComponent(texto)}`
}

export function abrirWhatsAppRecordatorio(
  cita: Cita,
  tipo: 'recordatorio' | 'confirmacion' | 'agradecimiento' = 'recordatorio'
) {
  window.open(generarWhatsAppRecordatorio(cita, tipo), '_blank', 'noopener')
}

/* ==========================================================================
   EXPORTACIÓN DE REPORTES A EXCEL / CSV CON BOM UTF-8
   ========================================================================== */
export function descargarCSV(nombreArchivo: string, columnas: string[], filas: (string | number)[][]) {
  const contenido = [
    columnas.join(';'),
    ...filas.map(f => f.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\r\n')

  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ==========================================================================
   MODAL DE IMPRESIÓN DE TICKET TÉRMICO (80mm / 58mm)
   ========================================================================== */
export function TicketTermicoModal({
  open,
  onClose,
  cita,
}: {
  open: boolean
  onClose: () => void
  cita: Cita | null
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open || !cita) return null

  const ex = parseCitaExtras(cita)
  const ticketNum = cita.id.replace(/\D/g, '').slice(-5) || '00142'
  const igv = ex.grandTotal * 0.18 / 1.18
  const subtotal = ex.grandTotal - igv

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto cursor-pointer"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white text-slate-900 shadow-2xl p-6 cursor-default border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-200 no-print">
          <div className="flex items-center gap-2">
            <ModIcon name="Printer" className="h-4 w-4 text-slate-700" />
            <h3 className="font-bold text-sm text-slate-900">Ticket Térmico (80mm)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="Cerrar modal de impresión"
          >
            <ModIcon name="X" className="h-4 w-4" />
          </button>
        </div>

        {/* CONTENEDOR FÍSICO DEL TICKET (80mm) */}
        <div className="a-ticket-print-wrapper rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 font-mono text-xs text-slate-800 space-y-2">
          <div className="text-center space-y-0.5">
            <p className="font-extrabold text-sm tracking-wider uppercase text-slate-900">CHINO BARBERSHOP</p>
            <p className="text-[11px] text-slate-600">Tu mejor corte, sin esperas</p>
            <p className="text-[10px] text-slate-500">22845, Nueva Cajamarca 22846</p>
            <p className="text-[10px] text-slate-500">WhatsApp: +51 928 192 437</p>
          </div>

          <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-[11px] space-y-1">
            <div className="flex justify-between font-bold">
              <span>COMPROBANTE:</span>
              <span>#TK-{ticketNum}</span>
            </div>
            <div className="flex justify-between">
              <span>Fecha / Hora:</span>
              <span>{fechaLarga(cita.fecha)} {formatHora12(cita.hora)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cliente:</span>
              <span className="font-bold text-right truncate max-w-[170px]">{cita.nombre}</span>
            </div>
            <div className="flex justify-between">
              <span>Teléfono:</span>
              <span>{cita.celular}</span>
            </div>
            <div className="flex justify-between">
              <span>Barbero:</span>
              <span className="font-semibold">{cita.barbero}</span>
            </div>
          </div>

          {/* DESGLOSE DE ÍTEMS */}
          <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-[11px]">
            <div className="flex justify-between font-bold pb-1 border-b border-slate-300">
              <span>DESCRIPCIÓN</span>
              <span>TOTAL</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="truncate pr-2">{cita.servicioNombre ?? cita.servicio}</span>
              <span className="font-bold font-mono">S/ {ex.serviceTotal.toFixed(2)}</span>
            </div>
            {ex.productsText && (
              <div className="flex justify-between py-1 text-slate-600">
                <span className="truncate pr-2">+ {ex.productsText}</span>
                <span className="font-bold font-mono">S/ {ex.productsTotal.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* TOTALES */}
          <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-[11px] space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Op. Gravada:</span>
              <span>S/ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>I.G.V. (18%):</span>
              <span>S/ {igv.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-sm text-slate-900 border-t border-slate-300 pt-1">
              <span>TOTAL A PAGAR:</span>
              <span className="font-mono">S/ {ex.grandTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 pt-1">
              <span>Medio de Pago:</span>
              <span className="font-semibold uppercase">{formatPaymentInfo(cita.metodo_pago, cita.ref_pago)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-600">
              <span>Estado:</span>
              <span className="font-bold uppercase text-emerald-700">{cita.estado}</span>
            </div>
          </div>

          {/* PROGRAMA VIP */}
          <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-center text-[10px] space-y-0.5 text-slate-600">
            <p className="font-bold text-slate-900">PROGRAMA DE FIDELIZACIÓN VIP</p>
            <p>¡Gracias por acumular sellos VIP!</p>
            <p>5 sellos = 1 corte clásico GRATIS.</p>
          </div>

          <div className="border-t border-dashed border-slate-400 pt-2 text-center text-[10px] text-slate-500">
            <p>¡Gracias por tu preferencia!</p>
            <p className="font-semibold text-slate-700">chinobarbershop.pe</p>
          </div>
        </div>

        {/* ACCIONES */}
        <div className="mt-4 flex gap-2 no-print">
          <button
            type="button"
            onClick={() => printTicketCita(cita)}
            className={`${T.btnPrimary} flex-1`}
          >
            <ModIcon name="Printer" className="h-4 w-4" />
            <span>Imprimir Ticket</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   MOTOR DE IMPRESIÓN DEDICADO (IFRAME OCULTO — 80mm TÉRMICO Y A4 EJECUTIVO)
   Garantiza impresión nítida en blanco y negro sin depender de modales ni tema
   ========================================================================== */
function escapePrintHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function printDocumentHtml(title: string, bodyHtml: string, paper: '80mm' | 'a4' = '80mm') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const isThermal = paper === '80mm'
  const styles = isThermal
    ? `
      @page { size: 80mm auto; margin: 3mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 74mm;
        margin: 0 auto;
        font-family: 'Courier New', Courier, monospace;
        font-size: 11.5px;
        line-height: 1.38;
        color: #000;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .center { text-align: center; }
      .brand { font-size: 15px; font-weight: 800; letter-spacing: 0.06em; }
      .sub { font-size: 10.5px; color: #222; }
      .hr { border-top: 1px dashed #111; margin: 8px 0; }
      .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
      .row b { text-align: right; }
      .items-head { display: flex; justify-content: space-between; font-weight: 800; border-bottom: 1px solid #111; padding-bottom: 3px; margin-bottom: 4px; font-size: 10.5px; }
      .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; border-top: 1.5px solid #000; padding-top: 5px; margin-top: 4px; }
      .vip-box { text-align: center; font-size: 10px; margin-top: 6px; }
    `
    : `
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.45;
        color: #111;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
      .brand { font-size: 18px; font-weight: 800; letter-spacing: 0.03em; }
      .meta { font-size: 11px; color: #444; margin-top: 2px; }
      .meta-right { text-align: right; font-size: 11px; color: #333; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
      .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
      .kpi-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #475569; }
      .kpi-val { font-size: 16px; font-weight: 800; margin-top: 2px; font-family: ui-monospace, Menlo, monospace; }
      .kpi-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
      .sec-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin: 14px 0 6px; color: #111; }
      .methods { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
      .method { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; }
      .method span { font-size: 10.5px; color: #475569; display: block; }
      .method b { font-size: 13.5px; font-family: ui-monospace, Menlo, monospace; }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11.5px; }
      th { text-align: left; background: #f1f5f9; color: #1e293b; font-weight: 700; text-transform: uppercase; font-size: 10px; padding: 7px 8px; border-bottom: 1.5px solid #94a3b8; }
      td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
      .num { text-align: right; font-family: ui-monospace, Menlo, monospace; }
      tfoot td { font-weight: 800; background: #f8fafc; border-top: 1.5px solid #334155; }
      .footer-note { margin-top: 24px; padding-top: 10px; border-top: 1px dashed #94a3b8; display: flex; justify-content: space-between; font-size: 10.5px; color: #475569; }
    `

  const fullDoc = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapePrintHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>${bodyHtml}</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)

  const cleanup = () => {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    } catch {}
  }

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    cleanup()
    window.print()
    return
  }

  doc.open()
  doc.write(fullDoc)
  doc.close()

  let printed = false
  const triggerPrint = () => {
    if (printed) return
    printed = true
    try {
      win.focus()
      win.print()
    } catch {
      window.print()
    }
    win.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(cleanup, 60000)
  }

  setTimeout(triggerPrint, 140)
}

export function printTicketCita(cita: Cita) {
  const ex = parseCitaExtras(cita)
  const ticketNum = cita.id.replace(/\D/g, '').slice(-5) || '00142'
  const igv = (ex.grandTotal * 0.18) / 1.18
  const subtotal = ex.grandTotal - igv

  const body = `
    <div class="center">
      <div class="brand">CHINO BARBERSHOP</div>
      <div class="sub">Tu mejor corte, sin esperas</div>
      <div class="sub">22845, Nueva Cajamarca 22846</div>
      <div class="sub">WhatsApp: +51 928 192 437</div>
    </div>
    <div class="hr"></div>
    <div class="row"><span>COMPROBANTE:</span><b>#TK-${escapePrintHtml(ticketNum)}</b></div>
    <div class="row"><span>Fecha / Hora:</span><span>${escapePrintHtml(fechaLarga(cita.fecha))} ${escapePrintHtml(formatHora12(cita.hora))}</span></div>
    <div class="row"><span>Cliente:</span><b>${escapePrintHtml(cita.nombre)}</b></div>
    <div class="row"><span>Teléfono:</span><span>${escapePrintHtml(cita.celular)}</span></div>
    <div class="row"><span>Barbero:</span><b>${escapePrintHtml(cita.barbero)}</b></div>
    <div class="hr"></div>
    <div class="items-head"><span>DESCRIPCIÓN</span><span>TOTAL</span></div>
    <div class="row"><span>${escapePrintHtml(cita.servicioNombre ?? cita.servicio)}</span><b>${escapePrintHtml(money(ex.serviceTotal))}</b></div>
    ${ex.productsText ? `<div class="row"><span>+ ${escapePrintHtml(ex.productsText)}</span><b>${escapePrintHtml(money(ex.productsTotal))}</b></div>` : ''}
    <div class="hr"></div>
    <div class="row"><span>Op. Gravada:</span><span>${escapePrintHtml(money(subtotal))}</span></div>
    <div class="row"><span>I.G.V. (18%):</span><span>${escapePrintHtml(money(igv))}</span></div>
    <div class="total-row"><span>TOTAL A PAGAR</span><span>${escapePrintHtml(money(ex.grandTotal))}</span></div>
    <div class="row" style="margin-top:4px;"><span>Medio de pago:</span><b>${escapePrintHtml(formatPaymentInfo(cita.metodo_pago, cita.ref_pago))}</b></div>
    <div class="row"><span>Estado:</span><b>${escapePrintHtml(String(cita.estado).toUpperCase())}</b></div>
    <div class="hr"></div>
    <div class="vip-box">
      <b>PROGRAMA DE FIDELIZACIÓN VIP</b><br/>
      5 sellos = 1 corte clásico GRATIS.<br/>
      ¡Gracias por tu preferencia!
    </div>
  `
  printDocumentHtml(`Ticket #TK-${ticketNum} — Chino Barbershop`, body, '80mm')
}

export function printComprobantePedido(pedido: Pedido) {
  let items: Array<{ name: string; qty: number; price: number }> = []
  try {
    const parsed = JSON.parse(pedido.items_json || '[]')
    if (Array.isArray(parsed)) items = parsed
  } catch {}

  const fechaEmision = utcToFechaLimaClient(pedido.created_at) || getFechaHoy()
  const itemsHtml = items
    .map(
      it =>
        `<div class="row"><span>${Number(it.qty) || 1}x ${escapePrintHtml(it.name)}</span><b>${escapePrintHtml(
          money((Number(it.price) || 0) * (Number(it.qty) || 1))
        )}</b></div>`
    )
    .join('')

  const body = `
    <div class="center">
      <div class="brand">CHINO BARBERSHOP</div>
      <div class="sub">TIENDA OFICIAL · R.U.C. 10458923011</div>
      <div class="sub">22845, Nueva Cajamarca 22846</div>
      <div class="sub">WhatsApp: +51 928 192 437</div>
    </div>
    <div class="hr"></div>
    <div class="row"><span>ORDEN:</span><b>${escapePrintHtml(pedido.id)}</b></div>
    <div class="row"><span>Fecha:</span><span>${escapePrintHtml(fechaLarga(fechaEmision))}</span></div>
    <div class="row"><span>Cliente:</span><b>${escapePrintHtml(pedido.cliente)}</b></div>
    <div class="row"><span>Teléfono:</span><span>${escapePrintHtml(pedido.telefono)}</span></div>
    <div class="row"><span>Entrega:</span><b>${pedido.entrega === 'delivery' ? 'Delivery Local' : 'Recojo en Local'}</b></div>
    ${pedido.direccion ? `<div class="row"><span>Dirección:</span><span>${escapePrintHtml(pedido.direccion)}</span></div>` : ''}
    <div class="hr"></div>
    <div class="items-head"><span>PRODUCTOS</span><span>SUBTOTAL</span></div>
    ${itemsHtml || '<div class="row"><span>Detalle de tienda</span><b>—</b></div>'}
    <div class="hr"></div>
    <div class="row"><span>Subtotal:</span><span>${escapePrintHtml(money(pedido.subtotal || pedido.total))}</span></div>
    <div class="row"><span>Envío:</span><span>${Number(pedido.envio) > 0 ? escapePrintHtml(money(pedido.envio)) : 'GRATIS'}</span></div>
    <div class="total-row"><span>TOTAL</span><span>${escapePrintHtml(money(pedido.total))}</span></div>
    <div class="row" style="margin-top:4px;"><span>Medio de pago:</span><b>${escapePrintHtml(formatPaymentInfo(pedido.metodo_pago, pedido.ref_pago))}</b></div>
    <div class="row"><span>Estado:</span><b>${escapePrintHtml(String(pedido.estado).toUpperCase())}</b></div>
    <div class="hr"></div>
    <div class="vip-box">Comprobante de entrega · ¡Gracias por tu compra!</div>
  `
  printDocumentHtml(`Pedido ${pedido.id} — Chino Barbershop`, body, '80mm')
}

export function printReporteCaja(params: {
  subTab: 'liquidacion' | 'pagos'
  periodoLabel: string
  resumen: {
    ingresosServicios: number
    ingresosTienda: number
    pedidosPagados: number
    totalRecaudado: number
    totalComisiones: number
    gananciaBarberia: number
    porMetodoPago: { efectivo: number; yape: number; plin: number; tarjeta: number }
  }
  barberos: Array<{
    barberoNombre: string
    comisionPct: number
    atendidas: number
    totalCobrado: number
    pagoBarbero: number
    gananciaLocal: number
  }>
  pagos: Array<{
    rawId: string
    fecha: string
    cliente: string
    concepto: string
    metodo: string
    refPago: string
    monto: number
    estado: string
  }>
}) {
  const ahora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })
  const { subTab, periodoLabel, resumen, barberos, pagos } = params

  if (subTab === 'liquidacion') {
    const totalCortes = barberos.reduce((a, b) => a + b.atendidas, 0)
    const totalServ = barberos.reduce((a, b) => a + b.totalCobrado, 0)
    const totalCom = barberos.reduce((a, b) => a + b.pagoBarbero, 0)
    const totalNetoServ = barberos.reduce((a, b) => a + b.gananciaLocal, 0)

    const rowsHtml = barberos
      .map(
        b => `
        <tr>
          <td><b>${escapePrintHtml(b.barberoNombre)}</b></td>
          <td class="num">${b.atendidas}</td>
          <td class="num">${b.comisionPct}%</td>
          <td class="num">${escapePrintHtml(money(b.totalCobrado))}</td>
          <td class="num"><b>${escapePrintHtml(money(b.pagoBarbero))}</b></td>
          <td class="num">${escapePrintHtml(money(b.gananciaLocal))}</td>
        </tr>`
      )
      .join('')

    const body = `
      <div class="header">
        <div>
          <div class="brand">CHINO BARBERSHOP</div>
          <div class="meta">Cierre de Caja y Liquidación de Comisiones · Nueva Cajamarca</div>
        </div>
        <div class="meta-right">
          <div><b>Período:</b> ${escapePrintHtml(periodoLabel)}</div>
          <div><b>Emitido:</b> ${escapePrintHtml(ahora)}</div>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi">
          <div class="kpi-lbl">Total Caja</div>
          <div class="kpi-val">${escapePrintHtml(money(resumen.totalRecaudado))}</div>
          <div class="kpi-sub">Serv. ${escapePrintHtml(money(resumen.ingresosServicios))} + Tnd. ${escapePrintHtml(money(resumen.ingresosTienda))}</div>
        </div>
        <div class="kpi">
          <div class="kpi-lbl">Comisiones Equipo</div>
          <div class="kpi-val">${escapePrintHtml(money(resumen.totalComisiones))}</div>
          <div class="kpi-sub">${totalCortes} cortes atendidos</div>
        </div>
        <div class="kpi">
          <div class="kpi-lbl">Margen Neto Local</div>
          <div class="kpi-val">${escapePrintHtml(money(resumen.gananciaBarberia))}</div>
          <div class="kpi-sub">Servicios netos + Tienda</div>
        </div>
        <div class="kpi">
          <div class="kpi-lbl">Ventas Tienda</div>
          <div class="kpi-val">${escapePrintHtml(money(resumen.ingresosTienda))}</div>
          <div class="kpi-sub">${resumen.pedidosPagados} pedidos cobrados</div>
        </div>
      </div>

      <div class="sec-title">Arqueo por Método de Pago</div>
      <div class="methods">
        <div class="method"><span>Efectivo</span><b>${escapePrintHtml(money(resumen.porMetodoPago.efectivo))}</b></div>
        <div class="method"><span>Yape</span><b>${escapePrintHtml(money(resumen.porMetodoPago.yape))}</b></div>
        <div class="method"><span>Plin</span><b>${escapePrintHtml(money(resumen.porMetodoPago.plin))}</b></div>
        <div class="method"><span>Tarjeta</span><b>${escapePrintHtml(money(resumen.porMetodoPago.tarjeta))}</b></div>
      </div>

      <div class="sec-title">Liquidación por Barbero</div>
      <table>
        <thead>
          <tr>
            <th>Barbero</th>
            <th class="num">Cortes</th>
            <th class="num">% Com.</th>
            <th class="num">Facturado</th>
            <th class="num">Pago Barbero</th>
            <th class="num">Neto Local</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="6" style="text-align:center;color:#64748b;">Sin movimientos en el período</td></tr>'}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTAL SERVICIOS</td>
            <td class="num">${totalCortes}</td>
            <td class="num">—</td>
            <td class="num">${escapePrintHtml(money(totalServ))}</td>
            <td class="num">${escapePrintHtml(money(totalCom))}</td>
            <td class="num">${escapePrintHtml(money(totalNetoServ))}</td>
          </tr>
        </tfoot>
      </table>

      <div class="footer-note">
        <span>Chino Barbershop · Gestión del Estudio</span>
        <span>Firma de conformidad: ___________________________</span>
      </div>
    `
    printDocumentHtml(`Cierre de Caja (${periodoLabel}) — Chino Barbershop`, body, 'a4')
    return
  }

  const totalPagos = pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0)
  const rowsPagos = pagos
    .map(
      p => `
      <tr>
        <td>${escapePrintHtml(p.fecha.slice(0, 10))}</td>
        <td><b>${escapePrintHtml(p.cliente)}</b><br/><span style="font-size:10px;color:#64748b;">${escapePrintHtml(p.concepto)}</span></td>
        <td>${escapePrintHtml(formatPaymentInfo(p.metodo, p.refPago))}</td>
        <td>${escapePrintHtml(String(p.estado).toUpperCase())}</td>
        <td class="num"><b>${escapePrintHtml(money(p.monto))}</b></td>
      </tr>`
    )
    .join('')

  const body = `
    <div class="header">
      <div>
        <div class="brand">CHINO BARBERSHOP</div>
        <div class="meta">Auditoría de Pagos y Movimientos de Caja</div>
      </div>
      <div class="meta-right">
        <div><b>Registros:</b> ${pagos.length}</div>
        <div><b>Emitido:</b> ${escapePrintHtml(ahora)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Cliente / Concepto</th>
          <th>Método / Op.</th>
          <th>Estado</th>
          <th class="num">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${rowsPagos || '<tr><td colspan="5" style="text-align:center;color:#64748b;">Sin movimientos para los filtros seleccionados</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">TOTAL LISTADO</td>
          <td class="num">${escapePrintHtml(money(totalPagos))}</td>
        </tr>
      </tfoot>
    </table>
  `
  printDocumentHtml('Auditoría de Pagos — Chino Barbershop', body, 'a4')
}

export function utcToFechaLimaClient(iso?: string | null): string {
  const ts = String(iso ?? '').trim()
  if (!ts) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const normalized = ts.includes('T')
    ? (/(Z|[+-]\d{2}:\d{2})$/i.test(ts) ? ts : `${ts}Z`)
    : `${ts.replace(' ', 'T')}Z`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return ts.slice(0, 10)
  }
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl space-y-4 a-fade"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="grid size-9 shrink-0 place-items-center rounded-xl border"
            style={{
              background: danger ? 'var(--danger-bg)' : 'var(--gold-soft)',
              borderColor: danger ? 'var(--danger-line)' : 'var(--gold-line)',
              color: danger ? 'var(--danger)' : 'var(--gold)',
            }}
          >
            <ModIcon name={danger ? 'AlertTriangle' : 'AlertCircle'} className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold a-txt">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed a-muted">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className={T.btnGhost}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className={danger ? T.btnDanger : T.btnPrimary}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
