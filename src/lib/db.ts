/**
 * db.ts — Cliente SQLite/Turso (libSQL) para Chino Barber Shop.
 * - En producción (Vercel) conecta a Turso mediante TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.
 * - En desarrollo local sin TURSO_DATABASE_URL usa el archivo local file:db/custom.db.
 * - Inicializa el esquema y datos semilla de forma idempotente una sola vez por proceso.
 */
import { createClient, type Client, type InValue, type Transaction } from '@libsql/client'
import path from 'path'
import bcrypt from 'bcryptjs'

type QueryExecutor = Pick<Client, 'execute' | 'executeMultiple'> | Pick<Transaction, 'execute'>

function rowToPlain<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    const val = row[key]
    out[key] = typeof val === 'bigint' ? Number(val) : val
  }
  return out as T
}

function createLibsqlClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
  if (tursoUrl) {
    return createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
    })
  }
  const localPath = path.resolve(process.cwd(), 'db', 'custom.db')
  return createClient({
    url: `file:${localPath}`,
  })
}

const SCHEMA_VERSION = 5
const globalForDb = globalThis as unknown as {
  __libsqlClient?: Client
  __libsqlInitPromise?: Promise<void>
  __libsqlSchemaV?: number
}

const rawClient: Client = globalForDb.__libsqlClient ?? createLibsqlClient()
if (process.env.NODE_ENV !== 'production') {
  globalForDb.__libsqlClient = rawClient
}

async function execSafe(client: Client, sql: string) {
  try {
    await client.execute(sql)
  } catch {
    // Columna o índice ya existente
  }
}

async function initSchema(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            TEXT PRIMARY KEY,
      nombre        TEXT NOT NULL,
      email         TEXT UNIQUE,
      celular       TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar        TEXT,
      rol           TEXT NOT NULL DEFAULT 'cliente',
      sellos_vip    INTEGER NOT NULL DEFAULT 0,
      notas         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS citas (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT,
      nombre      TEXT NOT NULL,
      celular     TEXT NOT NULL,
      servicio    TEXT NOT NULL,
      barbero     TEXT NOT NULL,
      fecha       TEXT NOT NULL,
      hora        TEXT NOT NULL,
      metodo_pago TEXT NOT NULL,
      ref_pago    TEXT,
      estado      TEXT NOT NULL DEFAULT 'pendiente',
      notas       TEXT,
      leida       INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token       TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash  TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS servicios (
      id        TEXT PRIMARY KEY,
      cat       TEXT NOT NULL,
      nombre    TEXT NOT NULL,
      desc      TEXT NOT NULL,
      dur       INTEGER NOT NULL,
      precio    REAL NOT NULL,
      foto      TEXT,
      orden     INTEGER NOT NULL DEFAULT 99,
      activo    INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS barberos (
      id          TEXT PRIMARY KEY,
      nombre      TEXT NOT NULL,
      rol         TEXT NOT NULL,
      esp         TEXT NOT NULL,
      exp         TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      foto        TEXT,
      activo      INTEGER NOT NULL DEFAULT 1,
      comision    INTEGER NOT NULL DEFAULT 50,
      horario     TEXT NOT NULL DEFAULT 'Lun - Sáb · 09:00 - 21:00',
      dias_libres TEXT NOT NULL DEFAULT 'Domingo'
    );

    CREATE TABLE IF NOT EXISTS bloqueos (
      id         TEXT PRIMARY KEY,
      fecha      TEXT NOT NULL,
      hora       TEXT,
      motivo     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media (
      id         TEXT PRIMARY KEY,
      mime       TEXT NOT NULL,
      data       BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resenas (
      id             TEXT PRIMARY KEY,
      cita_id        TEXT,
      usuario_id     TEXT,
      cliente_nombre TEXT NOT NULL,
      barbero_id     TEXT,
      servicio_id    TEXT,
      calificacion   INTEGER NOT NULL DEFAULT 5,
      comentario     TEXT NOT NULL,
      estado         TEXT NOT NULL DEFAULT 'aprobada',
      respuesta      TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS productos (
      id           TEXT PRIMARY KEY,
      nombre       TEXT NOT NULL,
      cat          TEXT NOT NULL,
      marca        TEXT NOT NULL DEFAULT 'American Crew · Reserve',
      presentacion TEXT NOT NULL DEFAULT '85 g',
      desc         TEXT NOT NULL DEFAULT '',
      precio       REAL NOT NULL,
      stock        INTEGER NOT NULL DEFAULT 15,
      img          TEXT,
      badge        TEXT,
      activo       INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id          TEXT PRIMARY KEY,
      usuario_id  TEXT,
      cita_id     TEXT,
      cliente     TEXT NOT NULL,
      telefono    TEXT NOT NULL,
      entrega     TEXT NOT NULL DEFAULT 'recojo',
      direccion   TEXT,
      items_json  TEXT NOT NULL DEFAULT '[]',
      subtotal    REAL NOT NULL DEFAULT 0,
      envio       REAL NOT NULL DEFAULT 0,
      total       REAL NOT NULL DEFAULT 0,
      metodo_pago TEXT NOT NULL DEFAULT 'yape',
      ref_pago    TEXT,
      estado      TEXT NOT NULL DEFAULT 'pendiente',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS galeria (
      id      TEXT PRIMARY KEY,
      titulo  TEXT NOT NULL,
      cat     TEXT NOT NULL,
      url     TEXT NOT NULL,
      orden   INTEGER NOT NULL DEFAULT 1,
      activo  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ajustes (
      clave   TEXT PRIMARY KEY,
      valor   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_citas_usuario     ON citas(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_citas_fecha       ON citas(fecha);
    CREATE INDEX IF NOT EXISTS idx_citas_slot        ON citas(fecha, hora, barbero);
    CREATE INDEX IF NOT EXISTS idx_usuarios_email    ON usuarios(email);
    CREATE INDEX IF NOT EXISTS idx_usuarios_cel      ON usuarios(celular);
    CREATE INDEX IF NOT EXISTS idx_pwd_resets_user   ON password_resets(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_bloqueos_fecha    ON bloqueos(fecha);
    CREATE INDEX IF NOT EXISTS idx_resenas_barbero   ON resenas(barbero_id);
  `)

  // Migraciones suaves para bases existentes
  await execSafe(client, `ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'cliente'`)
  await execSafe(client, `ALTER TABLE usuarios ADD COLUMN sellos_vip INTEGER NOT NULL DEFAULT 0`)
  await execSafe(client, `ALTER TABLE usuarios ADD COLUMN notas TEXT`)
  await execSafe(client, `ALTER TABLE citas ADD COLUMN leida INTEGER NOT NULL DEFAULT 1`)
  await execSafe(client, `ALTER TABLE barberos ADD COLUMN comision INTEGER NOT NULL DEFAULT 50`)
  await execSafe(client, `ALTER TABLE barberos ADD COLUMN horario TEXT NOT NULL DEFAULT 'Lun - Sáb · 09:00 - 21:00'`)
  await execSafe(client, `ALTER TABLE barberos ADD COLUMN dias_libres TEXT NOT NULL DEFAULT 'Domingo'`)
  await execSafe(client, `ALTER TABLE resenas ADD COLUMN estado TEXT NOT NULL DEFAULT 'aprobada'`)
  await execSafe(client, `ALTER TABLE resenas ADD COLUMN respuesta TEXT`)
  await execSafe(client, `ALTER TABLE productos ADD COLUMN marca TEXT NOT NULL DEFAULT 'American Crew · Reserve'`)
  await execSafe(client, `ALTER TABLE productos ADD COLUMN presentacion TEXT NOT NULL DEFAULT '85 g'`)
  await execSafe(client, `ALTER TABLE productos ADD COLUMN desc TEXT NOT NULL DEFAULT ''`)
  await execSafe(client, `ALTER TABLE pedidos ADD COLUMN usuario_id TEXT`)
  await execSafe(client, `ALTER TABLE pedidos ADD COLUMN cita_id TEXT`)
  await execSafe(client, `CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos(usuario_id)`)
  await execSafe(client, `CREATE INDEX IF NOT EXISTS idx_pedidos_tel ON pedidos(telefono)`)
}

async function seedDemoData(client: Client) {
  // 1. Cliente demo (contraseña alineada con el botón de prueba: OtraClave77)
  const DEMO_EMAIL = 'carlos@demo.com'
  const demoExists = await client.execute({ sql: 'SELECT id FROM usuarios WHERE email = ?', args: [DEMO_EMAIL] })
  if (demoExists.rows.length === 0) {
    const hash = await bcrypt.hash('OtraClave77', 12)
    await client.execute({
      sql: `INSERT INTO usuarios (id, nombre, email, celular, password_hash, rol) VALUES (?, ?, ?, ?, ?, 'cliente')`,
      args: ['usr_demo_carlos01', 'Carlos Mendoza', DEMO_EMAIL, '911222333', hash],
    })
  }

  // 2. Cuenta ADMIN (dueño)
  const ADMIN_EMAIL = 'admin@chinobarber.com'
  const adminExists = await client.execute({ sql: 'SELECT id FROM usuarios WHERE email = ?', args: [ADMIN_EMAIL] })
  if (adminExists.rows.length === 0) {
    const adminHash = await bcrypt.hash('Admin1234!', 12)
    await client.execute({
      sql: `INSERT INTO usuarios (id, nombre, email, celular, password_hash, rol) VALUES (?, ?, ?, ?, ?, 'admin')`,
      args: ['usr_admin_chino01', 'Dueño Chino Barber', ADMIN_EMAIL, '999000111', adminHash],
    })
  }

  // 3. Servicios
  const srvRes = await client.execute('SELECT COUNT(*) AS n FROM servicios')
  if (Number(srvRes.rows[0]?.n ?? 0) === 0) {
    const servicios: [string, string, string, string, number, number, string][] = [
      ['corte', 'corte', 'Corte de Cabello Signature', 'Corte personalizado con asesoría de visagismo, degradado a navaja y acabado con productos premium.', 35, 15, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80'],
      ['corte_barba', 'combo', 'Combo Master: Corte + Barba', 'El servicio completo. Corte de cabello + perfilado y ritual de barba con toallas calientes y aceites hidratantes.', 50, 25, 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80'],
      ['barba', 'barba', 'Ritual de Barba & Toalla Caliente', 'Diseño y afeitado tradicional a navaja, vaporizador de ozono, bálsamo nutritivo y toalla aromatizada.', 25, 12, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80'],
      ['cejas', 'barba', 'Perfilado & Diseño de Cejas', 'Limpieza y definición milimétrica con navaja descartable para resaltar la mirada masculina.', 15, 5, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80'],
      ['ninos', 'corte', 'Corte Infantil Jr. (Hasta 10 años)', 'Atención paciente y divertida con sillón especial, golosina de premio y el mejor corte para los más pequeños.', 30, 12, 'https://images.unsplash.com/photo-1605497787865-e6d4762b386f?auto=format&fit=crop&w=800&q=80'],
      ['diseno', 'combo', 'Corte Artístico Freestyle con Diseño', 'Corte con líneas, figuras tribales o sombreados personalizados creados a mano alzada por nuestros barberos.', 45, 20, 'https://images.unsplash.com/photo-1593702295094-aea22597af65?auto=format&fit=crop&w=800&q=80'],
    ]
    await client.batch(
      servicios.map((s, i) => ({
        sql: 'INSERT OR IGNORE INTO servicios (id, cat, nombre, desc, dur, precio, foto, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [...s, i + 1],
      })),
      'write'
    )
  }

  // 4. Barberos
  const barRes = await client.execute('SELECT COUNT(*) AS n FROM barberos')
  if (Number(barRes.rows[0]?.n ?? 0) === 0) {
    const barberos: [string, string, string, string, string, string, string][] = [
      ['chino', 'Chino (Fundador)', 'Master Barber & Fundador', 'Fades de precisión, freestyle & visagismo', '9 años de exp.', '["Skin Fade","Freestyle","Navaja Clásica"]', '/barberos/chino.jpg'],
      ['diego', 'Diego Valdivia', 'Senior Barber & Barba Specialist', 'Rituales de barba, cortes clásicos a tijera', '6 años de exp.', '["Barba de Lujo","Tijera Clásica","Pompadour"]', '/barberos/diego.jpg'],
      ['marco', 'Marco Sotomayor', 'Estilista & Tendencias Urbanas', 'Texturizados modernos, taper fades y colorimetría', '5 años de exp.', '["Texturas","Taper Fade","Diseños"]', '/barberos/marco.jpg'],
    ]
    await client.batch(
      barberos.map(b => ({
        sql: 'INSERT OR IGNORE INTO barberos (id, nombre, rol, esp, exp, tags, foto) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: b,
      })),
      'write'
    )
  }

  // 5. Reseñas
  const resCount = await client.execute('SELECT COUNT(*) AS n FROM resenas')
  if (Number(resCount.rows[0]?.n ?? 0) === 0) {
    const resenas: [string, string, string, string, number, string][] = [
      ['res_1', 'Carlos Mendoza', 'diego', 'corte_barba', 5, 'La atención es de otro nivel. Cero esperas, me atendió Diego con toalla caliente y café mientras me afeitaba. 100% recomendado.'],
      ['res_2', 'Rodrigo Benavides', 'chino', 'corte', 5, 'Chino es un genio con los degradados. La plataforma de reservas funciona impecable y el comprobante se valida en el acto.'],
      ['res_3', 'Álvaro Quintana', 'marco', 'barba', 5, 'Excelente ambiente y música. Reservé a las 6:30 pm y a las 6:29 ya me estaban invitando al sillón. Profesionales de verdad.'],
    ]
    await client.batch(
      resenas.map(r => ({
        sql: 'INSERT OR IGNORE INTO resenas (id, cliente_nombre, barbero_id, servicio_id, calificacion, comentario) VALUES (?, ?, ?, ?, ?, ?)',
        args: r,
      })),
      'write'
    )
  }

  // 6. Catálogo de 15 productos
  const prodRes = await client.execute('SELECT COUNT(*) AS n FROM productos')
  if (Number(prodRes.rows[0]?.n ?? 0) === 0) {
    const productos: [string, string, string, string, string, string, number, number, string, string][] = [
      ['prod_01', 'Cera Matte Clay Fijación Flexible', 'Cabello & Styling', 'American Crew · Reserve', '85 g', 'Arcilla moldeadora de acabado 100% mate sin residuos grasos. Aporta textura, volumen y control durante todo el día.', 38, 18, '/productos/prod-01.jpg', 'Más Vendido'],
      ['prod_02', 'Pomada Clásica Brillo & Fijación Media', 'Cabello & Styling', 'American Crew · Reserve', '85 g', 'Pomada a base de agua ideal para peinados clásicos, slick back y pompadour. Se retira fácilmente con un solo lavado.', 36, 14, '/productos/prod-02.jpg', 'Estilo Clásico'],
      ['prod_03', 'Polvo Voluminizador Powder Wax', 'Cabello & Styling', 'Marmara Barber Pro', '20 g', 'Polvo ultraligero que levanta la raíz al instante y crea un efecto texturizado mate sin apelmazar el cabello.', 32, 20, '/productos/prod-03.png', 'Efecto Gravedad'],
      ['prod_04', 'Spray Texturizante Matte Clay Spray', 'Cabello & Styling', 'American Crew · Reserve', '150 ml', 'Spray de arcilla caolín que absorbe el exceso de grasa y aporta densidad, textura mate y fijación duradera.', 39, 11, '/productos/prod-05.png', 'Volumen & Textura'],
      ['prod_05', 'Pomada Heavy Hold Fijación Extrema', 'Cabello & Styling', 'American Crew · Reserve', '85 g', 'Máxima fijación durante 24 horas con acabado brillante intenso para dominar hasta el cabello más rebelde.', 40, 12, '/productos/prod-04.jpg', 'Fijación Extrema'],
      ['prod_06', 'Cera Fiber Alta Fijación & Bajo Brillo', 'Cabello & Styling', 'American Crew · Reserve', '85 g', 'Resina fibrosa que engrosa, texturiza y aumenta la plenitud del cabello con acabado natural y bajo brillo.', 38, 16, '/productos/prod-06.jpg', 'Top Barbería'],
      ['prod_07', 'Sérum & Aceite Nutritivo para Barba', 'Cuidado de Barba', 'American Crew · Beard', '50 ml', 'Fórmula regeneradora con aceites orgánicos de argán y ciprés que mantiene la barba suave, brillante y bien cuidada.', 42, 15, '/productos/prod-07.jpg', 'Hidratación VIP'],
      ['prod_08', 'Bálsamo Acondicionador Beard Balm', 'Cuidado de Barba', 'American Crew · Beard', '60 g', 'Bálsamo suave con manteca de karité y aceite de almendras dulces que hidrata y moldea la barba con fijación flexible.', 39, 9, '/productos/prod-08.png', 'Control & Nutrición'],
      ['prod_09', 'Bálsamo Activador Crecimiento (Minoxidil)', 'Cuidado de Barba', 'Vikingo Grooming', '60 g', 'Tratamiento fortificante enriquecido con activos estimulantes que reactivan los folículos y pueblan zonas abiertas.', 48, 7, '/productos/prod-10.png', 'Fórmula Activa'],
      ['prod_10', 'Shampoo Cabello, Barba & Body Wash', 'Cuidado de Barba', 'Mr. Muk Barber Exclusive', '250 ml', 'Gel limpiador ultra acondicionador que deja la barba y el cabello suaves, hidratados y libres de impurezas.', 38, 13, '/productos/prod-09.png', '3 en 1 Premium'],
      ['prod_11', 'Bálsamo After Shave Calmante SPF 15', 'Afeitado & Cuidado', 'American Crew · Shave', '170 ml', 'Bálsamo facial todo en uno que calma al instante la irritación del afeitado, hidrata la piel e incluye protección solar.', 42, 14, '/productos/prod-12.jpg', 'Post-Afeitado'],
      ['prod_12', 'Gel de Afeitado Transparente Precisión', 'Afeitado & Cuidado', 'American Crew · Shave', '150 ml', 'Gel transparente que no reseca la piel y permite deslizar la navaja con total visibilidad en cuello, mejillas y patillas.', 34, 18, '/productos/prod-13.jpg', 'Perfilado Navaja'],
      ['prod_13', 'Mascarilla Reparadora Aceite de Argán', 'Afeitado & Cuidado', 'Muk Spa Argan Therapy', '250 ml', 'Tratamiento intensivo con aceite puro de argán marroquí libre de sulfatos para restaurar fuerza, suavidad y brillo.', 45, 10, '/productos/prod-14.jpg', 'Reparación Total'],
      ['prod_14', 'Cepillo de Barba Madera & Cerda Jabalí', 'Packs & Accesorios', 'The Barber Accesorios', '1 unid.', 'Cuerpo ovalado de madera noble con cerdas firmes de jabalí que desenredan y distribuyen el aceite uniformemente.', 28, 22, '/productos/prod-11.png', '100% Natural'],
      ['prod_15', 'Pack Cuidado de Barba + Cepillo + Neceser', 'Packs & Accesorios', 'Pack Exclusivo VIP', 'Kit 4 pzs', 'Set completo de regalo: Beard Serum + Espuma Limpiadora + Bálsamo de Barba + Cepillo de Madera y Neceser de cuero.', 115, 5, '/productos/prod-15.png', 'Ahorra S/ 25'],
    ]
    await client.batch(
      productos.map(p => ({
        sql: `INSERT OR IGNORE INTO productos (id, nombre, cat, marca, presentacion, desc, precio, stock, img, badge, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        args: p,
      })),
      'write'
    )
  }

  // 7. Galería
  const galRes = await client.execute('SELECT COUNT(*) AS n FROM galeria')
  if (Number(galRes.rows[0]?.n ?? 0) === 0) {
    const fotos: [string, string, string, string, number][] = [
      ['gal_1', 'Skin Fade + Diseño de Barba', 'Fade', 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80', 1],
      ['gal_2', 'Ritual de Barba con Toalla Caliente', 'Barba', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80', 2],
      ['gal_3', 'Pompadour Clásico a Tijera', 'Clásico', 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80', 3],
      ['gal_4', 'Crop Texturizado & Mid Fade', 'Textura', 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80', 4],
      ['gal_5', 'Taper Fade Urbano', 'Fade', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80', 5],
      ['gal_6', 'Perfilado de Barba a Navaja', 'Barba', 'https://images.unsplash.com/photo-1517832606699-7ae9b720a186?auto=format&fit=crop&w=800&q=80', 6],
    ]
    await client.batch(
      fotos.map(g => ({
        sql: 'INSERT OR IGNORE INTO galeria (id, titulo, cat, url, orden, activo) VALUES (?, ?, ?, ?, ?, 1)',
        args: g,
      })),
      'write'
    )
  }

  // 8. Ajustes
  const ajRes = await client.execute({ sql: 'SELECT clave FROM ajustes WHERE clave = ?', args: ['negocio'] })
  if (ajRes.rows.length === 0) {
    const defaultAjustes = {
      nombre: 'Chino Barber Shop',
      telefono: '987 654 321',
      whatsapp: '51987654321',
      direccion: 'Av. Principal 450, Lima, Perú',
      horarioApertura: '09:00',
      horarioCierre: '21:00',
      diasAtencion: 'Lunes a Sábado (Domingos previa cita)',
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
    await client.execute({
      sql: 'INSERT OR IGNORE INTO ajustes (clave, valor) VALUES (?, ?)',
      args: ['negocio', JSON.stringify(defaultAjustes)],
    })
  }
}

async function ensureInitialized(): Promise<void> {
  if (globalForDb.__libsqlSchemaV === SCHEMA_VERSION && globalForDb.__libsqlInitPromise) {
    return globalForDb.__libsqlInitPromise
  }
  const p = (async () => {
    await initSchema(rawClient)
    await seedDemoData(rawClient)
    globalForDb.__libsqlSchemaV = SCHEMA_VERSION
  })()
  globalForDb.__libsqlInitPromise = p
  try {
    await p
  } catch (err) {
    globalForDb.__libsqlInitPromise = undefined
    throw err
  }
}

export interface DbTx {
  get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | undefined>
  all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]>
  run(sql: string, ...args: unknown[]): Promise<{ changes: number }>
}

function wrapExecutor(exec: QueryExecutor): DbTx {
  return {
    async get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | undefined> {
      const res = await exec.execute({ sql, args: args as InValue[] })
      if (!res.rows.length) return undefined
      return rowToPlain<T>(res.rows[0] as unknown as Record<string, unknown>)
    },
    async all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> {
      const res = await exec.execute({ sql, args: args as InValue[] })
      return res.rows.map(r => rowToPlain<T>(r as unknown as Record<string, unknown>))
    },
    async run(sql: string, ...args: unknown[]): Promise<{ changes: number }> {
      const res = await exec.execute({ sql, args: args as InValue[] })
      return { changes: Number(res.rowsAffected ?? 0) }
    },
  }
}

export const db = {
  async get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | undefined> {
    await ensureInitialized()
    return wrapExecutor(rawClient).get<T>(sql, ...args)
  },
  async all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> {
    await ensureInitialized()
    return wrapExecutor(rawClient).all<T>(sql, ...args)
  },
  async run(sql: string, ...args: unknown[]): Promise<{ changes: number }> {
    await ensureInitialized()
    return wrapExecutor(rawClient).run(sql, ...args)
  },
  async exec(sql: string): Promise<void> {
    await ensureInitialized()
    await rawClient.executeMultiple(sql)
  },
  async transaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
    await ensureInitialized()
    const tx = await rawClient.transaction('write')
    try {
      const result = await fn(wrapExecutor(tx))
      await tx.commit()
      return result
    } catch (err) {
      try { await tx.rollback() } catch {}
      throw err
    }
  },
}
