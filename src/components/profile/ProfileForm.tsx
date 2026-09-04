'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile, type ProfileActionState } from '@/app/profile/actions'
import { useAchievementUnlockDialog } from '@/components/achievements/useAchievementUnlockDialog'
import { useActionToast } from '@/hooks/useActionToast'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import { SubjectCheckboxGrid } from '@/components/subjects/SubjectCheckboxGrid'
import type { Profile } from '@/types/database'

const initialState: ProfileActionState = {}

interface ProfileFormProps {
  profile: Profile
  backHref: string
}

export function ProfileForm({ profile, backHref }: ProfileFormProps) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateProfile, initialState)
  const [pendingRedirect, setPendingRedirect] = useState(false)
  const { dialog } = useAchievementUnlockDialog(state.unlockedAchievements, {
    onClose: () => {
      if (!pendingRedirect) return
      setPendingRedirect(false)
      router.push(backHref)
    },
  })

  useActionToast(state, {
    successMessage: 'プロフィールを保存しました',
    pending,
  })

  useEffect(() => {
    if (!state.success) return

    if (state.unlockedAchievements?.length) {
      setPendingRedirect(true)
      return
    }

    router.push(backHref)
  }, [state.success, state.unlockedAchievements, backHref, router])

  const targetSchoolsText = profile.target_schools.join('\n')
  const selectedSubjects = new Set(profile.subjects)

  return (
    <>
      {dialog}
      <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">
            氏名 <span className="text-error">*</span>
          </span>
          <input
            type="text"
            name="fullName"
            defaultValue={profile.full_name}
            required
            placeholder="山田 太郎"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">誕生日</span>
        <input
          type="date"
          name="birthday"
          defaultValue={profile.birthday ?? ''}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">志望校</span>
        <textarea
          name="targetSchools"
          defaultValue={targetSchoolsText}
          rows={4}
          placeholder={'東京大学\n京都大学\n早稲田大学'}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="mt-1 block text-xs text-muted">1行に1校ずつ入力してください</span>
      </label>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">使用科目</legend>
        <SubjectCheckboxGrid subjects={EXAM_SUBJECTS} selectedSubjects={selectedSubjects} />
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? '保存中…' : '保存する'}
        </button>
        <Link href={backHref} className="text-center text-sm text-muted hover:text-foreground">
          キャンセル
        </Link>
      </div>
    </form>
    </>
  )
}
