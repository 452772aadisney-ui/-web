'use client'

import { useRouter } from 'next/navigation'
import { StudyLogModeDialog } from '@/components/study/StudyLogModeDialog'

export function StudyLogModeDialogPage() {
  const router = useRouter()

  return <StudyLogModeDialog open onClose={() => router.push('/dashboard')} />
}
