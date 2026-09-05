# 3-1 新しいお知らせ通知：Push-first 統合

関連: [web-push-foundation.md](./web-push-foundation.md) / [web-push-study-reminder-integration.md](./web-push-study-reminder-integration.md)

実装ステータス: コード・テスト・文書のみ（本番デプロイ・実送信・env 本番変更は未実施）。

---

## 既存お知らせ処理（調査結果）

| 項目 | 事実 |
|------|------|
| UI | `/admin/announcements` → `AdminAnnouncementManager` |
| 作成 | Server Action `createAnnouncement`（下書き・予約公開なし。作成＝即公開） |
| 編集 | `updateAnnouncement`（**再通知しない**） |
| 削除 | `deleteAnnouncement`（通知なし） |
| 再公開 | 概念なし |
| 対象 | `target_all` または タグ ∪ 個別生徒（校舎フィールドなし） |
| 旧メール | `notifyStudentsOfNewAnnouncement` → 現在は orchestrator へ委譲 |
| 保存と通知 | DB保存成功後に通知。通知失敗でもお知らせは公開済み |

---

## 環境変数

```env
ANNOUNCEMENT_DELIVERY_MODE=legacy
ANNOUNCEMENT_PUSH_ALLOWLIST=
```

- 厳密一致: `legacy` | `dry-run` | `allowlist` | `all`
- 未設定・空・不正 → **必ず `legacy`**
- allowlist でリスト空／不正トークン → 全体を **legacy に強制**
- server-only。実値・user ID をログ／レスポンス／クライアントへ出さない
- `PUSH_SENDING_ENABLED` とは独立（flag が true 以外なら Push せずメール fallback）

### Rollback

Vercel で `ANNOUNCEMENT_DELIVERY_MODE=legacy`（または削除）。コード rollback 不要。

---

## 4モード

| モード | Push | 新方式メール | event/delivery | 実際の配信 |
|--------|------|--------------|----------------|------------|
| `legacy` | しない | しない | 作らない | **従来メールのみ**（paced）。preferences 非参照 |
| `dry-run` | しない | しない | 作らない | **従来メール維持** + 新方式件数集計 |
| `allowlist` | 対象のみ | 対象のみ | 対象のみ | 対象外は従来メール。二重送信なし |
| `all` | 全員新方式 | 必要時 fallback | する | 従来一括メールなし |

---

## Push / メール

固定文面（管理者自由入力不可）:

```text
title: 受験生web
body: 新しいお知らせが届きました。
targetPath: /dashboard/announcements
notificationType: announcement
idempotencyKey: announcement:{announcementId}
```

- お知らせ本文・生徒名・学校名は Push に載せない
- メール文面は従来どおり（件名にタイトル、本文はタイトル＋詳細URL）
- `announcement=false` → Push・メールなし・event 優先して作らない
- 行なし → true
- Push 1台以上成功 / 一部成功 → メールなし（email skipped 行も作らない）
- Push なし・全失敗・機能OFF・VAPID不足 → メール fallback（`notification_deliveries` channel=email）

---

## 冪等性

- UNIQUE `(user_id, announcement, announcement:{id})`
- push/email `sent` 済み → 再送しない
- email `failed` → 自動再送しない
- `pending` 10分未満 → in_progress
- stale pending → failed 整理のみ（自動再送なし）
- 編集・削除では通知しない（新規作成時のみ）

---

## 429 / 実行時間

- legacy / dry-run / allowlist 対象外メールも `pace: true`（300ms+ 逐次）
- 生徒処理 concurrency = 3
- soft deadline ≈ 55s（`maxDuration = 60` on `/admin/announcements`）
- プロセス間の完全な速度制御ではない（学習リマインダーと同様）

---

## 管理者Toast

- 全通知成功: 「お知らせを公開しました」
- 一部失敗: 「お知らせは公開しましたが、一部の通知を送信できませんでした」
- 全失敗: 「お知らせは公開しましたが、通知を送信できませんでした」
- お知らせ自体の公開失敗とは区別

---

## dry-run（作成なし）

管理者通知テスト画面「お知らせ通知の準備状況」または API `action: announcement-dry-run`。

- お知らせ作成・Push・メール・event/delivery 書き込みなし
- 件数のみ（user ID / メール / endpoint なし）

---

## 導入手順

運用画面: `/admin/notifications`（[web-push-operations.md](./web-push-operations.md)）

1. デプロイ（mode 未設定 or `legacy`）
2. `dry-run` で件数確認（従来メールは継続）
3. `allowlist` + 少数 UUID で Push-first 確認
4. `all` へ拡大
5. 問題時は `legacy` に戻す

---

## 第4段階への引き継ぎ

メッセージ通知は本パターン（mode / new-path / paced email / 固定 Push 文面 / 管理者停止）を再利用。  
お知らせ固有の対象解決（`resolveAnnouncementAudience`）はメッセージ側のスレッド参加者取得に置き換える。
