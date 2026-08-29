import {
  TEXTBOOK_DETAIL_TAG_GROUPS,
  type TextbookDetailTagGroupLabel,
} from '@/lib/constants/textbook-detail-tags'

export type TextbookParentGroupLabel = TextbookDetailTagGroupLabel

export const TEXTBOOK_PARENT_GROUP_LABELS = TEXTBOOK_DETAIL_TAG_GROUPS.map(
  (group) => group.label,
) as TextbookParentGroupLabel[]

export function isTextbookParentGroupLabel(value: string): value is TextbookParentGroupLabel {
  return TEXTBOOK_PARENT_GROUP_LABELS.includes(value as TextbookParentGroupLabel)
}

export function getParentGroupForDetailTag(tag: string): TextbookParentGroupLabel | null {
  for (const group of TEXTBOOK_DETAIL_TAG_GROUPS) {
    if ((group.tags as readonly string[]).includes(tag)) {
      return group.label
    }
  }
  return null
}

/** 詳細タグ（子）から親グループの科目タグを導出 */
export function deriveParentGroupsFromDetailTags(detailTags: string[]): TextbookParentGroupLabel[] {
  const parents = new Set<TextbookParentGroupLabel>()
  for (const tag of detailTags) {
    const parent = getParentGroupForDetailTag(tag)
    if (parent) parents.add(parent)
  }
  return [...parents]
}

/** DB保存用: detail_tags と自動導出された subjects */
export function resolveTextbookSubjectTags(detailTags: string[]): {
  detail_tags: string[]
  subjects: string[]
} {
  const detail_tags = [...new Set(detailTags.map((tag) => tag.trim()).filter(Boolean))]
  const subjects = deriveParentGroupsFromDetailTags(detail_tags)
  return { detail_tags, subjects }
}

export function getParentGroupsForProfile(profileSubjects: string[]): TextbookParentGroupLabel[] {
  const parents = new Set<TextbookParentGroupLabel>()
  for (const subject of profileSubjects) {
    if (isTextbookParentGroupLabel(subject)) {
      parents.add(subject)
      continue
    }
    const parent = getParentGroupForDetailTag(subject)
    if (parent) parents.add(parent)
  }
  return TEXTBOOK_PARENT_GROUP_LABELS.filter((label) => parents.has(label))
}

export function textbookMatchesParentGroup(
  item: { subjects: string[]; detail_tags?: string[] },
  parentLabel: TextbookParentGroupLabel,
): boolean {
  const detailTags = item.detail_tags ?? []
  if (item.subjects.includes(parentLabel)) return true

  const group = TEXTBOOK_DETAIL_TAG_GROUPS.find((entry) => entry.label === parentLabel)
  if (!group) return false

  const childTags = group.tags as readonly string[]
  if (detailTags.some((tag) => childTags.includes(tag))) return true
  if (item.subjects.some((tag) => childTags.includes(tag))) return true

  return false
}

/** 旧データ（subjects のみ）も親グループに解決 */
export function resolveStudySubjectCategory(subject: string): TextbookParentGroupLabel | null {
  if (isTextbookParentGroupLabel(subject)) return subject

  const fromDetail = getParentGroupForDetailTag(subject)
  if (fromDetail) return fromDetail

  const legacyMap: Record<string, TextbookParentGroupLabel> = {
    現代文: '国語',
    '古文/漢文': '国語',
    小論文: '国語',
    物理: '理科',
    化学: '理科',
    生物: '理科',
    地学: '理科',
    日本史: '社会',
    世界史: '社会',
    地理: '社会',
    '公共/倫理/政治経済': '社会',
  }

  if (legacyMap[subject]) return legacyMap[subject]
  if (subject === '英語' || subject === '数学' || subject === '情報') {
    return subject
  }

  return null
}

export function parseDetailTagsFromForm(formData: FormData): string[] {
  return formData
    .getAll('detailTags')
    .map((value) => String(value).trim())
    .filter(Boolean)
}

/** 生徒本人が独自登録した教材のみ、科目タグを編集可能 */
export function canStudentEditTextbookSubjectTags(
  book: { catalog_id: string | null; registered_by: string | null },
  studentId: string,
): boolean {
  return book.catalog_id === null && book.registered_by === studentId
}
