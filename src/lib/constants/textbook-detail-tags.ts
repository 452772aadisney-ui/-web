/** 教材の詳細タグ（教科ごとの科目・分野） */
export const TEXTBOOK_DETAIL_TAG_GROUPS = [
  {
    label: '英語',
    tags: [
      '単語・熟語',
      '英文法',
      '英文解釈',
      '長文',
      'リスニング',
      '英作文',
      'その他（英語）',
    ],
  },
  {
    label: '数学',
    tags: ['数IA', '数IIB', '数IIIC', 'その他（数学）'],
  },
  {
    label: '国語',
    tags: ['現代文', '単語', '古文', '漢文', 'その他（国語）'],
  },
  {
    label: '理科',
    tags: ['物理', '化学', '生物', '地学', 'その他（理科）'],
  },
  {
    label: '社会',
    tags: [
      '歴史総合',
      '日本史',
      '世界史',
      '地理',
      '公共',
      '倫理',
      '政治・経済',
      'その他（社会）',
    ],
  },
  {
    label: '情報',
    tags: ['情報I', 'その他（情報）'],
  },
] as const

export type TextbookDetailTagGroupLabel =
  (typeof TEXTBOOK_DETAIL_TAG_GROUPS)[number]['label']

export const ALL_TEXTBOOK_DETAIL_TAGS = TEXTBOOK_DETAIL_TAG_GROUPS.flatMap(
  (group) => group.tags,
) as readonly string[]

export function isTextbookDetailTag(value: string): boolean {
  return (ALL_TEXTBOOK_DETAIL_TAGS as readonly string[]).includes(value)
}

export function getDetailTagsForGroup(label: string): string[] {
  const group = TEXTBOOK_DETAIL_TAG_GROUPS.find((item) => item.label === label)
  return group ? [...group.tags] : []
}

/** vocab 実績の対象となる科目タグ（detail_tags） */
export const VOCABULARY_ACHIEVEMENT_DETAIL_TAGS = ['単語・熟語', '単語'] as const

/** 旧タグ（DB移行前データの実績判定用） */
const LEGACY_VOCABULARY_DETAIL_TAGS = ['英単語', '英熟語'] as const

export function isVocabularyAchievementDetailTag(tag: string): boolean {
  return (
    (VOCABULARY_ACHIEVEMENT_DETAIL_TAGS as readonly string[]).includes(tag) ||
    (LEGACY_VOCABULARY_DETAIL_TAGS as readonly string[]).includes(tag)
  )
}

export function isVocabularyAchievementTextbook(
  detailTags: string[] | null | undefined,
): boolean {
  return (detailTags ?? []).some(isVocabularyAchievementDetailTag)
}
