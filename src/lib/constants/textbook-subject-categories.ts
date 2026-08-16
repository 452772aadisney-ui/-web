/** 本棚リスト選択用の科目カテゴリ → 教材タグ（subjects）の対応 */
export const TEXTBOOK_SUBJECT_CATEGORIES = [
  { label: '英語', subjects: ['英語'] },
  { label: '数学', subjects: ['数学IA', '数学IIBC', '数学III'] },
  { label: '現代文', subjects: ['現代文'] },
  { label: '古文/漢文', subjects: ['古文', '漢文'] },
  { label: '物理', subjects: ['物理', '物理基礎'] },
  { label: '化学', subjects: ['化学', '化学基礎'] },
  { label: '生物', subjects: ['生物', '生物基礎'] },
  { label: '地学', subjects: ['地学', '地学基礎'] },
  { label: '日本史', subjects: ['日本史'] },
  { label: '世界史', subjects: ['世界史'] },
  { label: '地理', subjects: ['地理'] },
  { label: '公共/倫理/政治経済', subjects: ['公共', '倫理', '政治経済'] },
  { label: '情報', subjects: ['情報'] },
  { label: '小論文', subjects: ['小論文'] },
] as const

export type TextbookSubjectCategoryLabel =
  (typeof TEXTBOOK_SUBJECT_CATEGORIES)[number]['label']

export function getSubjectTagsForCategory(categoryLabel: string): string[] {
  const category = TEXTBOOK_SUBJECT_CATEGORIES.find((item) => item.label === categoryLabel)
  return category ? [...category.subjects] : []
}

export function catalogMatchesCategory(
  catalogSubjects: string[],
  categoryLabel: string,
): boolean {
  const tags = getSubjectTagsForCategory(categoryLabel)
  if (tags.length === 0) return false
  return tags.some((tag) => catalogSubjects.includes(tag))
}

export function isStudySubjectCategoryLabel(
  value: string,
): value is TextbookSubjectCategoryLabel {
  return TEXTBOOK_SUBJECT_CATEGORIES.some((category) => category.label === value)
}

/** プロフィールの使用科目から、学習記録用の科目カテゴリ一覧を返す */
export function getStudySubjectCategoriesForProfile(
  profileSubjects: string[],
): TextbookSubjectCategoryLabel[] {
  return TEXTBOOK_SUBJECT_CATEGORIES.filter((category) =>
    category.subjects.some((tag) => profileSubjects.includes(tag)),
  ).map((category) => category.label)
}

/** 保存済みの科目名（詳細タグ含む）を学習記録用カテゴリに変換 */
export function resolveStudySubjectCategory(
  subject: string,
): TextbookSubjectCategoryLabel | null {
  if (isStudySubjectCategoryLabel(subject)) return subject

  const category = TEXTBOOK_SUBJECT_CATEGORIES.find((item) =>
    (item.subjects as readonly string[]).includes(subject),
  )
  return category?.label ?? null
}

export function profileIncludesStudyCategory(
  profileSubjects: string[],
  categoryLabel: string,
): boolean {
  const tags = getSubjectTagsForCategory(categoryLabel)
  return tags.some((tag) => profileSubjects.includes(tag))
}

export function filterTextbooksByStudyCategory<T extends { subjects: string[] }>(
  textbooks: T[],
  categoryLabel: string,
): T[] {
  if (!categoryLabel) return []
  return textbooks.filter((book) => catalogMatchesCategory(book.subjects, categoryLabel))
}

/** URL パラメータとプロフィール科目から、初期表示する科目カテゴリを決める */
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
