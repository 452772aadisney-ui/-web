export type OnboardingChecklistItemId =
  | 'subjects'
  | 'birthday'
  | 'targetSchools'
  | 'textbooks'
  | 'studyLog'

export type OnboardingChecklistItem = {
  id: OnboardingChecklistItemId
  label: string
  href: string
  completed: boolean
}

export type OnboardingChecklistInput = {
  subjects: string[]
  birthday: string | null
  targetSchools: string[]
  textbookCount: number
  hasPositiveStudyLog: boolean
}

export function isValidBirthday(birthday: string | null | undefined): boolean {
  if (!birthday || !birthday.trim()) return false
  const trimmed = birthday.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false
  const date = new Date(`${trimmed}T00:00:00Z`)
  return !Number.isNaN(date.getTime())
}

export function hasRegisteredTargetSchools(targetSchools: string[] | null | undefined): boolean {
  return (targetSchools ?? []).some((school) => school.trim().length > 0)
}

export function buildOnboardingChecklist(
  input: OnboardingChecklistInput,
): OnboardingChecklistItem[] {
  return [
    {
      id: 'subjects',
      label: '使用科目を登録する',
      href: '/dashboard/profile#subjects',
      completed: (input.subjects ?? []).length > 0,
    },
    {
      id: 'birthday',
      label: '生年月日を登録する',
      href: '/dashboard/profile#birthday',
      completed: isValidBirthday(input.birthday),
    },
    {
      id: 'targetSchools',
      label: '志望校を登録する',
      href: '/dashboard/profile#target-schools',
      completed: hasRegisteredTargetSchools(input.targetSchools),
    },
    {
      id: 'textbooks',
      label: '教材を1冊以上登録する',
      href: '/dashboard/textbooks/register',
      completed: input.textbookCount > 0,
    },
    {
      id: 'studyLog',
      label: '学習記録を1件登録する',
      href: '/dashboard/study',
      completed: input.hasPositiveStudyLog,
    },
  ]
}

export function getIncompleteOnboardingItems(
  input: OnboardingChecklistInput,
): OnboardingChecklistItem[] {
  return buildOnboardingChecklist(input).filter((item) => !item.completed)
}

export function shouldShowOnboardingChecklist(input: OnboardingChecklistInput): boolean {
  return getIncompleteOnboardingItems(input).length > 0
}
