# 1-2 Web Push 基盤設計（1-3 / 1-4 反映版）

本ドキュメントは 1-2 設計を、1-3・1-4 で確定した内容で更新したものです。

実装スコープ:

- **1-3** = DB・RLS・型（migration `050`。**本番適用済み**）
- **1-4〜1-7** = Manifest / SW / 購読 / 設定画面 / 送信基盤・テスト通知
- 第2段階 = 既存通知種別への接続・メールフォールバック

---

## 通知種別

| 値 | 用途 | 設定画面に表示 |
|----|------|----------------|
| `study_reminder` | 学習記録未入力リマインダー | する |
| `announcement` | 新規お知らせ | する |
| `message` | 新規メッセージ（管理者→生徒） | する |
| `coaching_reminder` | コーチング催促 | する |
| `test` | 設定画面からのテスト通知 | **しない** |

※ 1-2 初版の `chat_message` は **`message`** に改名。

---

## DB 操作の責務

`push_subscriptions` に一般ユーザー向け書き込み RLS を設けない。  
通常の認証付き Supabase Client では Server Action からも書けないため、購読操作は次に統一する。

1. Server Action / Route Handler で通常の認証 Client の `getUser()` を実行
2. ログインユーザーを確定（クライアント送信の userId は信用しない）
3. 入力値を検証
4. **server-only Admin Client** で購読を操作
5. service role key / Admin Client をブラウザへ渡さない

`notification_events` / `notification_deliveries` も同様に Admin Client 経由のみ。  
`notification_preferences` のみ本人が参照・更新可。

### notification_preferences の実効権限

- `REVOKE ALL` を `anon` / `authenticated` に対して実行したうえで、`authenticated` に **SELECT / INSERT / UPDATE** のみ `GRANT`
- **DELETE は GRANT しない**（ポリシーも無し）
- RLS: `user_id = auth.uid()` の行だけ
- `anon` は操作不可

---

## 購読の再同期

Service Worker の `pushsubscriptionchange` から Next.js Server Action を直接呼ばない。

初期版: **ログイン後のアプリ起動時**、または **通知設定画面表示時** に、ブラウザの現在購読と DB を比較し、差異があれば再登録する。  
必要になった場合のみ、後工程で専用 API を追加する。

---

## 共有端末・アカウント切替

- 同一 endpoint が別ユーザー行にあっても、**endpoint だけを根拠に付け替えない**
- 購読 API では、現在ブラウザの PushSubscription と endpoint・`p256dh`・`auth` の一致を確認する
- ログアウト時に、そのブラウザの購読を DB 上で無効化する処理は後工程
- 共有端末でのログアウト → 別アカウントログインをテスト対象に含める

---

## 送信方針

- 1台以上の端末で Push 成功 → メールは送らない
- 一部端末のみ成功 → メールへフォールバックしない
- 有効端末への Push がすべて失敗した場合のみメールを検討
- HTTP **404 / 410** の購読だけ無効化
- 429 / 5xx / ネットワーク等の一時失敗は回数にかかわらず自動無効化しない
- `PUSH_SENDING_ENABLED` は文字列として明示的に **`true`** のときだけ送信可（未設定・空・`false`・その他は送らない）
- Preview 環境では原則送信しない
- 初期段階では通知履歴の自動削除なし・管理者向け履歴画面なし

---

## テーブル概要

| テーブル | 役割 | クライアント直接操作 |
|----------|------|----------------------|
| `push_subscriptions` | 端末購読 | 不可（Admin Client） |
| `notification_preferences` | 種別 ON/OFF（4項目、default ON） | 本人のみ（GRANT + RLS） |
| `notification_events` | 論理通知・冪等 | 不可 |
| `notification_deliveries` | 端末/メール別結果 | 不可 |

### 050 で新設する enum（3）

1. `push_notification_type`
2. `notification_delivery_channel`
3. `notification_delivery_status`

rollback は上記テーブル4つと enum 3つのみ削除する（既存システムの enum は触らない）。

### 冪等性キー（`user_id` + `notification_type` + `idempotency_key` で UNIQUE）

| 種別 | `idempotency_key` 例 |
|------|----------------------|
| study_reminder | JST 日付（例: `2026-09-04`） |
| announcement | announcement_id |
| message | message_id |
| coaching_reminder | `{booking_id}:{reminder_kind}` |
| test | 操作ごとの UUID |

### `target_path` 制約

許可:

- `/dashboard`
- `/dashboard/` から始まるパス
- `/dashboard?` から始まるクエリ付き

禁止例: `/dashboard-evil`、外部 URL、`//…`、`javascript:`、制御文字、`/admin`

---

## Manifest / Service Worker（1-4）

- Manifest: `src/app/manifest.ts`
  - `name` / `short_name` = **受験生web**
  - `start_url` = `/dashboard`
  - `scope` = `/dashboard`（`start_url` を含む。`/dashboard/` だと `/dashboard` が範囲外になりホーム画面起動が壊れるため使わない）
- 色: `theme_color` = `#2563eb`（`--primary`）、`background_color` = `#f4f6fb`（`--background`）
- SW: `public/sw.js`
  - 登録 scope = **`/dashboard/`**
  - `Service-Worker-Allowed` = **`/dashboard/`**（ルート scope `/` での再登録を防ぐ）
  - `fetch` なし・キャッシュなし
  - Push / notificationclick は、開いているタブが scope 外でも動作する（`clients.matchAll({ includeUncontrolled: true })`）
- 登録: 生徒の `/dashboard` レイアウトでのみ静かに登録。通知許可は要求しない
- 旧 scope `/` の SW がある場合: 登録ヘルパーが `unregister` してから `/dashboard/` で再登録する
- Push payload: `{ title, body, targetPath, tag? }`（個人情報・秘密情報なし）
- クリック遷移: 同一オリジンの `/dashboard` タブを優先。`/admin` は上書きしない

### scope 設計メモ

| 対象 | 値 | 理由 |
|------|-----|------|
| SW scope | `/dashboard/` | `/admin`・ログイン等を control しない。`/dashboard-evil` も除外 |
| Manifest scope | `/dashboard` | `start_url: /dashboard` を範囲内に含める |
| ページ `/dashboard`（末尾スラッシュなし） | SW の control 対象外 | Push 受信・通知クリックは問題なし。control は `/dashboard/...` が主 |

---

## 購読 API（1-5）

- Route Handler: `GET|POST|DELETE /api/push/subscription`
- 採用理由: Origin / Content-Type / HTTP ステータス（401/403/409）を明示しやすい。既存の主要 mutation は Server Action だが、Push は CSRF・ステータス要件が強い
- 流れ: `getUser()` → 生徒ロール確認 → Origin/JSON 検証 → 入力検証 → Admin Client
- `expirationTime` は DB 未保存（列なし・現時点で運用価値が低い）
- 共有端末: endpoint+p256dh+auth 完全一致時のみ移管。鍵不一致は 409（他ユーザー無効化なし）
- 解除順: **サーバー無効化 → ブラウザ unsubscribe**
- 起動時再同期: permission=granted かつ既存購読がある場合のみ（許可ダイアログなし）
- ログアウト: `HamburgerMenu` で Push クリーンアップ後に `signOut`（失敗してもログアウト続行）
- 環境変数: `.env.local.example` 参照。`PUSH_SENDING_ENABLED` は厳密に `true` のときのみ送信可
- `web-push@3.6.7`（Node runtime 専用。クライアント / SW には含めない）

---

## 通知設定画面（1-6）

- URL: `/dashboard/notifications`
- 導線: 生徒ハンバーガー「通知設定」（管理者メニューには無し）
- 端末ON/OFF: 1-5 の `enablePushSubscriptionFromUser` / `disablePushSubscriptionFromUser`
- カテゴリ: RLS 経由の Server Action（`getNotificationPreferences` / `updateNotificationPreference`）
- DB列名: `study_reminder` / `announcement` / `message` / `coaching_reminder`（`*_enabled` ではない）
- `test` は設定UIに出さない
- ページ表示では通知許可を要求しない

---

## 送信基盤・テスト通知（1-7）

- 共通送信: `src/lib/push/send-service.ts`（`web-push` 3.6.7、Node runtime）
- `PUSH_SENDING_ENABLED` は厳密に `true` のみ。Preview（`VERCEL_ENV` が production 以外）は送信不可
- テスト API: `POST /api/push/test`（現在端末の endpoint+p256dh+auth 照合、30秒クールダウン）
- 設定画面: 購読済みかつ送信可能時のみ「テスト通知を送る」
- flag OFF 時はイベントを作らず、購読・カテゴリ設定は継続利用可
- 同一 event の failed/pending delivery は今工程では再送しない（新しい idempotency key が必要）
- 404/410 のみ購読無効化。429/5xx は一時失敗として記録のみ

---

## フェーズ

| 工程 | 内容 |
|------|------|
| 1-3 | DB・RLS・型（migration `050`、本番適用済み） |
| 1-4 | Manifest・Service Worker |
| 1-5 | 購読 API・クライアント基盤 |
| 1-6 | 生徒向け通知設定画面 |
| 1-7 | 送信基盤・テスト通知 |
| 第2段階 | 学習リマインダー / お知らせ / メッセージ / コーチング接続、メールフォールバック |

---

## セキュリティメモ

- endpoint / `p256dh` / `auth` をログ・エラー文・クライアントレスポンスに出さない
- service role は認証・検証後の server-only 処理からのみ
- SW / Manifest は middleware から除外し、更新しやすい Cache-Control を付与
- SW の最大 scope は `Service-Worker-Allowed: /dashboard/` で制限する
