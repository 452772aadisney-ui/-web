'use client'

import { useActionState } from 'react'
import {
  updateStudentProfileByAdmin,
  type AdminStudentProfileActionState,
} from '@/app/admin/students/actions'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import { SubjectCheckboxGrid } from '@/components/subjects/SubjectCheckboxGrid'
import { useActionToast } from '@/hooks/useActionToast'

const initialState: AdminStudentProfileActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

export interface AdminStudentProfileData {
  id: string
  email: string
  full_name: string
  birthday: string | null
  target_schools: string[]
  subjects: string[]
  student_code: string | null
}

interface AdminStudentProfileFormProps {
  student: AdminStudentProfileData
}

export function AdminStudentProfileForm({ student }: AdminStudentProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateStudentProfileByAdmin, initialState)
  const selectedSubjects = new Set(student.subjects ?? [])

  useActionToast(state, {
    successMessage: '生徒情報を保存しました',
    pending,
  })

  return (
    <form action={formAction} className="mt-4 space-y-5">
      <input type="hidden" name="studentId" value={student.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">氏名 *</span>
          <input
            name="fullName"
            required
            defaultValue={student.full_name}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">メールアドレス</span>
          <input
            value={student.email}
            readOnly
            className={`${fieldClass} bg-background text-muted`}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">生徒ID</span>
          <input
            name="studentCode"
            defaultValue={student.student_code ?? ''}
            placeholder="例: JS-2026-000001"
            className={`${fieldClass} font-mono`}
          />
          <span className="mt-1 block text-xs text-muted">
            QRコードに使用されます。空欄の場合は自動生成されます。
          </span>
        </label>
      </div>

      <label className="block sm:max-w-xs">
        <span className="mb-1.5 block text-sm font-medium">誕生日</span>
        <input
          type="date"
          name="birthday"
          defaultValue={student.birthday ?? ''}
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">志望校</span>
        <textarea
          name="targetSchools"
          rows={4}
          defaultValue={(student.target_schools ?? []).join('\n')}
          placeholder={'東京大学\n京都大学'}
          className={fieldClass}
        />
        <span className="mt-1 block text-xs text-muted">1行に1校ずつ入力</span>
      </label>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">使用科目</legend>
        <SubjectCheckboxGrid subjects={EXAM_SUBJECTS} selectedSubjects={selectedSubjects} />
      </fieldset>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '保存中…' : '生徒情報を保存'}
      </button>
    </form>
  )
}
