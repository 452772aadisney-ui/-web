'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { createStudyLog, type StudyLogActionState } from '@/app/study/actions'
import { getStudySubjectCategoriesForProfile } from '@/lib/constants/textbook-subject-categories'
import { getJstDateKey } from '@/lib/study/dates'
import { MAX_STUDY_DURATION_MINUTES } from '@/lib/study/validation'

const initialState: StudyLogActionState = {}

const fieldClass =
  'block w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

const dateFieldShellClass =
  'w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'

interface StudyLogSubjectFormProps {
  profileSubjects: string[]
}

export function StudyLogSubjectForm({ profileSubjects }: StudyLogSubjectFormProps) {
  const [state, formAction, pending] = useActionState(createStudyLog, initialState)
  const todayKey = getJstDateKey()
  const studySubjectCategories = getStudySubjectCategoriesForProfile(profileSubjects)

  if (studySubjectCategories.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        使用科目が未設定です。{' '}
        <Link href="/dashboard/profile" className="font-medium underline">
          プロフィール編集
        </Link>
        で科目を選んでから学習記録を追加してください。
      </div>
    )
  }

  return (
    <form action={formAction} className="min-w-0 space-y-4">
      <input type="hidden" name="registrationMode" value="subject" />

      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">
          学習日 <span className="text-error">*</span>
        </span>
        <div className={dateFieldShellClass}>
          <input
            type="date"
            name="studiedOn"
            defaultValue={todayKey}
            max={todayKey}
            required
            className="study-date-input px-3 py-2.5 outline-none"
          />
        </div>
      </label>

      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">
          教科 <span className="text-error">*</span>
        </span>
        <select name="subject" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            選択してください
          </option>
          {studySubjectCategories.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
      </label>

      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">内容</span>
        <textarea
          name="content"
          rows={3}
          placeholder="例: 二次関数の演習"
          className={fieldClass}
        />
      </label>

      <label className="block w-full min-w-0 sm:max-w-xs">
        <span className="mb-1.5 block text-sm font-medium">
          学習時間（分） <span className="text-error">*</span>
        </span>
        <input
          type="number"
          name="durationMinutes"
          min={1}
          max={MAX_STUDY_DURATION_MINUTES}
          step={1}
          required
          placeholder="60"
          className={fieldClass}
        />
        <span className="mt-1 block text-xs text-muted">
          1〜{MAX_STUDY_DURATION_MINUTES}分の整数
        </span>
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      {state.success && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          学習記録を保存しました
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? '保存中…' : '記録を追加'}
      </button>
    </form>
  )
}
