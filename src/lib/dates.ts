/**
 * Utilidades para manejo seguro de fechas y zonas horarias en Chino Barber Shop.
 * La barbería opera en Lima, Perú (America/Lima, UTC-5).
 * Previene el desfasaje de fechas causado por Date.toISOString() en horas de la tarde/noche.
 */

export const TIMEZONE_BARBERIA = 'America/Lima'

/**
 * Devuelve la fecha actual (o con offset en días) en formato YYYY-MM-DD según la zona de la barbería.
 */
export function getFechaLima(offsetDays = 0, baseDate: Date = new Date()): string {
  try {
    const target = new Date(baseDate.getTime() + offsetDays * 864e5)
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE_BARBERIA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(target)
  } catch {
    const target = new Date(baseDate.getTime() + offsetDays * 864e5)
    const y = target.getFullYear()
    const m = String(target.getMonth() + 1).padStart(2, '0')
    const d = String(target.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

/**
 * Convierte un objeto Date local a YYYY-MM-DD sin alterar el día por conversión UTC.
 */
export function toLocalDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

/**
 * Devuelve la fecha de hoy en Lima (YYYY-MM-DD).
 */
export function getFechaHoy(): string {
  return getFechaLima(0)
}

/**
 * Verifica si una cadena YYYY-MM-DD corresponde a hoy en Lima.
 */
export function isTodayLima(fechaISO: string): boolean {
  return fechaISO === getFechaLima(0)
}

/**
 * Convierte un timestamp UTC guardado por SQLite datetime('now') ("YYYY-MM-DD HH:MM:SS" o ISO)
 * a la fecha YYYY-MM-DD en zona horaria America/Lima.
 */
export function utcSqliteToFechaLima(sqliteTimestamp?: string | null): string {
  const ts = String(sqliteTimestamp ?? '').trim()
  if (!ts) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const normalized = ts.includes('T')
    ? (/(Z|[+-]\d{2}:\d{2})$/i.test(ts) ? ts : `${ts}Z`)
    : `${ts.replace(' ', 'T')}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return ts.slice(0, 10)
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE_BARBERIA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed)
  } catch {
    return ts.slice(0, 10)
  }
}

/**
 * Formatea una fecha YYYY-MM-DD a texto legible en español (ej: "Viernes, 6 de Noviembre").
 */
export function formatFechaLarga(fechaISO: string): string {
  if (!fechaISO) return ''
  const parts = fechaISO.split('-').map(Number)
  if (parts.length !== 3) return fechaISO
  const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
  return d.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
