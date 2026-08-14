export const STUDY_FEEDBACK_STAMPS = [
  { id: 'excellent', emoji: '⭐', label: 'すばらしい' },
  { id: 'good', emoji: '👍', label: 'よくできました' },
  { id: 'effort', emoji: '💪', label: 'がんばった' },
  { id: 'nice', emoji: '👏', label: 'ナイス' },
] as const

export type StudyFeedbackStampId = (typeof STUDY_FEEDBACK_STAMPS)[number]['id']

export interface StudyDayFeedback {
  id: string
  student_id: string
  studied_on: string
  stamp: StudyFeedbackStampId
  comment: string
  admin_id: string
  created_at: string
  updated_at: string
}

export function isStudyFeedbackStampId(value: string): value is StudyFeedbackStampId {
  return STUDY_FEEDBACK_STAMPS.some((stamp) => stamp.id === value)
}

export function getStudyFeedbackStamp(stampId: string) {
  return STUDY_FEEDBACK_STAMPS.find((stamp) => stamp.id === stampId) ?? null
}
