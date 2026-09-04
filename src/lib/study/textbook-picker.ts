import { deriveStudyCategoryFromTextbook } from '@/lib/constants/textbook-subject-categories'
import type { Textbook } from '@/types/textbook'

export type StudyTextbookPickerItem = Textbook & {
  lastStudiedOn: string | null
  subjectLabel: string | null
}

export function toStudyTextbookPickerItems(
  textbooks: Textbook[],
  profileSubjects: string[],
  lastStudiedOnByTextbookId: Record<string, string>,
): StudyTextbookPickerItem[] {
  return textbooks.map((book) => {
    const detailTags = book.detail_tags ?? []
    const usageTags = book.usage_tags ?? []
    const subjects = book.subjects ?? []

    return {
      ...book,
      subjects,
      detail_tags: detailTags,
      usage_tags: usageTags,
      lastStudiedOn: lastStudiedOnByTextbookId[book.id] ?? null,
      subjectLabel: deriveStudyCategoryFromTextbook(subjects, profileSubjects, detailTags),
    }
  })
}
