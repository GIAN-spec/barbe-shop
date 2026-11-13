'use client'

/**
 * MÓDULO 11: AJUSTES DEL NEGOCIO (SaaS)
 * - Secciones colapsables (Acordeón):
 *   1. Horarios generales y Bloqueos de agenda (feriados / cierres)
 *   2. Datos de contacto y dirección
 *   3. Métodos de pago y QR Yape / Plin
 *   4. Configuración de Delivery y Tarjeta VIP
 * - Sin textos explicativos permanentes (usa Tooltips <Hint />)
 * - Una sola acción primaria: "Guardar cambios"
 */
import { useEffect, useState } from 'react'
import {
  T,
  AccordionSection,
  Hint,
  ScreenHeader,
  Toast,
  getFechaHoy,
  fechaLarga,
  type Bloqueo,
  type NegocioAjustes,
} from './ui'

const DEFAULT_AJUSTES: NegocioAjustes = {
  nombre: 'Chino Barber Shop',
  telefono: '987 654 321',
  whatsapp: '51987654321',
  direccion: 'Av. Principal 450, Lima, Perú',
  horarioApertura: '09:00',
  horarioCierre: '21:00',
  diasAtencion: 'Lunes a Sábado',
  yapeNumero: '987 654 321',
  yapeTitular: 'Chino Barber Shop SAC',
  yapeQrUrl: '',
  aceptaYape: true,
  aceptaTarjeta: true,
  aceptaEfectivo: true,
  deliveryActivo: true,
  deliveryTarifa: 8,
  metaSellosVip: 5,
}

export default function TabNegocio() {
  const [ajustes, setAjustes] = useState<NegocioAjustes>(DEFAULT_AJUSTES)
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [bFecha, setBFecha] = useState(getFechaHoy())
  const [bHora, setBHora] = useState('')
  const [bMotivo, setBMotivo] = useState('')
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const notify = (m: string, t: 'ok' | 'err' = 'ok') => {
    setMsg(m); setTone(t)
    setTimeout(() => setMsg(''), 1400)
  }

  async function cargar() {
    const [rAj, rBl] = await Promise.all([
      fetch('/api/admin/saas?mod=ajustes', { cache: 'no-store' }),
      fetch('/api/admin/bloqueos', { cache: 'no-store' }),
    ])
    if (rAj.ok) {
      const data = await rAj.json()
      if (data.ajustes && Object.keys(data.ajustes).length > 0) {
        setAjustes({ ...DEFAULT_AJUSTES, ...data.ajustes })
      }
    }
    if (rBl.ok) {
      setBloqueos((await rBl.json()).bloqueos ?? [])
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function guardarAjustes() {
    const r = await fetch('/api/admin/saas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: 'ajustes', ajustes }),
    })
    if (r.ok) notify('Ajustes del negocio guardados')
    else notify('No se pudieron guardar los ajustes', 'err')
  }

  async function agregarBloqueo() {
    if (!bMotivo.trim()) return
    const r = await fetch('/api/admin/bloqueos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: bFecha, hora: bHora || null, motivo: bMotivo }),
    })
    if (r.ok) {
      notify('Horario bloqueado')
      setBMotivo(''); setBHora('')
      await cargar()
    }
  }

  async function eliminarBloqueo(id: string) {
    await fetch(`/api/admin/bloqueos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    notify('Bloqueo eliminado')
    await cargar()
  }

  return (
    <div className="a-fade space-y-5 max-w-4xl">
      <Toast msg={msg} tone={tone} />

      <ScreenHeader
        title="Negocio"
        primaryAction={{
          label: 'Guardar cambios',
          icon: 'Check',
          onClick: guardarAjustes,
        }}
      />

      {/* 1. HORARIOS Y BLOQUEOS DE AGENDA */}
      <AccordionSection title="1. Horarios de atención y bloqueos de agenda" defaultOpen={true}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={T.label}>
              Hora de apertura <Hint text="Primer turno disponible en el calendario web." />
            </label>
            <input
              type="time"
              className={T.input}
              value={ajustes.horarioApertura}
              onChange={e => setAjustes({ ...ajustes, horarioApertura: e.target.value })}
            />
          </div>
          <div>
            <label className={T.label}>
              Hora de cierre <Hint text="Último turno de atención del día." />
            </label>
            <input
              type="time"
              className={T.input}
              value={ajustes.horarioCierre}
              onChange={e => setAjustes({ ...ajustes, horarioCierre: e.target.value })}
            />
          </div>
          <div>
            <label className={T.label}>Días laborables</label>
            <input
              className={T.input}
              value={ajustes.diasAtencion}
              onChange={e => setAjustes({ ...ajustes, diasAtencion: e.target.value })}
            />
          </div>
        </div>

        <div className="border-t pt-4 mt-2" style={{ borderColor: 'var(--line)' }}>
          <label className={T.label}>
            Bloquear fecha o turno por feriado / mantenimiento{' '}
            <Hint text="Deja el campo hora vacío para bloquear todo el día en el sistema de reservas." />
          </label>
          <div className="grid gap-2.5 sm:grid-cols-4">
            <input type="date" className={T.input} value={bFecha} onChange={e => setBFecha(e.target.value)} />
            <input type="time" className={T.input} value={bHora} onChange={e => setBHora(e.target.value)} />
            <input
              className={T.input}
              placeholder="Motivo (ej. Feriado)"
              value={bMotivo}
              onChange={e => setBMotivo(e.target.value)}
            />
            <button type="button" onClick={agregarBloqueo} className={T.btnGhost}>
              Bloquear fecha
            </button>
          </div>

          {bloqueos.length > 0 && (
            <div className="mt-3 divide-y rounded-lg border text-xs" style={{ borderColor: 'var(--line)' }}>
              {bloqueos.map(b => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="font-semibold a-txt">{fechaLarga(b.fecha)}</span>
                    <span className="a-muted"> · {b.hora ? `${b.hora} hrs` : 'Día completo'} · {b.motivo}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminarBloqueo(b.id)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </AccordionSection>

      {/* 2. CONTACTO Y DIRECCIÓN */}
      <AccordionSection title="2. Contacto y ubicación" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={T.label}>Nombre comercial</label>
            <input
              className={T.input}
              value={ajustes.nombre}
              onChange={e => setAjustes({ ...ajustes, nombre: e.target.value })}
            />
          </div>
          <div>
            <label className={T.label}>
              Teléfono / WhatsApp <Hint text="Número donde llegan las consultas de clientes." />
            </label>
            <input
              className={T.input}
              value={ajustes.telefono}
              onChange={e => setAjustes({ ...ajustes, telefono: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className={T.label}>Dirección del local</label>
          <input
            className={T.input}
            value={ajustes.direccion}
            onChange={e => setAjustes({ ...ajustes, direccion: e.target.value })}
          />
        </div>
      </AccordionSection>

      {/* 3. MÉTODOS DE PAGO Y QR YAPE */}
      <AccordionSection title="3. Métodos de pago y QR Yape / Plin" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={T.label}>Número oficial Yape / Plin</label>
            <input
              className={T.input}
              value={ajustes.yapeNumero}
              onChange={e => setAjustes({ ...ajustes, yapeNumero: e.target.value })}
            />
          </div>
          <div>
            <label className={T.label}>Titular de cuenta</label>
            <input
              className={T.input}
              value={ajustes.yapeTitular}
              onChange={e => setAjustes({ ...ajustes, yapeTitular: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className={T.label}>
            Imagen de código QR Yape <Hint text="URL de tu código QR para pagos desde la web." />
          </label>
          <input
            className={T.input}
            placeholder="https://..."
            value={ajustes.yapeQrUrl}
            onChange={e => setAjustes({ ...ajustes, yapeQrUrl: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-6 pt-1 text-xs font-medium a-txt">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ajustes.aceptaYape}
              onChange={e => setAjustes({ ...ajustes, aceptaYape: e.target.checked })}
            />
            Aceptar Yape / Plin
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ajustes.aceptaTarjeta}
              onChange={e => setAjustes({ ...ajustes, aceptaTarjeta: e.target.checked })}
            />
            Aceptar Tarjeta
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ajustes.aceptaEfectivo}
              onChange={e => setAjustes({ ...ajustes, aceptaEfectivo: e.target.checked })}
            />
            Aceptar Pago en Local
          </label>
        </div>
      </AccordionSection>

      {/* 4. DELIVERY Y PROGRAMA VIP */}
      <AccordionSection title="4. Delivery de tienda y tarjeta de fidelidad VIP" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={T.label}>
              Tarifa Delivery Lima (S/) <Hint text="Costo que se suma al carrito cuando el cliente elige Delivery." />
            </label>
            <input
              type="number"
              className={T.input}
              value={ajustes.deliveryTarifa}
              onChange={e => setAjustes({ ...ajustes, deliveryTarifa: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={T.label}>
              Cortes para corte gratis VIP <Hint text="Por defecto 5 sellos = 5.º corte gratis." />
            </label>
            <input
              type="number"
              min={3}
              max={10}
              className={T.input}
              value={ajustes.metaSellosVip}
              onChange={e => setAjustes({ ...ajustes, metaSellosVip: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium a-txt cursor-pointer">
              <input
                type="checkbox"
                checked={ajustes.deliveryActivo}
                onChange={e => setAjustes({ ...ajustes, deliveryActivo: e.target.checked })}
              />
              Habilitar Delivery en tienda
            </label>
          </div>
        </div>
      </AccordionSection>
    </div>
  )
}
