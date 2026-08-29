/** 使用目的（検索フィルタ用） */
export const TEXTBOOK_STUDY_PURPOSES = [
  '共通テスト対策',
  '私大・2次試験対策',
  '教科書',
] as const

export type TextbookStudyPurpose = (typeof TEXTBOOK_STUDY_PURPOSES)[number]

/** よく使う出版社（管理者登録・検索の候補） */
export const TEXTBOOK_PUBLISHERS = [
  '旺文社',
  '筑摩書房',
  '河合出版',
  '駿台文庫',
  'Z会',
  '数研出版',
  'KADOKAWA',
  'ジャパンタイムズ出版',
  '文英堂',
  '東進ブックス',
  '実教出版',
  'その他',
] as const

/** 大学別検索カテゴリ（管理者が教材ごとに設定） */
export const TEXTBOOK_TARGET_UNIVERSITIES = [
  '東大・京大',
  '医学部',
  '旧帝+一橋・東科',
  '上位国公立',
  '中堅国公立',
  '早慶上理',
  'GMARCH+四工大',
  '成成明学',
  '日東駒専',
  'その他',
] as const
