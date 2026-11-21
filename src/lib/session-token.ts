/**
 * session-token.ts — Firmado y verificación de JWT con ventana de inactividad.
 * Módulo independiente (solo jose, sin better-sqlite3) para que pueda usarse
 * tanto en Route Handlers como en proxy.ts (protección de rutas).
 */
import { SignJWT, jwtVerify } from 'jose'

const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production' && process.env.TURSO_AUTH_TOKEN
    ? `cbs-prod-derived-${process.env.TURSO_AUTH_TOKEN.slice(0, 32)}`
    : 'chino-barber-shop-secret-local-dev-key-2026')

const JWT_SECRET = new TextEncoder().encode(rawSecret)

export const COOKIE_NAME = 'cbs_session'
/** Cap absoluto del token (tiempo máximo aunque el usuario esté activo) */
export const SESSION_TTL_HOURS = 12
/** Ventana de inactividad: si no hay requests en este periodo, la sesión muere */
export const INACTIVITY_TTL_MINUTES = 30

export interface SessionPayload {
  userId: string
  nombre: string
  email: string | null
  rol?: 'cliente' | 'admin'
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(JWT_SECRET)
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    const iat = Number(payload.iat ?? 0)
    const idleSeconds = Math.floor(Date.now() / 1000) - iat
    if (idleSeconds > INACTIVITY_TTL_MINUTES * 60) {
      return null
    }
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
