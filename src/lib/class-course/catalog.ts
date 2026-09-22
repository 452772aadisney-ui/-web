/**
 * 既卒授業回数管理（共通授業）— 科目・時期・枠・番号表示。
 * 学習記録 / プロフィールの科目体系とは独立。
 */

export const CLASS_COURSE_TERMS = [
  'spring',
  'first_half',
  'summer',
  'second_half',
  'winter',
  'pre_exam',
] as const

export type ClassCourseTerm = (typeof CLASS_COURSE_TERMS)[number]

export const CLASS_COURSE_TERM_LABELS: Record<ClassCourseTerm, string> = {
  spring: '春期',
  first_half: '前期',
  summer: '夏期',
  second_half: '後期',
  winter: '冬期',
  pre_exam: '直前期',
}

export const CLASS_COURSE_SUBJECTS = [
  'english_grammar',
  'english_reading',
  'math_iaiibc',
  'math_iii',
  'physics',
  'japanese',
] as const

export type ClassCourseSubject = (typeof CLASS_COURSE_SUBJECTS)[number]

export const CLASS_COURSE_SUBJECT_LABELS: Record<ClassCourseSubject, string> = {
  english_grammar: '英文法',
  english_reading: '英文読解',
  math_iaiibc: '数学IAIIBC',
  math_iii: '数学Ⅲ',
  physics: '物理',
  japanese: '国語',
}

/** 通常枠 / 単発追加枠 — 採番キーの一部 */
export const CLASS_COURSE_TRACKS = ['regular', 'addon'] as const
export type ClassCourseTrack = (typeof CLASS_COURSE_TRACKS)[number]

export const CLASS_COURSE_TRACK_LABELS: Record<ClassCourseTrack, string> = {
  regular: '通常枠',
  addon: '単発追加',
}

/** 料金分類（表示のみ。請求機能なし） */
export type ClassCourseFeeKind = 'monthly_regular' | 'course' | 'addon'

export function resolveClassCourseFeeKind(
  term: ClassCourseTerm,
  track: ClassCourseTrack,
): ClassCourseFeeKind {
  if (track === 'addon') return 'addon'
  if (term === 'first_half' || term === 'second_half') return 'monthly_regular'
  return 'course'
}

export const CLASS_COURSE_FEE_KIND_LABELS: Record<ClassCourseFeeKind, string> = {
  monthly_regular: 'レギュラー',
  course: '講習（別料金）',
  addon: '単発追加（別料金）',
}

export const CLASS_COURSE_SEQ_MAX = 99
export const CLASS_COURSE_ADD_COUNT_MAX = 50

/** ①–⑳ (U+2460–U+2473), ㉑–㉟ (U+3251–U+325F), ㊱–㊿ (U+32B1–U+32BF) */
const CIRCLED_1_TO_20 = Array.from({ length: 20 }, (_, i) =>
  String.fromCharCode(0x2460 + i),
)
const CIRCLED_21_TO_35 = Array.from({ length: 15 }, (_, i) =>
  String.fromCharCode(0x3251 + i),
)
const CIRCLED_36_TO_50 = Array.from({ length: 15 }, (_, i) =>
  String.fromCharCode(0x32b1 + i),
)

export function formatClassCourseSeq(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) return `（${seq}）`
  if (seq <= 20) return CIRCLED_1_TO_20[seq - 1]!
  if (seq <= 35) return CIRCLED_21_TO_35[seq - 21]!
  if (seq <= 50) return CIRCLED_36_TO_50[seq - 36]!
  return `（${seq}）`
}

export function buildClassCourseDisplayName(params: {
  subject: ClassCourseSubject
  term: ClassCourseTerm
  track: ClassCourseTrack
  seqNo: number
}): string {
  const subject = CLASS_COURSE_SUBJECT_LABELS[params.subject]
  const term = CLASS_COURSE_TERM_LABELS[params.term]
  const seq = formatClassCourseSeq(params.seqNo)
  if (params.track === 'addon') {
    return `${subject}・${term}・追加${seq}`
  }
  return `${subject}・${term}${seq}`
}

/** 3月開始の学年年度（JST）。例: 2026-03-01〜2027-02-28 → 2026 */
export function resolveAcademicYearFromJstDateKey(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) throw new Error('invalid date key')
  const y = Number(m[1])
  const month = Number(m[2])
  return month >= 3 ? y : y - 1
}

export function academicYearRangeLabel(academicYear: number): string {
  return `${academicYear}年度（${academicYear}/3/1〜${academicYear + 1}/2/28）`
}

/** 手入力セレクト等向け。年度・講座・枠を見分けられる表示（並び替え用ではない）。 */
export function buildClassCourseSelectLabel(params: {
  academicYear: number
  subject: ClassCourseSubject
  term: ClassCourseTerm
  track: ClassCourseTrack
  seqNo: number
}): string {
  const fee = resolveClassCourseFeeKind(params.term, params.track)
  return [
    `${params.academicYear}年度`,
    CLASS_COURSE_SUBJECT_LABELS[params.subject],
    CLASS_COURSE_TERM_LABELS[params.term],
    CLASS_COURSE_TRACK_LABELS[params.track],
    CLASS_COURSE_FEE_KIND_LABELS[fee],
    formatClassCourseSeq(params.seqNo),
  ].join(' · ')
}

/** グループ見出し: 2026年度・英文読解・後期・通常枠 */
export function buildClassCourseGroupHeading(params: {
  academicYear: number
  subject: ClassCourseSubject
  term: ClassCourseTerm
  track: ClassCourseTrack
}): string {
  return [
    `${params.academicYear}年度`,
    CLASS_COURSE_SUBJECT_LABELS[params.subject],
    CLASS_COURSE_TERM_LABELS[params.term],
    CLASS_COURSE_TRACK_LABELS[params.track],
  ].join('・')
}

/** 数値 seq とカタログ順で並べる（表示文字列・UUID・作成順に依存しない）。 */
export function compareClassCourseUnitOrder(
  a: {
    academicYear: number
    term: ClassCourseTerm | string
    subject: ClassCourseSubject | string
    track: ClassCourseTrack | string
    seqNo: number
  },
  b: {
    academicYear: number
    term: ClassCourseTerm | string
    subject: ClassCourseSubject | string
    track: ClassCourseTrack | string
    seqNo: number
  },
): number {
  if (a.academicYear !== b.academicYear) return a.academicYear - b.academicYear
  const termA = CLASS_COURSE_TERMS.indexOf(a.term as ClassCourseTerm)
  const termB = CLASS_COURSE_TERMS.indexOf(b.term as ClassCourseTerm)
  if (termA !== termB) return termA - termB
  const subjectA = CLASS_COURSE_SUBJECTS.indexOf(a.subject as ClassCourseSubject)
  const subjectB = CLASS_COURSE_SUBJECTS.indexOf(b.subject as ClassCourseSubject)
  if (subjectA !== subjectB) return subjectA - subjectB
  const trackA = CLASS_COURSE_TRACKS.indexOf(a.track as ClassCourseTrack)
  const trackB = CLASS_COURSE_TRACKS.indexOf(b.track as ClassCourseTrack)
  if (trackA !== trackB) return trackA - trackB
  return a.seqNo - b.seqNo
}
