import type { StudentStarRanking } from '@/lib/achievements/ranking'

export function StarRankingBanner({ ranking }: { ranking: StudentStarRanking }) {
  return (
    <section className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted">獲得☆</p>
          <p className="mt-0.5 text-2xl font-bold text-foreground">
            {ranking.totalStars}
            <span className="ml-1 text-amber-500">☆</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-muted">現在の順位</p>
          <p className="mt-0.5 text-2xl font-bold text-foreground">
            {ranking.rank}
            <span className="ml-0.5 text-base font-semibold text-muted">位</span>
          </p>
          <p className="text-xs text-muted">/ {ranking.rankingPoolSize}人</p>
        </div>
      </div>
    </section>
  )
}
