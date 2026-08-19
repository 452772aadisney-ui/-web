export type AchievementCategory = 'beginner' | 'streak' | 'total' | 'daily' | 'balance'

export type AchievementDefinition = {
  id: string
  title: string
  description: string
  stars: number
  category: AchievementCategory
}

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  beginner: '初期離脱を防ぐビギナー実績（登録・準備系）',
  streak: '毎日アプリを開かせる継続実績（最重要）',
  total: '努力を可視化する累積実績（時間・量）',
  daily: '努力を可視化する累積実績（時間・量）',
  balance: 'バランス・行動促進実績',
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_study_log',
    title: 'ファーストステップ',
    description: '初めて学習記録を投稿した',
    stars: 0,
    category: 'beginner',
  },
  {
    id: 'textbooks_5',
    title: '本棚充実',
    description: '参考書を5冊登録した',
    stars: 0,
    category: 'beginner',
  },
  {
    id: 'textbooks_10',
    title: '準備万端',
    description: '参考書を10冊登録した',
    stars: 0,
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
    stars: 0,
    category: 'daily',
  },
  {
    id: 'subjects_3_day',
    title: '文武両道',
    description: '1日に3科目以上学習を記録した',
    stars: 0,
    category: 'balance',
  },
  {
    id: 'coaching_4_month',
    title: 'アクティブ生徒',
    description: 'コーチングを月4回受講した',
    stars: 0,
    category: 'balance',
  },
]

const achievementById = new Map(ACHIEVEMENTS.map((item) => [item.id, item]))

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return achievementById.get(id)
}

export function formatAchievementStars(stars: number): string {
  if (stars <= 0) return ''
  return '☆'.repeat(stars)
}

export const ACHIEVEMENT_CATEGORY_ORDER: AchievementCategory[] = [
  'beginner',
  'streak',
  'total',
  'daily',
  'balance',
]
