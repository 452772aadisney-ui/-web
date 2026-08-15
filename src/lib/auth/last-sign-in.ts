import { createAdminClient } from '@/lib/supabase/admin'

export async function fetchStudentLastSignInMap(): Promise<Map<string, string | null>> {
  const supabase = createAdminClient()
  const map = new Map<string, string | null>()

  if (!supabase) {
    return map
  }

  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })

    if (error) {
      console.error('[auth] listUsers failed:', error.message)
      break
    }

    if (!data.users.length) break

    for (const user of data.users) {
      map.set(user.id, user.last_sign_in_at ?? null)
    }

    if (data.users.length < perPage) break
    page += 1
  }

  return map
}

export function formatLastSignInAt(iso: string | null | undefined): string {
  if (!iso) return '未ログイン'

  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
