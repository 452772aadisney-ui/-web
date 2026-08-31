import { TEXTBOOK_PUBLISHERS } from '@/lib/constants/textbook-search'
import { createClient } from '@/lib/supabase/server'

/** 出版社候補を重複なくマージ（五十音順） */
export function mergeTextbookPublisherOptions(...sources: Array<string[] | readonly string[]>): string[] {
  const publishers = new Set<string>()
  for (const source of sources) {
    for (const publisher of source) {
      const trimmed = publisher.trim()
      if (trimmed) publishers.add(trimmed)
    }
  }
  return [...publishers].sort((a, b) => a.localeCompare(b, 'ja'))
}

/** 管理者フォーム用: 定数 + DB登録済み出版社 */
export async function fetchTextbookPublisherOptions(): Promise<string[]> {
  const supabase = await createClient()

  const [{ data: catalogRows }, { data: textbookRows }] = await Promise.all([
    supabase.from('textbook_catalog').select('publisher'),
    supabase.from('textbooks').select('publisher'),
  ])

  const fromCatalog = ((catalogRows ?? []) as { publisher: string | null }[])
    .map((row) => row.publisher ?? '')
    .filter(Boolean)

  const fromTextbooks = ((textbookRows ?? []) as { publisher: string | null }[])
    .map((row) => row.publisher ?? '')
    .filter(Boolean)

  return mergeTextbookPublisherOptions(TEXTBOOK_PUBLISHERS, fromCatalog, fromTextbooks)
}
