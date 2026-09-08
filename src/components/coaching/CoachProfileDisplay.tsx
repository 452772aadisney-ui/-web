import {
  getCoachAttributeTags,
  getCoachFeatureLabels,
  getCoachNameInitial,
  getCoachStrongSubjects,
} from '@/lib/coaching/coach-profile'
import type { CoachingCoach } from '@/types/coaching'

interface CoachProfileDisplayProps {
  coach: CoachingCoach
  /**
   * `card` — bordered profile panel (admin preview).
   * `plain` — no outer frame (nested inside an existing card/section).
   */
  variant?: 'card' | 'plain'
  className?: string
}

function TagList({ tags, tone = 'primary' }: { tags: string[]; tone?: 'primary' | 'muted' }) {
  if (tags.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag}
          className={
            tone === 'primary'
              ? 'rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-primary'
              : 'rounded-md bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground'
          }
        >
          {tag}
        </li>
      ))}
    </ul>
  )
}

export function CoachProfileDisplay({
  coach,
  variant = 'card',
  className = '',
}: CoachProfileDisplayProps) {
  const attributes = getCoachAttributeTags(coach)
  const subjects = getCoachStrongSubjects(coach)
  const features = getCoachFeatureLabels(coach)
  const bio = coach.bio?.trim()
  const initial = getCoachNameInitial(coach.name)
  const hasBody = attributes.length > 0 || subjects.length > 0 || features.length > 0 || Boolean(bio)

  const shell =
    variant === 'card'
      ? 'rounded-xl border border-border bg-background p-4'
      : 'rounded-xl bg-transparent p-0'

  return (
    <article className={`${shell} ${className}`.trim()}>
      <header className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary"
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-foreground">{coach.name}</h3>
          {attributes.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-muted">{attributes.slice(0, 3).join(' · ')}</p>
          )}
        </div>
      </header>

      {!hasBody ? (
        <p className="mt-3 text-sm text-muted">プロフィール情報はこれから登録されます。</p>
      ) : (
        <div className="mt-4 space-y-4">
          {attributes.length > 0 && <TagList tags={attributes} />}

          {subjects.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold text-muted">得意科目</h4>
              <TagList tags={subjects} tone="muted" />
            </section>
          )}

          {features.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold text-muted">その他特徴・経験</h4>
              <TagList tags={features} tone="muted" />
            </section>
          )}

          {bio && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold text-muted">紹介文</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{bio}</p>
            </section>
          )}
        </div>
      )}
    </article>
  )
}
