/**
 * GET  /api/citas          — Lista las citas del usuario autenticado
 * POST /api/citas          — Crea una nueva cita
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─── GET: citas del usuario o de invitado ──────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const celular = searchParams.get('celular')
  const ids = searchParams.get('ids')
  const session = await requireSession()

  // 1. Consulta de invitado (por IDs guardados en su navegador o búsqueda por celular)
  if (ids || (celular && !session)) {
    if (ids) {
      const idList = ids.split(',').map(s => s.trim()).filter(Boolean)
      if (idList.length > 0) {
        const placeholders = idList.map(() => '?').join(',')
        const citas = (db.prepare(`
          SELECT * FROM citas
          WHERE id IN (${placeholders}) AND usuario_id IS NULL
          ORDER BY fecha DESC, hora DESC
        `).all(...idList) as Record<string, unknown>[]).map(c => ({ ...c, date: c.fecha, time: c.hora }))
        return NextResponse.json({ citas })
      }
    }

    if (celular) {
      // Estricta seguridad: solo devolver citas creadas como invitado (usuario_id IS NULL)
      // Nunca exponer citas privadas de usuarios registrados
      const citas = (db.prepare(`
        SELECT * FROM citas
        WHERE celular = ? AND usuario_id IS NULL
        ORDER BY fecha DESC, hora DESC
        LIMIT 20
      `).all(celular) as Record<string, unknown>[]).map(c => ({ ...c, date: c.fecha, time: c.hora }))
      return NextResponse.json({ citas })
    }

    return NextResponse.json({ citas: [] })
  }

  // 2. Consulta de usuario autenticado
  if (session) {
    const citas = (db.prepare(`
      SELECT * FROM citas
      WHERE usuario_id = ?
      ORDER BY fecha DESC, hora DESC
    `).all(session.userId) as Record<string, unknown>[]).map(c => ({ ...c, date: c.fecha, time: c.hora }))
    return NextResponse.json({ citas })
  }

  return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
}

// ─── POST: crear cita ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nombre, celular, servicio, barbero, fecha, hora, metodoPago, refPago, notas } = body

    // Validaciones básicas
    if (!nombre || !celular || !servicio || !barbero || !fecha || !hora || !metodoPago) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
    }
    if (!/^9\d{8}$/.test(celular)) {
      return NextResponse.json({ error: 'Celular inválido.' }, { status: 400 })
    }

    // Verificar bloqueos (día completo u horario puntual del admin)
    const bloqueos = db.prepare('SELECT hora, motivo FROM bloqueos WHERE fecha = ?')
      .all(fecha) as { hora: string | null; motivo: string }[]
    const diaCompleto = bloqueos.find(b => b.hora === null)
    if (diaCompleto) {
      return NextResponse.json({ error: `La barbería está cerrada ese día (${diaCompleto.motivo}). Elige otra fecha.` }, { status: 409 })
    }
    if (bloqueos.some(b => b.hora === hora)) {
      return NextResponse.json({ error: 'Ese horario no está disponible. Elige otro.' }, { status: 409 })
    }

    // Verificar slot disponible
    const slotOcupado = db.prepare(`
      SELECT id FROM citas
      WHERE fecha = ? AND hora = ? AND barbero = ? AND estado != 'cancelada'
    `).get(fecha, hora, barbero)

    if (slotOcupado) {
      return NextResponse.json({ error: 'Este horario ya fue reservado. Elige otro.' }, { status: 409 })
    }

    // Usuario opcional (puede reservar como invitado)
    const session = await requireSession()
    const usuarioId = session?.userId ?? null

    // Estado según método de pago
    // SEGURIDAD: el cliente nunca puede auto-asignarse estado 'pagado'.
    // Solo efectivo = pendiente, promocion_fidelidad = confirmada, otros (transferencia/yape) = pendiente.
    const estadosPermitidos: Record<string, string> = {
      efectivo: 'pendiente',
      yape: 'pendiente',
      transferencia: 'pendiente',
      promocion_fidelidad: 'confirmada',
    }
    const estado = estadosPermitidos[metodoPago] ?? 'pendiente'

    const id = 'cita_' + randomUUID().replace(/-/g, '').slice(0, 16)

    // Transacción atómica: previene race condition de doble-booking
    const insertCita = db.transaction(() => {
      // Re-verificar dentro de la transacción (SERIALIZABLE)
      const slotDoble = db.prepare(`
        SELECT id FROM citas
        WHERE fecha = ? AND hora = ? AND barbero = ? AND estado != 'cancelada'
      `).get(fecha, hora, barbero)
      if (slotDoble) return null

      db.prepare(`
        INSERT INTO citas (id, usuario_id, nombre, celular, servicio, barbero, fecha, hora, metodo_pago, ref_pago, estado, notas, leida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, usuarioId, nombre, celular, servicio, barbero, fecha, hora, metodoPago, refPago ?? null, estado, notas ?? null)
      return id
    })

    const result = insertCita()
    if (!result) {
      return NextResponse.json({ error: 'Este horario ya fue reservado. Elige otro.' }, { status: 409 })
    }

    const rawCita = db.prepare('SELECT * FROM citas WHERE id = ?').get(result) as Record<string, unknown>
    const cita = {
      ...rawCita,
      date: rawCita.fecha,
      time: rawCita.hora,
    }
    return NextResponse.json({ ok: true, cita }, { status: 201 })

  } catch (err) {
    console.error('[citas POST]', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
