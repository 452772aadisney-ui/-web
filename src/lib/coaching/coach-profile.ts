import type { CoachingCoach } from '@/types/coaching'

export type CoachStream = 'humanities' | 'sciences'

export const COACH_STREAM_LABELS: Record<CoachStream, string> = {
  humanities: '文系',
  sciences: '理系',
}

export const COACH_SCHOOL_TYPE_OPTIONS = ['国公立', '私立'] as const
export const COACH_EXAM_TYPE_OPTIONS = ['一般受験', '推薦'] as const

export function getCoachAttributeTags(coach: CoachingCoach): string[] {
  const tags: string[] = []
  if (coach.stream) {
    tags.push(COACH_STREAM_LABELS[coach.stream as CoachStream] ?? coach.stream)
  }
  for (const value of coach.school_types ?? []) {
    if (value.trim()) tags.push(value.trim())
  }
  for (const value of coach.exam_types ?? []) {
    if (value.trim()) tags.push(value.trim())
  }
  return tags
}

export function getCoachStrongSubjects(coach: CoachingCoach): string[] {
  return (coach.strong_subjects ?? []).map((v) => v.trim()).filter(Boolean)
}

export function getCoachFeatureLabels(coach: CoachingCoach): string[] {
  const labels: string[] = []
  if (coach.has_internal_recommendation_experience) {
    labels.push('内部推薦経験あり')
  }
  for (const value of coach.feature_tags ?? []) {
    if (value.trim()) labels.push(value.trim())
  }
  return labels
}

/** Flat badge list (legacy / compact summaries). */
export function getCoachProfileBadges(coach: CoachingCoach): string[] {
  return [
    ...getCoachAttributeTags(coach),
    ...getCoachStrongSubjects(coach),
    ...getCoachFeatureLabels(coach),
  ]
}

export function getCoachNameInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.slice(0, 1)
}

export function summarizeCoachText(value: string | null | undefined, max = 80): string | null {
  const text = (value ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
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
