/**
 * GET /api/media/[id] — Sirve una imagen guardada en la tabla media.
 * Cacheo agresivo: las URLs de media son inmutables (id = contenido nuevo).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const row = db.prepare('SELECT mime, data FROM media WHERE id = ?').get(id) as
    { mime: string; data: Buffer } | undefined

  if (!row) {
    return NextResponse.json({ error: 'Imagen no encontrada.' }, { status: 404 })
  }

  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
