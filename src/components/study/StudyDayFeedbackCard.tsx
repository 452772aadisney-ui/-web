import { getStudyFeedbackStamp } from '@/lib/study/feedback'
import type { StudyDayFeedback } from '@/lib/study/feedback'
import { cn } from '@/lib/utils'

interface StudyDayFeedbackCardProps {
  feedback: StudyDayFeedback
  className?: string
}

export function StudyDayFeedbackCard({ feedback, className }: StudyDayFeedbackCardProps) {
  const stamp = getStudyFeedbackStamp(feedback.stamp)

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200 bg-amber-50/80 p-4',
        className,
      )}
    >
      <p className="text-sm font-semibold text-amber-900">先生からのフィードバック</p>
      <div className="mt-3 flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden>
          {stamp?.emoji ?? '⭐'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-amber-950">{stamp?.label ?? 'フィードバック'}</p>
          {feedback.comment.trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{feedback.comment}</p>
          ) : (
            <p className="mt-2 text-sm text-amber-800">スタンプが送られました。</p>
          )}
        </div>
      </div>
    </div>
  )
}
