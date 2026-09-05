# 通知運用手順書（6-1）

関連: [web-push-foundation.md](./web-push-foundation.md)

運用画面: **`/admin/notifications`**（旧 `/admin/notifications/test` は同ページへリダイレクト）

実装ステータス: コード・テスト・文書のみ（本番デプロイ・env変更・実通知・Cron手動実行・Git pushは未実施）。

---

## 画面でできること

1. 通知基盤の状態（ON/OFF・設定済み／未設定のみ）
2. 各カテゴリの配信モードと allowlist 件数（ID非表示）
3. 購読・管理者停止の集計（個人情報なし）
4. 直近24時間／7日の配信件数
5. pending / stale pending（要確認・自動再送なし）
6. コード上の Cron 一覧（最終実行は Vercel Logs）
7. dry-run（学習／お知らせ／メッセージ／コーチング）
8. testアカウント限定の5種固定文面テスト（Push または メール）

この画面から **mode変更・環境変数変更・Cron実行・自動再送はできません**。

---

## 各 mode の確認方法

1. `/admin/notifications` を開く
2. 「各カテゴリの配信モード」で設定値と実効モードを確認
3. 警告が出ている場合は実コードが **legacy fallback** している

| mode | 意味 |
|------|------|
| legacy | 従来経路（Push-firstしない） |
| dry-run | 新方式分岐を集計。外部Pushなし |
| allowlist | 許可UUIDのみ新方式 |
| all | 全対象を新方式 |

---

## dry-run

画面の各「準備状況を集計」または学習の「全体dry-run」。

- 外部送信なし
- event／delivery作成なし
- DB更新なし
- 「送信していない」と表示されること

---

## allowlist 試験 → all → rollback

1. dry-runで件数確認
2. `*_PUSH_ALLOWLIST` に試験UUIDのみ
3. `*_DELIVERY_MODE=allowlist`
4. testアカウントで固定テスト（下記）
5. 問題なければ `all`
6. 問題時は即 `legacy`（または env 削除）

**秘密情報・allowlist IDをチケットやチャットに貼らない。**

---

## Push全停止

`PUSH_SENDING_ENABLED` を `true` 以外にする（画面からは変更不可）。

---

## 429 / 404・410 / stale pending

| 現象 | 対応 |
|------|------|
| 429 | 自動再送しない。pace・Resend上限を確認 |
| 404/410 | 購読失効。再購読は生徒端末 |
| stale pending（10分超） | 要確認。画面から再送しない |

---

## Vercel Logs

Cron最終実行時刻はこの画面に出しません。「Vercel Logsで確認」。

Cron定義（参考）:

- study-digest `0 23 * * *`（JST 08時台）
- study-reminder `0 13 * * *`（JST 22時台）
- coaching-booking-reminder `0 3 * * 1`（JST 月曜12時台）
- coaching-session-reminder `0 11 * * *`（JST 20時台）

---

## testアカウント限定テスト

前提:

```env
ADMIN_NOTIFICATION_TEST_ENABLED=true
NOTIFICATION_TEST_USER_IDS=<試験用UUIDのみ>
```

### 学習記録リマインダー実経路テスト（推奨）

`/admin/notifications` の「学習記録リマインダー実経路テスト」:

- **判定のみ**: 送信・event／deliveryなし。JST当日の記録有無・設定・購読・想定結果を表示
- **実経路で1件送信**: 通常の `processStudyReminderNewPath` を1人だけ実行
  - `notification_type=study_reminder`（固定文面・`/dashboard/study`）
  - idempotency は `admin-study-reminder-test:{userId}:{30s bucket}`（**通常のJST日付キーではない**）
  - metadata: `source=admin_notification_ops` / `kind=study_reminder_integration_test`
  - 同日22時Cronを妨げない
  - 通常Cron APIは呼ばない
- 本番利用後は `ADMIN_NOTIFICATION_TEST_ENABLED` を OFF に戻す
- 緊急停止: Push全停止（`PUSH_SENDING_ENABLED`≠true）＋管理者テストOFF＋必要なら `STUDY_REMINDER_DELIVERY_MODE=legacy`
- Cron時刻起動そのものは別途 Vercel Logs で確認

### コーチング通知 実経路テスト

`/admin/notifications` の「コーチング通知 実経路テスト」:

- 許可されたテストアカウント1人専用。通常Cronは起動しない
- **予約催促**: 判定のみ / 実経路送信。実送信時は通常と同じ `coaching_booking_reminder` を当週1件作成（再実行・月曜Cronでは週内重複判定で増殖しない。CronのPushは別キーで継続）
- **前日案内**: 明日の `scheduled` 予約が必要。予約の作成・変更はしない。チャットなし
- idempotency は `admin-coaching-*-test:…`（通常の `booking-prompt:` / `session-previous-day:` と分離）
- 本番利用後は `ADMIN_NOTIFICATION_TEST_ENABLED` を OFF に戻す
- 緊急停止: `COACHING_REMINDER_DELIVERY_MODE=legacy` ＋管理者テストOFF
- Cron時刻起動は別途 Vercel Logs で確認

### 固定文面カテゴリテスト（notification_type=test）

5種（いずれも `notification_type=test`）:

1. 学習記録 → `/dashboard/study`
2. お知らせ → `/dashboard/announcements`
3. メッセージ → `/dashboard/chat/room`
4. コーチング予約催促 → `/dashboard/coaching`
5. コーチング前日案内（固定 `20:30`・予約は作らない）→ `/dashboard/coaching`

Push／メールは個別に送信。30秒制限・確認ダイアログ・二重クリック防止あり。

---

## デプロイ後の確認手順（本番作業は別途）

1. 管理者で `/admin/notifications` が開ける
2. 生徒では開けない
3. 最新状態に更新で集計が返る（通知は送られない）
4. dry-runが件数のみ返す
5. flag OFFでは送信不可
6. allowlist外への送信が拒否される
