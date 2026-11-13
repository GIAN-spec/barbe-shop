/**
 * rate-limit.ts — Rate limiting básico en memoria para el login.
 * Máx. 5 intentos fallidos por identidad (IP + usuario) en una ventana de
 * 15 minutos. Suficiente para el alcance del proyecto; si crece a multi-
 * instancia, se migra a Redis o a la tabla `sesiones`/`login_intentos`.
 */

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

interface AttemptRecord {
  count: number
  windowStart: number
  lockedUntil?: number
}

// Sobrevive al hot-reload de Next.js en dev
const globalForRate = globalThis as unknown as {
  __cbsRateLimit: Map<string, AttemptRecord> | undefined
}

const attempts: Map<string, AttemptRecord> =
  globalForRate.__cbsRateLimit ?? new Map()
globalForRate.__cbsRateLimit = attempts

/** Extrae una IP aproximada para el key (detrás de proxy usa x-forwarded-for) */
export function clientIpFrom(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export function rateLimitKey(ip: string, identifier: string): string {
  return `${ip}|${identifier.trim().toLowerCase()}`
}

export interface RateLimitResult {
  allowed: boolean
  /** Segundos que faltan para poder reintentar (solo si !allowed) */
  retryAfterSeconds: number
  remaining: number
}

/** Consulta si se permite intentar login con esta clave (no muta estado) */
export function checkRateLimit(key: string): RateLimitResult {
  const rec = attempts.get(key)
  const now = Date.now()

  if (!rec) {
    return { allowed: true, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS }
  }

  // Bloqueo activo
  if (rec.lockedUntil && rec.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((rec.lockedUntil - now) / 1000),
      remaining: 0,
    }
  }

  // Ventana expirada → se recicla
  if (now - rec.windowStart > WINDOW_MS) {
    attempts.delete(key)
    return { allowed: true, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS }
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - rec.count)
  if (remaining === 0) {
    // 5 fallos sin lock explícito: desbloqueo al terminar la ventana
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((rec.windowStart + WINDOW_MS - now) / 1000)),
      remaining: 0,
    }
  }
  return { allowed: true, retryAfterSeconds: 0, remaining }
}

/** Registra un intento fallido. Al 5to, bloquea por el resto de la ventana. */
export function recordFailure(key: string) {
  const now = Date.now()
  const rec = attempts.get(key)

  if (!rec || now - rec.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now })
    return
  }

  rec.count++
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + WINDOW_MS
  }
}

/** Éxito → limpia el historial de la clave. */
export function recordSuccess(key: string) {
  attempts.delete(key)
}

/** Limpieza defensiva anti-fuga de memoria (llamar en cada login) */
export function pruneRateLimit() {
  const now = Date.now()
  for (const [k, rec] of attempts) {
    if (now - rec.windowStart > WINDOW_MS && (!rec.lockedUntil || rec.lockedUntil < now)) {
      attempts.delete(k)
    }
  }
}
