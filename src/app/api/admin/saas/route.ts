/**
 * /api/admin/saas — Endpoint centralizado de recursos SaaS del Panel Admin:
 * - clientes (con sellos VIP e historial de citas)
 * - resenas (aprobar, ocultar, responder)
 * - productos (stock, precio, activo)
 * - pedidos (órdenes de tienda + verificación de pago)
 * - galeria (lookbook fotos)
 * - ajustes (configuración general del negocio)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

class StockConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StockConflictError'
  }
}

type OrderLineInput = { id?: string; name?: string; nombre?: string; qty?: number; price?: number; precio?: number }

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const { searchParams } = new URL(request.url)
  const mod = searchParams.get('mod') ?? 'all'

  if (mod === 'clientes') {
    return NextResponse.json({ clientes: await getClientesConHistorial() })
  }
  if (mod === 'resenas') {
    const resenas = await db.all(`
      SELECT r.*, COALESCE(r.estado, 'aprobada') AS estado, COALESCE(r.respuesta, '') AS respuesta
      FROM resenas r ORDER BY r.created_at DESC
    `)
    return NextResponse.json({ resenas })
  }
  if (mod === 'productos') {
    const productos = await db.all('SELECT * FROM productos ORDER BY id ASC')
    return NextResponse.json({ productos })
  }
  if (mod === 'pedidos') {
    const pedidos = await db.all('SELECT * FROM pedidos ORDER BY created_at DESC')
    return NextResponse.json({ pedidos })
  }
  if (mod === 'galeria') {
    const galeria = await db.all('SELECT * FROM galeria ORDER BY orden ASC, id DESC')
    return NextResponse.json({ galeria })
  }
  if (mod === 'ajustes') {
    const row = await db.get<{ valor: string }>('SELECT valor FROM ajustes WHERE clave = ?', 'negocio')
    return NextResponse.json({ ajustes: row ? JSON.parse(row.valor) : {} })
  }

  // mod === 'all'
  const [clientes, resenas, productos, pedidos, galeria, rowAj] = await Promise.all([
    getClientesConHistorial(),
    db.all(`
      SELECT r.*, COALESCE(r.estado, 'aprobada') AS estado, COALESCE(r.respuesta, '') AS respuesta
      FROM resenas r ORDER BY r.created_at DESC
    `),
    db.all('SELECT * FROM productos ORDER BY id ASC'),
    db.all('SELECT * FROM pedidos ORDER BY created_at DESC'),
    db.all('SELECT * FROM galeria ORDER BY orden ASC, id DESC'),
    db.get<{ valor: string }>('SELECT valor FROM ajustes WHERE clave = ?', 'negocio'),
  ])

  return NextResponse.json({
    clientes,
    resenas,
    productos,
    pedidos,
    galeria,
    ajustes: rowAj ? JSON.parse(rowAj.valor) : {},
  })
}

async function getClientesConHistorial() {
  // Combina usuarios registrados + clientes que agendaron citas sin cuenta previa
  const [usuarios, citas] = await Promise.all([
    db.all<{
      id: string
      nombre: string
      email: string | null
      celular: string
      sellos_vip: number
      notas: string
      created_at: string
    }>(`
      SELECT id, nombre, email, celular, COALESCE(sellos_vip, 0) AS sellos_vip, COALESCE(notas, '') AS notas, created_at
      FROM usuarios
      WHERE COALESCE(rol, 'cliente') != 'admin'
      ORDER BY created_at DESC
    `),
    db.all<{
      id: string
      usuario_id: string | null
      nombre: string
      celular: string
      fecha: string
      hora: string
      estado: string
      barbero: string
      metodo_pago: string
      servicioNombre: string
      precio: number
    }>(`
      SELECT c.id, c.usuario_id, c.nombre, c.celular, c.fecha, c.hora, c.estado, c.barbero, c.metodo_pago,
             COALESCE(s.nombre, c.servicio) AS servicioNombre,
             COALESCE(s.precio, 15) AS precio
      FROM citas c
      LEFT JOIN servicios s ON s.id = c.servicio
      ORDER BY c.fecha DESC, c.hora DESC
    `),
  ])

  const mapByPhone = new Map<string, {
    id: string
    nombre: string
    email: string
    celular: string
    sellos_vip: number
    notas: string
    visitas: number
    totalGastado: number
    ultimaCita: string
    historial: typeof citas
  }>()

  for (const u of usuarios) {
    const key = u.celular.trim() || u.id
    mapByPhone.set(key, {
      id: u.id,
      nombre: u.nombre,
      email: u.email ?? '',
      celular: u.celular,
      sellos_vip: u.sellos_vip ?? 0,
      notas: u.notas ?? '',
      visitas: 0,
      totalGastado: 0,
      ultimaCita: '',
      historial: [],
    })
  }

  for (const c of citas) {
    const key = (c.celular || '').trim() || c.nombre.toLowerCase()
    if (!mapByPhone.has(key)) {
      mapByPhone.set(key, {
        id: c.usuario_id || `cli_${key.replace(/\s+/g, '_')}`,
        nombre: c.nombre,
        email: '',
        celular: c.celular,
        sellos_vip: 0,
        notas: '',
        visitas: 0,
        totalGastado: 0,
        ultimaCita: c.fecha,
        historial: [],
      })
    }
    const entry = mapByPhone.get(key)!
    entry.historial.push(c)
    if (!entry.ultimaCita || c.fecha > entry.ultimaCita) {
      entry.ultimaCita = c.fecha
    }
    if (c.estado === 'completada' || c.estado === 'pagado') {
      entry.visitas++
      entry.totalGastado += Number(c.precio) || 0
    }
  }

  return Array.from(mapByPhone.values()).sort((a, b) => (b.ultimaCita || '').localeCompare(a.ultimaCita || ''))
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const body = await request.json()
  const { mod } = body

  if (mod === 'cliente') {
    const { nombre, celular, email, sellos_vip, notas } = body
    if (!nombre || !celular) {
      return NextResponse.json({ error: 'Nombre y teléfono son obligatorios.' }, { status: 400 })
    }
    const id = `usr_cli_${Date.now()}`
    await db.run(`
      INSERT INTO usuarios (id, nombre, email, celular, password_hash, rol, sellos_vip, notas)
      VALUES (?, ?, ?, ?, 'walkin', 'cliente', ?, ?)
    `, id, String(nombre).trim(), email ? String(email).trim() : null, String(celular).trim(), Number(sellos_vip) || 0, String(notas ?? ''))
    return NextResponse.json({ ok: true, clientes: await getClientesConHistorial() })
  }

  if (mod === 'producto') {
    const { nombre, cat, marca, presentacion, desc, precio, stock, img, badge } = body
    if (!nombre) return NextResponse.json({ error: 'Nombre requerido.' }, { status: 400 })
    const id = `prod_${Date.now()}`
    await db.run(`
      INSERT INTO productos (id, nombre, cat, marca, presentacion, desc, precio, stock, img, badge, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
      id,
      String(nombre).trim(),
      String(cat ?? 'Cabello & Styling').trim(),
      String(marca ?? 'American Crew · Reserve').trim(),
      String(presentacion ?? '85 g').trim(),
      String(desc ?? '').trim(),
      Number(precio) || 35,
      Number(stock ?? 10),
      String(img ?? '/productos/prod-01.jpg').trim(),
      String(badge ?? 'Nuevo').trim(),
    )
    const creado = await db.get('SELECT * FROM productos WHERE id = ?', id)
    return NextResponse.json({ ok: true, producto: creado })
  }

  if (mod === 'pedido') {
    const { id: customId, cliente, telefono, entrega, direccion, items, subtotal, envio, total, metodo_pago, ref_pago, estado } = body
    const id = customId || `ORD-${String(Date.now()).slice(-6)}`
    const exists = await db.get('SELECT id FROM pedidos WHERE id = ?', id)
    if (!exists) {
      const rawItems = Array.isArray(items) ? (items as OrderLineInput[]) : []
      try {
        await db.transaction(async (tx) => {
          const normalizedItems: Array<{ id: string | null; name: string; qty: number; price: number }> = []
          for (const it of rawItems) {
            const qty = Math.max(1, Math.floor(Number(it.qty) || 1))
            const rawId = it.id ? String(it.id).trim() : ''
            const rawName = String(it.name || it.nombre || '').trim()
            const dbProd = rawId
              ? await tx.get<{ id: string; nombre: string; precio: number; stock: number }>(
                  'SELECT id, nombre, precio, stock FROM productos WHERE id = ?',
                  rawId
                )
              : rawName
                ? await tx.get<{ id: string; nombre: string; precio: number; stock: number }>(
                    'SELECT id, nombre, precio, stock FROM productos WHERE LOWER(nombre) = LOWER(?)',
                    rawName
                  )
                : undefined

            if (dbProd) {
              if (Number(dbProd.stock) < qty) {
                throw new StockConflictError(
                  `Stock insuficiente para "${dbProd.nombre}" (disponible: ${dbProd.stock} unid.).`
                )
              }
              await tx.run('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', qty, dbProd.id)
              normalizedItems.push({
                id: dbProd.id,
                name: dbProd.nombre,
                qty,
                price: Number(it.price ?? it.precio ?? dbProd.precio) || 0,
              })
            } else {
              normalizedItems.push({
                id: rawId || null,
                name: rawName || 'Producto',
                qty,
                price: Number(it.price ?? it.precio) || 0,
              })
            }
          }

          await tx.run(`
            INSERT INTO pedidos (id, cliente, telefono, entrega, direccion, items_json, subtotal, envio, total, metodo_pago, ref_pago, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            id,
            String(cliente ?? 'Cliente Tienda').trim(),
            String(telefono ?? '999999999').trim(),
            String(entrega ?? 'recojo'),
            String(direccion ?? ''),
            JSON.stringify(normalizedItems),
            Number(subtotal) || Number(total) || 0,
            Number(envio) || 0,
            Number(total) || 0,
            String(metodo_pago ?? 'yape'),
            String(ref_pago ?? ''),
            String(estado ?? 'pendiente'),
          )
        })
      } catch (err) {
        if (err instanceof StockConflictError) {
          return NextResponse.json({ error: err.message }, { status: 409 })
        }
        throw err
      }
    }
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', id)
    return NextResponse.json({ ok: true, pedido })
  }

  if (mod === 'galeria') {
    const { titulo, cat, url } = body
    if (!titulo || !url) return NextResponse.json({ error: 'Título y foto requeridos.' }, { status: 400 })
    const id = `gal_${Date.now()}`
    await db.run(`
      INSERT INTO galeria (id, titulo, cat, url, orden, activo)
      VALUES (?, ?, ?, ?, 1, 1)
    `, id, String(titulo).trim(), String(cat ?? 'Fade').trim(), String(url).trim())
    const foto = await db.get('SELECT * FROM galeria WHERE id = ?', id)
    return NextResponse.json({ ok: true, foto })
  }

  return NextResponse.json({ error: 'Módulo no soportado.' }, { status: 400 })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const body = await request.json()
  const { mod, id } = body

  if (mod === 'cliente') {
    const { nombre, celular, email, sellos_vip, notas } = body
    const exists = await db.get('SELECT id FROM usuarios WHERE id = ?', id)
    if (exists) {
      await db.run(`
        UPDATE usuarios
        SET nombre = COALESCE(?, nombre),
            celular = COALESCE(?, celular),
            email = COALESCE(?, email),
            sellos_vip = COALESCE(?, sellos_vip),
            notas = COALESCE(?, notas)
        WHERE id = ?
      `,
        nombre !== undefined ? String(nombre).trim() : null,
        celular !== undefined ? String(celular).trim() : null,
        email !== undefined ? (String(email).trim() || null) : null,
        sellos_vip !== undefined ? Math.max(0, Math.min(5, Number(sellos_vip))) : null,
        notas !== undefined ? String(notas) : null,
        id,
      )
    } else if (celular) {
      const newId = `usr_cli_${Date.now()}`
      await db.run(`
        INSERT INTO usuarios (id, nombre, email, celular, password_hash, rol, sellos_vip, notas)
        VALUES (?, ?, ?, ?, 'walkin', 'cliente', ?, ?)
      `,
        newId,
        String(nombre ?? 'Cliente').trim(),
        email ? String(email).trim() : null,
        String(celular).trim(),
        Math.max(0, Math.min(5, Number(sellos_vip) || 0)),
        String(notas ?? ''),
      )
    }
    return NextResponse.json({ ok: true, clientes: await getClientesConHistorial() })
  }

  if (mod === 'resena') {
    const { estado, respuesta } = body
    if (estado !== undefined) {
      await db.run('UPDATE resenas SET estado = ? WHERE id = ?', String(estado), id)
    }
    if (respuesta !== undefined) {
      await db.run('UPDATE resenas SET respuesta = ? WHERE id = ?', String(respuesta), id)
    }
    const updated = await db.get('SELECT * FROM resenas WHERE id = ?', id)
    return NextResponse.json({ ok: true, resena: updated })
  }

  if (mod === 'producto') {
    const { nombre, cat, marca, presentacion, desc, precio, stock, img, badge, activo } = body
    await db.run(`
      UPDATE productos
      SET nombre = COALESCE(?, nombre),
          cat = COALESCE(?, cat),
          marca = COALESCE(?, marca),
          presentacion = COALESCE(?, presentacion),
          desc = COALESCE(?, desc),
          precio = COALESCE(?, precio),
          stock = COALESCE(?, stock),
          img = COALESCE(?, img),
          badge = COALESCE(?, badge),
          activo = COALESCE(?, activo)
      WHERE id = ?
    `,
      nombre !== undefined ? String(nombre).trim() : null,
      cat !== undefined ? String(cat).trim() : null,
      marca !== undefined ? String(marca).trim() : null,
      presentacion !== undefined ? String(presentacion).trim() : null,
      desc !== undefined ? String(desc).trim() : null,
      precio !== undefined ? Number(precio) : null,
      stock !== undefined ? Math.max(0, Number(stock)) : null,
      img !== undefined ? String(img).trim() : null,
      badge !== undefined ? String(badge).trim() : null,
      activo !== undefined ? (activo ? 1 : 0) : null,
      id,
    )
    const updated = await db.get('SELECT * FROM productos WHERE id = ?', id)
    return NextResponse.json({ ok: true, producto: updated })
  }

  if (mod === 'pedido') {
    const { estado, ref_pago } = body
    const existing = await db.get<{ id: string; estado: string; items_json: string }>(
      'SELECT id, estado, items_json FROM pedidos WHERE id = ?',
      id
    )
    if (!existing) {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 })
    }

    let parsedItems: OrderLineInput[] = []
    try {
      const arr = JSON.parse(existing.items_json || '[]')
      if (Array.isArray(arr)) parsedItems = arr
    } catch {}

    let stockAjustado: 'restored' | 'deducted' | null = null
    const nextEstado = estado !== undefined ? String(estado) : existing.estado

    try {
      await db.transaction(async (tx) => {
        const shouldRestore = existing.estado !== 'cancelado' && nextEstado === 'cancelado'
        const shouldDeduct = existing.estado === 'cancelado' && nextEstado !== 'cancelado'

        if (shouldRestore || shouldDeduct) {
          for (const it of parsedItems) {
            const qty = Math.max(1, Math.floor(Number(it.qty) || 1))
            const rawId = it.id ? String(it.id).trim() : ''
            const rawName = String(it.name || it.nombre || '').trim()
            const dbProd = rawId
              ? await tx.get<{ id: string; nombre: string; stock: number }>(
                  'SELECT id, nombre, stock FROM productos WHERE id = ?',
                  rawId
                )
              : rawName
                ? await tx.get<{ id: string; nombre: string; stock: number }>(
                    'SELECT id, nombre, stock FROM productos WHERE LOWER(nombre) = LOWER(?)',
                    rawName
                  )
                : undefined

            if (!dbProd) continue

            if (shouldRestore) {
              await tx.run('UPDATE productos SET stock = stock + ? WHERE id = ?', qty, dbProd.id)
            } else {
              if (Number(dbProd.stock) < qty) {
                throw new StockConflictError(
                  `Stock insuficiente para reactivar "${dbProd.nombre}" (disponible: ${dbProd.stock} unid.).`
                )
              }
              await tx.run('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', qty, dbProd.id)
            }
          }
          stockAjustado = shouldRestore ? 'restored' : 'deducted'
        }

        if (estado !== undefined) {
          await tx.run('UPDATE pedidos SET estado = ? WHERE id = ?', nextEstado, id)
        }
        if (ref_pago !== undefined) {
          await tx.run('UPDATE pedidos SET ref_pago = ? WHERE id = ?', String(ref_pago), id)
        }
      })
    } catch (err) {
      if (err instanceof StockConflictError) {
        return NextResponse.json({ error: err.message }, { status: 409 })
      }
      throw err
    }

    const updated = await db.get('SELECT * FROM pedidos WHERE id = ?', id)
    return NextResponse.json({ ok: true, pedido: updated, stockAjustado })
  }

  if (mod === 'galeria') {
    const { titulo, cat, url, activo } = body
    await db.run(`
      UPDATE galeria
      SET titulo = COALESCE(?, titulo),
          cat = COALESCE(?, cat),
          url = COALESCE(?, url),
          activo = COALESCE(?, activo)
      WHERE id = ?
    `,
      titulo !== undefined ? String(titulo).trim() : null,
      cat !== undefined ? String(cat).trim() : null,
      url !== undefined ? String(url).trim() : null,
      activo !== undefined ? (activo ? 1 : 0) : null,
      id,
    )
    const updated = await db.get('SELECT * FROM galeria WHERE id = ?', id)
    return NextResponse.json({ ok: true, foto: updated })
  }

  if (mod === 'ajustes') {
    const { ajustes } = body
    await db.run('INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)', 'negocio', JSON.stringify(ajustes ?? {}))
    return NextResponse.json({ ok: true, ajustes })
  }

  return NextResponse.json({ error: 'Módulo inválido.' }, { status: 400 })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const { searchParams } = new URL(request.url)
  const mod = searchParams.get('mod')
  const id = searchParams.get('id')
  if (!mod || !id) return NextResponse.json({ error: 'Parámetros requeridos.' }, { status: 400 })

  if (mod === 'producto') await db.run('DELETE FROM productos WHERE id = ?', id)
  else if (mod === 'galeria') await db.run('DELETE FROM galeria WHERE id = ?', id)
  else if (mod === 'resena') await db.run('DELETE FROM resenas WHERE id = ?', id)
  else if (mod === 'pedido') await db.run('DELETE FROM pedidos WHERE id = ?', id)

  return NextResponse.json({ ok: true, deleted: id })
}
