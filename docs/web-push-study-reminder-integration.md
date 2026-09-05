# 2-1 学習記録未入力リマインダー：Push-first 統合設計

調査日時点のコード根拠に基づく。**実装・Cron変更・送信・migration 実行は含まない（調査・設計のみ）。**

関連: [web-push-foundation.md](./web-push-foundation.md)（第1段階基盤）

---

## 1. 現在の処理フロー（メールのみ）

```text
Vercel Cron (UTC 13:00 = JST 22:00)
  → GET /api/cron/study-reminder
  → Authorization: Bearer ${CRON_SECRET}
  → buildTodayMissingStudyReport()  // = buildDailyStudyDigestReport(getJstDateKey())
  → notifyStudentsMissingTodayStudyLog(report)
  → sendEmailToMany(emails, { subject, text })
  → JSON { ok, dateKey, notRecordedCount, emailRecipientCount, emailSentCount }
```

| 項目 | 実体 |
|------|------|
| Cron 設定 | `vercel.json` → `path: /api/cron/study-reminder`, `schedule: "0 13 * * *"` |
| Route | `src/app/api/cron/study-reminder/route.ts` → `GET` のみ |
| 認証 | `authorization === \`Bearer ${CRON_SECRET?.trim()}\``。未設定または不一致は 401 |
| レポート構築 | `buildTodayMissingStudyReport` / `buildDailyStudyDigestReport`（`src/lib/study/digest.ts`） |
| Admin Client | `createAdminClient()`。未設定時は `null` を返し Cron は 500 |
| メール送信 | `notifyStudentsMissingTodayStudyLog`（`src/lib/email/notifications.ts`）→ `sendEmailToMany`（`src/lib/email/send.ts`）→ Resend `https://api.resend.com/emails` |
| 並列 | `Promise.all` で受信者全員を同時送信（上限なし） |
| 再試行 | アプリ層の自動再試行なし |
| maxDuration / runtime | Cron route に `export const runtime` / `maxDuration` なし（Next/Vercel 既定） |
| Preview 防御 | **なし**（Secret があれば Preview / 手動 GET でも動く） |
| ログ | digest 失敗時 `console.error`（DB メッセージ）。メールは件数と失敗時に `from`/`to`/`error` を `console.error`（**現行はメールアドレスをログしうる**） |
| 関連テスト | **study-reminder / digest / notifyStudentsMissingTodayStudyLog 専用テストは無し** |

併設 Cron（参考・今回対象外）: `study-digest` = `0 23 * * *` UTC → 昨日分 Discord 向け。同じ `buildDailyStudyDigestReport` を共有。

---

## 2. 現在の「未記録」判定

### メール / digest（正）

`buildDailyStudyDigestReport(dateKey)`:

1. `profiles` から `role = 'student'` を全件取得（`id, full_name, display_name, email`）
2. `study_logs` を `studied_on = dateKey` で全件取得
3. 生徒ごとに `logsByStudent.get(id)` の **配列長が 0** → `notRecorded`、1件以上 → `recorded`

参照カラムは **`studied_on`（学習対象日）**。`created_at` は表示ソートにのみ使用。

`dateKey` 既定値: `getJstDateKey()` = `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date)`（`src/lib/study/dates.ts`）。

### 学習種別の扱い

| ケース | 扱い（コード根拠） |
|--------|-------------------|
| 参考書学習 | `study_logs` 1行（`textbook_id` あり）。`studied_on` 一致なら記録あり |
| 科目のみ | 同様に `study_logs`（`textbook_id` null 可）。区別せず件数に入る |
| 0分 | DB: `duration_minutes > 0`（`005_study_logs.sql`）。アプリ: `validateStudyDurationMinutes` で 1分未満拒否。実質 0分行は作れない |
| 下書き | 下書きテーブルなし。INSERT 成功行のみ |
| 削除済み | 物理 DELETE（soft delete 列なし）。削除後は未記録扱い |
| 日付だけの行 | `subject` / `duration` 必須のため不可 |
| 22:00直前登録 | Cron 実行時点の SELECT に入れば記録あり。実行後の登録は既存メールではカバーされない |
| UTC 保存 | `studied_on` は `date` 型。判定は文字列 `YYYY-MM-DD` の等価比較。作成時刻の TZ は判定に使わない |

### ダッシュボード表示との関係

- マイページ字幕: `formatTodayStudyButtonSubtitle(todayMinutes)`（`src/lib/study/today-status.ts`）
  - `todayMinutes <= 0` → 「今日はまだ学習記録がありません」
- `todayMinutes`: `fetchStudentDashboardStudySummary` が同一 `todayKey`（`getJstDateKey()`）の `duration_minutes` 合計（`src/lib/study/queries.ts`）

**一致の結論（現行スキーマ前提）:**

- メール: 「当日 `studied_on` の行が1件以上あるか」
- UI: 「当日合計分が > 0 か」
- `duration_minutes > 0` 制約があるため、行が存在する ↔ 合計 > 0 は実質一致
- **差異の可能性:** 将来 0分や下書きを許すと分岐する。今回は統一しない

---

## 3. 現在の対象者・除外条件

### 含まれる

- `profiles.role === 'student'` の全行（Admin Client、RLS 迂回）

### コード上存在しない除外

- 退会・停止・削除フラグ（`profiles` に該当列なし）
- プロフィール不完全（`full_name` 空でも `notRecorded` に入る）
- `notification_preferences`（**メールは参照しない**）
- Push 購読の有無（メールのみ）
- 管理者兼用: `role` が `admin` なら対象外。student のままなら対象
- テストアカウント専用フラグなし

### メール送信時の実質除外

- `email` が空 / 空白のみ → `sendEmailToMany` の宛先から落ちる（`notRecorded` には残るが `recipientCount` に入らない）
- `RESEND_API_KEY` / `EMAIL_FROM` 未設定 → 全員 `skipped`（送信なし）

### 既送信判定

- **無し。** 同一日に Cron を再実行するとメールが再送されうる。DB 冪等なし。

### タイムゾーン

- 対象日は常に JST の `getJstDateKey()`。Cron 時刻 `0 13 * * *` UTC = JST 22:00。

### Push 導入後に差が出る点（予測整理）

| 観点 | 現行メール | Push-first 案 |
|------|------------|----------------|
| 設定 OFF | 無視してメール | 要仕様決定（§7） |
| 購読なし | メール | メール fallback |
| 購読あり・Push成功 | （該当なし） | メールしない |
| メールなし | 送れない | Push のみ成功しうる |
| 多重端末 | メール1通 | Push は有効購読ごと、メールは最大1 |

---

## 4. Push-first 導入後の処理フロー（設計）

```text
GET /api/cron/study-reminder（認証は現行踏襲＋後述の強化案）
  1. dateKey = getJstDateKey()
  2. candidates = 当日未記録の student 一覧（既存 digest 相当。集計ログは件数のみ）
  3. （任意）dry-run / allowlist フィルタ
  4. 生徒ごとに順次 or 小さな並列度で:
       a. 送信直前に当日記録を再確認 → あれば skip（通知なし）
       b. 通知設定確認（§7）
       c. notification_events を getOrCreate（idempotency_key = dateKey）
       d. 既存 delivery を見て再開方針適用（§8）
       e. 有効 Push 購読があれば sendPushNotification（subscriptionIds 全件 or サービス内取得）
       f. Push sent >= 1 → メールしない（email delivery は作らない or skipped 1行）
       g. 購読0 or Push全失敗 → メール fallback（email delivery 1行）
  5. 集計 JSON を返す（ID・endpoint・メールを含めない）
```

`sendPushNotification()`（`src/lib/push/send-service.ts`）を再利用する。学習リマインダー用に **再開ポリシーを Cron オーケストレータ側で明示**する（第1段階の「同一 event の failed/pending は再送しない」をそのまま全員に適用すると復旧できないため）。

---

## 5. Push とメールの分岐条件

| 状況 | Push | メール | 備考 |
|------|------|--------|------|
| 対象外（記録あり等） | しない | しない | event も作らない（推奨） |
| 設定 OFF（案B） | しない | しない | event 任意。作るなら全 channel skipped |
| `PUSH_SENDING_ENABLED≠true` または Preview | 送らない（既存 `resolvePushSendConfig`） | **現行相当のメールを送る**（Push無効時はメール継続） | 段階導入中の安全弁 |
| 有効購読 0 | — | fallback | |
| Push 1台以上 `sent` | 完了 | **送らない** | 一部失敗でもメールしない |
| Push 全失敗（有効購読あり） | 記録済み failed | fallback | |
| メールアドレスなし | （上記どおり） | 送れない。email delivery = `failed` or `skipped`（`no_email`） | |
| Resend 未設定 | — | `skipped`（現行 `sendEmail` と同じ） | |
| Push・メールとも失敗 | failed | failed | 翌日まで再送しない（同 idempotency）。運用で手動判断 |

### `skipped` を使う条件（提案）

- 設定 OFF（記録する場合）
- Push 成功済みのためメール不要（email 行を残す方針なら）
- 送信直前再確認で記録済みになった
- allowlist 外（段階導入）
- dry-run

Push 成功時の email 行: **作らない**を推奨（ノイズ削減）。集計は Cron レスポンスのカウンタで足りる。監査で必要なら後から `skipped` + `error_code=push_succeeded` を追加可能。

---

## 6. 通知文面と遷移先

### Push（提案・個人情報なし）

- タイトル: `受験生web`
- 本文: `今日の学習記録を忘れていませんか？`
- `targetPath`: **`/dashboard/study`**
- `tag`: 例 `study-reminder-{dateKey}`（端末上の置換用）

根拠: 既存メール CTA が既に `${baseUrl}/dashboard/study`。当該ページは `StudyLogModeDialogPage` で記録開始導線。SW 許可パス内。クエリに ID を載せない。

### メール

- **現状維持を推奨**（件名「本日の学習記録が未入力です」、本文に `dateLabel`、リンク `/dashboard/study`）。
- 変更が必要になるのは、設定 OFF をメールにも効かせる・二重防止を入れる場合の文言追加程度。必須ではない。

---

## 7. 通知設定 OFF 時の選択肢と推奨

### 現状

- UI コピー（`NOTIFICATION_PREFERENCE_COPY.study_reminder`）:  
  「その日の学習記録がない場合、22:00ごろにお知らせします。」  
  → チャネル（Push/メール）を区別していない。
- 画面導入文: 「…この端末で受け取れます。」→ 端末 Push 寄りの文脈。
- `sendPushNotification` は `study_reminder` OFF なら `preference_disabled`（**イベント未作成**）。
- **既存メールは preferences を見ない。**

### 案A: Push だけ OFF / メール継続

- 既存運用（メール必須）を壊しにくい
- UI 文言と食い違いやすい（「お知らせしません」に見えてメールが来る）

### 案B: リマインダー全体 OFF（Push もメールも送らない）

- 設定スイッチの一般的な期待に近い
- UI 文言と整合しやすい
- 現状メール運用からの行動変容あり（OFF にした生徒はメールも止まる）

### 推奨（確定はユーザー確認待ち）

**案Bを推奨。** 理由: 設定文言がチャネル非依存の「お知らせ」、第1段階 Push サービスもカテゴリ OFF で送らない設計。  
ただし **現行本番メールは preferences 無視**のため、案Bは仕様変更になる。導入前にプロダクト確認が必須。

暫定実装案（確認前）: コード上はフラグで切替可能にし、デフォルトは確認結果に従う。

---

## 8. 冪等性と再実行

### idempotency_key

```text
idempotency_key = dateKey  // 例: "2026-09-05"
notification_type = study_reminder
user_id = profiles.id
```

- UNIQUE `(user_id, notification_type, idempotency_key)` を利用
- 翌日は別 `dateKey` のため自然に分離
- JST キーなので UTC 日付切替の影響を受けない（Cron も JST 22:00 起点）

### 再開マトリクス（同一 event）

| 状態 | 再実行時 |
|------|----------|
| event なし | 新規作成して処理 |
| event あり + いずれかの push `sent` | Push 再送しない。メールしない。完了扱い |
| event あり + email `sent` | 完了。何もしない |
| event あり + push のみ `failed`（sent なし） | メール未送信なら email fallback を試行（email 行が無いか failed なら方針に従う） |
| event あり + email `failed` | メール再送するかは **1回まで追加試行** か **同日再送しない** を実装時に定数化（推奨: **同日は再送しない**。運用で翌日まで待つ） |
| push `pending` が残存 | 送信中断疑い。推奨: `sent_at` から一定時間（例 5分）経過した pending を `failed`/`transient` に更新してからメール可否を判定。即メールすると二重の恐れ |
| Push 成功後・履歴更新前に停止 | 稀。再実行で web-push 再送の可能性。delivery 一意 + claim pending で緩和。完全ゼロにはできない |
| メール成功・履歴更新前に停止 | 再実行で二重メールの恐れ。email UNIQUE(event_id) で claim してから Resend。claim 成功後のみ送信 |

### 現行メールとの差

現行は **冪等なし**。Push-first 化で初めて同日二重メールを構造的に防げる。

### 追加 migration の要否

- **必須ではない**（既存 UNIQUE で event / push delivery / email delivery を表現可能）
- 任意案（実行しない）:
  - `notification_deliveries` の pending タイムアウト用 partial index
  - Cron 実行ログ用 `notification_job_runs`（集計のみ）
  - より強い排他のための advisory lock 関数

---

## 9. 送信直前の再確認

- 一覧取得〜送信の間に記録が入る可能性がある。
- **各生徒の外部送信直前に** `study_logs` を `student_id + studied_on` で `limit 1` 再確認する（推奨）。
- 初期一覧は 2 クエリ（生徒全件 + 当日ログ）のまま。再確認は **未記録候補数 N 回**（全生徒数ではない）。
- 22:00 同時刻の記録: 再確認後〜 Push 応答前の極短い窓では通知が行きうる。トランザクションと外部 Push/Resend は原子的にできない。許容し、ロック画面文言は無害な固定文にする。
- 再確認で記録あり → 通知しない。event 未作成なら作らない。作成済みなら delivery `skipped`（任意）。

---

## 10. 性能・バッチ方針

コード構造上の負荷（本番件数の実測は行わない）:

| 段階 | 現行 | Push-first 案 |
|------|------|----------------|
| 生徒+ログ | 2 クエリ | 同左 + preferences / subscriptions の一括取得を推奨 |
| メール | `Promise.all` 無制限並列 | メール fallback のみ小数並列（例 3〜5） |
| Push | — | 生徒内は既存どおり **逐次**。生徒間並列は 1〜3 程度 |

Vercel:

- Cron Serverless の実行時間上限に依存（プランにより 60s〜300s 等）。`maxDuration` 未設定。
- 生徒数が増え Push+メールが重い場合は、**続きから再開可能な冪等**があるため、タイムアウト後の再実行で未完了分を消化する設計を優先（バッチ分割 API は第2候補）。

障害時: **生徒単位で継続**。グローバルな DB 初期取得失敗時のみ Cron 全体 500。

メモリ: 全日ログを `select('*')` している現行は改善余地あり（実装時は `student_id` のみ等に絞る候補）。今回は設計指摘のみ。

---

## 11. Cron 認証の評価と修正案（今回は変更しない）

### 現状の良い点

- 空の `CRON_SECRET` では常に 401
- Bearer 一致が必要

### 問題・ギャップ

- `VERCEL_ENV === 'production'` チェックなし → Preview でも Secret があれば送信
- GET のため、Secret 漏洩時にブラウザ・クローラ的ヒットでも発火しうる（実務上はヘッダ必須で緩和）
- レスポンスに個人情報は出していない（件数のみ）が、メール失敗ログに `to` がありうる
- 手動再実行の監査ログなし

### 修正案（2-2 以降・任意）

1. Production 以外は no-op（集計だけ / または 403）
2. `POST` 化 + Cron 設定更新（破壊的なので慎重に）
3. 失敗ログからメールアドレス除去
4. dry-run クエリ `?dryRun=1` は Production + Secret でのみ

---

## 12. 障害時の挙動（設計）

| 障害 | 挙動 |
|------|------|
| Admin / 対象取得失敗 | Cron 全体失敗。送信しない |
| 個別 preferences / 購読取得失敗 | その生徒を failed カウントして後続継続 |
| Push 一部失敗 | 継続。sent>=1 ならメールしない |
| Push 全失敗 | メール fallback |
| Resend 失敗 | email delivery failed。後続生徒は継続 |
| Cron タイムアウト / Vercel 再実行 | 冪等キーで安全に再開（§8） |
| VAPID 不正 / flag OFF | Push スキップ、メール継続（段階導入中） |
| メール環境変数不足 | 現行同様 skip |
| event 作成後送信前停止 | 再実行で delivery から再開 |
| 送信成功・履歴前停止 | §8 の残留リスク。完璧な同期は不可 |

---

## 13. 段階的な本番導入手順

1. **実装マージ・デプロイ**（`PUSH_SENDING_ENABLED=false` のまま）→ 実 Push なし。可能ならメール経路は現行維持フラグで保護
2. **dry-run モード**（env 例: `STUDY_REMINDER_DRY_RUN=true`）→ 件数・除外理由カウントのみ。名前 / メール / userId 全文 / endpoint / 鍵 / 学習内容は出さない
3. dry-run 結果を運用確認
4. **許可リスト**（env: ハッシュ化 ID または別管理。**ソースに UUID 直書きしない**）で Push のみ試験
5. 許可ユーザーで Push 成功時にメールが抑制されることを確認
6. Push 失敗 → メール fallback を確認
7. allowlist 解除、全生徒へ拡大
8. 既存「メール即時一括」を Push-first オーケストレータへ正式切替。旧 `notifyStudentsMissingTodayStudyLog` の直接呼出をやめる

各段階で `PUSH_SENDING_ENABLED` と dry-run / allowlist を独立に制御する。

---

## 14. notification events / deliveries 状態遷移（要約）

```text
(no event)
  → create event (pending 的意味は deliveries 側)
  → push deliveries: pending → sent | failed
  → (optional) email delivery: pending → sent | failed | skipped
完了条件の例:
  - any push sent
  - or email sent
  - or skipped（設定OFF・記録済み・dry-run）
  - or push failed* + email failed/skipped(no_email)
```

---

## 15. 実装対象ファイル候補（2-2）

| ファイル | 役割 |
|----------|------|
| `src/app/api/cron/study-reminder/route.ts` | オーケストレーション入口 |
| `src/lib/study/digest.ts` | 候補抽出の再利用・必要なら軽量化 |
| 新規 `src/lib/study/study-reminder-send.ts` 等 | Push-first フロー・再開・再確認 |
| `src/lib/email/notifications.ts` | 1通送信に分解 / delivery 連携 |
| `src/lib/push/send-service.ts` | 必要なら「failed 再送ポリシー」を呼び出し側に委譲する調整 |
| `src/lib/push/preferences.ts` | コピー更新（案B確定時） |
| テスト | digest 判定 / 分岐 / 冪等 / dry-run（モックのみ） |

---

## 16. 未確定事項（実装前に確認）

1. 設定 OFF は **案A / 案B** のどちらか（推奨は案B）
2. 同日のメール失敗後に Cron 再実行でメールを再送するか（推奨: しない）
3. Push 成功時に email `skipped` 行を残すか（推奨: 残さない）
4. pending のタイムアウト秒数
5. dry-run / allowlist の env 命名と運用主体
6. 本番の生徒規模に対する並列度の最終値

---

## 17. 今回やらないこと（再掲）

コード変更・package・migration 実行・Cron/env/デプロイ・実送信・本番 event 作成・購読情報出力・既存メール停止・rollback・テストユーザー ID のソース直書き。
