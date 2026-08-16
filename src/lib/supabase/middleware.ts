import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Profile } from '@/types/database'
import { getDashboardPathForRole, isAuthPath } from '@/lib/auth/routes'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

async function getProfileRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<Profile['role'] | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<Pick<Profile, 'role'>>()

  return profile?.role ?? null
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Vercel Cron など、未ログインで叩く API は認証リダイレクトの対象外
  if (pathname.startsWith('/api/cron')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthCallback = pathname.startsWith('/auth/callback')

  if (!user && !isAuthPath(pathname) && !isAuthCallback) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    const needsRole =
      isAuthPath(pathname) ||
      pathname === '/' ||
      pathname.startsWith('/admin')

    let role: Profile['role'] | null = null
    if (needsRole) {
      role = (await getProfileRole(supabase, user.id)) ?? 'student'
    }

    if (pathname === '/reset-password') {
      return supabaseResponse
    }

    if (isAuthPath(pathname) && role) {
      const url = request.nextUrl.clone()
      url.pathname = getDashboardPathForRole(role)
      return NextResponse.redirect(url)
    }

    if (pathname === '/' && role) {
      const url = request.nextUrl.clone()
      url.pathname = getDashboardPathForRole(role)
      return NextResponse.redirect(url)
    }

    if (pathname.startsWith('/admin') && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = getDashboardPathForRole('student')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
