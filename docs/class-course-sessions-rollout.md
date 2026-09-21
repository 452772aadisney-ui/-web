# 既卒授業回数・割当・実施（067–069）本番適用前手順

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

## 適用順（承認後・手動）

1. **前提**: 064〜066 および class_schedule（053–058、065 の create/bump 超管化）が適用済み
2. **`067_class_course_sessions_precheck.sql`（READ-ONLY）**
   - 依存列・表は `information_schema` / `to_regclass` のみ参照（未作成列を実表から SELECT しない）
   - 依存 `PASS`、067 オブジェクトは適用前 `ABSENT`
3. **067 適用** → **067 verify**（全行 `PASS`）
4. **068 precheck** → **068 適用** → **068 verify**
5. **069 precheck** → **069 適用** → **069 verify**
   - 069 は新規 RPC 追加。旧 `create_class_schedule_day_with_sessions` は残置（旧アプリ互換）
6. **新アプリをデプロイ**（067–069 適用後）
7. **閲覧確認**（書き込みなし）: 予定一覧・生徒予定・授業回数画面の表示
8. **書き込み確認は別途承認後**: 回数登録・コマ紐づけ・実施・取消（試験データは最小・追跡可能に）

## migration 途中失敗時

| 段階 | 状態 | 再実行 |
|------|------|--------|
| 067 途中 | `CREATE TABLE IF NOT EXISTS` / policy drop-create 中心。途中停止時はオブジェクトが部分存在しうる | precheck の PRESENT/ABSENT を見て、不足分のみ手作業確認後に **全文再実行可**（IF NOT EXISTS） |
| 068 途中 | RPC/trigger 置換。途中停止でもデータ行は触らない | 全文再実行可 |
| 069 途中 | 新規 RPC + trigger。旧 create は触らない | 全文再実行可 |

**いずれも既存 `class_schedule_*` 行や実施履歴を DELETE しない。**

## 旧アプリ互換・切替

- 既存コマ: `course_unit_id` NULL・`audience_type=all_kisotsu` のまま（非破壊）
- 旧アプリは新 RPC（`create_class_schedule_day_with_course_sessions` 等）を呼ばない限り、回数・対象・実施は増えない
- 旧 `create_class_schedule_day_with_sessions` は自由記述日作成のみ継続可能（コース紐づけなし）
- **切替推奨**: 067–069 適用後〜新デプロイまでの短い間、大管理者の授業予定・回数登録の**書き込みを控える**（旧 UI が対象なしコマだけ作るのを避ける）
- 新アプリは create/add/update を 069 原子 RPC 経由にし、部分保存しない

## 権限（RLS / EXECUTE）

- 新テーブル: 大管理者のみ書込。生徒は自分の割当 active・自分の attendee 行のみ SELECT
- 実施履歴: authenticated に UPDATE/DELETE なし。069 で DELETE トリガ拒否（追記のみ）
- 新規/取消/追加 RPC: `SECURITY DEFINER` + `search_path=public` + `service_role` のみ EXECUTE + 関数内で `is_super_admin` 確認

## Rollback 方針

- 原則: **アプリを戻し、067–069 スキーマと履歴は残置**
- 破壊的 DROP（表・履歴削除）を通常 rollback にしない

## 通知

- 回数追加・割当・実施は無通知
- 日全体変更: その日の対象和（全員向けコマがあれば既卒全員）。取得失敗時は全員へフォールバックしない
- 個別コマ変更: 明示の `recipientStudentIds`（対象のみ／変更前後の和）
