/**
 * PATCH /api/citas/[id]   — Acciones del CLIENTE sobre su cita (BLOQUE 5)
 *   - Solo puede cambiar el estado a 'cancelada' (política: ≥2h de antelación)
 *   - Puede reagendar fecha/hora/barbero (respetando bloqueos y disponibilidad)
 *   - No toca citas completadas / rechazadas / ya canceladas
 * DELETE /api/citas/[id]  — Elimina una cita (solo admin, vía /api/admin)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession } from '@/lib/auth'
import { getFechaLima, isSlotPastLima } from '@/lib/dates'

type RouteContext = { params: Promise<{ id: string }> }

/** ¿Fecha/hora bloqueada por el admin? Bloqueo hora exacta o día completo */
async function horaBloqueada(fecha: string, hora: string): Promise<string | null> {
  const bloqueos = await db.all<{ hora: string | null; motivo: string }>('SELECT hora, motivo FROM bloqueos WHERE fecha = ?', fecha)
  const completo = bloqueos.find(b => b.hora === null)
  if (completo) return `Cerrado ese día (${completo.motivo}).`
  const punctual = bloqueos.find(b => b.hora === hora)
  if (punctual) return `Horario ${hora} bloqueado (${punctual.motivo}).`
  return null
}

export async function PATCH(request: Request, ctx: RouteContext) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const { id } = await ctx.params
  const body = await request.json()
  const { estado, fecha, hora, barbero, notas } = body

  const cita = await db.get<{
    id: string; usuario_id: string; estado: string; fecha: string; hora: string; barbero: string
  }>('SELECT * FROM citas WHERE id = ?', id)

  if (!cita) {
    return NextResponse.json({ error: 'Cita no encontrada.' }, { status: 404 })
  }
  if (cita.usuario_id !== session.userId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  // Estados finales: no editable por el cliente
  if (['completada', 'cancelada', 'rechazada'].includes(cita.estado)) {
    return NextResponse.json({ error: 'Esta cita ya fue cerrada por la barbería.' }, { status: 400 })
  }

  // El cliente SOLO puede cancelar; confirmar/pagar/completar lo hace el admin
  if (estado && estado !== 'cancelada') {
    return NextResponse.json({ error: 'Solo puedes cancelar tu cita. La confirmación la hace la barbería.' }, { status: 403 })
  }

  // Política de cancelación: al menos 2 horas de antelación
  if (estado === 'cancelada') {
    const ts = new Date(`${cita.fecha}T${cita.hora}:00`).getTime()
    if (ts - Date.now() < 2 * 3600 * 1000) {
      return NextResponse.json({ error: 'No puedes cancelar con menos de 2 horas de antelación. Llámanos si es urgente.' }, { status: 400 })
    }
  }

  // Reagenda: validar formato, fecha no pasada, bloqueos y slot
  if (fecha || hora || barbero) {
    const targetFecha = String(fecha ?? cita.fecha).trim()
    const targetHora = String(hora ?? cita.hora).trim()
    const targetBarbero = String(barbero ?? cita.barbero).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetFecha) || !/^\d{2}:\d{2}$/.test(targetHora)) {
      return NextResponse.json({ error: 'Formato de fecha u hora inválido.' }, { status: 400 })
    }
    if (targetFecha < getFechaLima(0)) {
      return NextResponse.json({ error: 'No puedes reagendar a una fecha pasada.' }, { status: 400 })
    }
    if (isSlotPastLima(targetFecha, targetHora)) {
      return NextResponse.json({ error: 'Ese horario del día de hoy ya pasó. Selecciona una hora futura.' }, { status: 400 })
    }
    const bloqueo = await horaBloqueada(targetFecha, targetHora)
    if (bloqueo) {
      return NextResponse.json({ error: bloqueo }, { status: 409 })
    }
    const slotOcupado = await db.get(`
      SELECT id FROM citas
      WHERE fecha = ? AND hora = ? AND barbero = ? AND estado != 'cancelada' AND id != ?
    `, targetFecha, targetHora, targetBarbero, id)
    if (slotOcupado) {
      return NextResponse.json({ error: 'Ese horario ya está ocupado. Elige otro.' }, { status: 409 })
    }
  }

  const updates: string[] = []
  const values: unknown[] = []

  if (estado)  { updates.push('estado = ?'); values.push(estado) }
  if (fecha)   { updates.push('fecha = ?');  values.push(fecha)  }
  if (hora)    { updates.push('hora = ?');   values.push(hora)   }
  if (barbero) { updates.push('barbero = ?');values.push(barbero)}
  if (notas !== undefined) { updates.push('notas = ?'); values.push(notas) }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  values.push(id)
  await db.run(`UPDATE citas SET ${updates.join(', ')} WHERE id = ?`, ...values)

  const rawUpdated = await db.get<Record<string, unknown>>('SELECT * FROM citas WHERE id = ?', id)
  const updated = rawUpdated ? { ...rawUpdated, date: rawUpdated.fecha, time: rawUpdated.hora } : null
  return NextResponse.json({ ok: true, cita: updated })
}
