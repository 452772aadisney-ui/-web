import { getCoachProfileBadges } from '@/lib/coaching/coach-profile'
import type { CoachingCoach } from '@/types/coaching'

interface CoachProfileDisplayProps {
  coach: CoachingCoach
}

export function CoachProfileDisplay({ coach }: CoachProfileDisplayProps) {
  const badges = getCoachProfileBadges(coach)
  const bio = coach.bio?.trim()

  if (badges.length === 0 && !bio) {
    return null
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {badge}
            </span>
          ))}
        </div>
      )}
      {bio && (
        <p className={`text-sm leading-relaxed text-muted ${badges.length > 0 ? 'mt-3' : ''}`}>
          {bio}
        </p>
      )}
    </div>
  )
}
