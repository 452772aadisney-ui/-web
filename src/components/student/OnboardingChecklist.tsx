import Link from 'next/link'
import type { OnboardingChecklistItem } from '@/lib/student/onboarding-checklist'

export function OnboardingChecklist({ items }: { items: OnboardingChecklistItem[] }) {
  const incompleteCount = items.filter((item) => !item.completed).length
  if (incompleteCount === 0) return null

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold">はじめにやること</h2>
        <p className="text-xs text-muted">
          残り {incompleteCount} / {items.length}
        </p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => {
          const content = (
            <>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  item.completed
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'border border-border text-muted'
                }`}
                aria-hidden
              >
                {item.completed ? '✓' : ''}
              </span>
              <span
                className={
                  item.completed ? 'text-muted line-through' : 'font-medium text-foreground'
                }
              >
                {item.label}
              </span>
            </>
          )

          if (item.completed) {
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm"
              >
                {content}
              </li>
            )
          }

          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {content}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
