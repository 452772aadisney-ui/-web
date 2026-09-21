# 既卒授業回数・割当・実施（067–071）

**本番 DB に対してこのドキュメントから SQL を自動実行しないこと。**
破壊的テスト・隔離 harness・試験データ作成を本番で行わない。
**整合性確認前の本番適用案内はしない**（ローカル静的／モック検証のみ完了時）。

| 用途 | パス |
|------|------|
| 067–070 | 既存 precheck / migration / verify |
| 071 precheck | `supabase/queries/071_class_course_attendance_lineage_precheck.sql` |
| 071 migration | `supabase/migrations/071_class_course_attendance_lineage.sql` |
| 071 verify | `supabase/queries/071_class_course_attendance_lineage_verify.sql` |

## 適用順（承認後・手動）

1. 067 → 068 → 069 → 070（各 precheck → apply → verify）
2. **071 precheck → 071 適用 → 071 verify**
   - `attendance_lineage_id`（コマ削除後も訂正対象を一意識別）
   - 実施 RPC を 7 引数化（`p_attendance_lineage_id`）
   - コマ `BEFORE DELETE` で有効実施／欠席を拒否（日 CASCADE 含む）
3. 新アプリをデプロイ（071 適用後。070 のみ適用の旧アプリは 6 引数 RPC を呼ぶため不可）

## 残回数（lineage 単位）

- 訂正チェーンは `attendance_lineage_id` で識別（コマ由来は元 session uuid。手入力は初回採番）
- **各 lineage の最新 status** を見る。別コマの訂正は互いに打ち消さない
- 消化: 生徒×共通授業で、いずれかの lineage 最新が `attended` なら **1 カウント**
- 別 lineage へ二重 `attended` は RPC が **エラー**（skip 成功にしない）。同一 lineage の再実施のみ skip

例: S1 欠席 → S2 実施（消化1）→ S1 を未実施訂正（消化1維持）→ S2 を未実施（消化0）

## 日／コマ削除ガード（履歴 DELETE 禁止だけでは不十分）

`session_id ON DELETE SET NULL` のため、履歴行が残ったままコマは消えうる。ガード根拠は次:

| 経路 | 根拠 |
|------|------|
| コマ DELETE / 日 DELETE→sessions CASCADE | `tg_deny_session_delete_with_attendance`（071）: 当該 lineage 最新が attended/absent なら拒否 |
| attendees CASCADE（コマ削除時） | `tg_deny_session_attendee_delete_with_record`（068→071）: **当該コマ lineage** の最新のみ判定 |
| 実施との同時実行 | 実施 RPC は session を `FOR UPDATE`。DELETE も対象行をロックし直列化 |
| 訂正後の削除 | 許可。`event_date` / `attendance_lineage_id` / `source` / 履歴行は保持（`session_id` のみ NULL） |

## 履歴付き誤紐づけの訂正手順（新機能なし）

履歴があるコマの `course_unit_id` 付け替えは不可（069/070）。既存操作のみで直す:

1. 元コマの **実施／欠席を未実施へ訂正**（コマ画面、または生徒画面の「この記録を訂正」）
2. 対象外し・割当の整理が必要なら実施（未実施後のみ）
3. 元コマ／元日を **誤登録削除**（上記ガード通過後）
4. **正しい共通授業を紐づけたコマを新規作成**（必要なら対象を再設定）
5. 必要なら実施を再登録

### 通知（仕様変更なし・既存どおり）

| 操作 | 通知 |
|------|------|
| 実施・欠席・未実施の追記 | 無通知 |
| 誤登録の日／コマ削除（`deleteClassScheduleDay` / `Session`） | **無通知**（コード上明示） |
| 新規の日作成・コマ追加・内容変更・中止／再開 | **既存の予定通知**（対象和／明示 recipient）。整理のあと正しいコマを作り直すと、作成・変更に伴う通知が走りうる |

通知の宛先ルール自体は変更しない。

## 権限（要約）

- Write RPC: service_role + `p_actor_id` 大管理者再検証（`is_super_admin()` 不使用）
- 生徒は割当・実施履歴を SELECT 不可。対象判定は `session_attendees` のみ

## Rollback 方針

- 原則: アプリを戻し、067–071 スキーマと履歴は残置
