export const MAX_STUDY_DURATION_MINUTES = 1440

export function validateStudyDurationMinutes(durationMinutes: number): string | null {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return '学習時間は1分以上の整数で入力してください'
  }

  if (durationMinutes > MAX_STUDY_DURATION_MINUTES) {
    return `学習時間は${MAX_STUDY_DURATION_MINUTES}分以内で入力してください`
  }

  return null
}

export function validateStudiedOn(studiedOn: string, todayKey: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(studiedOn)) {
    return '学習日の形式が正しくありません'
  }

  if (studiedOn > todayKey) {
    return '学習日は今日以前の日付を選んでください'
  }

  return null
}
