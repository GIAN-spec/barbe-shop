/**
 * POST /api/auth/register
 * Crea un nuevo usuario con contraseña hasheada y devuelve un JWT de sesión.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, signJWT, setSessionCookie } from '@/lib/auth'
import { randomUUID } from 'crypto'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nombre, email, celular, password } = body

    // Validaciones
    if (!nombre || nombre.trim().length < 2) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres.' }, { status: 400 })
    }
    if (!celular || !/^9\d{8}$/.test(celular)) {
      return NextResponse.json({ error: 'El celular debe tener 9 dígitos y empezar con 9.' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 })
    }

    const emailNorm = email?.trim().toLowerCase() || null

    // Verificar email duplicado
    if (emailNorm) {
      const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(emailNorm)
      if (existing) {
        return NextResponse.json({ error: 'Este correo ya está registrado.' }, { status: 409 })
      }
    }

    const passwordHash = await hashPassword(password)
    const id = 'usr_' + randomUUID().replace(/-/g, '').slice(0, 16)

    db.prepare(`
      INSERT INTO usuarios (id, nombre, email, celular, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, nombre.trim(), emailNorm, celular, passwordHash)

    const token = await signJWT({ userId: id, nombre: nombre.trim(), email: emailNorm })
    await setSessionCookie(token)

    return NextResponse.json({
      ok: true,
      user: { id, nombre: nombre.trim(), email: emailNorm, celular },
    }, { status: 201 })

  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
