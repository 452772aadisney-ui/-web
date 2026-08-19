'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { createStudyLog, type StudyLogActionState } from '@/app/study/actions'
import { useAchievementUnlockDialog } from '@/components/achievements/useAchievementUnlockDialog'
import {
  filterTextbooksByStudyCategory,
  getStudySubjectCategoriesForProfile,
} from '@/lib/constants/textbook-subject-categories'
import { getJstDateKey } from '@/lib/study/dates'
import { StudyDurationInput } from '@/components/study/StudyDurationInput'
import type { Textbook } from '@/types/textbook'

const initialState: StudyLogActionState = {}

const fieldClass =
  'block w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

const dateFieldShellClass =
  'w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'

interface StudyLogTextbookFormProps {
  profileSubjects: string[]
  textbooks: Textbook[]
}

export function StudyLogTextbookForm({ profileSubjects, textbooks }: StudyLogTextbookFormProps) {
  const [state, formAction, pending] = useActionState(createStudyLog, initialState)
  const { dialog: achievementDialog } = useAchievementUnlockDialog(state.unlockedAchievements)
  const [selectedSubject, setSelectedSubject] = useState('')
  const todayKey = getJstDateKey()

  const studySubjectCategories = getStudySubjectCategoriesForProfile(profileSubjects)
  const filteredTextbooks = filterTextbooksByStudyCategory(textbooks, selectedSubject)

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
    <>
      {achievementDialog}
      <form action={formAction} className="min-w-0 space-y-4">
      <input type="hidden" name="registrationMode" value="textbook" />

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
          科目 <span className="text-error">*</span>
        </span>
        <select
          name="subject"
          required
          value={selectedSubject}
          onChange={(event) => setSelectedSubject(event.target.value)}
          className={fieldClass}
        >
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
        <span className="mb-1.5 block text-sm font-medium">
          参考書 <span className="text-error">*</span>
        </span>
        <select
          name="textbookId"
          required
          disabled={!selectedSubject}
          defaultValue=""
          key={selectedSubject}
          className={`${fieldClass} disabled:opacity-50`}
        >
          <option value="" disabled>
            {selectedSubject ? '参考書を選択' : '先に科目を選択してください'}
          </option>
          {filteredTextbooks.map((book) => (
            <option key={book.id} value={book.id}>
              {book.name}
            </option>
          ))}
        </select>
        {selectedSubject && filteredTextbooks.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">
            この科目の参考書がありません。{' '}
            <Link href="/dashboard/textbooks/register" className="underline">
              参考書登録
            </Link>
            で参考書を追加してください。
          </p>
        )}
      </label>

      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">内容</span>
        <textarea
          name="content"
          rows={3}
          placeholder="例: 第3章 二次関数の演習"
          className={fieldClass}
        />
      </label>

      <StudyDurationInput />

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
        disabled={pending || !selectedSubject || filteredTextbooks.length === 0}
        className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? '保存中…' : '記録を追加'}
      </button>
    </form>
    </>
  )
}
