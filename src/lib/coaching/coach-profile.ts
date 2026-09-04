import type { CoachingCoach } from '@/types/coaching'

export type CoachStream = 'humanities' | 'sciences'

export const COACH_STREAM_LABELS: Record<CoachStream, string> = {
  humanities: '文系',
  sciences: '理系',
}

export const COACH_SCHOOL_TYPE_OPTIONS = ['国公立', '私立'] as const
export const COACH_EXAM_TYPE_OPTIONS = ['一般受験', '推薦'] as const

export function getCoachProfileBadges(coach: CoachingCoach): string[] {
  const badges: string[] = []

  if (coach.stream) {
    badges.push(COACH_STREAM_LABELS[coach.stream as CoachStream] ?? coach.stream)
  }

  for (const value of coach.school_types ?? []) {
    if (value.trim()) badges.push(value)
  }

  for (const value of coach.exam_types ?? []) {
    if (value.trim()) badges.push(value)
  }

  if (coach.has_internal_recommendation_experience) {
    badges.push('内部推薦経験')
  }

  for (const value of coach.strong_subjects ?? []) {
    if (value.trim()) badges.push(value)
  }

  for (const value of coach.feature_tags ?? []) {
    if (value.trim()) badges.push(value)
  }

  return badges
}

export function parseCoachStringList(value: FormDataEntryValue | null): string[] {
  const raw = String(value ?? '')
    .split(/[\n,、]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  return [...new Set(raw)]
}

export function parseCoachCheckboxList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean)
}
