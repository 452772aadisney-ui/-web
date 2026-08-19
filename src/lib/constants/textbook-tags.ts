/** 教材に付けられる用途タグ */
export const TEXTBOOK_USAGE_TAGS = ['授業用', '自習用', '単語帳'] as const

export type TextbookUsageTag = (typeof TEXTBOOK_USAGE_TAGS)[number]

export const VOCABULARY_USAGE_TAG: TextbookUsageTag = '単語帳'

export function isVocabularyTextbook(usageTags: string[] | null | undefined): boolean {
  return (usageTags ?? []).includes(VOCABULARY_USAGE_TAG)
}
