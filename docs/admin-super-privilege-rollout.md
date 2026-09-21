# 大管理者（is_super_admin）+ 既卒スコープ RLS（064 / 065）ロールアウト

本番 DB に対してこのドキュメントから SQL を自動実行しないこと。
適用・検証・ロールバックは Dashboard SQL Editor / 運用手順に従い、**明示した UUID のみ**で bootstrap する。

関連ファイル:

| 用途 | パス |
|------|------|
| 移行 064 | `supabase/migrations/064_admin_super_privilege.sql` |
| 移行 066 | `supabase/migrations/066_admin_privilege_audit_hardening.sql` |
| 066 precheck | `supabase/queries/066_admin_privilege_audit_hardening_precheck.sql` |
| 066 verify | `supabase/queries/066_admin_privilege_audit_hardening_verify.sql` |
| 隔離検証（使い捨てDB・ロール切替） | `supabase/queries/066_admin_privilege_isolation_harness.sql` |
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
7. **066 precheck** → **066 適用** → **066 verify**（旧広いポリシー残存・DELETE保護・service_role message_kind）。
8. **新アプリをデプロイ**（`isSuperAdmin` / `audience_scope=enrolled` / 授業予定の大管理者ゲート / comment_at_read 未読）。
9. スモーク後、運用フリーズを解除。開いている管理画面は **リロード**。

Rollback するときは **逆順**: アプリ戻し →（必要なら）066 → 065 → 064。

---

## 最初の大管理者 bootstrap（テンプレ・実行しない）

064 は誰も `is_super_admin=true` にしない。  
UPDATE トリガ `profiles_protect_admin_privilege` は「既存の大管理者」を要求するため、**最初の 1 人はトリガを一時無効化**してから明示 UUID で立てる。

**必須条件**

- 同一トランザクション内で DISABLE → UPDATE → ENABLE
- 例外時も ENABLE を実行（`EXCEPTION WHEN OTHERS` で再有効化してから再送出）
- 対象 UUID が `role = 'admin'` であることを UPDATE の WHERE と行数検査で検証
- コミット前にトリガ有効・大管理者人数を確認

```sql
-- TEMPLATE ONLY. Do not run as-is against production from this chat.
-- Replace PASTE-ADMIN-UUID-HERE with the exact profiles.id of an existing admin.
-- Never pick by full_name / email / created_at / "first admin".

begin;

do $$
declare
  target uuid := 'PASTE-ADMIN-UUID-HERE'::uuid;
  updated_count integer;
  super_count integer;
  trigger_enabled boolean;
begin
  -- Fail closed: always re-enable trigger even on error.
  begin
    alter table public.profiles
      disable trigger profiles_protect_admin_privilege;

    update public.profiles
    set is_super_admin = true,
        updated_at = now()
    where id = target
      and role = 'admin';

    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception 'bootstrap aborted: target must be an existing admin (updated=%)', updated_count;
    end if;

  exception
    when others then
      alter table public.profiles
        enable trigger profiles_protect_admin_privilege;
      raise;
  end;

  alter table public.profiles
    enable trigger profiles_protect_admin_privilege;

  select tgenabled = 'O' into trigger_enabled
  from pg_trigger
  where tgname = 'profiles_protect_admin_privilege'
    and tgrelid = 'public.profiles'::regclass
    and not tgisinternal;

  if coalesce(trigger_enabled, false) is not true then
    raise exception 'bootstrap aborted: protect trigger is not enabled';
  end if;

  select count(*)::integer into super_count
  from public.profiles
  where role = 'admin' and is_super_admin = true;

  if super_count < 1 then
    raise exception 'bootstrap aborted: no super admin after update';
  end if;

  raise notice 'bootstrap ok: super_admin_count=%', super_count;
end $$;

commit;

-- Post-check (read-only)
-- select id, role, is_super_admin from public.profiles where is_super_admin = true;
-- select tgenabled from pg_trigger where tgname = 'profiles_protect_admin_privilege';
```

以降の昇格・降格は `public.set_admin_super_privilege(target_id, make_super)` のみ（監査付き）。  
**最後の大管理者は demote / DELETE 不可**。

---

## 切り替え中の利用制限（必須）

旧アプリの **service_role** 経路は RLS 追加だけでは制限できない。

**064 適用開始〜新アプリ反映・ロール別確認完了まで:**

- **通常管理者の管理画面利用全体を控える**（生徒一覧・お知らせ・通知運用・dry-run・コーチング代理操作を含む）
- 大管理者のみ、検証に必要な最小操作を許可
- 切替完了後: 新アプリへ再読み込み（ハードリロード）してから通常管理者の利用を再開

共存リスクの詳細は下記「共存期間」を参照。
---

## 最後の大管理者 — 保護対象と対象外

| 操作 | 保護 |
|------|------|
| `set_admin_super_privilege` demote | あり（advisory lock + remaining count） |
| profiles UPDATE で flag/role 剥がし | あり（同 lock） |
| profiles DELETE / auth.users CASCADE | あり（066 `profiles_protect_last_super_delete`） |
| Dashboard での Auth ユーザー削除 | 上記 DELETE トリガが発火すれば保護。トリガ無効化や物理バックアップ復元は対象外 |
| bootstrap（トリガ DISABLE） | オーナー SQL のみ。通常クライアント不可 |

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

- **通常管理者の管理画面利用全体を停止**（service_role を使う旧パスが RLS を迂回しうるため）
- 大管理者による検証用の最小操作のみ
- 新アプリ反映・ロール別確認後に利用再開し、**必ずハードリロード**
- 「RLS だけ先に当てて旧アプリを長く同居」は禁止

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

## 通知 dry-run の権限（最終）

| カテゴリ | 通常管理者 | 大管理者 | Cron / DELIVERY_MODE=dry-run |
|----------|------------|----------|------------------------------|
| 学習リマインダー全体 dry-run | 在学生のみ集計 | 全員 | **変更なし**（従来どおり全対象条件） |
| お知らせ準備状況 dry-run | 在学生のみ | 全員 | オーケストレータ dry-run は従来どおり |
| メッセージ準備状況 dry-run | 在学生のみ | 全員 | 同上 |
| コーチング準備状況 dry-run | 在学生のみ（候補から既卒除外） | 全員 | Cron 候補ロジックは変更なし |
| 授業予定準備状況 dry-run | **不可**（API 403） | 可（既卒向け） | Cron 対象条件は変更なし |

API は UI 非表示に加え `isSuperAdmin` / `excludeGraduates` をサーバーで強制。
ゲートキーは `adminId:enrolled|all` でスコープ分離（大管理者用結果を通常管理者ゲートと共有しない）。

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
- [ ] 066 verify: stale broad ポリシーなし・DELETE 保護・service_role message_kind・comment_at_read
- [ ] 学年タグ `既卒` が 1 件存在（precheck の INFO）

### アプリ / 権限（手動）

- [ ] 一般管理者: 既卒プロフィール・学習ログ・チャットが見えない / 編集できない
- [ ] 大管理者: 既卒を含む対象が見える・操作できる
- [ ] 一般管理者: お知らせ「在学生全員」(enrolled) は作成可、「全員(既卒含む)」は不可
- [ ] 一般管理者: 既卒タグの付与/削除・授業予定 CRUD が拒否される
- [ ] `set_admin_super_privilege` で最後の 1 人を demote すると例外になる
- [ ] 最後の大管理者 profiles DELETE / Auth ユーザー削除が拒否される
- [ ] フィードバック: 本文変更で再未読、同一本文再保存で再未読化しない

### カットオーバー運用

- [ ] 未適用 migration を確認してから 062→063→064→bootstrap→065→066→アプリの順
- [ ] bootstrap UUID を台帳に記録（推測禁止）
- [ ] フリーズ告知 → 適用 → verify → デプロイ → リロード依頼 → フリーズ解除

### 隔離 DB での RLS 検証（必須・本番禁止）

**実 DB 検証ステータス: 未実施**（このリポジトリ作業では隔離プロジェクトを起動・実行していない）。

必要環境:

1. 本番と切り離した Supabase プロジェクト（ローカル `supabase start` または専用 throwaway）
2. migration 066 まで適用済み
3. bootstrap 済みの大管理者 1 名 + 使い捨て通常管理者・在学生・既卒・全員宛てお知らせ行
4. SQL Editor / psql で **同一セッション**に `066_admin_privilege_isolation_harness.sql` を流す
   （`isolation_harness_ids` へ UUID を INSERT してから A–G1 を実行）
5. 各ブロックで `SET LOCAL ROLE authenticated|anon` 後に `PASS` NOTICE を確認
   postgres のままセクション 0 だけ成功しても **RLS 検証完了扱いにしない**
6. 同時降格（G2）は **独立した 2 接続**で実施

本番にテストユーザーや harness 用行を作らないこと。
