-- 062 verify (read-only)

select
  'study_day_feedback_reads_update_own_policy'::text as check_name,
  case
    when exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'study_day_feedback_reads'
        and policyname = 'study_day_feedback_reads_update_own'
        and cmd = 'UPDATE'
    ) then 'PASS'
    else 'FAIL'
  end as status,
  'UPDATE own reads'::text as details;
