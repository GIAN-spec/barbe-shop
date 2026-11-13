/**
 * PATCH /api/admin/citas/[id] — Gestión de estados, reprogramación y verificación de pagos.
 * Al marcar 'completada' (Atendida), suma automáticamente +1 sello VIP al cliente.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

const ESTADOS_VALIDOS = new Set(['pendiente', 'confirmada', 'completada', 'rechazada', 'pagado', 'cancelada'])

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const { id } = await ctx.params
  const body = await request.json()
  const { estado, fecha, hora, barbero, metodo_pago, ref_pago, notas } = body

  const cita = db.prepare('SELECT * FROM citas WHERE id = ?').get(id) as {
    id: string
    usuario_id: string | null
    nombre: string
    celular: string
    estado: string
  } | undefined

  if (!cita) {
    return NextResponse.json({ error: 'Cita no encontrada.' }, { status: 404 })
  }

  const updates: string[] = ['leida = 1']
  const values: unknown[] = []

  if (estado !== undefined) {
    if (!ESTADOS_VALIDOS.has(estado)) {
      return NextResponse.json(
        { error: `Estado inválido. Usa: ${[...ESTADOS_VALIDOS].join(', ')}.` },
        { status: 400 }
      )
    }
    updates.push('estado = ?')
    values.push(estado)
  }

  if (fecha !== undefined && String(fecha).trim()) {
    updates.push('fecha = ?')
    values.push(String(fecha).trim())
  }
  if (hora !== undefined && String(hora).trim()) {
    updates.push('hora = ?')
    values.push(String(hora).trim())
  }
  if (barbero !== undefined && String(barbero).trim()) {
    updates.push('barbero = ?')
    values.push(String(barbero).trim())
  }
  if (metodo_pago !== undefined) {
    updates.push('metodo_pago = ?')
    values.push(String(metodo_pago).trim())
  }
  if (ref_pago !== undefined) {
    updates.push('ref_pago = ?')
    values.push(ref_pago === null ? null : String(ref_pago).trim())
  }
  if (notas !== undefined) {
    updates.push('notas = ?')
    values.push(String(notas))
  }

  values.push(id)
  db.prepare(`UPDATE citas SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  // Si la cita pasa a 'completada' (Atendida) y antes no lo estaba, sumar +1 sello VIP al cliente
  let selloSumado = false
  if (estado === 'completada' && cita.estado !== 'completada') {
    if (cita.usuario_id) {
      db.prepare(`
        UPDATE usuarios
        SET sellos_vip = CASE WHEN COALESCE(sellos_vip, 0) >= 5 THEN 1 ELSE COALESCE(sellos_vip, 0) + 1 END
        WHERE id = ?
      `).run(cita.usuario_id)
      selloSumado = true
    } else if (cita.celular) {
      const u = db.prepare('SELECT id FROM usuarios WHERE celular = ?').get(cita.celular) as { id: string } | undefined
      if (u) {
        db.prepare(`
          UPDATE usuarios
          SET sellos_vip = CASE WHEN COALESCE(sellos_vip, 0) >= 5 THEN 1 ELSE COALESCE(sellos_vip, 0) + 1 END
          WHERE id = ?
        `).run(u.id)
        selloSumado = true
      } else {
        // Crear ficha de cliente si era un cliente sin cuenta registrada para guardar su sello VIP
        const newId = `usr_cli_${Date.now()}`
        db.prepare(`
          INSERT INTO usuarios (id, nombre, email, celular, password_hash, rol, sellos_vip)
          VALUES (?, ?, NULL, ?, 'walkin', 'cliente', 1)
        `).run(newId, cita.nombre || 'Cliente', cita.celular)
        db.prepare('UPDATE citas SET usuario_id = ? WHERE id = ?').run(newId, id)
        selloSumado = true
      }
    }
  }

  const updated = db.prepare(`
    SELECT c.*,
           s.nombre AS servicioNombre, s.dur AS servicioDur, s.precio AS servicioPrecio
    FROM citas c
    LEFT JOIN servicios s ON s.id = c.servicio
    WHERE c.id = ?
  `).get(id)

  return NextResponse.json({ ok: true, cita: updated, selloSumado })
}
