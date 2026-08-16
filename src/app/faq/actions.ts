'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type FaqActionState = {
  error?: string
  success?: boolean
}

async function assertAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'ログインが必要です'

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'admin') return '管理者権限が必要です'
  return null
}

function revalidateFaqPaths() {
  revalidatePath('/dashboard/faq')
  revalidatePath('/admin/faq')
}

async function nextCategorySortOrder(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase
    .from('faq_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()

  return (data?.sort_order ?? 0) + 1
}

async function nextItemSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
): Promise<number> {
  const { data } = await supabase
    .from('faq_items')
    .select('sort_order')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()

  return (data?.sort_order ?? 0) + 1
}

export async function createFaqCategory(
  _prev: FaqActionState,
  formData: FormData,
): Promise<FaqActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'カテゴリ名を入力してください' }

  const supabase = await createClient()
  const sortOrder = await nextCategorySortOrder(supabase)

  const { error } = await supabase.from('faq_categories').insert({
    name,
    sort_order: sortOrder,
  })

  if (error) {
    if (error.code === '23505') return { error: '同じ名前のカテゴリが既にあります' }
    return { error: 'カテゴリの追加に失敗しました' }
  }

  revalidateFaqPaths()
  return { success: true }
}

export async function deleteFaqCategory(formData: FormData): Promise<void> {
  if (await assertAdmin()) return

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return

  const supabase = await createClient()
  await supabase.from('faq_categories').delete().eq('id', id)
  revalidateFaqPaths()
}

export async function createFaqItem(
  _prev: FaqActionState,
  formData: FormData,
): Promise<FaqActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const categoryId = String(formData.get('categoryId') ?? '').trim()
  const question = String(formData.get('question') ?? '').trim()
  const answer = String(formData.get('answer') ?? '').trim()
  const isPublished = formData.get('isPublished') === 'on'

  if (!categoryId) return { error: 'カテゴリが指定されていません' }
  if (!question) return { error: '質問を入力してください' }
  if (!answer) return { error: '回答を入力してください' }

  const supabase = await createClient()
  const sortOrder = await nextItemSortOrder(supabase, categoryId)

  const { error } = await supabase.from('faq_items').insert({
    category_id: categoryId,
    question,
    answer,
    sort_order: sortOrder,
    is_published: isPublished,
  })

  if (error) return { error: 'FAQの追加に失敗しました' }

  revalidateFaqPaths()
  return { success: true }
}

export async function updateFaqItem(
  _prev: FaqActionState,
  formData: FormData,
): Promise<FaqActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get('id') ?? '').trim()
  const question = String(formData.get('question') ?? '').trim()
  const answer = String(formData.get('answer') ?? '').trim()
  const isPublished = formData.get('isPublished') === 'on'

  if (!id) return { error: 'FAQが指定されていません' }
  if (!question) return { error: '質問を入力してください' }
  if (!answer) return { error: '回答を入力してください' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('faq_items')
    .update({
      question,
      answer,
      is_published: isPublished,
    })
    .eq('id', id)

  if (error) return { error: 'FAQの更新に失敗しました' }

  revalidateFaqPaths()
  return { success: true }
}

export async function deleteFaqItem(formData: FormData): Promise<void> {
  if (await assertAdmin()) return

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return

  const supabase = await createClient()
  await supabase.from('faq_items').delete().eq('id', id)
  revalidateFaqPaths()
}
