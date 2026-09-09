import {
  TEXTBOOK_DETAIL_TAG_GROUPS,
  type TextbookDetailTagGroupLabel,
} from '@/lib/constants/textbook-detail-tags'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'

export type TextbookParentGroupLabel = TextbookDetailTagGroupLabel

export const TEXTBOOK_PARENT_GROUP_LABELS = TEXTBOOK_DETAIL_TAG_GROUPS.map(
  (group) => group.label,
) as TextbookParentGroupLabel[]

/** Study-log selectable science subjects (not the parent group 「理科」). */
export const SCIENCE_STUDY_SUBJECTS = ['物理', '化学', '生物', '地学'] as const
export type ScienceStudySubject = (typeof SCIENCE_STUDY_SUBJECTS)[number]

/**
 * Ordered study-log / chart labels.
 * 「理科」 is kept for legacy stored logs only — not offered as a new selection.
 */
export const STUDY_SUBJECT_CATEGORY_ORDER = [
  '英語',
  '数学',
  '国語',
  '物理',
  '化学',
  '生物',
  '地学',
  '理科',
  '社会',
  '情報',
] as const

export type StudySubjectCategoryLabel = (typeof STUDY_SUBJECT_CATEGORY_ORDER)[number]

const SCIENCE_STUDY_SUBJECT_SET = new Set<string>(SCIENCE_STUDY_SUBJECTS)

const EXAM_TO_SCIENCE_STUDY: Record<string, ScienceStudySubject> = {
  物理: '物理',
  物理基礎: '物理',
  化学: '化学',
  化学基礎: '化学',
  生物: '生物',
  生物基礎: '生物',
  地学: '地学',
  地学基礎: '地学',
}

export function isTextbookParentGroupLabel(value: string): value is TextbookParentGroupLabel {
  return TEXTBOOK_PARENT_GROUP_LABELS.includes(value as TextbookParentGroupLabel)
}

export function isScienceStudySubject(value: string): value is ScienceStudySubject {
  return SCIENCE_STUDY_SUBJECT_SET.has(value)
}

export function isStudySubjectCategoryLabel(value: string): value is StudySubjectCategoryLabel {
  return (STUDY_SUBJECT_CATEGORY_ORDER as readonly string[]).includes(value)
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

/** プロフィールの使用科目（大学受験科目）から親グループを解決（教材タグ用） */
export function getParentGroupForExamSubject(subject: string): TextbookParentGroupLabel | null {
  return EXAM_SUBJECT_PARENT_GROUP[subject] ?? null
}

/**
 * Map a profile exam subject (or stored study label) to a study-log category.
 * Math stays grouped; science 基礎 folds into 物理/化学/生物/地学.
 */
export function normalizeToStudySubjectCategory(subject: string): StudySubjectCategoryLabel | null {
  const trimmed = subject.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('数学') || trimmed === '数学') return '数学'
  if (EXAM_TO_SCIENCE_STUDY[trimmed]) return EXAM_TO_SCIENCE_STUDY[trimmed]
  if (isScienceStudySubject(trimmed)) return trimmed
  if (trimmed === '理科') return '理科'

  if (trimmed === '英語' || trimmed === '情報') return trimmed
  if (['現代文', '古文', '漢文', '小論文'].includes(trimmed)) return '国語'
  if (['日本史', '世界史', '地理', '倫理', '政治経済'].includes(trimmed)) return '社会'

  if (isTextbookParentGroupLabel(trimmed) && trimmed !== '理科') return trimmed

  const fromDetail = getParentGroupForDetailTag(trimmed)
  if (fromDetail === '理科') {
    // Detail tags 物理/化学/… are study subjects themselves
    if (isScienceStudySubject(trimmed)) return trimmed
    return null
  }
  if (fromDetail) return fromDetail

  return null
}

/** Selectable study categories for a profile (never offers legacy 「理科」). */
export function getStudySubjectCategoriesForProfile(
  profileSubjects: string[],
): StudySubjectCategoryLabel[] {
  const selected = new Set<StudySubjectCategoryLabel>()
  for (const subject of profileSubjects) {
    const category = normalizeToStudySubjectCategory(subject)
    if (category && category !== '理科') {
      selected.add(category)
    }
  }
  return STUDY_SUBJECT_CATEGORY_ORDER.filter(
    (label) => label !== '理科' && selected.has(label),
  )
}

export function getParentGroupsForProfile(profileSubjects: string[]): TextbookParentGroupLabel[] {
  const parents = new Set<TextbookParentGroupLabel>()
  for (const subject of profileSubjects) {
    if (isTextbookParentGroupLabel(subject)) {
      parents.add(subject)
      continue
    }
    const parent =
      getParentGroupForDetailTag(subject) ?? getParentGroupForExamSubject(subject)
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

/**
 * Match textbooks for a study category.
 * Science subjects require an explicit 物理/化学/生物/地学 tag — bare 「理科」 is not guessed.
 * Legacy 「理科」 (edit-only) matches the parent group so existing logs stay editable.
 */
export function textbookMatchesStudyCategory(
  item: { subjects: string[]; detail_tags?: string[] },
  categoryLabel: string,
): boolean {
  if (isScienceStudySubject(categoryLabel)) {
    const tags = [...(item.detail_tags ?? []), ...item.subjects]
    return tags.includes(categoryLabel)
  }
  if (categoryLabel === '理科') {
    return textbookMatchesParentGroup(item, '理科')
  }
  if (isTextbookParentGroupLabel(categoryLabel)) {
    return textbookMatchesParentGroup(item, categoryLabel)
  }
  return false
}

/**
 * Resolve stored study_logs.subject for display / charts.
 * Keeps legacy 「理科」; maps 基礎 → 4 subjects; does not collapse 物理→理科.
 */
export function resolveStudySubjectCategory(subject: string): StudySubjectCategoryLabel | null {
  return normalizeToStudySubjectCategory(subject)
}

/** True when label is legacy 理科 or one of the four science study subjects. */
export function isScienceFamilyStudyLabel(subject: string): boolean {
  const resolved = resolveStudySubjectCategory(subject) ?? subject
  return resolved === '理科' || isScienceStudySubject(resolved)
}

/**
 * Sum minutes for the science family without double-counting.
 * Use when a report needs 「理科全体」 across legacy 理科 + 物理/化学/生物/地学.
 */
export function sumScienceFamilyMinutes(
  rows: Array<{ subject: string; minutes: number }>,
): number {
  let total = 0
  for (const row of rows) {
    if (isScienceFamilyStudyLabel(row.subject)) {
      total += row.minutes
    }
  }
  return total
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
