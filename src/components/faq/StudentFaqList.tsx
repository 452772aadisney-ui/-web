import type { FaqCategoryWithItems } from '@/types/faq'

interface StudentFaqListProps {
  categories: FaqCategoryWithItems[]
}

export function StudentFaqList({ categories }: StudentFaqListProps) {
  if (categories.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted">
        よくある質問は現在準備中です。
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <section key={category.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="mb-3 text-base font-bold">{category.name}</h2>
          <div className="space-y-2">
            {category.items.map((item) => (
              <details
                key={item.id}
                className="group rounded-lg border border-border bg-background open:bg-blue-50/30"
              >
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    <span>{item.question}</span>
                    <span className="shrink-0 text-xs text-muted group-open:hidden">開く</span>
                    <span className="hidden shrink-0 text-xs text-muted group-open:inline">閉じる</span>
                  </span>
                </summary>
                <div className="border-t border-border px-4 py-3 text-sm leading-relaxed text-muted whitespace-pre-wrap">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
