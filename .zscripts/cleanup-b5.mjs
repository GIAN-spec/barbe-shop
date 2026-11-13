// Limpieza de datos de prueba del Bloque 5
import Database from 'better-sqlite3'
const db = new Database('db/custom.db')
const manana = new Date(Date.now() + 2 * 864e5).toISOString().split('T')[0]
const delC = db.prepare("DELETE FROM citas WHERE notas = 'Prueba B5' OR nombre IN ('Q', 'X') OR (usuario_id IS NOT NULL AND fecha = ?)").run(manana)
const delB = db.prepare("DELETE FROM bloqueos WHERE motivo LIKE 'Prueba%'").run()
console.log('citas borradas:', delC.changes, '| bloqueos borrados:', delB.changes)
db.close()
