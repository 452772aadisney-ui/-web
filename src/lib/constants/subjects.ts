/** 大学受験で選択可能な科目（使用科目） */
export const EXAM_SUBJECTS = [
  '現代文',
  '古文',
  '漢文',
  '数学IA',
  '数学IIBC',
  '数学III',
  '英語',
  '物理',
  '物理基礎',
  '化学',
  '化学基礎',
  '生物',
  '生物基礎',
  '地学',
  '地学基礎',
  '日本史',
  '世界史',
  '地理',
  '倫理',
  '政治経済',
  '情報',
  '小論文',
] as const

export type ExamSubject = (typeof EXAM_SUBJECTS)[number]

/** 科目タグの幅（最長の「数学IIBC」+ チェックボックス分） */
export const SUBJECT_TAG_CELL_WIDTH = '8.25rem'
