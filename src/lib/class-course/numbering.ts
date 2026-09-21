/**
 * 共通授業の連番採番（同一キー: 年度×時期×科目×通常/追加枠）。
 * DB 既存番号集合を渡して純関数で決める。実 INSERT は TX + advisory lock。
 */

import {
  CLASS_COURSE_ADD_COUNT_MAX,
  CLASS_COURSE_SEQ_MAX,
  CLASS_COURSE_TERM_LABELS,
  CLASS_COURSE_TRACK_LABELS,
  buildClassCourseDisplayName,
  formatClassCourseSeq,
  type ClassCourseSubject,
  type ClassCourseTerm,
  type ClassCourseTrack,
} from '@/lib/class-course/catalog'

export type ClassCourseNumberingMode = 'append' | 'custom'

export type ClassCourseNumberingInput = {
  existingSeqNumbers: readonly number[]
  mode: ClassCourseNumberingMode
  /** custom 時必須。append 時は無視 */
  startSeq?: number
  count: number
}

export type ClassCourseNumberingSuccess = {
  ok: true
  startSeq: number
  endSeq: number
  seqNumbers: number[]
  requestedStartSeq: number
  overlapCount: number
  shift: number
}

export type ClassCourseNumberingFailure = {
  ok: false
  code:
    | 'invalid_count'
    | 'invalid_start'
    | 'range_exceeds_max'
    | 'no_contiguous_range'
  message: string
}

export type ClassCourseNumberingResult =
  | ClassCourseNumberingSuccess
  | ClassCourseNumberingFailure

function occupiedSet(existing: readonly number[]): Set<number> {
  const set = new Set<number>()
  for (const n of existing) {
    if (Number.isInteger(n) && n >= 1 && n <= CLASS_COURSE_SEQ_MAX) set.add(n)
  }
  return set
}

function rangeIsFree(occupied: Set<number>, start: number, count: number): boolean {
  for (let i = 0; i < count; i++) {
    if (occupied.has(start + i)) return false
  }
  return true
}

function countOverlaps(
  occupied: Set<number>,
  start: number,
  count: number,
): number {
  let n = 0
  for (let i = 0; i < count; i++) {
    if (occupied.has(start + i)) n += 1
  }
  return n
}

/**
 * append: max+1 から count 個（欠番は埋めない）。
 * custom: 希望開始以降で最初の連続空き。衝突時はずらすが count は不変。
 */
export function planClassCourseSeqRange(
  input: ClassCourseNumberingInput,
): ClassCourseNumberingResult {
  const count = input.count
  if (!Number.isInteger(count) || count < 1 || count > CLASS_COURSE_ADD_COUNT_MAX) {
    return {
      ok: false,
      code: 'invalid_count',
      message: `追加回数は1〜${CLASS_COURSE_ADD_COUNT_MAX}回で指定してください`,
    }
  }

  const occupied = occupiedSet(input.existingSeqNumbers)
  let maxExisting = 0
  for (const n of occupied) if (n > maxExisting) maxExisting = n

  if (input.mode === 'append') {
    const startSeq = maxExisting + 1
    const endSeq = startSeq + count - 1
    if (endSeq > CLASS_COURSE_SEQ_MAX) {
      return {
        ok: false,
        code: 'range_exceeds_max',
        message: `番号が${CLASS_COURSE_SEQ_MAX}を超えるため登録できません`,
      }
    }
    const seqNumbers = Array.from({ length: count }, (_, i) => startSeq + i)
    return {
      ok: true,
      startSeq,
      endSeq,
      seqNumbers,
      requestedStartSeq: startSeq,
      overlapCount: 0,
      shift: 0,
    }
  }

  const requestedStart = input.startSeq
  if (
    requestedStart == null ||
    !Number.isInteger(requestedStart) ||
    requestedStart < 1 ||
    requestedStart > CLASS_COURSE_SEQ_MAX
  ) {
    return {
      ok: false,
      code: 'invalid_start',
      message: `開始番号は1〜${CLASS_COURSE_SEQ_MAX}で指定してください`,
    }
  }

  if (requestedStart + count - 1 > CLASS_COURSE_SEQ_MAX) {
    return {
      ok: false,
      code: 'range_exceeds_max',
      message: `番号が${CLASS_COURSE_SEQ_MAX}を超えるため登録できません`,
    }
  }

  const overlapCount = countOverlaps(occupied, requestedStart, count)

  for (
    let candidate = requestedStart;
    candidate + count - 1 <= CLASS_COURSE_SEQ_MAX;
    candidate += 1
  ) {
    if (!rangeIsFree(occupied, candidate, count)) continue
    const endSeq = candidate + count - 1
    const seqNumbers = Array.from({ length: count }, (_, i) => candidate + i)
    return {
      ok: true,
      startSeq: candidate,
      endSeq,
      seqNumbers,
      requestedStartSeq: requestedStart,
      overlapCount,
      shift: candidate - requestedStart,
    }
  }

  return {
    ok: false,
    code: 'no_contiguous_range',
    message: `指定回数分の連続した空き番号を${CLASS_COURSE_SEQ_MAX}以内に確保できません`,
  }
}

export function buildClassCourseRegistrationPopup(params: {
  plan: ClassCourseNumberingSuccess
  term: ClassCourseTerm
  track: ClassCourseTrack
  subject: ClassCourseSubject
}): { title: string; body: string } {
  const { plan, term, track, subject } = params
  const termLabel = CLASS_COURSE_TERM_LABELS[term]
  const rangeLabel =
    track === 'addon'
      ? `${termLabel}・追加${formatClassCourseSeq(plan.startSeq)}〜${formatClassCourseSeq(plan.endSeq)}`
      : `${termLabel}${formatClassCourseSeq(plan.startSeq)}〜${formatClassCourseSeq(plan.endSeq)}`
  const registeredLine = `登録した授業：${rangeLabel}（${plan.seqNumbers.length}回）`
  // 先頭1件の正式名称（確認用）
  void buildClassCourseDisplayName({
    subject,
    term,
    track,
    seqNo: plan.startSeq,
  })
  void CLASS_COURSE_TRACK_LABELS

  if (plan.shift === 0) {
    return { title: '授業を登録しました', body: registeredLine }
  }

  if (plan.overlapCount === plan.shift) {
    return {
      title: '授業を登録しました',
      body: [
        `すでに登録されている授業と番号が重複していたため、重複分（${plan.overlapCount}回）をずらして連番登録しました。`,
        registeredLine,
      ].join('\n'),
    }
  }

  return {
    title: '授業を登録しました',
    body: [
      `指定の番号範囲では登録できなかったため、開始番号を${formatClassCourseSeq(plan.requestedStartSeq)}から${formatClassCourseSeq(plan.startSeq)}へずらして連番登録しました（指定範囲内の重複 ${plan.overlapCount}件）。`,
      registeredLine,
    ].join('\n'),
  }
}
