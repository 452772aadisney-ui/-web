import { getStudyFeedbackStamp } from '@/lib/study/feedback'
import type { StudyDayFeedback } from '@/lib/study/feedback'
import { cn } from '@/lib/utils'

interface StudyDayFeedbackCardProps {
  feedback: StudyDayFeedback
  className?: string
  isUnread?: boolean
}

export function StudyDayFeedbackCard({
  feedback,
  className,
  isUnread = false,
}: StudyDayFeedbackCardProps) {
  const stamp = getStudyFeedbackStamp(feedback.stamp)
  const hasComment = feedback.comment.trim().length > 0

  return (
    <div
      className={cn(
        'rounded-xl border bg-amber-50/80 p-3',
        isUnread && hasComment
          ? 'border-red-300 ring-2 ring-red-200'
          : 'border-amber-200',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-amber-900">先生からのフィードバック</p>
        {isUnread && hasComment && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white">
            未読
          </span>
        )}
      </div>
      <div className="mt-2 flex items-start gap-2">
        <span className="text-xl leading-none" aria-hidden>
          {stamp?.emoji ?? '⭐'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-950">{stamp?.label ?? 'フィードバック'}</p>
          {feedback.comment.trim() ? (
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-amber-950">{feedback.comment}</p>
          ) : (
            <p className="mt-1.5 text-xs text-amber-800">スタンプが送られました。</p>
          )}
        </div>
      </div>
    </div>
  )
}
