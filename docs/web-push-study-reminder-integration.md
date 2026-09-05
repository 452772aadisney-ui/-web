# 2-1 / 2-2 学習記録未入力リマインダー：Push-first 統合

2-1 調査設計 + **2-2 実装**（デプロイ・実送信・env 本番変更は含まない）。

関連: [web-push-foundation.md](./web-push-foundation.md)

---

## 実装ステータス（2-2）

| 項目 | 状態 |
|------|------|
| モード切替 | 実装済み（初期値 `legacy`） |
| Push-first + メール fallback | 実装済み（`allowlist` / `all`） |
| dry-run 集計 | 実装済み（実配信は従来メール維持） |
| 本番デプロイ / 実送信 | **未実施** |

### 環境変数

```env
STUDY_REMINDER_DELIVERY_MODE=legacy
STUDY_REMINDER_PUSH_ALLOWLIST=
```

- 厳密一致のみ: `legacy` | `dry-run` | `allowlist` | `all`
- 未設定・空・不正 → **必ず `legacy`**
- `STUDY_REMINDER_PUSH_ALLOWLIST`: カンマ区切り UUID。空／不正トークンが1つでもあれば allowlist モード全体を **legacy に強制**
- server-only（`NEXT_PUBLIC_` なし）。実値・user ID をコミット／ログ／レスポンスへ出さない
- `PUSH_SENDING_ENABLED` とは独立。Push flag が `true` 以外なら Push せずメール fallback（新方式時）

### Rollback

Vercel で `STUDY_REMINDER_DELIVERY_MODE=legacy`（または削除）に戻す。コード rollback 不要。

---

## 4モード

| モード | Push | 新方式メール | 新 event/delivery | 実際の配信 |
|--------|------|--------------|-------------------|------------|
| `legacy` | しない | しない | 作らない | **従来メールのみ**（preferences 非参照） |
| `dry-run` | しない | しない | 作らない | **従来メール維持** + 新方式ならどうなるかの件数集計 |
| `allowlist` | 対象者のみ新方式 | 対象者のみ | 対象者のみ | 対象外は従来メール。二重送信なし |
| `all` | 全員新方式 | 必要時 fallback | する | 従来一括メールは使わない |

---

## 通知設定 OFF（正式移行後 = allowlist/all）

`notification_preferences.study_reminder = false` のとき:

- Web Push **しない**
- 22:00 未記録メール **しない**
- event / delivery **作らない**（優先）
- 集計: `preferenceDisabled`

行なし → **ON**（既存設計どおり）。

`legacy` / `dry-run` の従来メールは設定 OFF でも止めない（dry-run 集計では OFF 件数を出す）。

---

## 対象判定

- `study_logs.studied_on = getJstDateKey()` の行が 0 → 未記録（`buildTodayMissingStudyReport`）
- `created_at` では判定しない
- 送信直前に再確認 → 記録済みなら送らない（`recordedBeforeSend`）

---

## Push / メール分岐（新方式）

1. 再確認・設定確認
2. 既存 event/delivery ゲート（後述）
3. `PUSH_SENDING_ENABLED === "true"` かつ Production 相当なら `sendPushNotification`（`study_reminder` / 固定文面 / `idempotencyKey=dateKey`）
4. Push `sent >= 1` → メールしない（email skipped 行も作らない）
5. 購読なし・Push OFF・設定不足・Push 全失敗 → メール fallback（文面・CTA は従来どおり `/dashboard/study`）
6. メールなし → `undeliverable`（`error_code=no_email` の failed email delivery を記録しうる）

Preview（`VERCEL_ENV` があり production 以外）: 新方式の外部送信をスキップ（`nonProductionSkip`）。Push は `resolvePushSendConfig` でも停止。

---

## 冪等性・stale pending

- UNIQUE `(user_id, study_reminder, dateKey)`
- push `sent` または email `sent` → 完了（再送しない）
- email `failed` → **同日自動再送しない**
- `pending` かつ経過 **10分未満** → `in_progress`（即再送しない）
- `pending` かつ **10分以上** → `stale_pending` として failed に整理し、**その後も自動再送しない**
- 既に試行済みの購読へ同日 Push 再送しない（`sendPushNotification` の方針）

---

## Cron

- URL / 時刻維持: `GET /api/cron/study-reminder`、`0 13 * * *` UTC
- `Authorization: Bearer ${CRON_SECRET}`
- レスポンス・ログ: 集計のみ（PII / allowlist / secret なし）
- 初期取得失敗: 500
- 一部生徒失敗: **200** + カウンタ（Vercel の全面再実行で legacy 二重メールを避ける）
- 生徒並列: `STUDY_REMINDER_STUDENT_CONCURRENCY = 3`

主要コード:

- `src/lib/study/study-reminder-mode.ts`
- `src/lib/study/study-reminder-new-path.ts`
- `src/lib/study/study-reminder-orchestrator.ts`
- `src/lib/study/study-reminder-email.ts`
- `src/app/api/cron/study-reminder/route.ts`

---

## 段階導入手順

1. デプロイ（mode 未設定 = legacy）。従来メール継続を確認
2. `STUDY_REMINDER_DELIVERY_MODE=dry-run` → 集計のみ確認（実配信は従来メール）
3. Secret に `STUDY_REMINDER_PUSH_ALLOWLIST`（UUID）を設定し `allowlist`
4. 必要なら `PUSH_SENDING_ENABLED=true`（Production のみ）で Push 試験
5. fallback・設定 OFF・二重なしを確認
6. `all` へ拡大
7. 問題時は mode を `legacy` に戻す

### 実通知テスト手順（運用）

1. 許可ユーザーを allowlist に入れる（コードへ書かない）
2. 当日未記録の状態で Cron 相当を Production で実行（または翌日 22:00 を待つ）
3. Push 受信・クリックで `/dashboard/study`、メールが来ないことを確認
4. Push OFF / 購読なしでメール fallback を確認
5. 設定 OFF で両方来ないことを確認

---

## 追加 migration

不要（既存 UNIQUE を利用）。

---

## 残課題

- お知らせ / メッセージ / コーチング接続
- stale pending 後の明示的オペレーション再送
- failed メールの運用再送ツール
- Cron の POST 化・Production 強制の強化（任意）
