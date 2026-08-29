import { createAdminClient } from '@/lib/supabase/admin'

export async function fetchStudentLastAccessMap(): Promise<Map<string, string | null>> {
  const supabase = createAdminClient()
  const map = new Map<string, string | null>()

  if (!supabase) {
    return map
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, last_accessed_at')
    .eq('role', 'student')

  if (error) {
    console.error('[auth] fetchStudentLastAccessMap failed:', error.message)
    return map
  }

  for (const profile of data ?? []) {
    map.set(String(profile.id), profile.last_accessed_at ? String(profile.last_accessed_at) : null)
  }

  return map
}

export function formatLastAccessedAt(iso: string | null | undefined): string {
  if (!iso) return '未アクセス'

  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
