# 2-1 / 2-2 / 2-3 / 2-4 学習記録未入力リマインダー：Push-first 統合

2-1 調査設計 + **2-2 実装** + **2-3 管理者テスト送信** + **2-4 管理者全体dry-run**（デプロイ・実送信・env 本番変更は含まない）。

関連: [web-push-foundation.md](./web-push-foundation.md)

---

## 実装ステータス（2-2〜2-4）

| 項目 | 状態 |
|------|------|
| モード切替 | 実装済み（初期値 `legacy`） |
| Push-first + メール fallback | 実装済み（`allowlist` / `all`） |
| Cron dry-run 集計 | 実装済み（実配信は従来メール維持） |
| 管理者全体dry-run（2-4） | 実装済み（送信・DB更新なし・件数のみ） |
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
- **Resend 送信ペース（2-2追補）**: study-reminder 経路は共有キュー + `RESEND_SEND_MIN_INTERVAL_MS = 300`（約 3.3 req/s。Resend 既定はチーム全体 **5 req/s**）。legacy / dry-run 従来メールと新方式 fallback・管理者テストメールが対象。429 はその場リトライしない。Batch API は不採用。プロセス内キューのため、別 Vercel Function インスタンス間の完全な全体制御ではない

---

## 管理者向け通知テスト（2-3）

- URL: `/admin/notifications/test`（ハンバーガー「通知テスト」）
- `ADMIN_NOTIFICATION_TEST_ENABLED=true` かつ妥当な `NOTIFICATION_TEST_USER_IDS` のみ有効
- allowlist 外の生徒は選択・送信不可（API でも再検証）
- 状態確認は送信なし / Push・メールは `notification_type=test` で通常 `study_reminder` と分離
- メールは必ず `withResendSendPace` 経由
- 管理者＋対象＋種別で 30 秒クールダウン

---

## 管理者向け・全体dry-run（2-4）

### 目的

通常 Cron（22:00 JST / `0 13 * * *` UTC）を待たず、管理者が任意タイミングで **新方式判定の件数だけ** を確認する。

### 通知を送らないこと

- Push・メールは送信しない
- `notification_events` / `notification_deliveries` を作らない・更新しない
- Push購読・通知設定・学習記録を変更しない
- 通常 Cron Route を HTTP 呼び出ししない
- 読み取り専用の共有集計 `evaluateStudyReminderDryRunAggregate` を直接呼ぶ

### 実行権限

- ログイン済みかつ `profiles.role = admin`
- `ADMIN_NOTIFICATION_TEST_ENABLED === "true"`
- 正しい Origin・JSON Content-Type・変更系 POST
- サーバー側で再認証
- **`NOTIFICATION_TEST_USER_IDS` は対象制限に使わない**（全生徒を集計）
- `PUSH_SENDING_ENABLED=false` でも実行可（送信しないため）
- `STUDY_REMINDER_DELIVERY_MODE` が `legacy` でも実行可（結果に現在の通常配信モードを表示するだけ。mode は変更しない）

### 集計項目

最終分類（重複なし・合計＝生徒数）:

- 本日記録済み / 通知設定OFF / Push対象 / メールfallback対象 / 配信手段なし / 判定エラー

参考値（重複し得る）:

- 本日未記録 / 通知設定ON / 有効Push購読あり・なし

画面・APIは **件数と日付・時刻・配信モードのみ**。個人別一覧は出さない。

### 個人情報を表示しないこと

レスポンス・画面・Toast・ログに user ID / 氏名 / メール / 学習内容 / endpoint / 鍵 / allowlist / Cron secret / DBエラー全文を出さない。

### 通常Cronとの違い

| | 管理画面全体dry-run | Cron `dry-run` モード |
|---|---|---|
| 対象 | 全生徒 | 当日未記録候補（集計ロジックは共通分類器） |
| 実配信 | **なし** | 従来メールを維持 |
| 環境変数 | 変更しない | 変更しない（この機能では） |
| 実行 | 管理者UI / `action=full-dry-run` | `0 13 * * *` + `CRON_SECRET` |

共通化: `src/lib/study/study-reminder-dry-run.ts`（Cron orchestrator の dry-run も同関数を利用）。

### 回数制限

- UI: 実行中ボタン無効・二重クリック防止
- サーバー: 管理者単位で 60 秒に 1 回 + 同時実行防止（プロセス内メモリ）
- 現行スキーマでは永続レート制限テーブルを追加していない（migration なし）
- 限界: Vercel 複数インスタンス間ではメモリ制限が共有されない

### 検証手順

1. Preview/ローカルで `ADMIN_NOTIFICATION_TEST_ENABLED=true`
2. 管理者で `/admin/notifications/test` を開く
3. 「全体dry-runを実行」→ Toast「dry-runの集計が完了しました」
4. 結果カードに「Push・メールは送信されていません」と件数が出ること
5. 60 秒以内の再実行が 429 になること
6. 機能フラグ OFF / 生徒ロールでは実行できないこと
7. 通常 Cron・legacy・管理者テスト送信が従来どおり動くこと

主要コード:

- `src/lib/study/study-reminder-mode.ts`
- `src/lib/study/study-reminder-new-path.ts`
- `src/lib/study/study-reminder-dry-run.ts`
- `src/lib/study/study-reminder-orchestrator.ts`
- `src/lib/study/study-reminder-email.ts`
- `src/lib/admin/notification-test-full-dry-run.ts`
- `src/app/api/cron/study-reminder/route.ts`
- `src/app/api/admin/notification-test/route.ts`
- `src/components/admin/AdminNotificationTestClient.tsx`

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
