import type { StudentStarRanking } from '@/lib/achievements/ranking'

export function StarRankingBanner({ ranking }: { ranking: StudentStarRanking }) {
  return (
    <section className="rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold leading-none text-muted">獲得☆</p>
          <p className="mt-1 text-lg font-bold leading-none text-foreground">
            {ranking.totalStars}
            <span className="ml-0.5 text-sm text-amber-500">☆</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold leading-none text-muted">現在の順位</p>
          <p className="mt-1 text-lg font-bold leading-none text-foreground">
            {ranking.rank}
            <span className="ml-0.5 text-sm font-semibold text-muted">位</span>
            <span className="ml-1 text-[10px] font-normal text-muted">
              / {ranking.rankingPoolSize}人
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}
