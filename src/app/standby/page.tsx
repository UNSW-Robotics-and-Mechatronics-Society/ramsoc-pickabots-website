import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACCESS_COOKIE, accessToken } from '@/lib/access'
import StandbyForm from './StandbyForm'

// The event access gate. Kept a Server Component so the code itself is never
// shipped to the browser (the form posts to /api/access instead), and so the
// "already unlocked → go straight in" check reads the httpOnly cookie, which
// client JS deliberately can't see.
export default async function StandbyPage() {
  const cookieStore = await cookies()
  if (cookieStore.get(ACCESS_COOKIE)?.value === (await accessToken())) redirect('/voting')

  return <StandbyForm />
}
