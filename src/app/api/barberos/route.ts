/**
 * GET /api/barberos — Barberos activos (público, BLOQUE 3.6 lectura)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const barberos = await db.all<{ id: string; tags: string }>(`
    SELECT id, nombre, rol, esp, exp, tags, foto, activo
    FROM barberos
    WHERE activo = 1
    ORDER BY exp DESC
  `)

  // tags viene como JSON string en SQLite; limpiamos cualquier corchete o comilla residual
  const cleanTag = (t: unknown) => String(t ?? '').replace(/[\[\]"']/g, '').trim()
  const withTags = barberos.map(b => {
    let parsed: string[] = []
    try {
      const raw = JSON.parse(b.tags)
      parsed = Array.isArray(raw) ? raw.map(cleanTag).filter(Boolean) : String(b.tags ?? '').split(',').map(cleanTag).filter(Boolean)
    } catch {
      parsed = String(b.tags ?? '').split(',').map(cleanTag).filter(Boolean)
    }
    return { ...b, tags: parsed }
  })

  return NextResponse.json({ barberos: withTags })
}
