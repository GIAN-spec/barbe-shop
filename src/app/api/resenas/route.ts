/**
 * GET  /api/resenas  — Lista las reseñas públicas (solo las NO ocultas) con promedio y conteo
 * POST /api/resenas  — Publica una nueva reseña de un cliente (validada en servidor)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const NO_CACHE = { 'Cache-Control': 'no-store, max-age=0' }

// Solo reseñas visibles: las marcadas como 'oculta' desde el admin NO salen en la web
const VISIBLE = `COALESCE(r.estado, 'aprobada') != 'oculta'`

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const barberoId = searchParams.get('barbero')

    const base = `
      SELECT r.id, r.cliente_nombre, r.barbero_id, r.servicio_id, r.calificacion,
             r.comentario, COALESCE(r.respuesta, '') AS respuesta, r.created_at,
             b.nombre AS barbero_nombre, s.nombre AS servicio_nombre
      FROM resenas r
      LEFT JOIN barberos b ON r.barbero_id = b.id
      LEFT JOIN servicios s ON r.servicio_id = s.id
      WHERE ${VISIBLE}
    `

    const resenas = barberoId && barberoId !== 'any'
      ? await db.all(`${base} AND r.barbero_id = ? ORDER BY r.created_at DESC LIMIT 50`, barberoId)
      : await db.all(`${base} ORDER BY r.created_at DESC LIMIT 50`)

    const stats = (await db.get<{ total: number; promedio: number }>(`
      SELECT COUNT(*) AS total, COALESCE(AVG(calificacion), 5.0) AS promedio
      FROM resenas r
      WHERE ${VISIBLE}
    `)) ?? { total: 0, promedio: 5.0 }

    return NextResponse.json(
      { resenas, total: stats.total, promedio: Number(Number(stats.promedio).toFixed(1)) },
      { headers: NO_CACHE }
    )
  } catch (err) {
    console.error('[resenas GET]', err)
    return NextResponse.json({ error: 'Error al consultar reseñas.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { clienteNombre, barberoId, servicioId, calificacion, comentario, citaId } = body ?? {}

    const nombre = String(clienteNombre ?? '').trim().slice(0, 60)
    const texto = String(comentario ?? '').trim().slice(0, 600)

    if (nombre.length < 2 || texto.length < 5 || !calificacion) {
      return NextResponse.json({ error: 'Nombre, comentario y calificación son requeridos.' }, { status: 400 })
    }

    const rating = Math.max(1, Math.min(5, Math.round(Number(calificacion) || 5)))
    const id = 'res_' + randomUUID().replace(/-/g, '').slice(0, 12)

    const session = await requireSession()
    const usuarioId = session?.userId ?? null

    // Anti-spam básico: máximo 3 reseñas por usuario/nombre cada 24 h
    const recientes = (await db.get<{ n: number }>(`
      SELECT COUNT(*) AS n FROM resenas
      WHERE (usuario_id = ? OR cliente_nombre = ?) AND created_at >= datetime('now', '-1 day')
    `, usuarioId, nombre)) ?? { n: 0 }
    if (recientes.n >= 3) {
      return NextResponse.json({ error: 'Ya enviaste varias reseñas hoy. Intenta mañana.' }, { status: 429 })
    }

    await db.run(`
      INSERT INTO resenas (id, cita_id, usuario_id, cliente_nombre, barbero_id, servicio_id, calificacion, comentario)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      citaId ? String(citaId).slice(0, 64) : null,
      usuarioId,
      nombre,
      barberoId ? String(barberoId).slice(0, 32) : null,
      servicioId ? String(servicioId).slice(0, 32) : null,
      rating,
      texto,
    )

    const nuevaResena = await db.get('SELECT * FROM resenas WHERE id = ?', id)
    return NextResponse.json({ ok: true, resena: nuevaResena }, { status: 201 })
  } catch (err) {
    console.error('[resenas POST]', err)
    return NextResponse.json({ error: 'Error al guardar la reseña.' }, { status: 500 })
  }
}
