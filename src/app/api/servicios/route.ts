/**
 * GET /api/servicios — Catálogo público activo (BLOQUE 3.5 lectura)
 * GET /api/servicios?all=1 → incluye inactivos (uso interno del admin vía /api/admin/servicios)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const servicios = await db.all(`
    SELECT id, cat, nombre, desc, dur, precio, foto, activo
    FROM servicios
    WHERE activo = 1
    ORDER BY orden ASC, precio ASC
  `)
  return NextResponse.json({ servicios })
}
