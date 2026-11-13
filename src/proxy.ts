/**
 * proxy.ts (ex middleware en Next.js 16) — Protección de rutas privadas.
 * Verifica la cookie de sesión (JWT + ventana de inactividad de 30 min)
 * antes de que la request llegue a los handlers privados. Si no hay
 * sesión válida responde 401 directamente.
 *
 * Rutas protegidas:
 *  - /api/citas (GET/POST listado y creación con sesión)
 *  - /api/citas/[id] (PATCH cancelar/reagendar)
 *  - /api/usuario/perfil (GET/PATCH)
 *
 * Notas:
 *  - /api/citas/disponibilidad es público (calendario de reservas) → excluido.
 *  - La verificación es por token de sesión (módulo sin better-sqlite3).
 *  - Cada Route Handler revalida con requireSession(): el proxy es defensa
 *    en profundidad, no reemplaza la autorización.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME, verifySessionToken } from '@/lib/session-token'

export default async function proxy(request: NextRequest) {
  // Permitir creación de citas públicas (reserva rápida como invitado)
  if (request.nextUrl.pathname === '/api/citas' && request.method === 'POST') {
    return NextResponse.next()
  }

  // Permitir consulta de citas en modo invitado (por celular o por IDs guardados)
  if (request.nextUrl.pathname === '/api/citas' && request.method === 'GET' && (request.nextUrl.searchParams.has('celular') || request.nextUrl.searchParams.has('ids'))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  if (!session) {
    return NextResponse.json(
      { error: 'Tu sesión expiró o no has iniciado sesión. Inicia sesión nuevamente.' },
      { status: 401 }
    )
  }

  // BLOQUE 3.1: bajo /api/admin SOLO el dueño (rol admin)
  if (request.nextUrl.pathname.startsWith('/api/admin') && session.rol !== 'admin') {
    return NextResponse.json(
      { error: 'No tienes permisos de administrador.' },
      { status: 403 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/citas',
    //todas las citas por id, excepto /api/citas/disponibilidad (pública)
    '/api/citas/((?!disponibilidad)[^/]+)',
    '/api/usuario/perfil',
    '/api/admin/:path*',
  ],
}
