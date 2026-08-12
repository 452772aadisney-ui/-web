/** 教材に付けられる用途タグ */
export const TEXTBOOK_USAGE_TAGS = ['授業用', '自習用'] as const

export type TextbookUsageTag = (typeof TEXTBOOK_USAGE_TAGS)[number]
