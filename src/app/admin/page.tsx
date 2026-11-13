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

  let rol = 'cliente'
  try {
    const row = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(session.userId) as { rol: string } | undefined
    rol = row?.rol ?? 'cliente'
  } catch {}

  if (rol !== 'admin') redirect('/?denied=1')

  return (
    <div className={`${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <AdminDashboard />
    </div>
  )
}
