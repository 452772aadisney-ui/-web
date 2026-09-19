-- 065 rollback（破壊的ポリシー/列戻し）
-- POLICY: 本番では原則実行しない。既定の復旧はアプリ戻し + RLS 残置。
--
-- ************************************************************************
-- WARN: This RE-EXPOSES graduate (既卒) student data to regular admins.
-- profiles / study_logs / chat / feedback / achievements / coaching_bookings
-- become visible again via is_admin(). Class schedule CRUD returns to any admin.
-- 既卒 tag assign/rename protection is removed.
-- ************************************************************************
--
-- Precheck: supabase/rollbacks/065_admin_graduate_scope_rls_precheck.sql
-- Rollout:  docs/admin-super-privilege-rollout.md
-- Order: run this BEFORE 064 rollback if both must be undone.

-- ---------------------------------------------------------------------------
-- Announcements: restore pre-065 select/write; drop audience_scope
-- ---------------------------------------------------------------------------
drop trigger if exists announcements_sync_audience_scope on public.announcements;
drop function if exists public.sync_announcement_audience_scope();
drop function if exists public.admin_can_manage_announcement(uuid);
drop function if exists public.announcement_includes_kisotsu(uuid);

drop policy if exists "announcements_select" on public.announcements;
drop policy if exists "announcements_select_student" on public.announcements;
drop policy if exists "announcements_select_admin" on public.announcements;
drop policy if exists "announcements_select_all" on public.announcements;

create policy "announcements_select_student"
  on public.announcements for select to authenticated
  using (
    public.is_admin()
    or target_all
    or exists (
      select 1 from public.announcement_target_students ats
      where ats.announcement_id = id and ats.student_id = auth.uid()
    )
    or exists (
      select 1 from public.announcement_target_tags att
      inner join public.profile_student_tags pst on pst.tag_id = att.tag_id
      where att.announcement_id = id and pst.profile_id = auth.uid()
    )
  );

drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin"
  on public.announcements for insert to authenticated
  with check (public.is_admin());

drop policy if exists "announcements_update_admin" on public.announcements;
create policy "announcements_update_admin"
  on public.announcements for update to authenticated
  using (public.is_admin());

drop policy if exists "announcements_delete_admin" on public.announcements;
create policy "announcements_delete_admin"
  on public.announcements for delete to authenticated
  using (public.is_admin());

alter table public.announcements
  drop constraint if exists announcements_audience_scope_check;

alter table public.announcements
  drop column if exists audience_scope;

-- ---------------------------------------------------------------------------
-- Student-scoped tables: restore is_admin() access (RE-EXPOSES 既卒)
-- ---------------------------------------------------------------------------
drop policy if exists "study_logs_select_admin" on public.study_logs;
create policy "study_logs_select_admin"
  on public.study_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "chat_messages_select_admin" on public.chat_messages;
create policy "chat_messages_select_admin"
  on public.chat_messages for select to authenticated
  using (public.is_admin());

drop policy if exists "chat_messages_insert_admin" on public.chat_messages;
create policy "chat_messages_insert_admin"
  on public.chat_messages for insert to authenticated
  with check (
    public.is_admin()
    and sender_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = student_id and p.role = 'student'
    )
  );

drop policy if exists "study_day_feedback_select" on public.study_day_feedback;
create policy "study_day_feedback_select"
  on public.study_day_feedback for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "study_day_feedback_insert_admin" on public.study_day_feedback;
create policy "study_day_feedback_insert_admin"
  on public.study_day_feedback for insert to authenticated
  with check (public.is_admin());

drop policy if exists "study_day_feedback_update_admin" on public.study_day_feedback;
create policy "study_day_feedback_update_admin"
  on public.study_day_feedback for update to authenticated
  using (public.is_admin());

drop policy if exists "student_achievements_select_admin" on public.student_achievements;
create policy "student_achievements_select_admin"
  on public.student_achievements for select
  to authenticated
  using (public.is_admin());

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coaching_bookings'
      and policyname = 'coaching_bookings_select'
  ) or to_regclass('public.coaching_bookings') is not null then
    execute $p$
      drop policy if exists "coaching_bookings_select" on public.coaching_bookings;
      create policy "coaching_bookings_select"
        on public.coaching_bookings for select to authenticated
        using (student_id = auth.uid() or public.is_admin());
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 既卒 tag mutation protection: remove
-- ---------------------------------------------------------------------------
drop trigger if exists student_tags_protect_kisotsu on public.student_tags;
drop trigger if exists profile_student_tags_protect_kisotsu on public.profile_student_tags;
drop function if exists public.protect_kisotsu_tag_mutations();

-- ---------------------------------------------------------------------------
-- Class schedule: any admin again (RE-EXPOSES schedule admin to regular admins)
-- ---------------------------------------------------------------------------
drop policy if exists "class_schedule_days_select" on public.class_schedule_days;
create policy "class_schedule_days_select"
  on public.class_schedule_days for select
  to authenticated
  using (public.is_admin() or public.is_kisotsu_profile());

drop policy if exists "class_schedule_days_insert_admin" on public.class_schedule_days;
create policy "class_schedule_days_insert_admin"
  on public.class_schedule_days for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "class_schedule_days_update_admin" on public.class_schedule_days;
create policy "class_schedule_days_update_admin"
  on public.class_schedule_days for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "class_schedule_days_delete_admin" on public.class_schedule_days;
create policy "class_schedule_days_delete_admin"
  on public.class_schedule_days for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "class_schedule_sessions_select" on public.class_schedule_sessions;
create policy "class_schedule_sessions_select"
  on public.class_schedule_sessions for select
  to authenticated
  using (public.is_admin() or public.is_kisotsu_profile());

drop policy if exists "class_schedule_sessions_insert_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_insert_admin"
  on public.class_schedule_sessions for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "class_schedule_sessions_update_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_update_admin"
  on public.class_schedule_sessions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "class_schedule_sessions_delete_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_delete_admin"
  on public.class_schedule_sessions for delete
  to authenticated
  using (public.is_admin());

-- Restore RPC actor gate to admin (pre-065 / 057), not super admin
create or replace function public.bump_class_schedule_notify_revision(
  p_day_id uuid,
  p_updated_by uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: service_role only'
      using errcode = '42501';
  end if;

  if p_day_id is null or p_updated_by is null then
    raise exception 'day id and updated_by are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_updated_by
      and p.role = 'admin'
  ) then
    raise exception 'permission denied: admin actor required'
      using errcode = '42501';
  end if;

  update public.class_schedule_days
  set
    notify_revision = notify_revision + 1,
    updated_by = p_updated_by,
    updated_at = now()
  where id = p_day_id
  returning notify_revision into v_revision;

  if v_revision is null then
    raise exception 'class_schedule_day not found'
      using errcode = 'P0002';
  end if;

  return v_revision;
end;
$$;

create or replace function public.create_class_schedule_day_with_sessions(
  p_schedule_date date,
  p_venue_name text,
  p_location_details text,
  p_sessions jsonb,
  p_actor_id uuid
)
returns table (day_id uuid, notify_revision integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_id uuid;
  v_revision integer;
  v_session jsonb;
  v_start time;
  v_end time;
  v_subject text;
  v_note text;
  v_count integer;
  v_venue text;
  v_location text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: service_role only'
      using errcode = '42501';
  end if;

  if p_actor_id is null then
    raise exception 'actor id is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.role = 'admin'
  ) then
    raise exception 'permission denied: admin actor required'
      using errcode = '42501';
  end if;

  v_venue := trim(coalesce(p_venue_name, ''));
  if char_length(v_venue) = 0 or char_length(v_venue) > 200 then
    raise exception 'invalid venue_name'
      using errcode = '22023';
  end if;

  v_location := nullif(trim(both E'\n\r\t ' from coalesce(p_location_details, '')), '');
  if v_location is not null and char_length(v_location) > 2000 then
    raise exception 'invalid location_details'
      using errcode = '22023';
  end if;

  if p_sessions is null or jsonb_typeof(p_sessions) is distinct from 'array' then
    raise exception 'sessions must be a non-empty json array'
      using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_sessions);
  if v_count is null or v_count < 1 then
    raise exception 'at least one session is required'
      using errcode = '22023';
  end if;
  if v_count > 24 then
    raise exception 'too many sessions'
      using errcode = '22023';
  end if;

  insert into public.class_schedule_days as csd (
    schedule_date,
    venue_name,
    location_details,
    address,
    map_url,
    room_note,
    status,
    notify_revision,
    created_by,
    updated_by
  )
  values (
    p_schedule_date,
    v_venue,
    v_location,
    null,
    null,
    null,
    'scheduled',
    1,
    p_actor_id,
    p_actor_id
  )
  returning csd.id, csd.notify_revision
  into v_day_id, v_revision;

  perform 1
  from public.class_schedule_days d
  where d.id = v_day_id
  for update;

  for v_session in
    select je.value
    from jsonb_array_elements(p_sessions) as je(value)
  loop
    begin
      v_start := (v_session->>'start_time')::time;
      v_end := (v_session->>'end_time')::time;
    exception
      when others then
        raise exception 'invalid session time'
          using errcode = '22023';
    end;

    v_subject := trim(coalesce(v_session->>'subject', ''));
    if char_length(v_subject) = 0 or char_length(v_subject) > 100 then
      raise exception 'session subject is required'
        using errcode = '22023';
    end if;
    if v_subject ~ '[[:cntrl:]]' then
      raise exception 'session subject is required'
        using errcode = '22023';
    end if;

    if v_end <= v_start then
      raise exception 'session end_time must be after start_time'
        using errcode = '22023';
    end if;

    v_note := nullif(trim(coalesce(v_session->>'note', '')), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'invalid session note'
        using errcode = '22023';
    end if;

    insert into public.class_schedule_sessions as css (
      day_id, start_time, end_time, subject, note, status
    ) values (
      v_day_id, v_start, v_end, v_subject, v_note, 'scheduled'
    );
  end loop;

  day_id := v_day_id;
  notify_revision := v_revision;
  return next;
end;
$$;

revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from public;
revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from anon;
revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from authenticated;
grant execute on function public.bump_class_schedule_notify_revision(uuid, uuid) to service_role;

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) to service_role;
