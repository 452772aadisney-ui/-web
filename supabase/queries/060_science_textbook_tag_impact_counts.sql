-- 理科タグ分離の影響確認（読み取り専用・件数のみ）
-- Supabase Dashboard > SQL Editor で実行してください。
-- DB を変更しません。教材名・生徒名・UUIDは出力しません。
--
-- 明示タグ = detail_tags / subjects 配列に '物理'|'化学'|'生物'|'地学' が含まれる
-- 理科関連 = subjects に '理科'、または detail_tags に理科グループタグ
--   （物理/化学/生物/地学/その他（理科））が含まれる

with science_explicit as (
  select unnest(array['物理', '化学', '生物', '地学']) as tag
),
science_related_detail as (
  select unnest(array['物理', '化学', '生物', '地学', 'その他（理科）']) as tag
),
catalog_flags as (
  select
    c.id,
    exists (
      select 1
      from unnest(coalesce(c.detail_tags, '{}'::text[]) || coalesce(c.subjects, '{}'::text[])) t(tag)
      where t.tag in (select tag from science_explicit)
    ) as has_explicit_science,
    (
      '理科' = any (coalesce(c.subjects, '{}'::text[]))
      or exists (
        select 1
        from unnest(coalesce(c.detail_tags, '{}'::text[])) t(tag)
        where t.tag in (select tag from science_related_detail)
      )
    ) as is_science_related
  from public.textbook_catalog c
),
student_book_flags as (
  select
    t.id,
    t.student_id,
    exists (
      select 1
      from unnest(coalesce(t.detail_tags, '{}'::text[]) || coalesce(t.subjects, '{}'::text[])) x(tag)
      where x.tag in (select tag from science_explicit)
    ) as has_explicit_science,
    (
      '理科' = any (coalesce(t.subjects, '{}'::text[]))
      or exists (
        select 1
        from unnest(coalesce(t.detail_tags, '{}'::text[])) x(tag)
        where x.tag in (select tag from science_related_detail)
      )
    ) as is_science_related
  from public.textbooks t
)
select
  'catalog_with_explicit_science'::text as metric,
  count(*)::int as count
from catalog_flags
where has_explicit_science

union all

select
  'catalog_science_related_without_explicit',
  count(*)::int
from catalog_flags
where is_science_related
  and not has_explicit_science

union all

select
  'student_textbooks_with_explicit_science',
  count(*)::int
from student_book_flags
where has_explicit_science

union all

select
  'student_textbooks_science_related_without_explicit',
  count(*)::int
from student_book_flags
where is_science_related
  and not has_explicit_science

union all

select
  'students_with_science_related_without_explicit_bookshelf',
  count(distinct student_id)::int
from student_book_flags
where is_science_related
  and not has_explicit_science

order by metric;
