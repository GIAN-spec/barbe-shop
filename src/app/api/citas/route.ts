/**
 * GET  /api/citas          — Lista las citas del usuario autenticado
 * POST /api/citas          — Crea una nueva cita
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession } from '@/lib/auth'
import { getFechaLima, isSlotPastLima } from '@/lib/dates'
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
        const rows = await db.all<Record<string, unknown>>(`
          SELECT * FROM citas
          WHERE id IN (${placeholders}) AND usuario_id IS NULL
          ORDER BY fecha DESC, hora DESC
        `, ...idList)
        const citas = rows.map(c => ({ ...c, date: c.fecha, time: c.hora }))
        return NextResponse.json({ citas })
      }
    }

    if (celular) {
      // Estricta seguridad: solo devolver citas creadas como invitado (usuario_id IS NULL)
      // Nunca exponer citas privadas de usuarios registrados
      const rows = await db.all<Record<string, unknown>>(`
        SELECT * FROM citas
        WHERE celular = ? AND usuario_id IS NULL
        ORDER BY fecha DESC, hora DESC
        LIMIT 20
      `, celular)
      const citas = rows.map(c => ({ ...c, date: c.fecha, time: c.hora }))
      return NextResponse.json({ citas })
    }

    return NextResponse.json({ citas: [] })
  }

  // 2. Consulta de usuario autenticado
  if (session) {
    const rows = await db.all<Record<string, unknown>>(`
      SELECT * FROM citas
      WHERE usuario_id = ?
      ORDER BY fecha DESC, hora DESC
    `, session.userId)
    const citas = rows.map(c => ({ ...c, date: c.fecha, time: c.hora }))
    return NextResponse.json({ citas })
  }

  return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
}

// ─── POST: crear cita ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nombre, celular, servicio, barbero, fecha, hora, metodoPago, refPago, notas, addonItems } = body

    // Validaciones básicas y de formato/fecha
    if (!nombre || !celular || !servicio || !barbero || !fecha || !hora || !metodoPago) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
    }
    if (!/^9\d{8}$/.test(celular)) {
      return NextResponse.json({ error: 'Celular inválido (9 dígitos empezando con 9).' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || !/^\d{2}:\d{2}$/.test(String(hora))) {
      return NextResponse.json({ error: 'Formato de fecha u hora inválido.' }, { status: 400 })
    }
    const hoyLima = getFechaLima(0)
    if (String(fecha) < hoyLima) {
      return NextResponse.json({ error: 'No se pueden agendar citas en fechas pasadas.' }, { status: 400 })
    }
    if (isSlotPastLima(String(fecha), String(hora))) {
      return NextResponse.json({ error: 'Ese horario del día de hoy ya pasó. Por favor selecciona una hora futura o agenda para mañana.' }, { status: 400 })
    }

    // Verificar bloqueos (día completo u horario puntual del admin)
    const bloqueos = await db.all<{ hora: string | null; motivo: string }>('SELECT hora, motivo FROM bloqueos WHERE fecha = ?', fecha)
    const diaCompleto = bloqueos.find(b => b.hora === null)
    if (diaCompleto) {
      return NextResponse.json({ error: `La barbería está cerrada ese día (${diaCompleto.motivo}). Elige otra fecha.` }, { status: 409 })
    }
    if (bloqueos.some(b => b.hora === hora)) {
      return NextResponse.json({ error: 'Ese horario no está disponible. Elige otro.' }, { status: 409 })
    }

    // Verificar slot disponible
    const slotOcupado = await db.get(`
      SELECT id FROM citas
      WHERE fecha = ? AND hora = ? AND barbero = ? AND estado != 'cancelada'
    `, fecha, hora, barbero)

    if (slotOcupado) {
      return NextResponse.json({ error: 'Este horario ya fue reservado. Elige otro.' }, { status: 409 })
    }

    // Usuario opcional (puede reservar como invitado)
    const session = await requireSession()
    const usuarioId = session?.userId ?? null

    // Estado según método de pago
    // SEGURIDAD: el cliente nunca puede auto-asignarse estado 'pagado'.
    // Si envía 'promocion_fidelidad', verificamos en BD que realmente tenga 5 sellos acumulados.
    let estado = 'pendiente'
    if (metodoPago === 'promocion_fidelidad') {
      const rowCitas = await db.get<{ total: number }>(
        `SELECT COUNT(*) AS total FROM citas WHERE celular LIKE ? AND estado IN ('completada', 'pagado')`,
        `%${String(celular).slice(-9)}`
      )
      const sellosPorCitas = Number(rowCitas?.total ?? 0) % 6
      const rowUser = usuarioId
        ? await db.get<{ sellos_vip: number }>('SELECT COALESCE(sellos_vip, 0) AS sellos_vip FROM usuarios WHERE id = ?', usuarioId)
        : await db.get<{ sellos_vip: number }>('SELECT COALESCE(sellos_vip, 0) AS sellos_vip FROM usuarios WHERE celular = ?', celular)
      if (sellosPorCitas === 5 || Number(rowUser?.sellos_vip ?? 0) >= 5) {
        estado = 'confirmada'
      }
    }

    const id = 'cita_' + randomUUID().replace(/-/g, '').slice(0, 16)

    // Transacción atómica: previene race condition de doble-booking
    const result = await db.transaction(async (tx) => {
      const slotDoble = await tx.get(`
        SELECT id FROM citas
        WHERE fecha = ? AND hora = ? AND barbero = ? AND estado != 'cancelada'
      `, fecha, hora, barbero)
      if (slotDoble) return null

      await tx.run(`
        INSERT INTO citas (id, usuario_id, nombre, celular, servicio, barbero, fecha, hora, metodo_pago, ref_pago, estado, notas, leida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, id, usuarioId, nombre, celular, servicio, barbero, fecha, hora, metodoPago, refPago ?? null, estado, notas ?? null)
      return id
    })

    if (!result) {
      return NextResponse.json({ error: 'Este horario ya fue reservado. Elige otro.' }, { status: 409 })
    }

    // Si la cita incluye productos sumados, registrar también en `pedidos` (vinculado por cita_id) y descontar stock
    let linkedPedidoId: string | null = null
    if (Array.isArray(addonItems) && addonItems.length > 0) {
      const cleanItems = addonItems
        .filter((it: Record<string, unknown>) => it && (it.nombre || it.name))
        .map((it: Record<string, unknown>) => ({
          id: it.id || null,
          name: String(it.nombre || it.name),
          qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
          price: Number(it.precio || it.price) || 0,
          img: it.foto || it.img || null,
          marca: it.marca || null,
        }))

      if (cleanItems.length > 0) {
        const sub = cleanItems.reduce((acc, it) => acc + it.price * it.qty, 0)
        linkedPedidoId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`
        const tel = String(celular).replace(/\D/g, '').slice(-9)
        for (const it of cleanItems) {
          if (it.id) {
            await db.run('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', it.qty, it.id)
          }
        }
        await db.run(`
          INSERT INTO pedidos (id, usuario_id, cita_id, cliente, telefono, entrega, direccion, items_json, subtotal, envio, total, metodo_pago, ref_pago, estado)
          VALUES (?, ?, ?, ?, ?, 'recojo', ?, ?, ?, 0, ?, ?, ?, 'pendiente')
        `,
          linkedPedidoId,
          usuarioId,
          result,
          String(nombre).trim(),
          tel,
          `Entrega en local junto a tu cita (${fecha} · ${hora})`,
          JSON.stringify(cleanItems),
          sub,
          sub,
          String(metodoPago || 'efectivo'),
          refPago ?? '',
        )
      }
    }

    const rawCita = await db.get<Record<string, unknown>>('SELECT * FROM citas WHERE id = ?', result)
    const cita = rawCita ? {
      ...rawCita,
      date: rawCita.fecha,
      time: rawCita.hora,
      pedido_id: linkedPedidoId,
    } : null
    return NextResponse.json({ ok: true, cita, pedidoId: linkedPedidoId }, { status: 201 })

  } catch (err) {
    console.error('[citas POST]', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
