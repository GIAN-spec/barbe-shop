/**
 * GET /api/productos — Catálogo público de productos activos con stock y precio en tiempo real desde Turso
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

export async function GET() {
  try {
    const productos = await db.all(`
      SELECT id, nombre, cat, marca, presentacion, desc, precio, stock, img, badge, activo
      FROM productos
      WHERE COALESCE(activo, 1) = 1
      ORDER BY id ASC
    `)
    return NextResponse.json({ productos }, { headers: NO_CACHE })
  } catch (err) {
    console.error('[GET /api/productos]', err)
    return NextResponse.json({ error: 'Error al cargar productos.' }, { status: 500, headers: NO_CACHE })
  }
}
