// Test: lista primeros servicios (ids reales)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const m = require('better-sqlite3')
const d = new m('db/custom.db')
console.log(JSON.stringify(d.prepare('SELECT id, nombre, foto FROM servicios LIMIT 5').all(), null, 1))
d.close()
