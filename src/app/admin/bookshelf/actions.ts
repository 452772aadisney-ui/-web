'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TEXTBOOK_USAGE_TAGS } from '@/lib/constants/textbook-tags'
import type { TextbookCatalogVisibility } from '@/types/textbook'

export type CatalogActionState = {
  error?: string
  success?: boolean
}

async function assertAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'ログインが必要です' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'admin') return { error: '権限がありません' }

  return { userId: user.id }
}

function parseSubjects(formData: FormData): string[] {
  return String(formData.get('subjects') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseUsageTags(formData: FormData): string[] {
  return TEXTBOOK_USAGE_TAGS.filter((tag) => formData.get(`usage_${tag}`) === 'on')
}

function revalidateCatalogPaths() {
  revalidatePath('/admin/bookshelf')
  revalidatePath('/admin/textbooks')
  revalidatePath('/dashboard/bookshelf')
}

export async function createTextbookCatalogEntry(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = await createClient()
  const name = String(formData.get('name') ?? '').trim()
  const subjects = parseSubjects(formData)
  const usageTags = parseUsageTags(formData)
  const visibility = String(formData.get('visibility') ?? 'public') as TextbookCatalogVisibility

  if (!name) return { error: '参考書名を入力してください' }
  if (subjects.length === 0) return { error: '科目タグを1つ以上入力してください' }
  if (usageTags.length === 0) return { error: '用途タグを1つ以上選択してください' }
  if (visibility !== 'public' && visibility !== 'private') {
    return { error: '公開設定が不正です' }
  }

  const { error } = await supabase.from('textbook_catalog').insert({
    name,
    subjects,
    usage_tags: usageTags,
    visibility,
    created_by: auth.userId,
  })

  if (error) return { error: '参考書の登録に失敗しました' }

  revalidateCatalogPaths()
  return { success: true }
}

export async function updateTextbookCatalogVisibility(
  catalogId: string,
  visibility: TextbookCatalogVisibility,
): Promise<CatalogActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

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
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase.from('textbook_catalog').delete().eq('id', catalogId)

  if (error) return { error: '参考書の削除に失敗しました' }

  revalidateCatalogPaths()
  return { success: true }
}
