export type AchievementCategory = 'beginner' | 'streak' | 'total' | 'daily' | 'balance' | 'secret'

export type AchievementDefinition = {
  id: string
  title: string
  description: string
  stars: number
  category: AchievementCategory
  /** 実績一覧には表示しない（解除ポップアップのみ） */
  secret?: boolean
}

/** ハンバーガーメニュー内の全ページを開いたか判定に使う */
export const ACHIEVEMENT_MENU_PAGE_KEYS = [
  '/dashboard/study',
  '/dashboard/study/history',
  '/dashboard/achievements',
  '/dashboard/bookshelf',
  '/dashboard/textbooks/register',
  '/dashboard/calendar',
  '/dashboard/todo',
  '/dashboard/coaching',
  '/dashboard/quizzes',
  '/dashboard/announcements',
  '/dashboard/chat',
  '/dashboard/faq',
  '/dashboard/info',
] as const

/** 同系統の実績は先頭から順に表示し、達成すると次が現れる（secret は含めない） */
export const ACHIEVEMENT_SERIES: readonly (readonly string[])[] = [
  ['first_study_log'],
  ['keep_going'],
  ['textbooks_5', 'textbooks_10'],
  ['streak_3', 'streak_7', 'streak_14', 'streak_30'],
  ['total_10h', 'total_100h', 'total_500h', 'total_1000h'],
  ['daily_5h', 'daily_10h', 'daily_13h'],
  ['single_subject_6h'],
  ['subjects_3_day'],
  ['coaching_4_month'],
  ['announcement_read'],
]

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_study_log',
    title: 'ファーストステップ',
    description: '初めて学習記録を投稿した',
    stars: 1,
    category: 'beginner',
  },
  {
    id: 'keep_going',
    title: 'これから続けよう',
    description: '初めて学習記録を登録',
    stars: 1,
    category: 'beginner',
  },
  {
    id: 'textbooks_5',
    title: '本棚充実',
    description: '参考書を5冊登録した',
    stars: 1,
    category: 'beginner',
  },
  {
    id: 'textbooks_10',
    title: '準備万端',
    description: '参考書を10冊登録した',
    stars: 2,
    category: 'beginner',
  },
  {
    id: 'streak_3',
    title: '三日坊主脱出',
    description: '3日連続で学習を記録した',
    stars: 1,
    category: 'streak',
  },
  {
    id: 'streak_7',
    title: '一週間達成',
    description: '7日連続で学習を記録した',
    stars: 2,
    category: 'streak',
  },
  {
    id: 'streak_14',
    title: '習慣化マスター',
    description: '14日連続で学習を記録した',
    stars: 3,
    category: 'streak',
  },
  {
    id: 'streak_30',
    title: '継続は力なり',
    description: '30日連続で学習を記録した',
    stars: 4,
    category: 'streak',
  },
  {
    id: 'total_10h',
    title: '10時間の壁',
    description: '累計学習時間が10時間に達した',
    stars: 1,
    category: 'total',
  },
  {
    id: 'total_100h',
    title: '100時間突破',
    description: '累計学習時間が100時間に達した',
    stars: 2,
    category: 'total',
  },
  {
    id: 'total_500h',
    title: 'ちょっとは勉強したかな...',
    description: '累計学習時間が500時間に達した',
    stars: 3,
    category: 'total',
  },
  {
    id: 'total_1000h',
    title: '一端の受験生',
    description: '累計学習時間が1000時間に達した',
    stars: 4,
    category: 'total',
  },
  {
    id: 'daily_5h',
    title: '小さな努力',
    description: '1日で5時間以上学習した',
    stars: 1,
    category: 'daily',
  },
  {
    id: 'daily_10h',
    title: '限界突破',
    description: '1日で10時間以上学習した',
    stars: 2,
    category: 'daily',
  },
  {
    id: 'daily_13h',
    title: '心配が勝る...',
    description: '1日で13時間以上学習した',
    stars: 3,
    category: 'daily',
  },
  {
    id: 'single_subject_6h',
    title: '一途なタイプ',
    description: '1つの科目を1日で6時間以上勉強した',
    stars: 1,
    category: 'daily',
  },
  {
    id: 'subjects_3_day',
    title: '文武両道',
    description: '1日に3科目以上学習を記録した',
    stars: 2,
    category: 'balance',
  },
  {
    id: 'coaching_4_month',
    title: 'アクティブ生徒',
    description: 'コーチングを月4回受講した',
    stars: 2,
    category: 'balance',
  },
  {
    id: 'announcement_read',
    title: '知らなきゃ損！',
    description: '未読のお知らせを1つ既読にした',
    stars: 1,
    category: 'balance',
  },
  {
    id: 'dream_high',
    title: '夢は天高く',
    description: '志望校を登録',
    stars: 1,
    category: 'secret',
    secret: true,
  },
  {
    id: 'rat_year',
    title: 'あなたはねずみ年...？',
    description: '生年月日を登録',
    stars: 1,
    category: 'secret',
    secret: true,
  },
  {
    id: 'all_menus',
    title: '機能しっかり',
    description: 'すべてのメニューを開いてみた',
    stars: 1,
    category: 'secret',
    secret: true,
  },
]

const achievementById = new Map(ACHIEVEMENTS.map((item) => [item.id, item]))

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return achievementById.get(id)
}

export function isSecretAchievement(id: string): boolean {
  return achievementById.get(id)?.secret === true
}

export function formatAchievementStars(stars: number): string {
  if (stars <= 0) return ''
  return '☆'.repeat(stars)
}

export function normalizeAchievementVisitPath(pathname: string): string | null {
  if (pathname.startsWith('/dashboard/study/subject') || pathname.startsWith('/dashboard/study/textbook')) {
    return '/dashboard/study'
  }

  if ((ACHIEVEMENT_MENU_PAGE_KEYS as readonly string[]).includes(pathname)) {
    return pathname
  }

  return null
}
