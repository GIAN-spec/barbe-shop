/**
 * POST /api/auth/login
 * Verifica credenciales con rate limiting (máx. 5 intentos fallidos / 15 min),
 * emite JWT en cookie HttpOnly con expiración por inactividad (30 min).
 *
 * GET /api/auth/login  (usado como /api/auth/me)
 * Devuelve el usuario de la sesión activa y renueva la ventana de actividad.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyPassword, signJWT, setSessionCookie, getSessionFromCookie,
} from '@/lib/auth'
import {
  checkRateLimit, recordFailure, recordSuccess, pruneRateLimit,
  clientIpFrom, rateLimitKey,
} from '@/lib/rate-limit'

// ─── GET: sesión actual (actividad → renueva token deslizante) ───────────────
export async function GET() {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 })
  }
  const user = await db.get<{ id: string; nombre: string; email: string; celular: string; avatar: string | null; rol: string }>(
    'SELECT id, nombre, email, celular, avatar, rol FROM usuarios WHERE id = ?',
    session.userId
  )

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 })
  }

  // Renovación deslizante: este request cuenta como actividad
  const token = await signJWT({ userId: user.id, nombre: user.nombre, email: user.email, rol: user.rol as 'cliente' | 'admin' })
  await setSessionCookie(token)

  return NextResponse.json({ user })
}

// ─── POST: login ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  pruneRateLimit()

  try {
    const body = await request.json()
    const { identifier, password } = body   // identifier = email o celular

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Correo/celular y contraseña son requeridos.' }, { status: 400 })
    }

    // ── Rate limiting: 5 intentos fallidos por IP+usuario en 15 min ──
    const key = rateLimitKey(clientIpFrom(request), identifier)
    const rl = checkRateLimit(key)
    if (!rl.allowed) {
      const mins = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60))
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Intenta en ${mins} minuto(s).` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    const user = await db.get<{
      id: string; nombre: string; email: string; celular: string
      avatar: string | null; password_hash: string; rol: string
    }>(`
      SELECT id, nombre, email, celular, avatar, password_hash, rol
      FROM usuarios
      WHERE email = ? OR celular = ?
    `, identifier.trim().toLowerCase(), identifier.trim())

    const ok = user ? await verifyPassword(password, user.password_hash) : false
    if (!ok || !user) {
      recordFailure(key)
      // Respuesta genérica: no revelar si el usuario existe
      return NextResponse.json(
        {
          error: rl.remaining <= 1
            ? 'Credenciales incorrectas. Te queda 1 intento antes del bloqueo temporal.'
            : `Credenciales incorrectas. Intentos restantes: ${rl.remaining - 1}.`,
        },
        { status: 401 }
      )
    }

    recordSuccess(key) // login correcto → resetea contador

    const token = await signJWT({ userId: user.id, nombre: user.nombre, email: user.email, rol: user.rol as 'cliente' | 'admin' })
    await setSessionCookie(token)

    const { password_hash: _ph, ...safeUser } = user
    return NextResponse.json({ ok: true, user: safeUser })

  } catch (err) {
    console.error('[login]', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
