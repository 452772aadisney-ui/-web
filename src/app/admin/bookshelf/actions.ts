'use server'

import { revalidatePath } from 'next/cache'
import {
  filterGraduatesFromStudentIds,
  requireAdminAccess,
} from '@/lib/auth/admin-access'
import { createClient } from '@/lib/supabase/server'
import { TEXTBOOK_USAGE_TAGS } from '@/lib/constants/textbook-tags'
import {
  parseDetailTagsFromForm,
  resolveTextbookSubjectTags,
} from '@/lib/textbooks/subject-tags'
import { resolveTextbookCoverUrl } from '@/lib/textbooks/cover-url'
import type { TextbookCatalogVisibility } from '@/types/textbook'
export type CatalogActionState = {
  error?: string
  success?: boolean
}

async function requireBookshelfAdmin() {
  const access = await requireAdminAccess()
  if (!access.ok) return { ok: false as const, error: access.error }
  return { ok: true as const, access }
}

function parseSubjects(formData: FormData): string[] {
  return resolveTextbookSubjectTags(parseDetailTagsFromForm(formData)).subjects
}

function parseDetailTags(formData: FormData): string[] {
  return resolveTextbookSubjectTags(parseDetailTagsFromForm(formData)).detail_tags
}
function parseUsageTags(formData: FormData): string[] {
  return TEXTBOOK_USAGE_TAGS.filter((tag) => formData.get(`usage_${tag}`) === 'on')
}

function parseStringList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean)
}

function parseOptionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim()
  return value || null
}

function parseCatalogMetadata(formData: FormData) {
  const rawCoverUrl = parseOptionalText(formData, 'coverUrl')
  return {
    detail_tags: parseStringList(formData, 'detailTags'),
    publisher: parseOptionalText(formData, 'publisher'),
    cover_url: resolveTextbookCoverUrl(rawCoverUrl),
    study_purposes: parseStringList(formData, 'studyPurposes'),
    target_universities: parseStringList(formData, 'targetUniversities'),
  }
}

function parseStudentIds(formData: FormData): string[] {
  return formData
    .getAll('studentIds')
    .map((value) => String(value).trim())
    .filter(Boolean)
}

function parseTextbookIdsJson(formData: FormData): Record<string, string> {
  try {
    const raw = String(formData.get('textbookIdsJson') ?? '{}')
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed ?? {}
  } catch {
    return {}
  }
}

function revalidateCatalogPaths(studentIds: string[] = []) {
  revalidatePath('/admin/bookshelf')
  revalidatePath('/admin/bookshelf/search')
  revalidatePath('/admin/textbooks')
  revalidatePath('/dashboard/bookshelf')
  revalidatePath('/dashboard')
  for (const studentId of studentIds) {
    revalidatePath(`/admin/students/${studentId}`)
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard/study')
  }
}

async function syncStudentAssignments(input: {
  userId: string
  isSuperAdmin: boolean
  selectedStudentIds: string[]
  textbookIdsByStudent: Record<string, string>
  catalogId: string | null
  name: string
  subjects: string[]
  detailTags: string[]
  usageTags: string[]
  metadata?: ReturnType<typeof parseCatalogMetadata>}): Promise<CatalogActionState> {
  const supabase = await createClient()
  const selectedStudentIds = await filterGraduatesFromStudentIds(input.selectedStudentIds, {
    isSuperAdmin: input.isSuperAdmin,
  })
  const currentStudentIds = await filterGraduatesFromStudentIds(
    Object.keys(input.textbookIdsByStudent),
    { isSuperAdmin: input.isSuperAdmin },
  )
  const toRemove = currentStudentIds.filter((id) => !selectedStudentIds.includes(id))
  const affectedStudentIds = [...new Set([...selectedStudentIds, ...currentStudentIds])]

  for (const studentId of toRemove) {
    const textbookId = input.textbookIdsByStudent[studentId]
    if (!textbookId) continue
    const { error } = await supabase.from('textbooks').delete().eq('id', textbookId)
    if (error) return { error: '生徒の登録解除に失敗しました' }
  }

  for (const studentId of selectedStudentIds) {
    const textbookId = input.textbookIdsByStudent[studentId]
    if (textbookId) {
      const { error } = await supabase
        .from('textbooks')
        .update({
          name: input.name,
          subjects: input.subjects,
          detail_tags: input.detailTags,
          usage_tags: input.usageTags,
          catalog_id: input.catalogId,
          ...(input.metadata
            ? {
                cover_url: input.metadata.cover_url,
                publisher: input.metadata.publisher,
              }
            : {}),
        })
        .eq('id', textbookId)

      if (error) return { error: '教材の更新に失敗しました' }
      continue
    }

    const { error } = await supabase.from('textbooks').insert({
      student_id: studentId,
      name: input.name,
      subjects: input.subjects,
      detail_tags: input.detailTags,
      usage_tags: input.usageTags,
      catalog_id: input.catalogId,
      registered_by: input.userId,
      is_seen_by_student: false,
      ...(input.metadata
        ? {
            cover_url: input.metadata.cover_url,
            publisher: input.metadata.publisher,
          }
        : {}),
    })

    if (error) {
      if (error.code === '23505') {
        return { error: '選択した生徒の中に、既に同じ参考書を登録している生徒がいます' }
      }
      return { error: '生徒への登録に失敗しました' }
    }
  }

  revalidateCatalogPaths(affectedStudentIds)
  return { success: true }
}

export async function createTextbookCatalogEntry(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const auth = await requireBookshelfAdmin()
  if (!auth.ok) return { error: auth.error }

  const supabase = await createClient()
  const name = String(formData.get('name') ?? '').trim()
  const subjects = parseSubjects(formData)
  const detailTags = parseDetailTags(formData)
  const usageTags = parseUsageTags(formData)
  const metadata = parseCatalogMetadata(formData)
  const visibility = String(formData.get('visibility') ?? 'public') as TextbookCatalogVisibility

  if (!name) return { error: '参考書名を入力してください' }
  if (detailTags.length === 0) return { error: '科目タグを1つ以上選択してください' }
  if (usageTags.length === 0) return { error: '用途タグを1つ以上選択してください' }
  if (visibility !== 'public' && visibility !== 'private') {
    return { error: '公開設定が不正です' }
  }

  const { error } = await supabase.from('textbook_catalog').insert({
    name,
    subjects,
    usage_tags: usageTags,
    visibility,
    is_searchable: true,
    created_by: auth.access.profile.id,
    ...metadata,
  })

  if (error) return { error: '参考書の登録に失敗しました' }

  revalidateCatalogPaths()
  return { success: true }
}

export async function updateAdminBookshelfCatalogEntry(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const auth = await requireBookshelfAdmin()
  if (!auth.ok) return { error: auth.error }

  const supabase = await createClient()
  const catalogId = String(formData.get('catalogId') ?? '').trim()
  const isManagedCatalog = formData.get('isManagedCatalog') === 'true'
  const createCatalogMaster = formData.get('createCatalogMaster') === 'on'
  const name = String(formData.get('name') ?? '').trim()
  const subjects = parseSubjects(formData)
  const detailTags = parseDetailTags(formData)
  const usageTags = parseUsageTags(formData)
  const metadata = parseCatalogMetadata(formData)
  const visibility = String(formData.get('visibility') ?? 'public') as TextbookCatalogVisibility
  const selectedStudentIds = parseStudentIds(formData)
  const textbookIdsByStudent = parseTextbookIdsJson(formData)

  if (!catalogId) return { error: '参考書が指定されていません' }
  if (!name) return { error: '参考書名を入力してください' }
  if (detailTags.length === 0) return { error: '科目タグを1つ以上選択してください' }
  if (usageTags.length === 0) return { error: '用途タグを1つ以上選択してください' }
  if (visibility !== 'public' && visibility !== 'private') {
    return { error: '公開設定が不正です' }
  }

  let targetCatalogId = catalogId

  if (isManagedCatalog) {
    const { error } = await supabase
      .from('textbook_catalog')
      .update({
        name,
        subjects,
        usage_tags: usageTags,
        visibility,
        ...metadata,
      })
      .eq('id', catalogId)

    if (error) return { error: '参考書の更新に失敗しました' }

    if (Object.keys(textbookIdsByStudent).length === 0 && selectedStudentIds.length === 0) {
      revalidateCatalogPaths()
      return { success: true }
    }
  } else if (createCatalogMaster) {
    const { data: created, error } = await supabase
      .from('textbook_catalog')
      .insert({
        name,
        subjects,
        usage_tags: usageTags,
        visibility,
        is_searchable: false,
        created_by: auth.access.profile.id,
      })
      .select('id')
      .single<{ id: string }>()

    if (error || !created) return { error: '本棚マスタの作成に失敗しました' }
    targetCatalogId = created.id
  }

  if (targetCatalogId !== catalogId || !isManagedCatalog) {
    const ids = Object.values(textbookIdsByStudent)
    if (ids.length > 0) {
      const { error } = await supabase
        .from('textbooks')
        .update({ catalog_id: targetCatalogId })
        .in('id', ids)

      if (error) return { error: '本棚マスタへの紐づけに失敗しました' }
    }
  }

  return syncStudentAssignments({
    userId: auth.access.profile.id,
    isSuperAdmin: auth.access.isSuperAdmin,
    selectedStudentIds,
    textbookIdsByStudent,
    catalogId: targetCatalogId,
    name,
    subjects,
    detailTags,
    usageTags,
    metadata,
  })
}

export async function updateAdminBookshelfStudentEntry(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const auth = await requireBookshelfAdmin()
  if (!auth.ok) return { error: auth.error }

  const supabase = await createClient()
  const name = String(formData.get('name') ?? '').trim()
  const subjects = parseSubjects(formData)
  const detailTags = parseDetailTags(formData)
  const usageTags = parseUsageTags(formData)
  const metadata = parseCatalogMetadata(formData)
  const visibility = String(formData.get('visibility') ?? 'private') as TextbookCatalogVisibility
  const createCatalogMaster = formData.get('createCatalogMaster') === 'on'
  const selectedStudentIds = parseStudentIds(formData)
  const textbookIdsByStudent = parseTextbookIdsJson(formData)

  if (!name) return { error: '参考書名を入力してください' }
  if (detailTags.length === 0) return { error: '科目タグを1つ以上選択してください' }
  if (usageTags.length === 0) return { error: '用途タグを1つ以上選択してください' }

  let catalogId: string | null = null

  if (createCatalogMaster) {
    if (visibility !== 'public' && visibility !== 'private') {
      return { error: '公開設定が不正です' }
    }

    const { data: created, error } = await supabase
      .from('textbook_catalog')
      .insert({
        name,
        subjects,
        usage_tags: usageTags,
        visibility,
        is_searchable: false,
        created_by: auth.access.profile.id,
        ...metadata,
      })
      .select('id')
      .single<{ id: string }>()

    if (error || !created) return { error: '本棚マスタの作成に失敗しました' }
    catalogId = created.id
  }

  return syncStudentAssignments({
    userId: auth.access.profile.id,
    isSuperAdmin: auth.access.isSuperAdmin,
    selectedStudentIds,
    textbookIdsByStudent,
    catalogId,
    name,
    subjects,
    detailTags,
    usageTags,
    metadata,
  })
}

export async function updateTextbookCatalogVisibility(
  catalogId: string,
  visibility: TextbookCatalogVisibility,
): Promise<CatalogActionState> {
  const auth = await requireBookshelfAdmin()
  if (!auth.ok) return { error: auth.error }

  if (visibility !== 'public' && visibility !== 'private') {
    return { error: '公開設定が不正です' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('textbook_catalog')
    .update({ visibility })
    .eq('id', catalogId)

  if (error) return { error: '公開設定の更新に失敗しました' }

  revalidateCatalogPaths()
  return { success: true }
}

export async function deleteTextbookCatalogEntry(catalogId: string): Promise<CatalogActionState> {
  const auth = await requireBookshelfAdmin()
  if (!auth.ok) return { error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase.from('textbook_catalog').delete().eq('id', catalogId)

  if (error) return { error: '参考書の削除に失敗しました' }

  revalidateCatalogPaths()
  return { success: true }
}

export async function deleteAdminBookshelfStudentEntry(
  textbookIdsJson: string,
): Promise<CatalogActionState> {
  const auth = await requireBookshelfAdmin()
  if (!auth.ok) return { error: auth.error }

  let textbookIdsByStudent: Record<string, string> = {}
  try {
    textbookIdsByStudent = JSON.parse(textbookIdsJson) as Record<string, string>
  } catch {
    return { error: '削除対象が不正です' }
  }

  const supabase = await createClient()
  const studentIds = await filterGraduatesFromStudentIds(
    Object.keys(textbookIdsByStudent),
    auth.access,
  )
  const ids = studentIds
    .map((studentId) => textbookIdsByStudent[studentId])
    .filter(Boolean)

  if (ids.length === 0) return { error: '削除対象がありません' }

  const { error } = await supabase.from('textbooks').delete().in('id', ids)
  if (error) return { error: '参考書の削除に失敗しました' }

  revalidateCatalogPaths(studentIds)
  return { success: true }
}
