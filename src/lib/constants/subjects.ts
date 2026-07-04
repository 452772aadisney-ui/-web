/** 大学受験で選択可能な科目（使用科目） */
export const EXAM_SUBJECTS = [
  '国語',
  '数学',
  '英語',
  '物理',
  '化学',
  '生物',
  '地学',
  '日本史',
  '世界史',
  '地理',
  '公民',
  '情報',
  '小論文',
] as const

export type ExamSubject = (typeof EXAM_SUBJECTS)[number]
