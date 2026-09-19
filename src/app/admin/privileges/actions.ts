'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdminAccess } from '@/lib/auth/admin-access'
import { createClient } from '@/lib/supabase/server'

export type PrivilegeActionState = {
  error?: string
  success?: boolean
}

export async function listAdminsForPrivilegeManagement(): Promise<
  Array<{
    id: string
    full_name: string
    display_name: string
    email: string
    is_super_admin: boolean
  }>
> {
  const access = await requireSuperAdminAccess()
  if (!access.ok) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email, is_super_admin')
    .eq('role', 'admin')
    .order('full_name')

  return (data ?? []).map((row) => ({
    id: row.id as string,
    full_name: row.full_name as string,
    display_name: row.display_name as string,
    email: row.email as string,
    is_super_admin: Boolean(row.is_super_admin),
  }))
}

export async function setAdminSuperPrivilegeAction(
  _prev: PrivilegeActionState,
  formData: FormData,
): Promise<PrivilegeActionState> {
  const access = await requireSuperAdminAccess()
  if (!access.ok) return { error: access.error }

  const targetId = String(formData.get('targetId') ?? '').trim()
  const makeSuper = formData.get('makeSuper') === 'true'
  const confirmed = formData.get('confirmed') === 'on'
  if (!targetId) return { error: '対象が指定されていません' }
  if (!confirmed) return { error: '変更内容を確認してください' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_admin_super_privilege', {
    p_target_id: targetId,
    p_make_super: makeSuper,
  })

  if (error) {
    if (error.message.includes('last super admin')) {
      return { error: '最後の大管理者は降格できません' }
    }
    return { error: '権限の変更に失敗しました' }
  }

  revalidatePath('/admin/privileges')
  revalidatePath('/admin')
  return { success: true }
}
