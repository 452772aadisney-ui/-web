import { createClient } from '@/lib/supabase/server'
import type { FaqCategory, FaqCategoryWithItems, FaqItem } from '@/types/faq'

type FaqItemRow = FaqItem

function groupFaqByCategory(
  categories: FaqCategory[],
  items: FaqItemRow[],
  publishedOnly: boolean,
): FaqCategoryWithItems[] {
  return categories
    .map((category) => ({
      ...category,
      items: items
        .filter((item) => item.category_id === category.id)
        .filter((item) => !publishedOnly || item.is_published)
        .sort((a, b) => a.sort_order - b.sort_order || a.question.localeCompare(b.question, 'ja')),
    }))
    .filter((category) => !publishedOnly || category.items.length > 0)
}

export async function fetchPublishedFaq(): Promise<FaqCategoryWithItems[]> {
  const supabase = await createClient()

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from('faq_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('faq_items')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('question', { ascending: true }),
  ])

  return groupFaqByCategory(
    (categories as FaqCategory[] | null) ?? [],
    (items as FaqItemRow[] | null) ?? [],
    true,
  )
}

export async function fetchFaqForAdmin(): Promise<FaqCategoryWithItems[]> {
  const supabase = await createClient()

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from('faq_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('faq_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('question', { ascending: true }),
  ])

  return groupFaqByCategory(
    (categories as FaqCategory[] | null) ?? [],
    (items as FaqItemRow[] | null) ?? [],
    false,
  )
}
