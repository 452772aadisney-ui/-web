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
  '/dashboard/textbooks/search',
  '/dashboard/calendar',
  '/dashboard/todo',
  '/dashboard/coaching',
  '/dashboard/quizzes',
  '/dashboard/announcements',
  '/dashboard/chat',
  '/dashboard/faq',
  '/dashboard/info',
] as const

export const STUDY_HISTORY_PAGE_KEY = '/dashboard/study/history'

/** 同系統の実績は先頭から順に表示し、達成すると次が現れる（secret は含めない） */
export const ACHIEVEMENT_SERIES: readonly (readonly string[])[] = [
  ['first_study_log'],
  ['keep_going'],
  ['textbooks_5', 'textbooks_10', 'textbooks_15', 'textbooks_20'],
  ['streak_3', 'streak_7', 'streak_14', 'streak_21', 'streak_30', 'streak_45', 'streak_60', 'streak_100'],
  ['total_10h', 'total_25h', 'total_50h', 'total_100h', 'total_200h', 'total_500h', 'total_1000h'],
  ['daily_5h', 'daily_10h', 'daily_13h'],
  ['single_subject_6h', 'single_subject_10h'],
  ['vocab_3h', 'vocab_30h', 'vocab_75h', 'vocab_200h', 'vocab_500h'],
  ['subjects_3_day'],
  ['subjects_3_day_2h'],
  ['todo_first', 'todo_5'],
  ['calendar_exam_view'],
  ['study_log_detailed_memo'],
  ['coaching_first', 'coaching_10', 'coaching_20', 'coaching_50'],
  ['coaching_4_month'],
  ['announcement_read', 'announcement_read_5'],
  ['study_history_views_10'],
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
    id: 'textbooks_15',
    title: 'やりたいことがたくさん',
    description: '参考書を15冊登録した',
    stars: 2,
    category: 'beginner',
  },
  {
    id: 'textbooks_20',
    title: '本棚作れそう',
    description: '参考書を20冊登録した',
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
    id: 'streak_21',
    title: '気を緩めず...',
    description: '21日連続で学習を記録した',
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
    id: 'streak_45',
    title: '毎日がeveryday',
    description: '45日連続で学習を記録した',
    stars: 4,
    category: 'streak',
  },
  {
    id: 'streak_60',
    title: '2ヶ月の奇跡',
    description: '60日連続で学習を記録した',
    stars: 4,
    category: 'streak',
  },
  {
    id: 'streak_100',
    title: '百錬成鋼',
    description: '100日連続で学習を記録した',
    stars: 5,
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
    id: 'total_25h',
    title: '勉強を始めよう',
    description: '累計学習時間が25時間に達した',
    stars: 1,
    category: 'total',
  },
  {
    id: 'total_50h',
    title: '勉強してます？',
    description: '累計学習時間が50時間に達した',
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
    id: 'total_200h',
    title: '東京から徒歩で青森へ',
    description: '累計学習時間が200時間に達した',
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
    id: 'single_subject_10h',
    title: '猪突猛進',
    description: '1つの科目を1日で10時間以上勉強した',
    stars: 2,
    category: 'daily',
  },
  {
    id: 'vocab_3h',
    title: '覚えなきゃ...',
    description: '単語帳の学習時間が3時間を突破',
    stars: 1,
    category: 'total',
  },
  {
    id: 'vocab_30h',
    title: 'まだまだ...',
    description: '単語帳の学習時間が30時間を突破',
    stars: 1,
    category: 'total',
  },
  {
    id: 'vocab_75h',
    title: 'これから...',
    description: '単語帳の学習時間が75時間を突破',
    stars: 2,
    category: 'total',
  },
  {
    id: 'vocab_200h',
    title: 'もっともっと...',
    description: '単語帳の学習時間が200時間を突破',
    stars: 3,
    category: 'total',
  },
  {
    id: 'vocab_500h',
    title: '生き字引',
    description: '単語帳の学習時間が500時間を突破',
    stars: 4,
    category: 'total',
  },
  {
    id: 'subjects_3_day',
    title: '文武両道',
    description: '1日に3科目以上学習を記録した',
    stars: 2,
    category: 'balance',
  },
  {
    id: 'subjects_3_day_2h',
    title: '3色団子',
    description: '1日に3教科以上を2時間以上記録した',
    stars: 1,
    category: 'balance',
  },
  {
    id: 'subjects_5_day_2h',
    title: '虹色グラデーション',
    description: '1日に5教科以上を2時間以上記録した',
    stars: 3,
    category: 'balance',
    secret: true,
  },
  {
    id: 'todo_first',
    title: '言われた通りに',
    description: 'ToDoを1件完了した',
    stars: 1,
    category: 'balance',
  },
  {
    id: 'todo_5',
    title: '有言実行',
    description: 'ToDoを累計5個完了した',
    stars: 2,
    category: 'balance',
  },
  {
    id: 'calendar_exam_view',
    title: '先を見据えて',
    description: '自分の模試や小テストの予定をカレンダーで確認した',
    stars: 1,
    category: 'balance',
  },
  {
    id: 'study_log_detailed_memo',
    title: '未来の自分へ',
    description: '学習記録の「内容」欄に10文字以上の詳しいメモを残して投稿した',
    stars: 1,
    category: 'balance',
  },
  {
    id: 'coaching_first',
    title: '初めての',
    description: 'コーチングを初めて予約し、実施した',
    stars: 1,
    category: 'balance',
  },
  {
    id: 'coaching_10',
    title: '相談が，あるんです',
    description: 'コーチングを10回予約し、実施した',
    stars: 2,
    category: 'balance',
  },
  {
    id: 'coaching_20',
    title: '私のこと，分かりますよね？',
    description: 'コーチングを20回予約し、実施した',
    stars: 3,
    category: 'balance',
  },
  {
    id: 'coaching_50',
    title: '二人三脚',
    description: 'コーチングを50回予約し、実施した',
    stars: 4,
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
    id: 'announcement_read_5',
    title: 'メガホンを持って',
    description: '未読のお知らせを5つ既読にした',
    stars: 2,
    category: 'balance',
  },
  {
    id: 'study_history_views_10',
    title: '過去から学ぶ',
    description: '学習履歴で、過去の履歴を10回以上見た',
    stars: 2,
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
  {
    id: 'birthday_since_registration',
    title: '歳は数字でしかない，から',
    description: '登録して初めて誕生日を迎えた',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'chat_messages_5',
    title: '些細なことでも',
    description: 'メッセージ機能で管理者に5回以上メッセージを送った',
    stars: 1,
    category: 'secret',
    secret: true,
  },
  {
    id: 'chat_messages_20',
    title: 'ほうれん草食べた',
    description: 'メッセージ機能で管理者に20回以上メッセージを送った',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'chat_messages_50',
    title: '何でも話せる間柄',
    description: 'メッセージ機能で管理者に50回以上メッセージを送った',
    stars: 3,
    category: 'secret',
    secret: true,
  },
  {
    id: 'study_log_early_morning',
    title: '早起きは何文の徳？',
    description: '5:00～8:00の間に学習を記録した',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'study_log_lunch',
    title: 'やっぱ昼は勉強っしょ！',
    description: '12:00～13:00の間に学習を記録した',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'study_log_afternoon_light',
    title: '光の散乱を感じて...',
    description: '16:00～18:00の間に学習を記録した',
    stars: 1,
    category: 'secret',
    secret: true,
  },
  {
    id: 'study_log_midnight',
    title: '真夜中のmidnight',
    description: '23:00～0:00の間に学習を記録した',
    stars: 1,
    category: 'secret',
    secret: true,
  },
  {
    id: 'study_log_late_night',
    title: '明日は休み...？',
    description: '1:00～3:00の間に学習を記録した',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'weekend_warrior',
    title: '週末の覇者',
    description: '土曜日と日曜日の2日間で合計16時間以上勉強した',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'friday_night_study',
    title: '華金の誘惑を断ち切って',
    description: '金曜日の21:00以降に学習を記録した',
    stars: 1,
    category: 'secret',
    secret: true,
  },
  {
    id: 'christmas_study',
    title: '聖なる夜もペンを握る',
    description: '12月24日と25日の両日に学習を記録した',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'new_year_study',
    title: '一年の計は元旦にあり',
    description: '1月1日に学習を記録した',
    stars: 2,
    category: 'secret',
    secret: true,
  },
  {
    id: 'monthly_aug_50h',
    title: '天王山を超えて',
    description: '8月の1か月間で50時間以上勉強した',
    stars: 3,
    category: 'secret',
    secret: true,
  },
  {
    id: 'monthly_sep_100h',
    title: '勉強の秋！',
    description: '9月の1か月間で100時間以上勉強した',
    stars: 3,
    category: 'secret',
    secret: true,
  },
  {
    id: 'monthly_oct_100h',
    title: '晩秋の勢い',
    description: '10月の1か月間で100時間以上勉強した',
    stars: 3,
    category: 'secret',
    secret: true,
  },
  {
    id: 'monthly_nov_100h',
    title: '11ってペンが2本だよね？',
    description: '11月の1か月間で100時間以上勉強した',
    stars: 3,
    category: 'secret',
    secret: true,
  },
  {
    id: 'monthly_dec_100h',
    title: '寒い時こそ勉強！',
    description: '12月の1か月間で100時間以上勉強した',
    stars: 3,
    category: 'secret',
    secret: true,
  },
  {
    id: 'chat_night_consultation',
    title: '夜のお悩み相談',
    description: '22:00〜1:00の間に先生にメッセージを送信した',
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
  if (
    pathname.startsWith('/dashboard/study/subject') ||
    pathname.startsWith('/dashboard/study/textbook')
  ) {
    return '/dashboard/study'
  }

  if ((ACHIEVEMENT_MENU_PAGE_KEYS as readonly string[]).includes(pathname)) {
    return pathname
  }

  return null
}
