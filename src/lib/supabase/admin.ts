import { createClient } from '@supabase/supabase-js'

/**
 * server-only Admin Client（service role）。
 * RLS を迂回するため、auth.getUser() による本人確認と入力検証の後にだけ使うこと。
 * SUPABASE_SERVICE_ROLE_KEY / 本クライアントをブラウザや Client Component に渡さないこと。
 * Push 購読・通知イベント/配信の書き込みも、後工程では本クライアント経由のみとする。
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    return null
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
