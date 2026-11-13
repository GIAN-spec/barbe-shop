// eslint-disable-next-line @typescript-eslint/no-require-imports
const m = require('better-sqlite3')
const d = new m('db/custom.db')
console.log('borradas:', d.prepare("DELETE FROM citas WHERE id = 'cita_b759309e5bb04aa7'").run().changes)
console.log('restantes:', JSON.stringify(d.prepare('SELECT COUNT(*) n FROM citas').get()))

