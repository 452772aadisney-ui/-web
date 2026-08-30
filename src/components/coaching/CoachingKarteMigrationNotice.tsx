export function CoachingKarteMigrationNotice() {
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">カルテ機能のデータベースが未設定です</p>
      <p className="mt-1">
        Supabase に{' '}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
          044_coaching_karte.sql
        </code>{' '}
        マイグレーションを適用すると、カルテの保存・履歴表示が使えるようになります。
      </p>
    </div>
  )
}
