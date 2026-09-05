# 4-1 新しいメッセージ通知：Push-first 統合

関連: [web-push-foundation.md](./web-push-foundation.md)

実装ステータス: コード・migration案・テスト・文書のみ（本番デプロイ・実送信・migration適用・env変更は未実施）。

---

## 既存メッセージ構造（調査）

| 項目 | 事実 |
|------|------|
| テーブル | `chat_messages`（`id`, `student_id`, `sender_id`, `body`, `created_at`） |
| スレッド | `student_id` 単位の1対1（グループなし） |
| role | `student` / `admin` のみ（講師専用ロールなし） |
| 送信 | `sendChatMessage`（Server Action） |
| 生徒→管理者 | 全管理者へメール + Discord |
| 管理者→生徒 | 当該生徒へメール（旧） |
| 既読 | `chat_read_states` の watermark（メッセージ単位既読なし） |
| presence | なし |

### コーチング催促の区別（必須）

当初、催促は `sendCoachingBookingReminders` → `sendChatMessage` で **通常行と同一** だった。

**migration 052（未適用）** で `message_kind` を追加:

- `user`（通常）
- `coaching_booking_reminder`（催促一括）

Push-first の `message` 通知は **`message_kind=user` かつ admin→student のみ**。  
催促は除外し、将来の `coaching_reminder` 接続へ委ねる。

**本番へ本機能を載せる前に 052 を適用すること。** 未適用のまま insert すると `message_kind` 列不足で失敗する。

verify: `supabase/rollbacks/052_chat_message_kind_verify.sql`  
rollback: `supabase/rollbacks/052_chat_message_kind_rollback.sql`

---

## 環境変数

```env
MESSAGE_DELIVERY_MODE=legacy
MESSAGE_PUSH_ALLOWLIST=
```

- 厳密一致: `legacy` | `dry-run` | `allowlist` | `all`
- 未設定・空・不正 → **legacy**
- allowlist 空／不正 → 全体 legacy 強制
- 管理者向けメール／Discordは **モード非影響**

### Rollback

`MESSAGE_DELIVERY_MODE=legacy`（または削除）。

---

## 対象 / 除外

| 対象 | 除外 |
|------|------|
| admin→student の通常メッセージ (`user`) | 生徒→管理者 |
| | 送信者本人 |
| | `coaching_booking_reminder` |
| | 保存失敗 |

---

## Push

```text
title: 受験生web
body: 新しいメッセージが届きました。
targetPath: /dashboard/chat/room
tag: chat-message
idempotencyKey: message:{messageId}
```

- 本文・氏名は Push に載せない
- メール文面は既存どおり（120字プレビュー維持）
- OS tag は会話単位で固定 `chat-message`（user ID なし）。連続送信は端末上で置き換わりうる
- event はメッセージごとに別（勝手に同一視しない）
- 将来: debounce/digest は別タスク

---

## モード

| モード | 生徒宛て配信 |
|--------|----------------|
| legacy | paced メールのみ（prefs 非参照） |
| dry-run | 集計 + paced メール維持 |
| allowlist | 対象のみ Push-first、他は legacy メール |
| all | Push-first。message=false は両方なし |

---

## 既読・オンライン

- 保存直後通知のため、初期実装では既読再確認なし
- 画面を開いていても Push/メールされうる
- presence なし。将来の抑制は Realtime 接続状態などが候補

---

## 429

生徒宛てメールは `pace: true`（300ms+）。1受信者が主。プロセス間完全制御ではない。

---

## dry-run

管理画面「メッセージ通知の準備状況」/ API `message-dry-run`。  
**全生徒の構造的準備状況**（実受信者は送信時のみ確定）。作成・送信・書き込みなし。

---

## 導入手順

1. **migration 052 を本番適用**
2. デプロイ（mode=`legacy`）
3. `dry-run` → `allowlist` → `all`
4. 問題時は `legacy`

---

## 第5段階（コーチング催促）への引き継ぎ

- `message_kind=coaching_booking_reminder` を送信側で既に付与
- 通知は `notification_type=coaching_reminder` + 専用 idempotency（booking/week）を推奨
- 通常 `message` 通知と二重にしないこと（本実装は催促を message 経路から除外済み）
