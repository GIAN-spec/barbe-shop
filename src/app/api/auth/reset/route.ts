/**
 * POST /api/auth/reset — Restablece la contraseña usando el token (4.3)
 * Valida: token existe + no usado + no expirado (30 min).
 * Al usar el token se marca done, invalidando réplicas del mismo envío.
 */
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 })
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 })
    }

    const tokenHash = createHash('sha256').update(String(token)).digest('hex')
    const rec = db.prepare(`
      SELECT token_hash, usuario_id, expires_at, used_at
      FROM password_resets
      WHERE token_hash = ?
    `).get(tokenHash) as {
      token_hash: string; usuario_id: string
      expires_at: string; used_at: string | null
    } | undefined

    if (!rec || rec.used_at) {
      return NextResponse.json({ error: 'El enlace no es válido o ya fue utilizado.' }, { status: 400 })
    }

    const exp = db.prepare(`
      SELECT (expires_at <= datetime('now')) AS v
      FROM password_resets WHERE token_hash = ?
    `).get(tokenHash) as { v: number }

    if (exp.v) {
      return NextResponse.json({ error: 'El enlace expiró (30 min). Solicita uno nuevo.' }, { status: 400 })
    }

    const hash = await hashPassword(String(password))

    // Transacción: actualiza la clave + marca todos los tokens pendientes
    // de este usuario como usados (no pueden reutilizarse otros links viejos).
    db.transaction(() => {
      db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hash, rec.usuario_id)
      db.prepare('UPDATE password_resets SET used_at = datetime(\'now\') WHERE usuario_id = ? AND used_at IS NULL').run(rec.usuario_id)
    })()

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[reset]', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
