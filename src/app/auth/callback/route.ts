import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import type { Profile } from '@/types/database'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user && (!next || next === '/')) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single<Pick<Profile, 'role'>>()

        const redirectPath = getDashboardPathForRole(profile?.role ?? 'student')
        return NextResponse.redirect(`${origin}${redirectPath}`)
      }

      return NextResponse.redirect(`${origin}${next ?? '/'}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
