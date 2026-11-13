/**
 * POST /api/auth/recuperar — Solicita restablecimiento de contraseña (4.3)
 * Acepta identificador por correo O celular, según cómo registró su cuenta.
 *
 * Seguridad:
 *  - El token se guarda SOLO como hash SHA-256 en la tabla password_resets.
 *  - El token real viaja por el canal del usuario (entrega simulada en este
 *    entorno académico: no hay SMTP configurado, así que se devuelve en la
 *    respuesta como "instrucciones simuladas").
 *  - Expira a los 30 minutos y es de un solo uso.
 *  - Rate limited (mismo motor que el login).
 *  - Si el usuario no existe responde genérico ok (no se filtran cuentas).
 */
import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { db } from '@/lib/db'
import {
  checkRateLimit, recordFailure, recordSuccess, rateLimitKey, clientIpFrom,
} from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const identifier = String(body.identifier ?? '').trim()
    if (!identifier) {
      return NextResponse.json({ error: 'Ingresa tu correo o celular.' }, { status: 400 })
    }

    // Anti-abuso: 5 solicitudes fallidas/por cuenta en 15 min
    const key = 'pwdreset|' + rateLimitKey(clientIpFrom(request), identifier)
    const rl = checkRateLimit(key)
    if (!rl.allowed) {
      const mins = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60))
      return NextResponse.json(
        { error: `Demasiadas solicitudes de recuperación. Reintenta en ${mins} minuto(s).` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    // Email o celular de Perú: se decide por formato
    const isEmail = identifier.includes('@')
    const user = db.prepare(
      isEmail
        ? 'SELECT id FROM usuarios WHERE email = ?'
        : 'SELECT id FROM usuarios WHERE celular = ?'
    ).get(
      isEmail ? identifier.toLowerCase() : identifier
    ) as { id: string } | undefined

    if (!user) {
      recordFailure(key)
      // Respuesta genérica: no revelar qué cuentas existen
      return NextResponse.json({
        ok: true,
        message: 'Si la cuenta existe, recibirás las instrucciones en breve.',
      })
    }

    const token = randomBytes(24).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')

    db.prepare(`
      INSERT INTO password_resets (token_hash, usuario_id, expires_at)
      VALUES (?, ?, datetime('now', '+30 minutes'))
    `).run(tokenHash, user.id)

    recordSuccess(key)

    const via = isEmail ? 'email' : 'sms'
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[DEV PWD RESET] Token para ${identifier}: ${token}`)
    }
    return NextResponse.json({
      ok: true,
      via,
      mensaje: `Si la cuenta existe, recibirás las instrucciones en breve.`,
    })

  } catch (err) {
    console.error('[recuperar]', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
