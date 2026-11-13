/**
 * auth.ts — Utilidades de autenticación: hash de contraseñas y sesión.
 * Usa bcryptjs (puro JS, sin binarios nativos) y jose para JWT.
 * Sesión con expiración por inactividad (30 min) y renovación deslizante:
 * cada request autenticado re-emitirá el token (nuevo iat), de modo que
 * un usuario activo nunca es deslogueado, pero uno idle >30 min sí.
 */
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import {
  COOKIE_NAME,
  INACTIVITY_TTL_MINUTES,
  SESSION_TTL_HOURS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from './session-token'

export { COOKIE_NAME, INACTIVITY_TTL_MINUTES, SESSION_TTL_HOURS }
export type { SessionPayload }
export { signSessionToken as signJWT, verifySessionToken as verifyJWT }

// ─── Contraseñas ─────────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

/**
 * Guarda la cookie de sesión. maxAge = ventana de inactividad:
 * si el navegador no recibe renovación en 30 min, la cookie muere sola
 * (defensa extra aunque el JS del cliente se quede esperando).
 */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: INACTIVITY_TTL_MINUTES * 60,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

/** Lee la cookie y valida el token (sin renovar). Seguro para RSC. */
export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

/**
 * Renueva la sesión deslizante: re-firma el token con iat nuevo y
 * re-emite la cookie (Res-Set-Cookie). Solo válido en Route Handlers
 * / Server Actions (cookies().set() no funciona en RSC).
 */
export async function refreshSession(session: SessionPayload): Promise<string> {
  const token = await signSessionToken(session)
  await setSessionCookie(token)
  return token
}

/**
 * Helper para Route Handlers privados: devuelve la sesión si es válida
 * y de paso la renueva (actividad cuenta como uso). null si expirada.
 */
export async function requireSession(): Promise<SessionPayload | null> {
  const session = await getSessionFromCookie()
  if (!session) return null
  try {
    await refreshSession(session)
  } catch {
    // Si el contexto no permite setear cookies (p. ej. prefetch), la
    // sesión sigue siendo válida: solo no se renueva en este request.
  }
  return session
}

/**
 * Helper para Route Handlers de administración (BLOQUE 3):
 * valida sesión + rol admin. Devuelve null si no autorizado
 * y un objeto con el status HTTP recomendado en `denied`.
 */
export async function requireAdmin(): Promise<
  { session: SessionPayload; denied: null } | { session: null; denied: { status: number; message: string } }
> {
  const session = await requireSession()
  if (!session) {
    return { session: null, denied: { status: 401, message: 'Tu sesión expiró o no has iniciado sesión.' } }
  }
  if (session.rol !== 'admin') {
    return { session: null, denied: { status: 403, message: 'No tienes permisos de administrador.' } }
  }
  return { session, denied: null }
}
