import {
  TEXTBOOK_DETAIL_TAG_GROUPS,
  type TextbookDetailTagGroupLabel,
} from '@/lib/constants/textbook-detail-tags'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'

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

const EXAM_SUBJECT_PARENT_GROUP: Record<string, TextbookParentGroupLabel> = Object.fromEntries(
  EXAM_SUBJECTS.map((subject) => {
    if (subject === '英語') return [subject, '英語']
    if (subject === '情報') return [subject, '情報']
    if (subject.startsWith('数学')) return [subject, '数学']
    if (['現代文', '古文', '漢文', '小論文'].includes(subject)) return [subject, '国語']
    if (
      ['物理', '物理基礎', '化学', '化学基礎', '生物', '生物基礎', '地学', '地学基礎'].includes(
        subject,
      )
    ) {
      return [subject, '理科']
    }
    if (['日本史', '世界史', '地理', '倫理', '政治経済'].includes(subject)) {
      return [subject, '社会']
    }
    return [subject, '国語']
  }),
)

/** プロフィールの使用科目（大学受験科目）から親グループを解決 */
export function getParentGroupForExamSubject(subject: string): TextbookParentGroupLabel | null {
  return EXAM_SUBJECT_PARENT_GROUP[subject] ?? null
}

export function getParentGroupsForProfile(profileSubjects: string[]): TextbookParentGroupLabel[] {
  const parents = new Set<TextbookParentGroupLabel>()
  for (const subject of profileSubjects) {
    if (isTextbookParentGroupLabel(subject)) {
      parents.add(subject)
      continue
    }
    const parent =
      getParentGroupForDetailTag(subject) ??
      getParentGroupForExamSubject(subject) ??
      resolveStudySubjectCategory(subject)
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

  const fromExam = getParentGroupForExamSubject(subject)
  if (fromExam) return fromExam

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
