import type { StudentTag } from '@/types/tag'

export function groupTagsByCategory(tags: StudentTag[]): Map<string, StudentTag[]> {
  const map = new Map<string, StudentTag[]>()
  for (const tag of tags) {
    const category = tag.category || 'その他'
    const list = map.get(category) ?? []
    list.push(tag)
    map.set(category, list)
  }
  return map
}
