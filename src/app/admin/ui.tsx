'use client'

/**
 * Primitivas UI del Panel Admin SaaS — Chino Barber
 * Incluye: Drawer lateral, Menú ⋯, Badges sobrios, Acordeón colapsable,
 * Tooltips (sin textos explicativos permanentes) y Estados vacíos limpios.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        onClick={e => e.stopPropagation()}
        className="a-drawer-panel flex h-dvh max-h-dvh w-full max-w-md flex-col border-l shadow-2xl"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <header className="flex items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: 'var(--line)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-bold a-txt truncate">{title}</h3>
            {sub && <p className="text-xs a-muted mt-0.5">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg border a-txt-2 hover:bg-[var(--hover)]"
            style={{ borderColor: 'var(--line)' }}
            aria-label="Cerrar panel"
          >
            <ModIcon name="X" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {children}
        </div>

        {footer && (
          <footer className="border-t px-6 py-4" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
            {footer}
          </footer>
        )}
      </aside>
    </div>
  )
}

/* ==========================================================================
   MENÚ CONTEXTUAL DE FILA (⋯) PARA ACCIONES SECUNDARIAS
   ========================================================================== */
export function RowMenu({
  actions,
}: {
  actions: Array<{ label: string; onClick: () => void; danger?: boolean; disabled?: boolean }>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block text-left" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="grid size-8 place-items-center rounded-md border transition hover:bg-[var(--hover)]"
        style={{ borderColor: 'var(--line)', color: 'var(--txt-2)' }}
        aria-label="Más acciones"
      >
        <ModIcon name="MoreHorizontal" className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-1.5 w-44 origin-top-right rounded-lg border py-1 shadow-lg a-fade"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        >
          {actions.map((a, idx) => (
            <button
              key={idx}
              type="button"
              disabled={a.disabled}
              onClick={() => { setOpen(false); a.onClick() }}
              className={`flex w-full items-center px-3 py-2 text-left text-xs font-medium transition hover:bg-[var(--hover)] disabled:opacity-40 ${
                a.danger ? 'text-red-600' : 'a-txt'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
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
