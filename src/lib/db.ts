/**
 * db.ts — Singleton de conexión SQLite para Chino Barber Shop.
 * Inicializa las tablas si no existen y devuelve la misma instancia
 * durante toda la vida del proceso de Node.js (compatible con Next.js dev).
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import bcrypt from 'bcryptjs'

function getDatabasePath(): string {
  const localDb = path.resolve(process.cwd(), 'db', 'custom.db')
  // En Vercel el filesystem de la app es de solo lectura; usamos /tmp
  if (process.env.VERCEL) {
    const tmpDb = path.join('/tmp', 'custom.db')
    if (!fs.existsSync(tmpDb)) {
      if (fs.existsSync(localDb)) {
        try {
          fs.copyFileSync(localDb, tmpDb)
        } catch (e) {
          console.error('[DB] Error al copiar DB a /tmp:', e)
        }
      }
    }
    return tmpDb
  }
  return localDb
}

const DB_PATH = getDatabasePath()

// Singleton global para evitar múltiples conexiones en hot-reload de Next.js
const SCHEMA_VERSION = 3
const globalForDb = globalThis as unknown as { __db: Database.Database | undefined; __dbSchemaV?: number }

export const db: Database.Database =
  globalForDb.__db ??
  (() => {
    const instance = new Database(DB_PATH)
    if (process.env.VERCEL) {
      instance.pragma('journal_mode = DELETE')
    } else {
      instance.pragma('journal_mode = WAL')
    }
    instance.pragma('foreign_keys = ON')
    instance.pragma('synchronous = NORMAL')
    instance.pragma('cache_size = -2000')
    return instance
  })()

// Las migraciones se re-ejecutan si cambia la versión de esquema (también tras hot-reload)
if (globalForDb.__dbSchemaV !== SCHEMA_VERSION) {
  initSchema(db)
  seedDemoData(db)
  globalForDb.__dbSchemaV = SCHEMA_VERSION
}

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__db = db
}

/** Crea todas las tablas si no existen */
function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id          TEXT PRIMARY KEY,
      nombre      TEXT NOT NULL,
      email       TEXT UNIQUE,
      celular     TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
      id      TEXT PRIMARY KEY,
      nombre  TEXT NOT NULL,
      rol     TEXT NOT NULL,
      esp     TEXT NOT NULL,
      exp     TEXT NOT NULL,
      tags    TEXT NOT NULL DEFAULT '[]',
      foto    TEXT,
      activo  INTEGER NOT NULL DEFAULT 1,
      comision INTEGER NOT NULL DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS bloqueos (
      id         TEXT PRIMARY KEY,
      fecha      TEXT NOT NULL,
      hora       TEXT,
      motivo     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media (
      id      TEXT PRIMARY KEY,
      mime    TEXT NOT NULL,
      data    BLOB NOT NULL,
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
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_citas_fecha   ON citas(fecha);
    CREATE INDEX IF NOT EXISTS idx_citas_usuario ON citas(usuario_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_citas_slot_unico ON citas(fecha, hora, barbero) WHERE estado != 'cancelada';
    CREATE INDEX IF NOT EXISTS idx_sesiones_user ON sesiones(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_reset_user    ON password_resets(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_bloqueos_fecha ON bloqueos(fecha);
    CREATE INDEX IF NOT EXISTS idx_resenas_barbero ON resenas(barbero_id);
  `)

  // Migración suave para BDs existentes: columna rol en usuarios
  try {
    db.exec(`ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'cliente'`)
  } catch {
    // ya existe
  }

  // Migración suave: columna comision en barberos (default 50%)
  try {
    db.exec(`ALTER TABLE barberos ADD COLUMN comision INTEGER NOT NULL DEFAULT 50`)
  } catch {
    // ya existe
  }

  // Migración suave: columna orden en servicios (drag & drop del admin)
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN orden INTEGER NOT NULL DEFAULT 99`)
    // Normalizar una vez el orden de filas pre-existentes (por precio, luego inserción)
    db.exec(`UPDATE servicios SET orden = (
      SELECT COUNT(*) FROM servicios s2
      WHERE s2.precio < servicios.precio
         OR (s2.precio = servicios.precio AND s2.rowid < servicios.rowid)
    ) + 1`)
  } catch {
    // ya existe
  }

  // Migración suave: flag de notificación leída en citas (BLOQUE 6)
  try {
    db.exec(`ALTER TABLE citas ADD COLUMN leida INTEGER NOT NULL DEFAULT 1`)
  } catch {
    // ya existe
  }

  // Migraciones SaaS Admin: sellos VIP en usuarios, horarios en barberos, moderación en reseñas
  try { db.exec(`ALTER TABLE usuarios ADD COLUMN sellos_vip INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE usuarios ADD COLUMN notas TEXT`) } catch {}
  try { db.exec(`ALTER TABLE barberos ADD COLUMN horario TEXT NOT NULL DEFAULT 'Lun - Sáb · 09:00 - 21:00'`) } catch {}
  try { db.exec(`ALTER TABLE barberos ADD COLUMN dias_libres TEXT NOT NULL DEFAULT 'Domingo'`) } catch {}
  try { db.exec(`ALTER TABLE resenas ADD COLUMN estado TEXT NOT NULL DEFAULT 'aprobada'`) } catch {}
  try { db.exec(`ALTER TABLE resenas ADD COLUMN respuesta TEXT`) } catch {}

  // Tablas adicionales del Panel Admin SaaS (Productos, Pedidos, Galería, Ajustes)
  db.exec(`
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
  `)
  try { db.exec(`ALTER TABLE productos ADD COLUMN marca TEXT NOT NULL DEFAULT 'American Crew · Reserve'`) } catch {}
  try { db.exec(`ALTER TABLE productos ADD COLUMN presentacion TEXT NOT NULL DEFAULT '85 g'`) } catch {}
  try { db.exec(`ALTER TABLE productos ADD COLUMN desc TEXT NOT NULL DEFAULT ''`) } catch {}
}

/**
 * Seeds idempotentes: cuenta demo, catálogo de servicios y barberos.
 */
function seedDemoData(db: Database.Database) {
  const DEMO_EMAIL = 'carlos@demo.com'
  const exists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(DEMO_EMAIL)
  if (!exists) {
    const id = 'usr_demo_carlos01'
    const hash = bcrypt.hashSync('Password123!', 12)
    db.prepare(`
      INSERT INTO usuarios (id, nombre, email, celular, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, 'Carlos Mendoza', DEMO_EMAIL, '911222333', hash)
  }

  // Cuenta ADMIN (dueño) — BLOQUE 3.1
  const ADMIN_EMAIL = 'admin@chinobarber.com'
  const adminExists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(ADMIN_EMAIL)
  if (!adminExists) {
    const adminId = 'usr_admin_chino01'
    const adminHash = bcrypt.hashSync('Admin1234!', 12)
    db.prepare(`
      INSERT INTO usuarios (id, nombre, email, celular, password_hash, rol)
      VALUES (?, ?, ?, ?, ?, 'admin')
    `).run(adminId, 'Dueño Chino Barber', ADMIN_EMAIL, '999000111', adminHash)
  }

  // Catálogo de servicios (migra los datos que vivían en el frontend)
  const servicios: [string, string, string, string, number, number, string][] = [
    ['corte', 'corte', 'Corte de Cabello Signature', 'Corte personalizado con asesoría de visagismo, degradado a navaja y acabado con productos premium.', 35, 15, 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80'],
    ['corte_barba', 'combo', 'Combo Master: Corte + Barba', 'El servicio completo. Corte de cabello + perfilado y ritual de barba con toallas calientes y aceites hidratantes.', 50, 25, 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80'],
    ['barba', 'barba', 'Ritual de Barba & Toalla Caliente', 'Diseño y afeitado tradicional a navaja, vaporizador de ozono, bálsamo nutritivo y toalla aromatizada.', 25, 12, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80'],
    ['cejas', 'barba', 'Perfilado & Diseño de Cejas', 'Limpieza y definición milimétrica con navaja descartable para resaltar la mirada masculina.', 15, 5, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80'],
    ['ninos', 'corte', 'Corte Infantil Jr. (Hasta 10 años)', 'Atención paciente y divertida con sillón especial, golosina de premio y el mejor corte para los más pequeños.', 30, 12, 'https://images.unsplash.com/photo-1605497787865-e6d4762b386f?auto=format&fit=crop&w=800&q=80'],
    ['diseno', 'combo', 'Corte Artístico Freestyle con Diseño', 'Corte con líneas, figuras tribales o sombreados personalizados creados a mano alzada por nuestros barberos.', 45, 20, 'https://images.unsplash.com/photo-1593702295094-aea22597af65?auto=format&fit=crop&w=800&q=80'],
  ]
  const srvCount = db.prepare('SELECT COUNT(*) AS n FROM servicios').get() as { n: number }
  if (srvCount.n === 0) {
    const insS = db.prepare('INSERT INTO servicios (id, cat, nombre, desc, dur, precio, foto, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const tx = db.transaction(() => {
      servicios.forEach((s, i) => insS.run(...s, i + 1))
    })
    tx()
  }

  // Barberos
  const barberos: [string, string, string, string, string, string, string][] = [
    ['chino', 'Chino (Fundador)', 'Master Barber & Fundador', 'Fades de precisión, freestyle & visagismo', '9 años de exp.', '["Skin Fade","Freestyle","Navaja Clásica"]', '/barberos/chino.jpg'],
    ['diego', 'Diego Valdivia', 'Senior Barber & Barba Specialist', 'Rituales de barba, cortes clásicos a tijera', '6 años de exp.', '["Barba de Lujo","Tijera Clásica","Pompadour"]', '/barberos/diego.jpg'],
    ['marco', 'Marco Sotomayor', 'Estilista & Tendencias Urbanas', 'Texturizados modernos, taper fades y colorimetría', '5 años de exp.', '["Texturas","Taper Fade","Diseños"]', '/barberos/marco.jpg'],
  ]
  const barCount = db.prepare('SELECT COUNT(*) AS n FROM barberos').get() as { n: number }
  if (barCount.n === 0) {
    const insB = db.prepare('INSERT INTO barberos (id, nombre, rol, esp, exp, tags, foto) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const tx = db.transaction(() => {
      for (const b of barberos) insB.run(...b)
    })
    tx()
  }

  // Reseñas de clientes
  const resCount = db.prepare('SELECT COUNT(*) AS n FROM resenas').get() as { n: number }
  if (resCount.n === 0) {
    const resenas: [string, string, string, string, number, string][] = [
      ['res_1', 'Carlos Mendoza', 'diego', 'corte_barba', 5, 'La atención es de otro nivel. Cero esperas, me atendió Diego con toalla caliente y café mientras me afeitaba. 100% recomendado.'],
      ['res_2', 'Rodrigo Benavides', 'chino', 'corte', 5, 'Chino es un genio con los degradados. La plataforma de reservas funciona impecable y el comprobante se valida en el acto.'],
      ['res_3', 'Álvaro Quintana', 'marco', 'barba', 5, 'Excelente ambiente y música. Reservé a las 6:30 pm y a las 6:29 ya me estaban invitando al sillón. Profesionales de verdad.'],
    ]
    const insR = db.prepare('INSERT OR IGNORE INTO resenas (id, cliente_nombre, barbero_id, servicio_id, calificacion, comentario) VALUES (?, ?, ?, ?, ?, ?)')
    const tx = db.transaction(() => {
      for (const r of resenas) insR.run(...r)
    })
    tx()
  }

  // Catálogo oficial de 15 Productos (con imágenes reales de /public/productos/prod-XX)
  const brokenCheck = db.prepare(`SELECT COUNT(*) AS n FROM productos WHERE img LIKE '/productos/polvo%'`).get() as { n: number }
  if (brokenCheck.n > 0) {
    db.exec('DELETE FROM productos')
  }
  const prodCount = db.prepare('SELECT COUNT(*) AS n FROM productos').get() as { n: number }
  if (prodCount.n === 0) {
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
    const insP = db.prepare(`
      INSERT INTO productos (id, nombre, cat, marca, presentacion, desc, precio, stock, img, badge, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `)
    db.transaction(() => {
      for (const p of productos) insP.run(...p)
    })()
  }

  // Galería Lookbook (8 fotos)
  const galCount = db.prepare('SELECT COUNT(*) AS n FROM galeria').get() as { n: number }
  if (galCount.n === 0) {
    const fotos: [string, string, string, string, number][] = [
      ['gal_1', 'Skin Fade + Diseño de Barba', 'Fade', 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80', 1],
      ['gal_2', 'Ritual de Barba con Toalla Caliente', 'Barba', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80', 2],
      ['gal_3', 'Pompadour Clásico a Tijera', 'Clásico', 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80', 3],
      ['gal_4', 'Crop Texturizado & Mid Fade', 'Textura', 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80', 4],
      ['gal_5', 'Taper Fade Urbano', 'Fade', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80', 5],
      ['gal_6', 'Perfilado de Barba a Navaja', 'Barba', 'https://images.unsplash.com/photo-1517832606699-7ae9b720a186?auto=format&fit=crop&w=800&q=80', 6],
    ]
    const insG = db.prepare('INSERT INTO galeria (id, titulo, cat, url, orden, activo) VALUES (?, ?, ?, ?, ?, 1)')
    db.transaction(() => {
      for (const g of fotos) insG.run(...g)
    })()
  }

  // Ajustes del Negocio por defecto
  const ajExists = db.prepare('SELECT clave FROM ajustes WHERE clave = ?').get('negocio')
  if (!ajExists) {
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
    db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?)').run('negocio', JSON.stringify(defaultAjustes))
  }
}
