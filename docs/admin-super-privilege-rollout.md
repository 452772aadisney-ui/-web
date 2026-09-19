# 大管理者（is_super_admin）+ 既卒スコープ RLS（064 / 065）ロールアウト

本番 DB に対してこのドキュメントから SQL を自動実行しないこと。
適用・検証・ロールバックは Dashboard SQL Editor / 運用手順に従い、**明示した UUID のみ**で bootstrap する。

関連ファイル:

| 用途 | パス |
|------|------|
| 移行 064 | `supabase/migrations/064_admin_super_privilege.sql` |
| 移行 065 | `supabase/migrations/065_admin_graduate_scope_rls.sql` |
| 064 precheck | `supabase/queries/064_admin_super_privilege_precheck.sql` |
| 064 verify | `supabase/queries/064_admin_super_privilege_verify.sql` |
| 065 precheck | `supabase/queries/065_admin_graduate_scope_rls_precheck.sql` |
| 065 verify | `supabase/queries/065_admin_graduate_scope_rls_verify.sql` |
| 064 rollback 前確認 | `supabase/rollbacks/064_admin_super_privilege_precheck.sql` |
| 064 rollback | `supabase/rollbacks/064_admin_super_privilege_rollback.sql` |
| 065 rollback 前確認 | `supabase/rollbacks/065_admin_graduate_scope_rls_precheck.sql` |
| 065 rollback | `supabase/rollbacks/065_admin_graduate_scope_rls_rollback.sql` |

---

## 適用順（厳密）

1. **未適用の先行 migration をすべて適用**（少なくとも 063 まで）。  
   `schema_migrations` / 運用台帳で確認。**ファイル名や並びから推測しない。**
2. **064 precheck**（read-only）→ 期待: `is_super_admin` 列 `ABSENT`、依存オブジェクトあり。
3. **064 適用** → **064 verify**（列・関数・トリガ・監査表・profiles ポリシー）。
4. **最初の大管理者を bootstrap**（下記テンプレ。064 の直後・065 の前が推奨）。  
   **UUID を明示指定。氏名・作成日時・role 順から推測しない。**
5. **065 precheck**（read-only）→ 期待: 064 オブジェクト `PRESENT`、`audience_scope` は未適用なら `ABSENT`。
6. **065 適用** → **065 verify**。
7. **新アプリをデプロイ**（`isSuperAdmin` / `audience_scope=enrolled` / 授業予定の大管理者ゲート）。
8. スモーク後、運用フリーズを解除。開いている管理画面は **リロード**。

Rollback するときは **逆順**: アプリ戻し →（必要なら）065 DB rollback → 064 DB rollback。

---

## 最初の大管理者 bootstrap（テンプレ・実行しない）

064 は誰も `is_super_admin=true` にしない。  
UPDATE トリガ `profiles_protect_admin_privilege` は「既存の大管理者」を要求するため、**最初の 1 人はトリガを一時無効化**してから明示 UUID で立てる。

```sql
-- TEMPLATE ONLY. Do not run as-is.
-- Replace PASTE-ADMIN-UUID-HERE with the exact profiles.id of an existing admin.
-- Never pick by full_name / email / created_at / "first admin".

begin;

alter table public.profiles
  disable trigger profiles_protect_admin_privilege;

update public.profiles
set is_super_admin = true,
    updated_at = now()
where id = 'PASTE-ADMIN-UUID-HERE'::uuid
  and role = 'admin';

-- Expect exactly 1. If 0, abort (wrong UUID or not admin).
-- select count(*) from public.profiles
-- where role = 'admin' and is_super_admin = true;

alter table public.profiles
  enable trigger profiles_protect_admin_privilege;

commit;
```

以降の昇格・降格は `public.set_admin_super_privilege(target_id, make_super)` のみ（監査付き）。  
**最後の大管理者は demote 不可**（関数・UPDATE トリガの両方で保護）。

---

## 共存期間（旧アプリ × 新 RLS）のリスク

064/065 適用後・新アプリ前（または旧バンドルが残っている間）:

| 状況 | 挙動 |
|------|------|
| RLS は既に既卒を一般管理者から隠す | 旧 UI は「全生徒が見える」前提のまま → 一覧欠落・空詳細・操作失敗に見える |
| 旧アプリに `isSuperAdmin` チェックなし | 授業予定 CRUD / 既卒タグ付与 UI が残っていても DB が拒否する |
| 旧アプリの「全員」お知らせ | `target_all=true` → トリガで `audience_scope='all'`。一般管理者は管理できない（大管理者向け意味） |
| 新アプリの「在学生全員」 | `audience_scope='enrolled'`（一般管理者可） |

**推奨フリーズ（カットオーバー中）**

- 一般管理者による **既卒まわりの操作**（既卒プロフィール閲覧・タグ変更・既卒向けお知らせ・授業予定の作成/更新）を止める。
- 在学生向け通常オペは可能だが、混乱回避のため短時間の管理作業フリーズを推奨。
- 旧タブからの書き込みを避けるため、切替後は **必ずリロード**。

「RLS だけ先に当てて旧アプリを長く同居」は推奨しない。

---

## 通常管理者向けに大管理者専用とした通知運用

既卒と在学生を行単位で安全に分離できない（または対象が既卒前提の）項目:

| 項目 | 扱い |
|------|------|
| 授業予定 dry-run / 授業予定管理 CRUD | 大管理者専用 |
| 配信 24h/7d 集計・pending・最近の失敗 | 通常管理者には非表示（混在 user_id） |
| 購読集計 | 通常管理者は在学生のみ（service_role で既卒除外） |

Cron・自動学習リマインダー等は管理者セッションに依存せず、既存の対象条件を維持（既卒を一律除外しない）。

---

## Rollback の危険（特に 065）

- **065 を rollback すると、一般管理者が再び既卒の学習ログ・チャット・予約・プロフィール等を読める**（再露出）。  
  アプリだけ戻しても RLS が残っていれば秘匿は維持される。**原則はアプリ戻し + DB 残置。**
- 064 rollback は `admin_privilege_audit` 削除と `is_super_admin` 列 DROP で **監査・権限フラグを失う**。列を残してアプリだけ戻す方が安全。
- 破壊的 SQL の前に必ず各 `supabase/rollbacks/*_precheck.sql` を実行し、WARN 行を読むこと。

---

## 検証チェックリスト

### DB（SQL）

- [ ] 064 verify: 全行 `PASS`（列・`is_super_admin()` / `is_kisotsu_student` / `admin_can_access_student` / トリガ / 監査表 RLS / profiles ポリシー）
- [ ] bootstrap 後: `role=admin and is_super_admin` が **意図した人数**（通常まず 1）
- [ ] 065 verify: `audience_scope`・制約・同期トリガ・お知らせ/生徒系/授業予定ポリシー・RPC が大管理者ゲート
- [ ] 学年タグ `既卒` が 1 件存在（precheck の INFO）

### アプリ / 権限（手動）

- [ ] 一般管理者: 既卒プロフィール・学習ログ・チャットが見えない / 編集できない
- [ ] 大管理者: 既卒を含む対象が見える・操作できる
- [ ] 一般管理者: お知らせ「在学生全員」(enrolled) は作成可、「全員(既卒含む)」は不可
- [ ] 一般管理者: 既卒タグの付与/削除・授業予定 CRUD が拒否される
- [ ] `set_admin_super_privilege` で最後の 1 人を demote すると例外になる

### カットオーバー運用

- [ ] 未適用 migration を確認してから 064 → 065 → アプリの順
- [ ] bootstrap UUID を台帳に記録（推測禁止）
- [ ] フリーズ告知 → 適用 → verify → デプロイ → リロード依頼 → フリーズ解除
