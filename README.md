# 💈 Chino Barber Shop — Sistema de Reservas

Sistema completo de reservas para barbería: web pública (SPA vanilla guarda en `public/index.html` servida vía iframe), API en Next.js App Router, base de datos SQLite (better-sqlite3) y panel de administración en React (`/admin`).

## ⚡ Ejecutar

```bash
npm install
npm run dev        # http://localhost:3000
```

Build de producción (standalone):

```bash
npm run build      # genera .next/standalone
npm run start      # NODE_ENV=production node .next/standalone/server.js
```

## 🔑 Cuentas

| Rol | Usuario | Contraseña |
|---|---|---|
| Dueño (panel `/admin`) | `admin@chinobarber.com` | `Admin1234!` |
| Cliente demo | `carlos@demo.com` | `OtraClave77` |

> ⚠️ Cambia estas contraseñas antes de usar en producción (o desactiva la semilla en `src/lib/db.ts`).

## 🗂 Estructura clave

- `db/custom.db` — SQLite (WAL). Se crea y siembra sola al primer arranque (`src/lib/db.ts`); migraciones suaves idempotentes.
- `public/index.html` — SPA completa del cliente (catálogo se carga de la BD vía API).
- `src/app/api/**` — endpoints REST:
  - `auth/*`: login, register, logout, recuperar, reset
  - `citas`: listar/crear/patch (cliente + validación bloqueos y política de cancelación 2h), `disponibilidad` (pública)
  - `servicios`, `barberos`: catálogo público (respeta el orden fijado en el panel)
  - `admin/*`: agenda, estados, servicios/barberos (edición + drag & drop de `orden`), bloqueos, dashboard (métricas + notificaciones)
- `src/app/admin/**` — panel del dueño (guard SSR + APIs protegidas por rol).
- `src/proxy.ts` — protección de rutas (`/api/citas`, `/api/usuario/perfil`, `/api/admin/*`).
- `src/lib/` — `db.ts`, `auth.ts` (bcrypt + JWT jose + cookies HttpOnly con sesión deslizante 30 min inactividad / 12h tope), `session-token.ts`, `rate-limit.ts`.

## 🔒 Seguridad

- Contraseñas con bcrypt (cost 12), JWT HS256 en cookie HttpOnly/SameSite.
- Rate limit de login (5 fallos / 15 min → 429 + Retry-After).
- Destroy/recuperación de contraseña por token hash SHA-256 de un solo uso (30 min).
- Roles: `cliente` | `admin` (el cliente no puede confirmar/pagar/completar citas; solo cancelar/reagendar con reglas).

## 🚀 Despliegue / notas

- La BD es un archivo: respáldala copiando `db/custom.db` (`-wal`/`-shm` también si están).
- Variables recomendadas en producción: mover el secreto JWT fuera de código (ver `src/lib/session-token.ts`), forzar `secure: true` en cookies (HTTPS) y TLS delante.
- Puerto configurable con `-p` en dev o `PORT` en producción.
