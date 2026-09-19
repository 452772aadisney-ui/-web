-- 066: Pre-prod hardening after privilege-separation audit
-- Apply after 065. Does not seed super admins. Does not delete audit history.
--
-- Fixes:
-- - Last-super DELETE protection + advisory lock on privilege changes
-- - Stale broad is_admin() policies on reads/targets/assignment joins
-- - service_role chat message_kind (063) must not force 'user'
-- - study_day_feedback_reads.comment_at_read for content-aware unread
--
-- precheck: supabase/queries/066_admin_privilege_audit_hardening_precheck.sql
-- verify:   supabase/queries/066_admin_privilege_audit_hardening_verify.sql

-- ---------------------------------------------------------------------------
-- 1) Concurrent demote / last-super: transactional advisory lock + DELETE guard
-- ---------------------------------------------------------------------------
create or replace function public.set_admin_super_privilege(
  p_target_id uuid,
  p_make_super boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role public.user_role;
  target_was_super boolean;
  remaining integer;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'super admin required';
  end if;

  -- Serialize privilege mutations (concurrent demote of last two supers).
  perform pg_advisory_xact_lock(872014065);

  select role, is_super_admin
    into target_role, target_was_super
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception 'target not found';
  end if;

  if target_role <> 'admin' then
    raise exception 'target must already be an admin';
  end if;

  if target_was_super = p_make_super then
    return;
  end if;

  if p_make_super = false then
    select count(*)::integer into remaining
    from public.profiles
    where role = 'admin' and is_super_admin = true and id <> p_target_id;

    if remaining < 1 then
      raise exception 'cannot demote the last super admin';
    end if;
  end if;

  update public.profiles
  set is_super_admin = p_make_super,
      updated_at = now()
  where id = p_target_id;

  insert into public.admin_privilege_audit (
    actor_id, target_id, action, before_is_super_admin, after_is_super_admin
  ) values (
    auth.uid(),
    p_target_id,
    case when p_make_super then 'promote_super' else 'demote_super' end,
    target_was_super,
    p_make_super
  );
end;
$$;

revoke all on function public.set_admin_super_privilege(uuid, boolean) from public;
revoke all on function public.set_admin_super_privilege(uuid, boolean) from anon, authenticated;
grant execute on function public.set_admin_super_privilege(uuid, boolean) to authenticated;

create or replace function public.protect_admin_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_super boolean;
  super_count integer;
begin
  perform pg_advisory_xact_lock(872014065);

  actor_is_super := public.is_super_admin();

  if not actor_is_super then
    if new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'is_super_admin can only be changed by a super admin';
    end if;
    if new.role is distinct from old.role then
      raise exception 'role can only be changed by a super admin';
    end if;
  end if;

  if new.role <> 'admin' then
    new.is_super_admin := false;
  end if;

  if old.is_super_admin = true and old.role = 'admin'
     and (new.is_super_admin = false or new.role <> 'admin') then
    select count(*)::integer into super_count
    from public.profiles
    where role = 'admin' and is_super_admin = true and id <> old.id;

    if super_count < 1 then
      raise exception 'cannot remove the last super admin';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_last_super_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  perform pg_advisory_xact_lock(872014065);

  if old.role = 'admin' and old.is_super_admin = true then
    select count(*)::integer into remaining
    from public.profiles
    where role = 'admin' and is_super_admin = true and id <> old.id;
    if remaining < 1 then
      raise exception 'cannot delete the last super admin';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists profiles_protect_last_super_delete on public.profiles;
create trigger profiles_protect_last_super_delete
  before delete on public.profiles
  for each row execute function public.protect_last_super_admin_delete();

revoke all on function public.protect_last_super_admin_delete() from public;
revoke all on function public.protect_last_super_admin_delete() from anon, authenticated;

comment on function public.protect_last_super_admin_delete() is
  'Block DELETE (incl. auth.users CASCADE) of the last is_super_admin admin.';

-- ---------------------------------------------------------------------------
-- 2) Chat message_kind: service_role Cron must keep system kinds (063 fix)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_chat_message_kind_on_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    new.message_kind := 'user';
  end if;
  return new;
end;
$$;

comment on function public.enforce_chat_message_kind_on_write() is
  'Force message_kind=user unless writer is admin or service_role.';

-- ---------------------------------------------------------------------------
-- 3) Feedback reads: content snapshot for race-safe unread
-- ---------------------------------------------------------------------------
alter table public.study_day_feedback_reads
  add column if not exists comment_at_read text not null default '';

comment on column public.study_day_feedback_reads.comment_at_read is
  'Comment text captured at mark-read; unread if current comment differs.';

drop policy if exists "study_day_feedback_reads_select" on public.study_day_feedback_reads;
create policy "study_day_feedback_reads_select"
  on public.study_day_feedback_reads for select to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
  );

drop policy if exists "study_day_feedback_reads_delete_admin" on public.study_day_feedback_reads;
create policy "study_day_feedback_reads_delete_admin"
  on public.study_day_feedback_reads for delete to authenticated
  using (public.admin_can_access_student(student_id));

-- ---------------------------------------------------------------------------
-- 4) Scope remaining broad admin / world-readable policies
-- ---------------------------------------------------------------------------
drop policy if exists "announcement_reads_select" on public.announcement_reads;
create policy "announcement_reads_select"
  on public.announcement_reads for select to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
  );

-- announcement_target_students: hide graduate ids from regular admins / world
drop policy if exists "announcement_target_students_select" on public.announcement_target_students;
create policy "announcement_target_students_select"
  on public.announcement_target_students for select to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
    or public.is_super_admin()
  );

drop policy if exists "announcement_target_students_admin" on public.announcement_target_students;
create policy "announcement_target_students_admin"
  on public.announcement_target_students for all to authenticated
  using (
    public.is_super_admin()
    or (
      public.admin_can_manage_announcement(announcement_id)
      and public.admin_can_access_student(student_id)
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.admin_can_manage_announcement(announcement_id)
      and public.admin_can_access_student(student_id)
    )
  );

-- announcement_target_tags: write only for manageable announcements
drop policy if exists "announcement_target_tags_admin" on public.announcement_target_tags;
create policy "announcement_target_tags_admin"
  on public.announcement_target_tags for all to authenticated
  using (
    public.is_super_admin()
    or public.admin_can_manage_announcement(announcement_id)
  )
  with check (
    public.is_super_admin()
    or public.admin_can_manage_announcement(announcement_id)
  );

-- Schedule / task student assignment joins
drop policy if exists "exam_schedule_students_select_all" on public.exam_schedule_students;
drop policy if exists "exam_schedule_students_select" on public.exam_schedule_students;
create policy "exam_schedule_students_select"
  on public.exam_schedule_students for select to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
    or public.is_super_admin()
  );
drop policy if exists "exam_schedule_students_insert_admin" on public.exam_schedule_students;
create policy "exam_schedule_students_insert_admin"
  on public.exam_schedule_students for insert to authenticated
  with check (public.admin_can_access_student(student_id));
drop policy if exists "exam_schedule_students_delete_admin" on public.exam_schedule_students;
create policy "exam_schedule_students_delete_admin"
  on public.exam_schedule_students for delete to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "homework_task_students_select_all" on public.homework_task_students;
drop policy if exists "homework_task_students_select" on public.homework_task_students;
create policy "homework_task_students_select"
  on public.homework_task_students for select to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
    or public.is_super_admin()
  );
drop policy if exists "homework_task_students_insert_admin" on public.homework_task_students;
create policy "homework_task_students_insert_admin"
  on public.homework_task_students for insert to authenticated
  with check (public.admin_can_access_student(student_id));
drop policy if exists "homework_task_students_delete_admin" on public.homework_task_students;
create policy "homework_task_students_delete_admin"
  on public.homework_task_students for delete to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "application_task_students_select_all" on public.application_task_students;
drop policy if exists "application_task_students_select" on public.application_task_students;
create policy "application_task_students_select"
  on public.application_task_students for select to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
    or public.is_super_admin()
  );
drop policy if exists "application_task_students_insert_admin" on public.application_task_students;
create policy "application_task_students_insert_admin"
  on public.application_task_students for insert to authenticated
  with check (public.admin_can_access_student(student_id));
drop policy if exists "application_task_students_delete_admin" on public.application_task_students;
create policy "application_task_students_delete_admin"
  on public.application_task_students for delete to authenticated
  using (public.admin_can_access_student(student_id));
