/**
 * POST /api/pedidos — Registrar pedido público de tienda directamente en la base de datos
 * GET  /api/pedidos — Consultar estado de un pedido por id y teléfono
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { codigo, cliente, celular, entregaModo, destino, items, subtotal, shipping, total, metodoDetalle, estadoPago } = body

    if (!cliente || !celular || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Datos de pedido incompletos.' }, { status: 400 })
    }

    const id = codigo || `ORD-${Math.floor(100000 + Math.random() * 900000)}`
    const tel = String(celular).replace(/\D/g, '').slice(-9)
    const entrega = entregaModo === 'delivery' ? 'delivery' : 'recojo'
    const direccion = destino || ''
    const sub = Number(subtotal) || Number(total) || 0
    const env = Number(shipping) || 0
    const tot = Number(total) || (sub + env)
    
    // Determinar método de pago y estado
    const mLower = String(metodoDetalle || '').toLowerCase()
    let metodoPago = 'efectivo'
    if (mLower.includes('yape')) metodoPago = 'yape'
    else if (mLower.includes('plin')) metodoPago = 'plin'
    else if (mLower.includes('tarjeta')) metodoPago = 'tarjeta'

    let refPago = ''
    const opMatch = mLower.match(/op\.?\s*#?([0-9a-z]+)/i)
    if (opMatch) refPago = opMatch[1]

    // Si pagó con tarjeta o yape ya ingresó el comprobante, o queda pendiente
    const estado = mLower.includes('tarjeta') ? 'pagado' : 'pendiente'

    // Formatear items limpios
    const itemsJson = JSON.stringify(items.map((it: any) => ({
      name: it.nombre || it.name,
      qty: Number(it.qty) || 1,
      price: Number(it.precio || it.price) || 0
    })))

    // Descontar stock en base de datos si existe el producto
    for (const it of items) {
      if (it.id) {
        const qty = Math.max(1, Math.floor(Number(it.qty) || 1))
        await db.run('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', qty, it.id)
      }
    }

    // Insertar o actualizar pedido
    await db.run(`
      INSERT OR REPLACE INTO pedidos (id, cliente, telefono, entrega, direccion, items_json, subtotal, envio, total, metodo_pago, ref_pago, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, String(cliente).trim(), tel, entrega, direccion, itemsJson, sub, env, tot, metodoPago, refPago, estado)

    const creado = await db.get('SELECT * FROM pedidos WHERE id = ?', id)
    return NextResponse.json({ ok: true, pedido: creado }, { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/pedidos]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error al procesar pedido.' }, { status: 500 })
  }
}
