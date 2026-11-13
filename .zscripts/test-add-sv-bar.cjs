// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('http')

function req(method, path, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      host: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => resolve({ status: res.statusCode, setCookie: res.headers['set-cookie'], body: buf }))
    })
    req.on('error', (e) => resolve({ status: 0, body: String(e) }))
    if (data) req.end(data); else req.end()
  })
}

;(async () => {
  const login = await req('POST', '/api/auth/login', { identifier: 'admin@chinobarber.com', password: 'Admin1234!' })
  const cookie = (login.setCookie || []).map((c) => c.split(';')[0]).join('; ')
  console.log('login', login.status, 'cookie:', cookie.slice(0, 40) + '...')

  const s = await req('POST', '/api/admin/servicios', { nombre: 'Corte Prueba Temporal', cat: 'corte', precio: 12, dur: 20, desc: 'test' }, cookie)
  console.log('POST servicios', s.status, s.body)

  const b = await req('POST', '/api/admin/barberos', { nombre: 'Prueba Barbero Temporal', rol: 'Junior Barber', exp: '1 año de exp.', tags: 'fade, test' }, cookie)
  console.log('POST barberos', b.status, b.body)

  const barberoId = b.status === 201 ? JSON.parse(b.body).barbero.id : null
  if (barberoId) {
    const f1 = await req('PATCH', '/api/admin/barberos', { id: barberoId, foto: 'data:invalid-url-test' }, cookie)
    console.log('PATCH foto url', f1.status, f1.body.slice(0, 120))
    const f2 = await req('PATCH', '/api/admin/barberos', { id: barberoId, foto: null }, cookie)
    console.log('PATCH quitar foto', f2.status, f2.body.slice(0, 120))

    const l = await req('GET', '/api/admin/barberos', null, cookie)
    const created = JSON.parse(l.body).barberos.find((x) => x.id === barberoId)
    console.log('barbero creado -> nombre:', created.nombre, '| rol:', created.rol, '| tags:', created.tags, '| foto:', created.foto)
  }

  console.log('ids de prueba: servicio="Corte Prueba Temporal" barberoId=' + barberoId)
})()

