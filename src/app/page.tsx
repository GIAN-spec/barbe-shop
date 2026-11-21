import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const params = new URLSearchParams({ v: '4.0' })
  if (sp.auth) params.set('auth', String(sp.auth))
  if (sp.denied) params.set('denied', String(sp.denied))
  redirect(`/index.html?${params.toString()}`)
}
