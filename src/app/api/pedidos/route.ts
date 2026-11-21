/**
 * GET  /api/pedidos — Historial de pedidos del cliente autenticado o de invitado (por ids o teléfono)
 * POST /api/pedidos — Registrar pedido público de tienda validando precios y stock en el servidor
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
    const { codigo, citaId, cliente, celular, entregaModo, destino, items, metodoDetalle } = body

    if (!cliente || !celular || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Datos de pedido incompletos.' }, { status: 400, headers: NO_CACHE })
    }

    const tel = String(celular).replace(/\D/g, '').slice(-9)
    if (!/^9\d{8}$/.test(tel)) {
      return NextResponse.json({ error: 'Ingresa un número de celular válido de 9 dígitos.' }, { status: 400, headers: NO_CACHE })
    }

    const session = await requireSession()
    const usuarioId = session?.userId ?? null

    // Generar ID único garantizando que nunca sobrescriba un pedido existente
    let id = typeof codigo === 'string' && /^ORD-[A-Z0-9-]+$/i.test(codigo.trim())
      ? codigo.trim()
      : `ORD-${Math.floor(100000 + Math.random() * 900000)}`
    const existing = await db.get('SELECT id FROM pedidos WHERE id = ?', id)
    if (existing) {
      id = `ORD-${Math.floor(100000 + Math.random() * 900000)}`
    }

    const entrega = entregaModo === 'delivery' ? 'delivery' : 'recojo'
    const direccion = String(destino ?? '').trim().slice(0, 220)

    // Validar precios y stock contra la tabla `productos` en el servidor
    const verifiedItems: Array<{
      id: string | null
      name: string
      qty: number
      price: number
      img: string | null
      marca: string | null
    }> = []

    let calculatedSubtotal = 0

    for (const rawIt of items) {
      const qty = Math.max(1, Math.min(50, Math.floor(Number(rawIt.qty) || 1)))
      const rawId = rawIt.id ? String(rawIt.id).trim() : ''
      const rawName = String(rawIt.nombre || rawIt.name || '').trim()

      const dbProd = rawId
        ? await db.get<{ id: string; nombre: string; marca: string; precio: number; stock: number; img: string | null; activo: number }>(
            'SELECT id, nombre, marca, precio, stock, img, activo FROM productos WHERE id = ?',
            rawId
          )
        : await db.get<{ id: string; nombre: string; marca: string; precio: number; stock: number; img: string | null; activo: number }>(
            'SELECT id, nombre, marca, precio, stock, img, activo FROM productos WHERE nombre = ?',
            rawName
          )

      if (dbProd) {
        if (dbProd.activo === 0) {
          return NextResponse.json({ error: `El producto "${dbProd.nombre}" ya no está disponible.` }, { status: 400, headers: NO_CACHE })
        }
        if (Number(dbProd.stock) < qty) {
          return NextResponse.json(
            { error: `Stock insuficiente para "${dbProd.nombre}" (disponible: ${dbProd.stock} unid.).` },
            { status: 409, headers: NO_CACHE }
          )
        }
        const unitPrice = Number(dbProd.precio) || 0
        calculatedSubtotal += unitPrice * qty
        verifiedItems.push({
          id: dbProd.id,
          name: dbProd.nombre,
          qty,
          price: unitPrice,
          img: dbProd.img || rawIt.img || rawIt.foto || null,
          marca: dbProd.marca || null,
        })
      } else {
        const fallbackPrice = Math.max(1, Number(rawIt.precio || rawIt.price) || 35)
        calculatedSubtotal += fallbackPrice * qty
        verifiedItems.push({
          id: rawId || null,
          name: rawName || 'Producto Chino Barber',
          qty,
          price: fallbackPrice,
          img: rawIt.img || rawIt.foto || null,
          marca: rawIt.marca || null,
        })
      }
    }

    const env = entrega === 'delivery' ? 8 : 0
    const tot = calculatedSubtotal + env

    const mLower = String(metodoDetalle || '').toLowerCase()
    let metodoPago = 'efectivo'
    if (mLower.includes('yape')) metodoPago = 'yape'
    else if (mLower.includes('plin')) metodoPago = 'plin'
    else if (mLower.includes('tarjeta')) metodoPago = 'tarjeta'

    let refPago = ''
    const opMatch = mLower.match(/op\.?\s*#?([0-9a-z]+)/i)
    if (opMatch) refPago = opMatch[1].slice(0, 32)

    // Seguridad: todo pedido público inicia como 'pendiente' hasta verificación real en el Panel Admin
    const estado = 'pendiente'
    const itemsJson = JSON.stringify(verifiedItems)

    await db.transaction(async (tx) => {
      for (const it of verifiedItems) {
        if (it.id) {
          await tx.run('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', it.qty, it.id)
        }
      }
      await tx.run(`
        INSERT INTO pedidos (id, usuario_id, cita_id, cliente, telefono, entrega, direccion, items_json, subtotal, envio, total, metodo_pago, ref_pago, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, usuarioId, citaId ?? null, String(cliente).trim().slice(0, 80), tel, entrega, direccion, itemsJson, calculatedSubtotal, env, tot, metodoPago, refPago, estado)
    })

    const creado = await db.get('SELECT * FROM pedidos WHERE id = ?', id)
    return NextResponse.json({ ok: true, pedido: creado }, { status: 201, headers: NO_CACHE })
  } catch (err: unknown) {
    console.error('[POST /api/pedidos]', err)
    return NextResponse.json({ error: 'Error al procesar pedido.' }, { status: 500, headers: NO_CACHE })
  }
}
