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

  // tags viene como JSON string en SQLite
  const withTags = barberos.map(b => {
    let parsed: string[] = []
    try { parsed = JSON.parse(b.tags) } catch { parsed = [] }
    return { ...b, tags: parsed }
  })

  return NextResponse.json({ barberos: withTags })
}
