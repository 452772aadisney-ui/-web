import type { StudentTag } from '@/types/tag'
import { getGradeSortIndex } from '@/lib/tags/grade-order'

export function groupTagsByCategory(tags: StudentTag[]): Map<string, StudentTag[]> {
  const map = new Map<string, StudentTag[]>()
  for (const tag of tags) {
    const category = tag.category || 'その他'
    const list = map.get(category) ?? []
    list.push(tag)
    map.set(category, list)
  }

  for (const [category, list] of map.entries()) {
    if (category === '学年') {
      list.sort((a, b) => getGradeSortIndex(a.name) - getGradeSortIndex(b.name))
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    }
    map.set(category, list)
  }

  return map
}
