/** 本棚・学習記録用の教科（親グループ） */
import {
  TEXTBOOK_DETAIL_TAG_GROUPS,
  getDetailTagsForGroup,
} from '@/lib/constants/textbook-detail-tags'
import {
  getParentGroupsForProfile,
  resolveStudySubjectCategory as resolveParentGroup,
  textbookMatchesParentGroup,
  type TextbookParentGroupLabel,
} from '@/lib/textbooks/subject-tags'

export const TEXTBOOK_SUBJECT_CATEGORIES = TEXTBOOK_DETAIL_TAG_GROUPS.map((group) => ({
  label: group.label,
  subjects: [...group.tags],
}))

export type TextbookSubjectCategoryLabel = TextbookParentGroupLabel

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
): value is TextbookSubjectCategoryLabel {
  return TEXTBOOK_SUBJECT_CATEGORIES.some((category) => category.label === value)
}

export function getStudySubjectCategoriesForProfile(
  profileSubjects: string[],
): TextbookSubjectCategoryLabel[] {
  return getParentGroupsForProfile(profileSubjects)
}

export function resolveStudySubjectCategory(
  subject: string,
): TextbookSubjectCategoryLabel | null {
  return resolveParentGroup(subject)
}

export function deriveStudyCategoryFromTextbook(
  textbookSubjects: string[],
  profileSubjects: string[],
  detailTags: string[] = [],
): TextbookSubjectCategoryLabel | null {
  const item = { subjects: textbookSubjects, detail_tags: detailTags }
  for (const category of TEXTBOOK_SUBJECT_CATEGORIES) {
    if (
      catalogMatchesCategory(item, category.label) &&
      profileIncludesStudyCategory(profileSubjects, category.label)
    ) {
      return category.label
    }
  }
  return null
}

export function getOrderedChartSubjectLabels(subjectsInData: string[]): TextbookSubjectCategoryLabel[] {
  const subjectSet = new Set(subjectsInData)
  return TEXTBOOK_SUBJECT_CATEGORIES.map((category) => category.label).filter((label) =>
    subjectSet.has(label),
  )
}

export function profileIncludesStudyCategory(
  profileSubjects: string[],
  categoryLabel: string,
): boolean {
  return getParentGroupsForProfile(profileSubjects).includes(
    categoryLabel as TextbookSubjectCategoryLabel,
  )
}

export function filterTextbooksByStudyCategory<T extends { subjects: string[]; detail_tags?: string[] }>(
  textbooks: T[],
  categoryLabel: string,
): T[] {
  if (!categoryLabel) return []
  return textbooks.filter((book) =>
    catalogMatchesCategory(book, categoryLabel as TextbookSubjectCategoryLabel),
  )
}

export function resolveInitialSubjectCategoryForProfile(
  profileSubjects: string[],
  param?: string,
): TextbookSubjectCategoryLabel {
  const available = getStudySubjectCategoriesForProfile(profileSubjects)
  if (
    param &&
    isStudySubjectCategoryLabel(param) &&
    profileIncludesStudyCategory(profileSubjects, param)
  ) {
    return param
  }
  return available[0] ?? TEXTBOOK_SUBJECT_CATEGORIES[0].label
}
