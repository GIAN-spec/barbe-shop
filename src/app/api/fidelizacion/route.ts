/**
 * GET /api/fidelizacion?celular=999999999
 * Consulta el estado de la Tarjeta de Fidelización Digital (5 cortes = el 6.º es GRATIS).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const celRaw = searchParams.get('celular') ?? ''
  const digits = celRaw.replace(/\D/g, '')

  if (!digits || digits.length < 7) {
    return NextResponse.json({ error: 'Número de celular inválido (mínimo 7 dígitos).' }, { status: 400 })
  }

  // En Perú los celulares tienen 9 dígitos; buscamos por los últimos 9 para evitar problemas con prefijo +51
  const ultimosDigitos = digits.slice(-9)

  const row = await db.get<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM citas
    WHERE celular LIKE ? AND estado IN ('completada', 'pagado')
  `, `%${ultimosDigitos}`)

  const total = Number(row?.total ?? 0)
  const sellos = total % 6 // 0 a 5
  const siguienteEsGratis = sellos === 5
  const faltantes = siguienteEsGratis ? 0 : 5 - sellos
  const premiosObtenidos = Math.floor(total / 6)

  // Últimas citas completadas para historial
  const ultimasCitas = await db.all(`
    SELECT c.fecha, c.hora, c.servicio, COALESCE(s.nombre, c.servicio) AS servicioNombre
    FROM citas c
    LEFT JOIN servicios s ON s.id = c.servicio
    WHERE c.celular LIKE ? AND c.estado IN ('completada', 'pagado')
    ORDER BY c.fecha DESC, c.hora DESC
    LIMIT 5
  `, `%${ultimosDigitos}`)

  return NextResponse.json({
    celular: ultimosDigitos,
    totalCortesCompletados: total,
    sellosActuales: sellos,
    siguienteEsGratis,
    faltantesParaGratis: faltantes,
    premiosObtenidos,
    mensaje: siguienteEsGratis
      ? '🎉 ¡FELICIDADES! Tu próximo corte es 100% GRATIS por tu fidelidad'
      : `Llevas ${sellos} de 5 cortes. ¡Te faltan solo ${faltantes} para tu corte GRATIS!`,
    historialReciente: ultimasCitas,
  })
}
