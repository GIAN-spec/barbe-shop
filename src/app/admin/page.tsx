import { redirect } from 'next/navigation'
import { Inter, Manrope, JetBrains_Mono } from 'next/font/google'
import { getSessionFromCookie } from '@/lib/auth'
import { db } from '@/lib/db'
import AdminDashboard from './admin-dashboard'

export const dynamic = 'force-dynamic'

// Tipografías del panel (self-hosted por next/font: sin peticiones a Google, sin saltos de layout)
const fontBody = Inter({ subsets: ['latin'], variable: '--font-admin-body', display: 'swap' })
const fontDisplay = Manrope({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-admin-display', display: 'swap' })
const fontMono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-admin-mono', display: 'swap' })

export default async function AdminPage() {
  // Guardia de servidor — solo el dueño entra
  const session = await getSessionFromCookie()
  if (!session) redirect('/?auth=admin')

  let adminUser: { nombre: string; email: string } | null = null
  let rol = 'cliente'
  try {
    const row = await db.get<{ nombre: string; email: string | null; rol: string }>(
      'SELECT nombre, email, rol FROM usuarios WHERE id = ?',
      session.userId
    )
    rol = row?.rol ?? 'cliente'
    if (row) {
      adminUser = {
        nombre: row.nombre || session.nombre,
        email: row.email ?? session.email ?? '',
      }
    }
  } catch {}

  if (rol !== 'admin') redirect('/?denied=1')

  return (
    <div className={`${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <AdminDashboard adminUser={adminUser ?? undefined} />
    </div>
  )
}
