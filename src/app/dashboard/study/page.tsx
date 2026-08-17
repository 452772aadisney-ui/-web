import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudyLogModeDialogPage } from '@/components/study/StudyLogModeDialogPage'

export default async function StudentStudyRecordPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  return <StudyLogModeDialogPage />
}
