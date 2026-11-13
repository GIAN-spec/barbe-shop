// Inspección: categorías de servicios
// eslint-disable-next-line @typescript-eslint/no-require-imports
const m = require('better-sqlite3')
const d = new m('db/custom.db')
const t = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%cate%'").all()
console.log('tabla categorias:', JSON.stringify(t))
console.log('cols servicios:', d.prepare('PRAGMA table_info(servicios)').all().map(c => c.name).join(', '))
console.log('cats actuales:', d.prepare('SELECT DISTINCT cat FROM servicios').all().map(r => r.cat).join(', '))
d.close()
