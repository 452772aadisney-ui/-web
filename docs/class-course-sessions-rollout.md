# 既卒授業回数・割当・実施（067–071）本番適用準備

**状態: 適用準備完了 · 実DB未検証**  
**このチャットから push / 本番 SQL / デプロイ / 実通知は行わない。**  
実際の本番適用と、通知を伴う書き込み確認は **別途承認後**。

検証区分:

| 区分 | 内容 | 状態 |
|------|------|------|
| 静的 | migration / verify SQL 読取、RPC・トリガ・RLS定義の照合 | 済 |
| 単体・モック | lineage 残回数、guards、migration 文字列テスト、tsc / 全 vitest / build | 済 |
| 実DB | precheck→適用→verify の本番または同等環境実行 | **未実施** |

未解決の重大欠陥は、静的・モック範囲では見えていない。

---

## 1. 未 push コミットと 067〜071 ファイル一覧

### 未 push（`main` が `origin/main` より ahead 8）

| Commit | 要約 |
|--------|------|
| `375cd34` | 共通授業・割当・登録 UI（067 起点） |
| `f5add57` | コマ紐づけ・実施・対象通知 |
| `ecc63ea` | create/add/edit をコース紐づけ主経路に |
| `6f3880a` | 一括実施・取消/対象外し DB ガード（068） |
| `3e974ef` | 生徒残回数画面・068 手順 |
| `1893a2c` | 原子 RPC・通知 audience fail-closed（069） |
| `e956026` | 残回数・生徒公開縮小・実施 RPC（070） |
| `bc64905` | lineage 判定・コマ削除ガード（071） |

### SQL ファイル（適用対象）

| 段階 | migration | precheck（READ-ONLY） | verify（READ-ONLY） |
|------|-----------|----------------------|---------------------|
| 067 | `supabase/migrations/067_class_course_sessions.sql` | `supabase/queries/067_class_course_sessions_precheck.sql` | `supabase/queries/067_class_course_sessions_verify.sql` |
| 068 | `supabase/migrations/068_class_course_cancel_guards.sql` | `supabase/queries/068_class_course_cancel_guards_precheck.sql` | `supabase/queries/068_class_course_cancel_guards_verify.sql` |
| 069 | `supabase/migrations/069_class_schedule_course_atomic.sql` | `supabase/queries/069_class_schedule_course_atomic_precheck.sql` | `supabase/queries/069_class_schedule_course_atomic_verify.sql` |
| 070 | `supabase/migrations/070_class_course_attendance_integrity.sql` | `supabase/queries/070_class_course_attendance_integrity_precheck.sql` | `supabase/queries/070_class_course_attendance_integrity_verify.sql` |
| 071 | `supabase/migrations/071_class_course_attendance_lineage.sql` | `supabase/queries/071_class_course_attendance_lineage_precheck.sql` | `supabase/queries/071_class_course_attendance_lineage_verify.sql` |

071 適用後の横断確認（READ-ONLY）:

- `supabase/queries/071_class_course_final_state_check.sql`

アプリ差分は上記 8 コミットに含まれる（手順書は本ファイル）。

---

## 2. 067→071 最終定義（静的確認）

意図した最終状態（071 後）:

| 種別 | 定義 | 古い／広い権限 |
|------|------|----------------|
| RLS 割当 | `select_super` のみ。`select_own` **削除**（070） | 生徒の割当直読不可 |
| RLS 実施履歴 | `select_super` / `insert_super`。own ポリシーなし | authenticated に UPDATE/DELETE なし |
| RLS 対象 | `attendees_select_own`（自分の行）残置 | 対象強調用。割当・残回数は含まない |
| RPC 実施 | `record_class_course_attendance(uuid×5,text,uuid)` **7引数** | **6引数は 071 で DROP** |
| RPC 取消・対象外し・コース日作成等 | `service_role` のみ EXECUTE + `p_actor_id` 大管理者再検証 | authenticated/anon へ EXECUTE を広げない |
| トリガ | attendees 削除ガード（lineage 単位）、session 削除ガード（071）、履歴 DELETE 拒否、course_unit 再紐づけ（履歴無し時のみ可） | — |
| 旧 create | `create_class_schedule_day_with_sessions` **意図的残置**（自由記述互換） | コース紐づけはしない |

**注意:** 070 verify の `070_record_attendance_rpc` は **6引数 PRESENT = PASS**（070 直後用）。071 後は 6引数が消えるため、**070 verify を最終判定に使わない**。最終は `071_…_verify` + `071_…_final_state_check`。

---

## 3. `attendance_lineage_id` と生徒分離（静的・モック）

| 軸 | 判定 |
|----|------|
| lineage | 同一訂正チェーン。コマ由来は元 session uuid（`session_id` SET NULL 後も不変）。手入力は初回採番 |
| 生徒 | すべての最新判定・RPC が `student_id` で絞る。同一コマの複数生徒は **別 assignment 行**（生徒×unit）をロック |
| 共通授業 | `course_unit_id` で絞る。消化は unit あたり有効 attended lineage が1つ以上なら1カウント |
| モック | S1欠席→S2実施→S1未実施訂正で消化維持、別 lineage 二重実施はエラー |

実DBでの同時受講の混在テストは **未実施**。

---

## 4. ロック順・部分保存・失敗表示（静的）

| 操作 | ロック順（コード上） | 原子性 |
|------|----------------------|--------|
| 実施 `record_…` | ① active 割当 `FOR UPDATE` → ②（session あり）session `FOR UPDATE` → insert | 単一 RPC。失敗時 insert なし |
| 対象外し | ① 割当 `FOR UPDATE` → lineage 再確認 → delete attendee | 単一 RPC |
| 取消 | ① 割当 `FOR UPDATE` → 有効実施再確認 → status=cancelled | 単一 RPC |
| コマ／日削除 | DELETE 行ロック。session `BEFORE DELETE` で有効実施/欠席なら拒否。日は sessions CASCADE で同トリガ | トリガ例外で文全体失敗 |

デッドロック回避の要点: 実施は **割当→session**。削除は session 行のみ（割当を先に取らない）。対象外し／取消は割当のみ。

アプリ: RPC/`error` 時は `ok: false` / エラー文言。同一 lineage の再実施 skip は「追加保存なし」と明示し、別 lineage 衝突は成功にしない。一括は一部失敗を成功扱いにしない。

実DBでの競合・デッドロック再現は **未実施**。

---

## 5. 最初の読み取り専用 precheck

**パス:** `supabase/queries/067_class_course_sessions_precheck.sql`  
（依存: class_schedule 053–058 系、および `profiles.is_super_admin`＝064 済み）

| 結果 | 判断 |
|------|------|
| 依存行がすべて `PASS`、067 オブジェクトが `ABSENT` | 067 適用へ進める |
| `FAIL_APPLY_CLASS_SCHEDULE_FIRST` / `FAIL_APPLY_064_FIRST` | **停止**。先に前提 migration |
| 067 オブジェクトが既に `PRESENT` | **停止して状態確認**。二重適用や部分適用の疑い。verify / 手動確認後に方針決定 |

書き込みなし。1 行でも想定外なら次へ進まない。

---

## 6. SQL Editor での段階適用（CLI 挙動に依存しない）

各段階を **止まれる単位**にする。Supabase Dashboard → SQL Editor。

### トランザクション境界（明示）

CLI の「ファイル＝1TX」を前提にしない。SQL Editor では **毎回自分で包む**:

```sql
begin;
-- ここに migration ファイル全文を貼る
commit;
```

- 成功: 全行がコミットされる  
- エラー: 同じセッションで即座に `rollback;`（未 commit なら変更破棄）。**エラー後に commit しない**  
- precheck / verify は READ-ONLY のため `begin` 不要（SELECT のみ）

1 ファイルを複数 Run に分割しない。分割すると部分適用のリスクが上がる。

### 手順（各 migration）

1. 当該 **precheck** を Run → 期待どおりか確認。だめなら **停止**  
2. `begin;` + **migration 全文** + `commit;`  
3. 当該 **verify** を Run → **全行 `PASS`**。1 行でも `FAIL` なら **停止**（次の migration・デプロイ・書き込み確認に進まない）  
4. 次の番号へ  

順序: **067 → 068 → 069 → 070 → 071**  

071 verify PASS 後: **`071_class_course_final_state_check.sql`** → 全行 `PASS`。

### 段階ごとの verify 期待（要約）

| 直後 | verify | 特記 |
|------|--------|------|
| 067 | 表・列・RPC 存在、RLS on、active unique | — |
| 068 | remove/cancel RPC、attendee delete トリガ | — |
| 069 | course create/add/update RPC、rebind・履歴 delete 拒否、**legacy create 残** | — |
| 070 | select_own 削除、source、**6引数 record**、EXECUTE 縮小 | 中間状態 |
| 071 | lineage NOT NULL、session delete トリガ、**7引数のみ** | 6引数なし |
| 最終 | `final_state_check` | 070 の 6引数チェックは使わない |

---

## 7. 切替・互換・停止／復旧

### 切替中に停止すべき操作

- 大管理者の **授業予定・回数・実施の書き込み**（067–071 適用〜新アプリデプロイまでの隙間）  
- 旧 UI での自由記述日の量産（対象なしコマが増える）  
- 適用途中でのアプリデプロイ（特に 070 のみ／071 前は 6引数、新アプリは 7引数）

### 旧アプリ互換

| 状態 | 挙動 |
|------|------|
| DB のみ 067–071、旧アプリ | 旧 create は自由記述可能。新 RPC・lineage 実施は呼ばない限り回数管理は増えない |
| 新アプリ、DB が 071 未満 | `record_class_course_attendance` 7引数がなく失敗しうる → **デプロイは 071 後** |
| legacy create RPC | 残置（意図的） |

### 失敗時

1. **その場で停止**（次 migration・デプロイ・通知付き書き込み確認に進まない）  
2. verify / final_state の FAIL 行を記録  
3. 未 commit なら `rollback;`  
4. 既に commit 済みの部分適用: **履歴や割当を DELETE して戻す rollback は通常手順にしない**。アプリを旧版のままにし、スキーマは残置。修復は不足定義の足し直し or 別途承認した修復 SQL  
5. データ破壊的 DROP は緊急時の別承認事項

### 通知（仕様変更なし）

- 実施・回数登録: 無通知  
- 誤登録の日／コマ削除: 無通知  
- 日／コマの作成・変更・中止再開: 既存の予定通知（承認後の書き込み確認で扱う）

---

## 承認後に行うこと（この文書の範囲外）

1. 本番（または承認済み同等）で §5–6 を実行し実DB検証を「実施済」にする  
2. 071 + final_state PASS を確認してからアプリをデプロイ  
3. 閲覧確認 → 別承認後に書き込み確認（通知を伴う操作を含む）  
4. git push は別途承認
