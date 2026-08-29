import type { TextbookCatalog } from '@/types/textbook'

export type TextbookCatalogSearchFilters = {
  query?: string
  detailTags?: string[]
  publisher?: string
  university?: string
  studyPurpose?: string
}

function normalizeQuery(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function filterTextbookCatalog(
  catalog: TextbookCatalog[],
  filters: TextbookCatalogSearchFilters,
  options?: { excludeCatalogIds?: Set<string>; publicOnly?: boolean },
): TextbookCatalog[] {
  const query = normalizeQuery(filters.query)
  const detailTags = filters.detailTags ?? []
  const exclude = options?.excludeCatalogIds ?? new Set<string>()
  const publicOnly = options?.publicOnly ?? true

  return catalog.filter((item) => {
    if (publicOnly && item.visibility !== 'public') return false
    if (exclude.has(item.id)) return false

    if (query) {
      const haystack = [
        item.name,
        item.publisher ?? '',
        ...item.subjects,
        ...item.detail_tags,
        ...item.study_purposes,
        ...item.target_universities,
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }

    if (detailTags.length > 0) {
      const tags = new Set([...item.detail_tags, ...item.subjects])
      if (!detailTags.some((tag) => tags.has(tag))) return false
    }

    if (filters.publisher && item.publisher !== filters.publisher) return false

    if (
      filters.university &&
      !item.target_universities.includes(filters.university)
    ) {
      return false
    }

    if (
      filters.studyPurpose &&
      !item.study_purposes.includes(filters.studyPurpose)
    ) {
      return false
    }

    return true
  })
}

export function getUniquePublishersFromCatalog(catalog: TextbookCatalog[]): string[] {
  const publishers = new Set<string>()
  for (const item of catalog) {
    if (item.publisher?.trim()) publishers.add(item.publisher.trim())
  }
  return [...publishers].sort((a, b) => a.localeCompare(b, 'ja'))
}

export function getUniqueUniversitiesFromCatalog(catalog: TextbookCatalog[]): string[] {
  const universities = new Set<string>()
  for (const item of catalog) {
    for (const university of item.target_universities) {
      if (university.trim()) universities.add(university.trim())
    }
  }
  return [...universities].sort((a, b) => a.localeCompare(b, 'ja'))
}

export function parseSearchListParam(value: string | string[] | undefined): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value.join(',') : value
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
