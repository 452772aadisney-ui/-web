# 既卒授業回数・割当・実施（067–070）本番適用前手順

**本番 DB に対してこのドキュメントから SQL を自動実行しないこと。**
破壊的テスト・隔離 harness・試験データ作成を本番で行わない。

| 用途 | パス |
|------|------|
| **最初に実行する読み取り専用 precheck** | `supabase/queries/067_class_course_sessions_precheck.sql` |
| 067 migration | `supabase/migrations/067_class_course_sessions.sql` |
| 067 verify | `supabase/queries/067_class_course_sessions_verify.sql` |
| 068 precheck | `supabase/queries/068_class_course_cancel_guards_precheck.sql` |
| 068 migration | `supabase/migrations/068_class_course_cancel_guards.sql` |
| 068 verify | `supabase/queries/068_class_course_cancel_guards_verify.sql` |
| 069 precheck | `supabase/queries/069_class_schedule_course_atomic_precheck.sql` |
| 069 migration | `supabase/migrations/069_class_schedule_course_atomic.sql` |
| 069 verify | `supabase/queries/069_class_schedule_course_atomic_verify.sql` |
| 070 precheck | `supabase/queries/070_class_course_attendance_integrity_precheck.sql` |
| 070 migration | `supabase/migrations/070_class_course_attendance_integrity.sql` |
| 070 verify | `supabase/queries/070_class_course_attendance_integrity_verify.sql` |

## 適用順（承認後・手動）

1. **前提**: 064〜066 および class_schedule（053–058、065 の create/bump 超管化）が適用済み
2. **`067_…_precheck.sql`（READ-ONLY）** → **067 適用** → **067 verify**（全行 `PASS`）
3. **068 precheck** → **068 適用** → **068 verify**
4. **069 precheck** → **069 適用** → **069 verify**
5. **070 precheck** → **070 適用** → **070 verify**
   - 生徒の `class_course_assignments_select_own` を削除
   - 実施追記は `record_class_course_attendance`（割当 `FOR UPDATE`）
   - 履歴 `source`（`session` / `manual`）追加
6. **新アプリをデプロイ**（067–070 適用後）
7. **閲覧確認**（書き込みなし）
8. **書き込み確認は別途承認後**

## migration 途中失敗・再実行（IF NOT EXISTS だけでは断定しない）

Supabase CLI の migration は通常 **ファイル単位で1トランザクション**。途中例外ならそのファイルはロールバックされ、再適用は全文から。

| 段階 | 途中失敗時に起きうること | 再実行の扱い |
|------|--------------------------|--------------|
| 067 | `CREATE TABLE IF NOT EXISTS` / policy drop-create。**手動で部分適用した場合**は表だけ存在しうる | precheck の PRESENT/ABSENT を見て不足を確認。全文再実行は IF NOT EXISTS で概ね安全だが、**制約名・seed の差分は verify で確認** |
| 068 | RPC/trigger の `CREATE OR REPLACE`。データ行は触らない | 全文再実行可。verify でシグネチャ・EXECUTE を確認 |
| 069 | 新規 RPC + trigger。旧 create は残置 | 全文再実行可。**部分適用後に関数定義だけ古い**場合は replace で上書きされるが、verify で `cancel` の `FOR UPDATE` 有無を確認 |
| 070 | policy DROP・`source` 追加・RPC replace。`source` の backfill → `NOT NULL` は同一 TX 内なら原子的。**手動分割適用**すると backfill 前の NOT NULL で失敗しうる | precheck で `source` / RPC / select_own の有無を確認してから全文再実行。verify で policy 削除・EXECUTE・attendees_select_own 残存を確認 |

**いずれも既存 `class_schedule_*` 行や実施履歴を DELETE しない。**
「再実行可」= IF NOT EXISTS がある、ではなく **トランザクション境界 + precheck/verify で定義差分を潰せる**こと。

## 権限（RLS / EXECUTE）— service_role + p_actor_id

書き込み RPC は次の既存安全方式に揃える（`auth.uid()` 依存の `is_super_admin()` を RPC 内で使わない）。

1. アプリ: `requireSuperAdmin()`（ユーザ JWT で大管理者確認）→ `createAdminClient()`（service_role）
2. RPC: `auth.role() = service_role` のみ通過
3. RPC: `profiles` を **`id = p_actor_id` かつ `role=admin` かつ `is_super_admin=true`** で再検証
4. `EXECUTE` は **service_role のみ**（authenticated / anon へ広げない）

通常管理者・生徒は (1) で拒否。service_role を直接叩けても (3) の `p_actor_id` が大管理者でなければ拒否。

| 対象 | 生徒 | 通常管理者 | 大管理者 |
|------|------|------------|----------|
| `class_course_assignments` SELECT | 不可（070 で own 削除） | RLS 上不可 | 可 |
| `class_course_attendance_events` | 不可 | 不可 | 可 |
| `class_schedule_session_attendees` 自分の行 | 可（対象強調用・session_id 等） | — | 可 |
| 実施/取消/対象外し RPC | EXECUTE なし | EXECUTE なし | アプリ経由のみ |

## 残回数・ロック

- 消化根拠は **最新 status = attended**（過去の attended が残っても、最新が not_done/absent なら未消化）
- 有効実施の二重追記は RPC が割当行ロック下で skip
- 実施・対象外し・割当取消はいずれも **active 割当行を先に `FOR UPDATE`**

## 履歴とコマ削除

- `session_id ON DELETE SET NULL`。`event_date` / 行 `id` / `course_unit_id` / `source` は残る
- `source=session` かつ `session_id IS NULL` = コマ削除後のコマ由来。`source=manual` = 手入力
- 実施履歴の DELETE は拒否（追記のみ）。削除で訂正制約を迂回しない
- `course_unit_id` 付け替え: **そのコマに紐づく実施履歴が無いときのみ可**（誤紐づけの訂正用）。履歴がある場合は従来どおり不可

## Rollback 方針

- 原則: **アプリを戻し、067–070 スキーマと履歴は残置**
- 破壊的 DROP（表・履歴削除）を通常 rollback にしない

## 通知

- 回数追加・割当・実施は無通知
- 日全体変更: その日の対象和（全員向けコマがあれば既卒全員）。取得失敗時は全員へフォールバックしない
- 個別コマ変更: 明示の `recipientStudentIds`（対象のみ／変更前後の和）
