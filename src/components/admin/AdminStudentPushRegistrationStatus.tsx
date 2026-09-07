import type { PushRegistrationView } from '@/lib/admin/push-registration'

const NOTE =
  '受験生webに登録されている有効なPush購読です。端末やOS側の設定変更は即時反映されない場合があります。'

/**
 * Read-only Push registration status beside notification category prefs.
 * Never shows endpoints, keys, or device fingerprints.
 */
export function AdminStudentPushRegistrationStatus({
  registration,
}: {
  registration: PushRegistrationView
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      aria-labelledby="admin-student-push-registration-heading"
    >
      <h2 id="admin-student-push-registration-heading" className="text-lg font-bold">
        この生徒のPush登録状況
      </h2>
      <p className="mt-1 text-sm text-muted">{NOTE}</p>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-muted">登録状態</dt>
          <dd className="mt-1 font-medium text-foreground">{registration.label}</dd>
        </div>
        {registration.status === 'registered' && registration.activeCount != null && (
          <div>
            <dt className="text-muted">有効な登録端末</dt>
            <dd className="mt-1 font-medium text-foreground">{registration.activeCount}台</dd>
          </div>
        )}
      </dl>

      <p className="mt-4 rounded-lg bg-background px-3 py-2 text-xs leading-relaxed text-muted">
        Push登録状況は端末の受け取り準備です。下の「通知設定」は塾側の配信カテゴリです。登録済みでも全カテゴリ停止なら通知は送られず、カテゴリが有効でも未登録ならメールへフォールバックします（メールもない場合は配信手段なしになり得ます）。
      </p>
    </section>
  )
}
