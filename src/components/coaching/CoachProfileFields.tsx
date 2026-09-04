import {
  COACH_EXAM_TYPE_OPTIONS,
  COACH_SCHOOL_TYPE_OPTIONS,
  COACH_STREAM_LABELS,
} from '@/lib/coaching/coach-profile'
import type { CoachingCoach } from '@/types/coaching'

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface CoachProfileFieldsProps {
  coach?: CoachingCoach
}

export function CoachProfileFields({ coach }: CoachProfileFieldsProps) {
  return (
    <div className="space-y-4 rounded-lg border border-dashed border-border bg-background/60 p-4">
      <p className="text-sm font-medium">プロフィール（任意）</p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">文系 / 理系</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="stream"
              value=""
              defaultChecked={!coach?.stream}
            />
            未設定
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="stream"
              value="humanities"
              defaultChecked={coach?.stream === 'humanities'}
            />
            {COACH_STREAM_LABELS.humanities}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="stream"
              value="sciences"
              defaultChecked={coach?.stream === 'sciences'}
            />
            {COACH_STREAM_LABELS.sciences}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">国公立 / 私立</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {COACH_SCHOOL_TYPE_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="schoolTypes"
                value={option}
                defaultChecked={coach?.school_types?.includes(option)}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">一般受験 / 推薦</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {COACH_EXAM_TYPE_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="examTypes"
                value={option}
                defaultChecked={coach?.exam_types?.includes(option)}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="hasInternalRecommendation"
          defaultChecked={coach?.has_internal_recommendation_experience}
        />
        内部推薦経験あり
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">得意科目</span>
        <input
          name="strongSubjects"
          defaultValue={coach?.strong_subjects?.join('、') ?? ''}
          placeholder="例: 数学、英語"
          className={fieldClass}
        />
        <span className="mt-1 block text-xs text-muted">カンマまたは読点区切り</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">その他特徴</span>
        <input
          name="featureTags"
          defaultValue={coach?.feature_tags?.join('、') ?? ''}
          placeholder="例: 難関大受験、メンタルサポート"
          className={fieldClass}
        />
        <span className="mt-1 block text-xs text-muted">カンマまたは読点区切り</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">紹介文</span>
        <textarea
          name="bio"
          rows={4}
          defaultValue={coach?.bio ?? ''}
          placeholder="生徒向けに表示する紹介文"
          className={fieldClass}
        />
      </label>
    </div>
  )
}
