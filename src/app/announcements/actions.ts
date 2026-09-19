'use server'

import { revalidatePath } from 'next/cache'
import { evaluateAndUnlockAchievements, type UnlockedAchievement } from '@/lib/achievements/unlock'
import {
  announcementPublishSuccessMessage,
  deliverAnnouncementNotifications,
} from '@/lib/announcements/announcement-orchestrator'
import {
  normalizeAudienceScope,
  regularAdminMayManageAudienceScope,
  targetingIncludesKisotsu,
  type AnnouncementAudienceScope,
} from '@/lib/announcements/audience-scope'
import {
  fetchAllKisotsuStudentIds,
  requireAdminAccess,
} from '@/lib/auth/admin-access'
import { createClient } from '@/lib/supabase/server'

export type AnnouncementActionState = {
  error?: string
  success?: boolean
  successMessage?: string
}

function revalidateAnnouncementPaths() {
  revalidatePath('/admin/announcements')
  revalidatePath('/dashboard/announcements')
  revalidatePath('/dashboard')
}

function parseTargeting(formData: FormData): {
  targetAll: boolean
  tagIds: string[]
  studentIds: string[]
  error?: string
} {
  const targetAll = formData.get('targetAll') === 'on'
  const tagIds = formData.getAll('targetTagIds').map(String).filter(Boolean)
  const studentIds = formData.getAll('targetStudentIds').map(String).filter(Boolean)

  if (!targetAll && tagIds.length === 0 && studentIds.length === 0) {
    return {
      targetAll: false,
      tagIds: [],
      studentIds: [],
      error: '全員配信にするか、タグまたは生徒を1つ以上指定してください',
    }
  }

  return { targetAll, tagIds, studentIds }
}

async function resolveAudienceScopeForAdmin(params: {
  isSuperAdmin: boolean
  targetAll: boolean
  tagIds: string[]
  studentIds: string[]
}): Promise<{ scope: AnnouncementAudienceScope; error?: string }> {
  if (params.targetAll) {
    if (params.isSuperAdmin) return { scope: 'all' }
    return { scope: 'enrolled' }
  }

  const supabase = await createClient()
  const { data: tags } = await supabase
    .from('student_tags')
    .select('id, category, name')
    .in('id', params.tagIds.length > 0 ? params.tagIds : ['00000000-0000-0000-0000-000000000000'])

  const kisotsuIds = new Set(await fetchAllKisotsuStudentIds())
  if (
    targetingIncludesKisotsu({
      tagIds: params.tagIds,
      studentIds: params.studentIds,
      tags: (tags ?? []) as Array<{ id: string; category: string; name: string }>,
      kisotsuStudentIds: kisotsuIds,
    })
  ) {
    if (!params.isSuperAdmin) {
      return {
        scope: 'targeted',
        error: '既卒生を含む配信先は指定できません',
      }
    }
  }

  return { scope: 'targeted' }
}

async function saveAnnouncementTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  announcementId: string,
  scope: AnnouncementAudienceScope,
  tagIds: string[],
  studentIds: string[],
) {
  await supabase.from('announcement_target_tags').delete().eq('announcement_id', announcementId)
  await supabase.from('announcement_target_students').delete().eq('announcement_id', announcementId)

  if (scope === 'all' || scope === 'enrolled') return

  if (tagIds.length > 0) {
    await supabase.from('announcement_target_tags').insert(
      tagIds.map((tagId) => ({ announcement_id: announcementId, tag_id: tagId })),
    )
  }

  if (studentIds.length > 0) {
    await supabase.from('announcement_target_students').insert(
      studentIds.map((studentId) => ({
        announcement_id: announcementId,
        student_id: studentId,
      })),
    )
  }
}

export async function createAnnouncement(
  _prev: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  const access = await requireAdminAccess()
  if (!access.ok) return { error: access.error }

  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const { targetAll, tagIds, studentIds, error: targetError } = parseTargeting(formData)

  if (!title) return { error: 'タイトルを入力してください' }
  if (!body) return { error: '本文を入力してください' }
  if (targetError) return { error: targetError }

  const resolved = await resolveAudienceScopeForAdmin({
    isSuperAdmin: access.isSuperAdmin,
    targetAll,
    tagIds,
    studentIds,
  })
  if (resolved.error) return { error: resolved.error }
  if (!access.isSuperAdmin && !regularAdminMayManageAudienceScope(resolved.scope)) {
    return { error: 'この配信範囲は大管理者のみ設定できます' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: created, error } = await supabase
    .from('announcements')
    .insert({
      title,
      body,
      created_by: user?.id ?? null,
      audience_scope: resolved.scope,
      target_all: resolved.scope === 'all',
    })
    .select('id')
    .single()

  if (error || !created) return { error: '投稿に失敗しました' }

  await saveAnnouncementTargets(
    supabase,
    created.id,
    resolved.scope,
    tagIds,
    studentIds,
  )

  let successMessage = 'お知らせを公開しました'
  try {
    const summary = await deliverAnnouncementNotifications({
      announcementId: created.id,
      title,
      targetAll: resolved.scope === 'all',
      audienceScope: resolved.scope,
      tagIds,
      studentIds,
    })
    successMessage = announcementPublishSuccessMessage(summary)
  } catch {
    console.error('[announcements] notification failed after save')
    successMessage = 'お知らせは公開しましたが、通知を送信できませんでした'
  }

  revalidateAnnouncementPaths()
  return { success: true, successMessage }
}

export async function updateAnnouncement(
  _prev: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  const access = await requireAdminAccess()
  if (!access.ok) return { error: access.error }

  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const { targetAll, tagIds, studentIds, error: targetError } = parseTargeting(formData)

  if (!id || !title || !body) return { error: '必須項目を入力してください' }
  if (targetError) return { error: targetError }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('announcements')
    .select('id, audience_scope, target_all')
    .eq('id', id)
    .maybeSingle<{ id: string; audience_scope: string | null; target_all: boolean }>()

  if (!existing) return { error: '対象が見つかりません' }

  const existingScope = normalizeAudienceScope(existing.audience_scope, existing.target_all)
  if (!access.isSuperAdmin && !regularAdminMayManageAudienceScope(existingScope)) {
    return { error: '対象が見つかりません' }
  }

  const resolved = await resolveAudienceScopeForAdmin({
    isSuperAdmin: access.isSuperAdmin,
    targetAll,
    tagIds,
    studentIds,
  })
  if (resolved.error) return { error: resolved.error }
  if (!access.isSuperAdmin && !regularAdminMayManageAudienceScope(resolved.scope)) {
    return { error: 'この配信範囲は大管理者のみ設定できます' }
  }

  const { error } = await supabase
    .from('announcements')
    .update({
      title,
      body,
      audience_scope: resolved.scope,
      target_all: resolved.scope === 'all',
    })
    .eq('id', id)

  if (error) return { error: '更新に失敗しました' }

  await saveAnnouncementTargets(supabase, id, resolved.scope, tagIds, studentIds)

  revalidateAnnouncementPaths()
  revalidatePath(`/dashboard/announcements/${id}`)
  return { success: true }
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  const access = await requireAdminAccess()
  if (!access.ok) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  // RLS blocks unmanaged announcements for regular admins
  await supabase.from('announcements').delete().eq('id', id)
  revalidateAnnouncementPaths()
}

export async function markAnnouncementAsRead(announcementId: string): Promise<UnlockedAchievement[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !announcementId) return []

  const { data: existingRead } = await supabase
    .from('announcement_reads')
    .select('student_id')
    .eq('student_id', user.id)
    .eq('announcement_id', announcementId)
    .maybeSingle()

  if (existingRead) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  await supabase.from('announcement_reads').upsert(
    {
      student_id: user.id,
      announcement_id: announcementId,
      read_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,announcement_id' },
  )

  revalidatePath('/dashboard/announcements')
  revalidatePath(`/dashboard/announcements/${announcementId}`)
  revalidatePath('/admin/announcements')
  revalidatePath('/dashboard')

  if (profile?.role !== 'student') return []

  return evaluateAndUnlockAchievements(user.id)
}
