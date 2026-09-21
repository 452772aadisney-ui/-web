'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelClassCourseAssignment } from '@/app/class-course/attendance-actions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export function CancelAssignmentButton(props: {
  studentId: string
  courseUnitId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        type="button"
        disabled={props.disabled || pending}
        className="rounded border border-border px-2 py-1 text-xs text-error disabled:opacity-50"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        title={
          props.disabled
            ? '実施済みのため、先に未実施へ訂正してください'
            : undefined
        }
      >
        割当取消
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title="この授業の割当を取り消しますか？"
        description="共通授業の定義と履歴は残ります。予定コマの対象に残っている場合や実施済みの場合は取り消せません。"
        confirmLabel="取り消す"
        busy={pending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await cancelClassCourseAssignment({
              courseUnitId: props.courseUnitId,
              studentId: props.studentId,
            })
            if (!result.ok) {
              setError(result.error)
              setOpen(false)
              return
            }
            setOpen(false)
            router.refresh()
          })
        }}
        onCancel={() => {
          if (!pending) setOpen(false)
        }}
      />
    </>
  )
}
