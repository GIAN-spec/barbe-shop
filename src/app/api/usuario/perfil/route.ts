/**
 * GET  /api/usuario/perfil  — Datos del usuario autenticado
 * PATCH /api/usuario/perfil — Actualiza nombre, celular, contraseña
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, hashPassword, verifyPassword } from '@/lib/auth'

export async function GET() {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const user = await db.get<{
    id: string; nombre: string; email: string; celular: string
    avatar: string | null; created_at: string
  }>(`
    SELECT id, nombre, email, celular, avatar, created_at FROM usuarios WHERE id = ?
  `, session.userId)

  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
  }

  return NextResponse.json({ user })
}

export async function PATCH(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const body = await request.json()
  const { nombre, celular, currentPassword, newPassword } = body

  const user = await db.get<{ id: string; password_hash: string }>(`
    SELECT id, password_hash FROM usuarios WHERE id = ?
  `, session.userId)

  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })
  }

  const updates: string[] = []
  const values: unknown[] = []

  if (nombre && nombre.trim().length >= 2) {
    updates.push('nombre = ?')
    values.push(nombre.trim())
  }
  if (celular && /^9\d{8}$/.test(celular)) {
    updates.push('celular = ?')
    values.push(celular)
  }

  // Cambio de contraseña
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Debes ingresar tu contraseña actual.' }, { status: 400 })
    }
    const ok = await verifyPassword(currentPassword, user.password_hash)
    if (!ok) {
      return NextResponse.json({ error: 'La contraseña actual es incorrecta.' }, { status: 400 })
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' }, { status: 400 })
    }
    updates.push('password_hash = ?')
    values.push(await hashPassword(newPassword))
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  values.push(user.id)
  await db.run(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`, ...values)

  const updated = await db.get(`
    SELECT id, nombre, email, celular, avatar FROM usuarios WHERE id = ?
  `, user.id)

  return NextResponse.json({ ok: true, user: updated })
}
