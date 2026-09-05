# 5-1 コーチング通知：Push-first 統合

関連: [web-push-foundation.md](./web-push-foundation.md) / [web-push-message-integration.md](./web-push-message-integration.md)

実装ステータス: コード・テスト・文書のみ（本番デプロイ・実送信・Cron手動実行・env変更・Git pushは未実施）。**新規 migration なし**（前日案内はチャット非保存）。

---

## 2種類の通知

| 種類 | いつ | 対象 | metadata.kind |
|------|------|------|----------------|
| 週次予約催促 | 月曜 12:00–12:59 JST | その週に有効予約がないコーチング対象生徒 | `booking_prompt` |
| 予約前日案内 | 毎日 20:00–20:59 JST | 翌日に `scheduled` 予約がある生徒 | `session_previous_day` |

Vercel Hobby は指定した1時間のどこかで実行されることを許容（分単位の正確さは不要）。

---

## 確定文面

### 週次予約催促

Push: タイトル `受験生web` / 本文 `今週のコーチングを予約してください。` / `/dashboard/coaching`

メール: 件名 `今週のコーチングを予約してください` / 本文 `受験生webから今週のコーチングを予約してください。` / CTA `コーチングを確認する`

### 予約前日案内

Push: タイトル `受験生web` / 本文 `明日HH:mmからコーチングです。`（JST） / `/dashboard/coaching`

メール: 件名 `明日のコーチングのお知らせ` / 本文 `明日HH:mmからコーチングです。` / CTA `コーチングを確認する`

---

## JST 対象範囲

### 週次

- 「その週」= JST 月曜日 00:00 以上〜翌週月曜日 00:00 未満
- 予約あり: `coaching_bookings` が生徒に紐づき、`status ∈ {scheduled, completed}`、紐づく `coaching_slots.slot_date` が週内
- 対象外: 空き枠のみ / cancelled / 翌週以降 / 他生徒 / 既卒学年タグ（既存 `fetchStudentsWithoutCoachingBookingThisWeek` と同じ）

### 前日案内

- Cron実行日の翌日 00:00 以上〜翌々日 00:00 未満（`slot_date` = 翌日 JST）
- 有効: `status = scheduled` のみ（送信直前にキャンセル・日時変更を再確認）

---

## Cron

| Path | Schedule (UTC) | JST 相当 |
|------|----------------|----------|
| `/api/cron/coaching-booking-reminder` | `0 3 * * 1` | 月曜 12時台 |
| `/api/cron/coaching-session-reminder` | `0 11 * * *` | 毎日 20時台 |

共通: `CRON_SECRET` Bearer / Production 限定の外部送信 / Preview 非送信 / `runtime=nodejs` / `maxDuration=60` / soft timeout / 件数のみレスポンス。

---

## message_kind / 二重防止

| message_kind | 通常 `message` 通知 | コーチング通知 |
|--------------|---------------------|----------------|
| `user` | 対象 | 対象外 |
| `coaching_booking_reminder` | **除外済み** | 週次催促（チャット保存後に Push-first） |

**前日案内はチャットに保存しない**（`coaching_session_reminder` kind は追加しない）。notification event から直接 Push／メール。

固定文面で種類判定しない。`message_kind` と `notification_type=coaching_reminder` + `metadata.kind` で分離。

---

## Push-first / メールfallback

`notification_preferences.coaching_reminder`:

- `false`（行なしは true）: Push・メールなし（アプリ内チャットは維持可）
- Push 1台以上成功 / 一部成功: メールなし
- Push 全失敗 / 購読なし / Push OFF / VAPID不足: メールfallback
- メールなし + Push成功なし: 配信手段なし

Push成功時に email `skipped` delivery は作らない。

---

## 冪等性

- 週次: `booking-prompt:YYYY-MM-DD`（対象週の月曜 JST）
- 前日: `session-previous-day:{bookingId}:{normalizedStartAt}`
- 日時変更後は新キーで再案内可。旧履歴は削除しない
- Push sent / email sent で完了。failed email・pending・stale pending は自動再送しない

---

## 段階導入モード

```env
COACHING_REMINDER_DELIVERY_MODE=legacy
COACHING_REMINDER_PUSH_ALLOWLIST=
```

| モード | 挙動 |
|--------|------|
| legacy（既定） | 週次: 既存どおりチャット催促のみ（Pushなし）。前日: 従来処理なしのため送信なし |
| dry-run | 新方式分岐を集計のみ。外部Pushなし・新 event/delivery なし。チャット作成なし |
| allowlist | 対象生徒のみ Push-first。他は legacy。空／不正 allowlist → 全体 legacy |
| all | 全対象 Push-first。`coaching_reminder=false` は両方なし |

Rollback: `COACHING_REMINDER_DELIVERY_MODE=legacy`（または削除）。コード rollback 不要。

---

## dry-run

管理画面「コーチング通知の準備状況」 / API `coaching-dry-run`。

- 週次: 対象・今週予約済・未予約・停止・Push準備・メールfallback・手段なし・判定エラー
- 前日: 翌日有効予約・停止・Push準備・メールfallback・手段なし・判定エラー
- チャット／Push／メール／event／delivery／予約変更なし

---

## 管理者向け実経路テスト（7-6）

`/admin/notifications` の「コーチング通知 実経路テスト」。許可されたテストアカウント1人専用。

| 項目 | 内容 |
|------|------|
| 判定のみ | 送信・チャット・event／deliveryなし |
| 予約催促実送信 | `processCoachingReminderNewPath` + `ensureBookingPromptChat`（チャット追加の可能性あり） |
| 前日案内実送信 | 明日の `scheduled` 予約のみ。予約の作成・変更なし |
| idempotency | `admin-coaching-booking-prompt-test:…` / `admin-coaching-session-previous-day-test:…` |
| 通常Cron | 起動しない。冪等性キーも分離。時刻起動は Vercel Logs で別確認 |
| metadata | `source=admin_notification_ops` + integration `kind` + `adminUserId` |

本番利用後は `ADMIN_NOTIFICATION_TEST_ENABLED` を OFF に戻す。緊急停止: `COACHING_REMINDER_DELIVERY_MODE=legacy`。

---

## 性能・pace

- 候補一括取得、生徒並列数 3、メールは `withResendSendPace`（300ms+）
- soft timeout（maxDuration 60 − 5s reserve）
- プロセス間の pace 完全共有は保証しない（既存メール基盤と同じ限界）

---

## allowlist 実機確認手順（本番作業は別途）

運用画面: `/admin/notifications`（[web-push-operations.md](./web-push-operations.md)）

1. `COACHING_REMINDER_DELIVERY_MODE=dry-run` で Cron/管理画面の集計のみ確認
2. `PUSH_SENDING_ENABLED=true` + VAPID 設定済みを確認
3. `COACHING_REMINDER_PUSH_ALLOWLIST=<試験用UUID>` + `allowlist`
4. 月曜12時台／毎日20時台の Cron または同等条件で試験アカウントのみ確認
5. 問題なければ `all`。問題があれば即 `legacy`

---

## 第6段階への引き継ぎ

- 学習／お知らせ／メッセージ／コーチングの4種が Push-first 接続済み
- 残タスク候補: 本番 mode 切替運用、通知履歴 UI、digest/debounce、失敗の手動再送ツール
