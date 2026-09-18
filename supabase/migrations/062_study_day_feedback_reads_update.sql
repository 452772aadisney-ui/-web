-- 062: study_day_feedback_reads — student UPDATE for upsert re-read
-- Supabase Dashboard > SQL Editor で実行してください
--
-- Background: mark-as-read uses upsert on (feedback_id, student_id).
-- INSERT is allowed for own rows; without UPDATE, conflict updates can fail
-- under RLS and leave badges stuck.
--
-- Does not delete or reset existing reads.

drop policy if exists "study_day_feedback_reads_update_own" on public.study_day_feedback_reads;
create policy "study_day_feedback_reads_update_own"
  on public.study_day_feedback_reads for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

comment on policy "study_day_feedback_reads_update_own" on public.study_day_feedback_reads is
  'Students may refresh read_at on their own feedback reads (upsert).';
