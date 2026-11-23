/**
 * PATCH /api/admin/citas/[id] — Gestión de estados, reprogramación y verificación de pagos.
 * Al marcar 'completada' (Atendida), suma automáticamente +1 sello VIP al cliente.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { getFechaLima } from '@/lib/dates'

const ESTADOS_VALIDOS = new Set(['pendiente', 'confirmada', 'completada', 'rechazada', 'pagado', 'cancelada'])

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.denied) {
    return NextResponse.json({ error: auth.denied.message }, { status: auth.denied.status })
  }

  const { id } = await ctx.params
  const body = await request.json()
  const { estado, fecha, hora, barbero, metodo_pago, ref_pago, notas } = body

  const cita = await db.get<{
    id: string
    usuario_id: string | null
    nombre: string
    celular: string
    fecha: string
    hora: string
    barbero: string
    estado: string
  }>('SELECT * FROM citas WHERE id = ?', id)

  if (!cita) {
    return NextResponse.json({ error: 'Cita no encontrada.' }, { status: 404 })
  }

  // Restricción de negocio: no se puede verificar/aprobar pago ni marcar como atendida una cita de fecha futura
  const hoy = getFechaLima(0)
  const fechaEfectiva = (fecha !== undefined && String(fecha).trim()) ? String(fecha).trim() : cita.fecha
  const horaEfectiva = (hora !== undefined && String(hora).trim()) ? String(hora).trim() : cita.hora
  const barberoEfectivo = (barbero !== undefined && String(barbero).trim()) ? String(barbero).trim() : cita.barbero
  const estadoEfectivo = estado !== undefined ? String(estado) : cita.estado

  const intentaAprobarOAtender = estado === 'pagado' || estado === 'completada' || Boolean(body.verificarPago)
  if (intentaAprobarOAtender && fechaEfectiva > hoy) {
    return NextResponse.json(
      {
        error: `Restricción: no se puede verificar/aprobar el pago ni marcar como atendida una cita futura (${fechaEfectiva}). Solo está permitido para citas de hoy (${hoy}) o anteriores.`,
      },
      { status: 400 }
    )
  }

  if (estado !== undefined && !ESTADOS_VALIDOS.has(estado)) {
    return NextResponse.json(
      { error: `Estado inválido. Usa: ${[...ESTADOS_VALIDOS].join(', ')}.` },
      { status: 400 }
    )
  }

  const cambiaHorario =
    fechaEfectiva !== cita.fecha ||
    horaEfectiva !== cita.hora ||
    barberoEfectivo !== cita.barbero
  const reactivando =
    ['cancelada', 'rechazada'].includes(cita.estado) &&
    !['cancelada', 'rechazada'].includes(estadoEfectivo)

  if ((cambiaHorario || reactivando) && !['cancelada', 'rechazada'].includes(estadoEfectivo)) {
    const bloqueos = await db.all<{ hora: string | null; motivo: string }>(
      'SELECT hora, motivo FROM bloqueos WHERE fecha = ?',
      fechaEfectiva
    )
    const diaCerrado = bloqueos.find(b => b.hora === null)
    if (diaCerrado) {
      return NextResponse.json(
        { error: `Fecha bloqueada (${diaCerrado.motivo}). Elige otro día.` },
        { status: 409 }
      )
    }
    const horaCerrada = bloqueos.find(b => b.hora === horaEfectiva)
    if (horaCerrada) {
      return NextResponse.json(
        { error: `Horario ${horaEfectiva} bloqueado (${horaCerrada.motivo}).` },
        { status: 409 }
      )
    }

    const conflict = await db.get<{ id: string }>(
      `SELECT id FROM citas
       WHERE id != ? AND fecha = ? AND hora = ? AND barbero = ? AND estado NOT IN ('cancelada', 'rechazada')`,
      id,
      fechaEfectiva,
      horaEfectiva,
      barberoEfectivo
    )
    if (conflict) {
      return NextResponse.json(
        { error: 'Este barbero ya tiene una cita ocupando ese horario.' },
        { status: 409 }
      )
    }
  }

  const updates: string[] = ['leida = 1']
  const values: unknown[] = []

  if (estado !== undefined) {
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
  try {
    await db.transaction(async (tx) => {
      if ((cambiaHorario || reactivando) && !['cancelada', 'rechazada'].includes(estadoEfectivo)) {
        const doubleCheck = await tx.get<{ id: string }>(
          `SELECT id FROM citas
           WHERE id != ? AND fecha = ? AND hora = ? AND barbero = ? AND estado NOT IN ('cancelada', 'rechazada')`,
          id,
          fechaEfectiva,
          horaEfectiva,
          barberoEfectivo
        )
        if (doubleCheck) {
          throw new Error('SLOT_CONFLICT')
        }
      }
      await tx.run(`UPDATE citas SET ${updates.join(', ')} WHERE id = ?`, ...values)
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'SLOT_CONFLICT') {
      return NextResponse.json({ error: 'Este barbero ya tiene una cita ocupando ese horario.' }, { status: 409 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo actualizar la cita.' }, { status: 409 })
  }

  // Si la cita pasa a 'completada' (Atendida) y antes no lo estaba, sumar +1 sello VIP al cliente
  let selloSumado = false
  if (estado === 'completada' && cita.estado !== 'completada') {
    if (cita.usuario_id) {
      await db.run(`
        UPDATE usuarios
        SET sellos_vip = CASE WHEN COALESCE(sellos_vip, 0) >= 5 THEN 1 ELSE COALESCE(sellos_vip, 0) + 1 END
        WHERE id = ?
      `, cita.usuario_id)
      selloSumado = true
    } else if (cita.celular) {
      const u = await db.get<{ id: string }>('SELECT id FROM usuarios WHERE celular = ?', cita.celular)
      if (u) {
        await db.run(`
          UPDATE usuarios
          SET sellos_vip = CASE WHEN COALESCE(sellos_vip, 0) >= 5 THEN 1 ELSE COALESCE(sellos_vip, 0) + 1 END
          WHERE id = ?
        `, u.id)
        selloSumado = true
      } else {
        // Crear ficha de cliente si era un cliente sin cuenta registrada para guardar su sello VIP
        const newId = `usr_cli_${Date.now()}`
        await db.run(`
          INSERT INTO usuarios (id, nombre, email, celular, password_hash, rol, sellos_vip)
          VALUES (?, ?, NULL, ?, 'walkin', 'cliente', 1)
        `, newId, cita.nombre || 'Cliente', cita.celular)
        await db.run('UPDATE citas SET usuario_id = ? WHERE id = ?', newId, id)
        selloSumado = true
      }
    }
  }

  const updated = await db.get(`
    SELECT c.*,
           s.nombre AS servicioNombre, s.dur AS servicioDur, s.precio AS servicioPrecio
    FROM citas c
    LEFT JOIN servicios s ON s.id = c.servicio
    WHERE c.id = ?
  `, id)

  return NextResponse.json({ ok: true, cita: updated, selloSumado })
}
