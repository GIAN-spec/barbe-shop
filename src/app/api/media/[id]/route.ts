/**
 * GET /api/media/[id] — Sirve una imagen guardada en la tabla media.
 * Cacheo agresivo: las URLs de media son inmutables (id = contenido nuevo).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const row = await db.get<{ mime: string; data: ArrayBuffer | Uint8Array | Buffer }>('SELECT mime, data FROM media WHERE id = ?', id)

  if (!row) {
    return NextResponse.json({ error: 'Imagen no encontrada.' }, { status: 404 })
  }

  const bytes = row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data as ArrayBuffer)
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
