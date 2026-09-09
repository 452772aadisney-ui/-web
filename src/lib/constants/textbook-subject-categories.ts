/** 本棚・学習記録用の教科カテゴリ */
import {
  TEXTBOOK_DETAIL_TAG_GROUPS,
  getDetailTagsForGroup,
} from '@/lib/constants/textbook-detail-tags'
import {
  STUDY_SUBJECT_CATEGORY_ORDER,
  getStudySubjectCategoriesForProfile as getStudyCategoriesFromProfile,
  isScienceStudySubject,
  isStudySubjectCategoryLabel as isStudyLabel,
  isTextbookParentGroupLabel,
  resolveStudySubjectCategory as resolveStudyLabel,
  textbookMatchesParentGroup,
  textbookMatchesStudyCategory,
  type StudySubjectCategoryLabel,
  type TextbookParentGroupLabel,
} from '@/lib/textbooks/subject-tags'

export const TEXTBOOK_SUBJECT_CATEGORIES = TEXTBOOK_DETAIL_TAG_GROUPS.map((group) => ({
  label: group.label,
  subjects: [...group.tags],
}))

export type TextbookSubjectCategoryLabel = TextbookParentGroupLabel
export type { StudySubjectCategoryLabel }

export function getSubjectTagsForCategory(categoryLabel: string): string[] {
  return getDetailTagsForGroup(categoryLabel)
}

export function catalogMatchesCategory(
  item: { subjects: string[]; detail_tags?: string[] },
  categoryLabel: TextbookSubjectCategoryLabel,
): boolean {
  return textbookMatchesParentGroup(item, categoryLabel)
}

export function isStudySubjectCategoryLabel(
  value: string,
): value is StudySubjectCategoryLabel {
  return isStudyLabel(value)
}

export function getStudySubjectCategoriesForProfile(
  profileSubjects: string[],
): StudySubjectCategoryLabel[] {
  return getStudyCategoriesFromProfile(profileSubjects)
}

export function resolveStudySubjectCategory(
  subject: string,
): StudySubjectCategoryLabel | null {
  return resolveStudyLabel(subject)
}

export function deriveStudyCategoryFromTextbook(
  textbookSubjects: string[],
  profileSubjects: string[],
  detailTags: string[] = [],
): StudySubjectCategoryLabel | null {
  const item = { subjects: textbookSubjects, detail_tags: detailTags }
  const available = new Set(getStudySubjectCategoriesForProfile(profileSubjects))

  for (const science of ['物理', '化学', '生物', '地学'] as const) {
    if (available.has(science) && textbookMatchesStudyCategory(item, science)) {
      return science
    }
  }

  for (const label of STUDY_SUBJECT_CATEGORY_ORDER) {
    if (label === '理科' || isScienceStudySubject(label)) continue
    if (!available.has(label)) continue
    if (
      isTextbookParentGroupLabel(label) &&
      textbookMatchesParentGroup(item, label)
    ) {
      return label
    }
  }

  return null
}

export function getOrderedChartSubjectLabels(subjectsInData: string[]): StudySubjectCategoryLabel[] {
  const subjectSet = new Set(subjectsInData)
  const ordered = STUDY_SUBJECT_CATEGORY_ORDER.filter((label) => subjectSet.has(label))
  const extras = [...subjectSet].filter(
    (label) => !(STUDY_SUBJECT_CATEGORY_ORDER as readonly string[]).includes(label),
  )
  return [...ordered, ...extras] as StudySubjectCategoryLabel[]
}

export function profileIncludesStudyCategory(
  profileSubjects: string[],
  categoryLabel: string,
): boolean {
  return getStudySubjectCategoriesForProfile(profileSubjects).includes(
    categoryLabel as StudySubjectCategoryLabel,
  )
}

export function filterTextbooksByStudyCategory<T extends { subjects: string[]; detail_tags?: string[] }>(
  textbooks: T[],
  categoryLabel: string,
): T[] {
  if (!categoryLabel) return []
  return textbooks.filter((book) => textbookMatchesStudyCategory(book, categoryLabel))
}

export function resolveInitialSubjectCategoryForProfile(
  profileSubjects: string[],
  param?: string,
): StudySubjectCategoryLabel {
  const available = getStudySubjectCategoriesForProfile(profileSubjects)
  if (
    param &&
    isStudySubjectCategoryLabel(param) &&
    profileIncludesStudyCategory(profileSubjects, param)
  ) {
    return param
  }
  return available[0] ?? '英語'
}

export {
  isScienceFamilyStudyLabel,
  isScienceStudySubject,
  sumScienceFamilyMinutes,
  textbookMatchesStudyCategory,
} from '@/lib/textbooks/subject-tags'
