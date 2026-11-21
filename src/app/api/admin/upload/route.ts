/**
 * POST /api/admin/upload — Sube una foto (multipart form-data, campo "file").
 * La guarda en la tabla media (SQLite, sin dependencias del filesystem) y
 * devuelve una URL estable: /api/media/<id>. La web pública la verá al
 * momento porque /api/servicios y /api/barberos leen la BD.
 * Máximo 4 MB; tipos: jpeg, png, webp.
 */
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

const MAX = 4 * 1024 * 1024
const PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Archivo no enviado (campo "file").' }, { status: 400 })
  }
  if (!PERMITIDOS.has(file.type)) {
    return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG o WEBP.' }, { status: 400 })
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: 'La foto debe pesar menos de 4 MB.' }, { status: 400 })
  }

  const buf = new Uint8Array(await file.arrayBuffer())
  const id = 'm' + randomUUID().replace(/-/g, '').slice(0, 12)
  await db.run('INSERT INTO media (id, mime, data) VALUES (?, ?, ?)', id, file.type, buf)

  return NextResponse.json({ ok: true, url: `/api/media/${id}` }, { status: 201 })
}
