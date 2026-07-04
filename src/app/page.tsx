import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'

export default async function HomePage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  redirect(getDashboardPathForRole(profile.role))
}
