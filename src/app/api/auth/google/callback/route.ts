/**
 * GET /api/auth/google/callback
 * Valida state CSRF, intercambia code por access_token con Google, consulta userinfo,
 * crea o recupera el usuario en BD, firma JWT de sesión HttpOnly y redirige a la web.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import {
  COOKIE_NAME,
  INACTIVITY_TTL_MINUTES,
  hashPassword,
  signJWT,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

const OAUTH_STATE_COOKIE = 'cbs_google_oauth_state'

function getAppOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (configured) return configured
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    return `${proto}://${forwardedHost}`
  }
  return new URL(request.url).origin
}

function redirectWithError(origin: string, code: string) {
  const res = NextResponse.redirect(`${origin}/index.html?v=4.0&auth_error=${encodeURIComponent(code)}`)
  res.cookies.delete(OAUTH_STATE_COOKIE)
  return res
}

function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request)

  try {
    const oauthError = request.nextUrl.searchParams.get('error')
    if (oauthError) {
      return redirectWithError(origin, oauthError === 'access_denied' ? 'google_cancelled' : 'google_failed')
    }

    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const savedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value

    if (!code || !state || !savedState || !statesMatch(state, savedState)) {
      return redirectWithError(origin, 'google_state')
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
    if (!clientId || !clientSecret) {
      return redirectWithError(origin, 'google_not_configured')
    }

    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    })

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
      cache: 'no-store',
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => '')
      console.error('[google/callback] token exchange failed:', tokenRes.status, errBody.slice(0, 200))
      return redirectWithError(origin, 'google_token')
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string }
    if (!tokenData.access_token) {
      console.error('[google/callback] missing access_token in Google response')
      return redirectWithError(origin, 'google_token')
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      cache: 'no-store',
    })

    if (!userInfoRes.ok) {
      console.error('[google/callback] userinfo failed:', userInfoRes.status)
      return redirectWithError(origin, 'google_failed')
    }

    const profile = (await userInfoRes.json()) as {
      email?: string
      email_verified?: boolean
      name?: string
      picture?: string
    }

    if (!profile.email || profile.email_verified === false) {
      return redirectWithError(origin, 'google_failed')
    }

    const emailNorm = profile.email.trim().toLowerCase()
    let user = await db.get<{
      id: string
      nombre: string
      email: string
      celular: string
      avatar: string | null
      rol: string
    }>(
      'SELECT id, nombre, email, celular, avatar, rol FROM usuarios WHERE LOWER(email) = ?',
      emailNorm
    )

    if (user) {
      if (profile.picture && !user.avatar) {
        await db.run('UPDATE usuarios SET avatar = ? WHERE id = ?', profile.picture, user.id)
        user.avatar = profile.picture
      }
    } else {
      const id = 'usr_g_' + randomUUID().replace(/-/g, '').slice(0, 14)
      const nombre = (profile.name?.trim() || emailNorm.split('@')[0]).slice(0, 80)
      const passwordHash = await hashPassword(randomBytes(32).toString('hex'))
      const avatar = profile.picture || null

      await db.run(
        `INSERT INTO usuarios (id, nombre, email, celular, password_hash, avatar, rol)
         VALUES (?, ?, ?, '', ?, ?, 'cliente')`,
        id,
        nombre,
        emailNorm,
        passwordHash,
        avatar
      )

      user = {
        id,
        nombre,
        email: emailNorm,
        celular: '',
        avatar,
        rol: 'cliente',
      }
    }

    const token = await signJWT({
      userId: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol as 'cliente' | 'admin',
    })

    const destUrl =
      user.rol === 'admin'
        ? `${origin}/admin`
        : `${origin}/index.html?v=4.0&google_login=1`

    const res = NextResponse.redirect(destUrl)
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: INACTIVITY_TTL_MINUTES * 60,
      path: '/',
    })
    res.cookies.delete(OAUTH_STATE_COOKIE)
    return res
  } catch (err) {
    console.error('[google/callback]', err)
    return redirectWithError(origin, 'google_failed')
  }
}
