/**
 * GET  /api/pedidos — Historial de pedidos del cliente autenticado o de invitado (por ids o teléfono)
 * POST /api/pedidos — Registrar pedido público de tienda directamente en la base de datos
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ids = searchParams.get('ids')
    const telefono = searchParams.get('telefono')
    const session = await requireSession()

    if (session) {
      const user = await db.get<{ celular: string }>('SELECT celular FROM usuarios WHERE id = ?', session.userId)
      const tel = user?.celular ? String(user.celular).replace(/\D/g, '').slice(-9) : ''
      const pedidos = tel
        ? await db.all(
            `SELECT * FROM pedidos
             WHERE usuario_id = ? OR telefono = ?
             ORDER BY created_at DESC LIMIT 40`,
            session.userId,
            tel
          )
        : await db.all(
            `SELECT * FROM pedidos
             WHERE usuario_id = ?
             ORDER BY created_at DESC LIMIT 40`,
            session.userId
          )
      return NextResponse.json({ pedidos }, { headers: NO_CACHE })
    }

    if (ids) {
      const idList = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 30)
      if (idList.length > 0) {
        const placeholders = idList.map(() => '?').join(',')
        const pedidos = await db.all(
          `SELECT * FROM pedidos
           WHERE id IN (${placeholders}) AND usuario_id IS NULL
           ORDER BY created_at DESC`,
          ...idList
        )
        return NextResponse.json({ pedidos }, { headers: NO_CACHE })
      }
    }

    if (telefono) {
      const tel = String(telefono).replace(/\D/g, '').slice(-9)
      if (tel.length >= 7) {
        const pedidos = await db.all(
          `SELECT * FROM pedidos
           WHERE telefono = ? AND usuario_id IS NULL
           ORDER BY created_at DESC LIMIT 20`,
          tel
        )
        return NextResponse.json({ pedidos }, { headers: NO_CACHE })
      }
    }

    return NextResponse.json({ pedidos: [] }, { headers: NO_CACHE })
  } catch (err) {
    console.error('[GET /api/pedidos]', err)
    return NextResponse.json({ error: 'Error al consultar pedidos.' }, { status: 500, headers: NO_CACHE })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { codigo, citaId, cliente, celular, entregaModo, destino, items, subtotal, shipping, total, metodoDetalle } = body

    if (!cliente || !celular || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Datos de pedido incompletos.' }, { status: 400 })
    }

    const session = await requireSession()
    const usuarioId = session?.userId ?? null

    const id = codigo || `ORD-${Math.floor(100000 + Math.random() * 900000)}`
    const tel = String(celular).replace(/\D/g, '').slice(-9)
    const entrega = entregaModo === 'delivery' ? 'delivery' : 'recojo'
    const direccion = destino || ''
    const sub = Number(subtotal) || Number(total) || 0
    const env = Number(shipping) || 0
    const tot = Number(total) || (sub + env)

    const mLower = String(metodoDetalle || '').toLowerCase()
    let metodoPago = 'efectivo'
    if (mLower.includes('yape')) metodoPago = 'yape'
    else if (mLower.includes('plin')) metodoPago = 'plin'
    else if (mLower.includes('tarjeta')) metodoPago = 'tarjeta'

    let refPago = ''
    const opMatch = mLower.match(/op\.?\s*#?([0-9a-z]+)/i)
    if (opMatch) refPago = opMatch[1]

    const estado = mLower.includes('tarjeta') ? 'pagado' : 'pendiente'

    const itemsJson = JSON.stringify(items.map((it: Record<string, unknown>) => ({
      id: it.id || null,
      name: it.nombre || it.name,
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      price: Number(it.precio || it.price) || 0,
      img: it.img || it.foto || null,
      marca: it.marca || null,
    })))

    for (const it of items) {
      if (it.id) {
        const qty = Math.max(1, Math.floor(Number(it.qty) || 1))
        await db.run('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', qty, it.id)
      }
    }

    await db.run(`
      INSERT OR REPLACE INTO pedidos (id, usuario_id, cita_id, cliente, telefono, entrega, direccion, items_json, subtotal, envio, total, metodo_pago, ref_pago, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, usuarioId, citaId ?? null, String(cliente).trim(), tel, entrega, direccion, itemsJson, sub, env, tot, metodoPago, refPago, estado)

    const creado = await db.get('SELECT * FROM pedidos WHERE id = ?', id)
    return NextResponse.json({ ok: true, pedido: creado }, { status: 201, headers: NO_CACHE })
  } catch (err: unknown) {
    console.error('[POST /api/pedidos]', err)
    return NextResponse.json({ error: 'Error al procesar pedido.' }, { status: 500, headers: NO_CACHE })
  }
}
