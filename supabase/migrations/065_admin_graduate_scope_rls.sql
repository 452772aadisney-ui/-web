-- 065: Announcement audience_scope + graduate-scoped RLS + kisotsu/class-schedule gates
-- Apply after 064.
--
-- precheck: supabase/queries/065_admin_graduate_scope_rls_precheck.sql
-- verify:   supabase/queries/065_admin_graduate_scope_rls_verify.sql
-- rollback: supabase/rollbacks/065_admin_graduate_scope_rls_rollback.sql
--           (precheck: supabase/rollbacks/065_admin_graduate_scope_rls_precheck.sql)
--           WARN: re-exposes graduate data to regular admins.
-- rollout:  docs/admin-super-privilege-rollout.md
--
-- Does NOT rewrite historical audience meaning beyond mapping:
--   target_all=true  → audience_scope='all'
--   otherwise        → audience_scope='targeted'
-- New regular-admin "全員" uses audience_scope='enrolled' (written by app).

-- ---------------------------------------------------------------------------
-- announcements.audience_scope
-- ---------------------------------------------------------------------------
alter table public.announcements
  add column if not exists audience_scope text;

update public.announcements
set audience_scope = case when target_all then 'all' else 'targeted' end
where audience_scope is null;

alter table public.announcements
  alter column audience_scope set default 'targeted';

alter table public.announcements
  alter column audience_scope set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_audience_scope_check'
  ) then
    alter table public.announcements
      add constraint announcements_audience_scope_check
      check (audience_scope in ('all', 'enrolled', 'targeted'));
  end if;
end $$;

comment on column public.announcements.audience_scope is
  'all=全員(既卒含む); enrolled=在学生のみ; targeted=タグ/個別. Legacy target_all kept in sync.';

create or replace function public.sync_announcement_audience_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prefer explicit audience_scope from new app; sync target_all for legacy readers.
  if tg_op = 'INSERT' then
    if new.audience_scope is null then
      new.audience_scope := case when new.target_all then 'all' else 'targeted' end;
    end if;
  elsif tg_op = 'UPDATE' then
    -- If only target_all changed (old app), refresh scope from target_all when scope unchanged
    if new.target_all is distinct from old.target_all
       and new.audience_scope is not distinct from old.audience_scope then
      new.audience_scope := case when new.target_all then 'all' else 'targeted' end;
    end if;
  end if;

  new.target_all := (new.audience_scope = 'all');
  return new;
end;
$$;

drop trigger if exists announcements_sync_audience_scope on public.announcements;
create trigger announcements_sync_audience_scope
  before insert or update on public.announcements
  for each row
  execute function public.sync_announcement_audience_scope();

revoke all on function public.sync_announcement_audience_scope() from public;
revoke all on function public.sync_announcement_audience_scope() from anon, authenticated;

-- True if announcement targets 既卒 tag or any 既卒 student id
create or replace function public.announcement_includes_kisotsu(p_announcement_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.announcement_target_tags att
      join public.student_tags st on st.id = att.tag_id
      where att.announcement_id = p_announcement_id
        and st.category = '学年'
        and st.name = '既卒'
    )
    or exists (
      select 1
      from public.announcement_target_students ats
      where ats.announcement_id = p_announcement_id
        and public.is_kisotsu_student(ats.student_id)
    );
$$;

revoke all on function public.announcement_includes_kisotsu(uuid) from public;
revoke all on function public.announcement_includes_kisotsu(uuid) from anon, authenticated;
grant execute on function public.announcement_includes_kisotsu(uuid) to authenticated;

create or replace function public.admin_can_manage_announcement(p_announcement_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_super_admin()
    or (
      public.is_admin()
      and exists (
        select 1 from public.announcements a
        where a.id = p_announcement_id
          and a.audience_scope = 'enrolled'
      )
    )
    or (
      public.is_admin()
      and exists (
        select 1 from public.announcements a
        where a.id = p_announcement_id
          and a.audience_scope = 'targeted'
          and not public.announcement_includes_kisotsu(a.id)
      )
    );
$$;

revoke all on function public.admin_can_manage_announcement(uuid) from public;
revoke all on function public.admin_can_manage_announcement(uuid) from anon, authenticated;
grant execute on function public.admin_can_manage_announcement(uuid) to authenticated;

-- Replace announcement SELECT policies
drop policy if exists "announcements_select_student" on public.announcements;
drop policy if exists "announcements_select" on public.announcements;
drop policy if exists "announcements_select_admin" on public.announcements;

create policy "announcements_select"
  on public.announcements for select to authenticated
  using (
    public.admin_can_manage_announcement(id)
    or public.is_super_admin()
    or (
      -- student visibility (unchanged for 'all' / targeted; enrolled excludes 既卒)
      (
        audience_scope = 'all'
        or target_all
        or (
          audience_scope = 'enrolled'
          and not public.is_kisotsu_profile()
        )
        or exists (
          select 1 from public.announcement_target_students ats
          where ats.announcement_id = id and ats.student_id = auth.uid()
        )
        or exists (
          select 1
          from public.announcement_target_tags att
          join public.profile_student_tags pst
            on pst.tag_id = att.tag_id and pst.profile_id = auth.uid()
          where att.announcement_id = id
        )
      )
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'student'
      )
    )
  );

-- Admin write policies: only manageable announcements for regular admins
drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin"
  on public.announcements for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.is_admin()
      and audience_scope in ('enrolled', 'targeted')
    )
  );

drop policy if exists "announcements_update_admin" on public.announcements;
create policy "announcements_update_admin"
  on public.announcements for update to authenticated
  using (public.admin_can_manage_announcement(id))
  with check (public.admin_can_manage_announcement(id));

drop policy if exists "announcements_delete_admin" on public.announcements;
create policy "announcements_delete_admin"
  on public.announcements for delete to authenticated
  using (public.admin_can_manage_announcement(id));

-- ---------------------------------------------------------------------------
-- Student-scoped tables: admin access via admin_can_access_student
-- ---------------------------------------------------------------------------
drop policy if exists "study_logs_select_admin" on public.study_logs;
create policy "study_logs_select_admin"
  on public.study_logs for select to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "chat_messages_select_admin" on public.chat_messages;
create policy "chat_messages_select_admin"
  on public.chat_messages for select to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "chat_messages_insert_admin" on public.chat_messages;
create policy "chat_messages_insert_admin"
  on public.chat_messages for insert to authenticated
  with check (public.is_admin() and public.admin_can_access_student(student_id));

drop policy if exists "study_day_feedback_select" on public.study_day_feedback;
create policy "study_day_feedback_select"
  on public.study_day_feedback for select to authenticated
  using (student_id = auth.uid() or public.admin_can_access_student(student_id));

drop policy if exists "study_day_feedback_insert_admin" on public.study_day_feedback;
create policy "study_day_feedback_insert_admin"
  on public.study_day_feedback for insert to authenticated
  with check (public.admin_can_access_student(student_id));

drop policy if exists "study_day_feedback_update_admin" on public.study_day_feedback;
create policy "study_day_feedback_update_admin"
  on public.study_day_feedback for update to authenticated
  using (public.admin_can_access_student(student_id))
  with check (public.admin_can_access_student(student_id));

drop policy if exists "student_achievements_select_admin" on public.student_achievements;
create policy "student_achievements_select_admin"
  on public.student_achievements for select to authenticated
  using (public.admin_can_access_student(student_id));

-- coaching_bookings: find existing select policies
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coaching_bookings'
      and policyname = 'coaching_bookings_select'
  ) then
    execute $p$
      drop policy if exists "coaching_bookings_select" on public.coaching_bookings;
      create policy "coaching_bookings_select"
        on public.coaching_bookings for select to authenticated
        using (
          student_id = auth.uid()
          or public.admin_can_access_student(student_id)
        );
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 既卒 tag assign/remove: super admin only; protect 学年/既卒 tag rename/delete
-- ---------------------------------------------------------------------------
create or replace function public.protect_kisotsu_tag_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kisotsu_id uuid;
  old_is_kisotsu boolean;
  new_is_kisotsu boolean;
begin
  select id into kisotsu_id
  from public.student_tags
  where category = '学年' and name = '既卒'
  limit 1;

  if tg_table_name = 'student_tags' then
    if tg_op = 'UPDATE' then
      if old.category = '学年' and old.name = '既卒' and not public.is_super_admin() then
        raise exception '既卒 tag can only be modified by a super admin';
      end if;
      if (new.category = '学年' and new.name = '既卒') and not public.is_super_admin()
         and (old.category, old.name) is distinct from (new.category, new.name) then
        raise exception '既卒 tag can only be created/renamed by a super admin';
      end if;
    elsif tg_op = 'DELETE' then
      if old.category = '学年' and old.name = '既卒' and not public.is_super_admin() then
        raise exception '既卒 tag can only be deleted by a super admin';
      end if;
    elsif tg_op = 'INSERT' then
      if new.category = '学年' and new.name = '既卒' and not public.is_super_admin() then
        raise exception '既卒 tag can only be created by a super admin';
      end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- profile_student_tags
  old_is_kisotsu := (kisotsu_id is not null and old.tag_id = kisotsu_id);
  new_is_kisotsu := (kisotsu_id is not null and new.tag_id = kisotsu_id);

  -- INSERT: super admin, or system/signup path (auth.uid() is null; e.g. handle_new_user).
  -- Authenticated non-super (including regular admin) cannot assign 既卒.
  if tg_op = 'INSERT' and new_is_kisotsu
     and not public.is_super_admin()
     and auth.uid() is not null then
    raise exception '既卒 tag can only be assigned by a super admin';
  end if;
  if tg_op = 'DELETE' and old_is_kisotsu and not public.is_super_admin() then
    raise exception '既卒 tag can only be removed by a super admin';
  end if;
  if tg_op = 'UPDATE' and (old_is_kisotsu or new_is_kisotsu) and not public.is_super_admin() then
    raise exception '既卒 tag assignment can only be changed by a super admin';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists student_tags_protect_kisotsu on public.student_tags;
create trigger student_tags_protect_kisotsu
  before insert or update or delete on public.student_tags
  for each row execute function public.protect_kisotsu_tag_mutations();

drop trigger if exists profile_student_tags_protect_kisotsu on public.profile_student_tags;
create trigger profile_student_tags_protect_kisotsu
  before insert or update or delete on public.profile_student_tags
  for each row execute function public.protect_kisotsu_tag_mutations();

revoke all on function public.protect_kisotsu_tag_mutations() from public;
revoke all on function public.protect_kisotsu_tag_mutations() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Class schedule admin CRUD: super admin only (students keep is_kisotsu_profile read)
-- ---------------------------------------------------------------------------
drop policy if exists "class_schedule_days_select" on public.class_schedule_days;
create policy "class_schedule_days_select"
  on public.class_schedule_days for select to authenticated
  using (public.is_super_admin() or public.is_kisotsu_profile());

drop policy if exists "class_schedule_days_insert_admin" on public.class_schedule_days;
create policy "class_schedule_days_insert_admin"
  on public.class_schedule_days for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "class_schedule_days_update_admin" on public.class_schedule_days;
create policy "class_schedule_days_update_admin"
  on public.class_schedule_days for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "class_schedule_days_delete_admin" on public.class_schedule_days;
create policy "class_schedule_days_delete_admin"
  on public.class_schedule_days for delete to authenticated
  using (public.is_super_admin());

drop policy if exists "class_schedule_sessions_select" on public.class_schedule_sessions;
create policy "class_schedule_sessions_select"
  on public.class_schedule_sessions for select to authenticated
  using (public.is_super_admin() or public.is_kisotsu_profile());

drop policy if exists "class_schedule_sessions_insert_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_insert_admin"
  on public.class_schedule_sessions for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "class_schedule_sessions_update_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_update_admin"
  on public.class_schedule_sessions for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "class_schedule_sessions_delete_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_delete_admin"
  on public.class_schedule_sessions for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Class schedule RPCs: require super-admin actor (service_role + p_actor_id)
-- ---------------------------------------------------------------------------
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
      and p.is_super_admin = true
  ) then
    raise exception 'permission denied: super admin actor required'
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
      and p.is_super_admin = true
  ) then
    raise exception 'permission denied: super admin actor required'
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

-- ---------------------------------------------------------------------------
-- Additional student-scoped write/select policies (admin_can_access_student)
-- ---------------------------------------------------------------------------
drop policy if exists "textbooks_select_admin" on public.textbooks;
create policy "textbooks_select_admin"
  on public.textbooks for select to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "textbooks_insert_admin" on public.textbooks;
create policy "textbooks_insert_admin"
  on public.textbooks for insert to authenticated
  with check (public.admin_can_access_student(student_id));

drop policy if exists "textbooks_update_admin" on public.textbooks;
create policy "textbooks_update_admin"
  on public.textbooks for update to authenticated
  using (public.admin_can_access_student(student_id))
  with check (public.admin_can_access_student(student_id));

drop policy if exists "textbooks_delete_admin" on public.textbooks;
create policy "textbooks_delete_admin"
  on public.textbooks for delete to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "coaching_karte_admin_all" on public.coaching_karte_entries;
create policy "coaching_karte_admin_all"
  on public.coaching_karte_entries for all to authenticated
  using (public.admin_can_access_student(student_id))
  with check (public.admin_can_access_student(student_id));

drop policy if exists "coaching_bookings_insert_own" on public.coaching_bookings;
create policy "coaching_bookings_insert_own"
  on public.coaching_bookings for insert to authenticated
  with check (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
  );

drop policy if exists "coaching_bookings_update" on public.coaching_bookings;
create policy "coaching_bookings_update"
  on public.coaching_bookings for update to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
  )
  with check (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
  );

drop policy if exists "coaching_bookings_delete_admin" on public.coaching_bookings;
create policy "coaching_bookings_delete_admin"
  on public.coaching_bookings for delete to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "quiz_results_select_own_or_admin" on public.quiz_results;
create policy "quiz_results_select_own_or_admin"
  on public.quiz_results for select to authenticated
  using (student_id = auth.uid() or public.admin_can_access_student(student_id));

drop policy if exists "quiz_results_insert_admin" on public.quiz_results;
create policy "quiz_results_insert_admin"
  on public.quiz_results for insert to authenticated
  with check (public.admin_can_access_student(student_id));

drop policy if exists "quiz_results_update_admin" on public.quiz_results;
create policy "quiz_results_update_admin"
  on public.quiz_results for update to authenticated
  using (public.admin_can_access_student(student_id))
  with check (public.admin_can_access_student(student_id));

drop policy if exists "quiz_results_delete_admin" on public.quiz_results;
create policy "quiz_results_delete_admin"
  on public.quiz_results for delete to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "quiz_assignment_students_insert_admin" on public.quiz_assignment_students;
create policy "quiz_assignment_students_insert_admin"
  on public.quiz_assignment_students for insert to authenticated
  with check (public.admin_can_access_student(student_id));

drop policy if exists "quiz_assignment_students_delete_admin" on public.quiz_assignment_students;
create policy "quiz_assignment_students_delete_admin"
  on public.quiz_assignment_students for delete to authenticated
  using (public.admin_can_access_student(student_id));

drop policy if exists "quiz_assignment_students_select_authenticated" on public.quiz_assignment_students;
create policy "quiz_assignment_students_select_authenticated"
  on public.quiz_assignment_students for select to authenticated
  using (
    student_id = auth.uid()
    or public.admin_can_access_student(student_id)
  );

-- Regular admins: only tag rows for accessible students (hide 既卒 profile ids).
-- Super admins: all rows (needed to resolve enrolled audience exclusions).
drop policy if exists "profile_student_tags_select" on public.profile_student_tags;
create policy "profile_student_tags_select"
  on public.profile_student_tags for select to authenticated
  using (
    profile_id = auth.uid()
    or public.admin_can_access_student(profile_id)
    or public.is_super_admin()
  );

drop policy if exists "profile_student_tags_insert_admin" on public.profile_student_tags;
create policy "profile_student_tags_insert_admin"
  on public.profile_student_tags for insert to authenticated
  with check (public.admin_can_access_student(profile_id) or public.is_super_admin());

drop policy if exists "profile_student_tags_delete_admin" on public.profile_student_tags;
create policy "profile_student_tags_delete_admin"
  on public.profile_student_tags for delete to authenticated
  using (public.admin_can_access_student(profile_id) or public.is_super_admin());

drop policy if exists "study_day_feedback_delete_admin" on public.study_day_feedback;
create policy "study_day_feedback_delete_admin"
  on public.study_day_feedback for delete to authenticated
  using (public.admin_can_access_student(student_id));

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'student_page_visits'
  ) then
    execute $p$
      drop policy if exists "student_page_visits_select_admin" on public.student_page_visits;
      create policy "student_page_visits_select_admin"
        on public.student_page_visits for select to authenticated
        using (public.admin_can_access_student(student_id));
    $p$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'application_tasks'
  ) then
    execute $p$
      drop policy if exists "application_tasks_select" on public.application_tasks;
      create policy "application_tasks_select"
        on public.application_tasks for select to authenticated
        using (student_id = auth.uid() or public.admin_can_access_student(student_id));
      drop policy if exists "application_tasks_insert_admin" on public.application_tasks;
      create policy "application_tasks_insert_admin"
        on public.application_tasks for insert to authenticated
        with check (public.admin_can_access_student(student_id));
      drop policy if exists "application_tasks_update_admin" on public.application_tasks;
      create policy "application_tasks_update_admin"
        on public.application_tasks for update to authenticated
        using (public.admin_can_access_student(student_id))
        with check (public.admin_can_access_student(student_id));
      drop policy if exists "application_tasks_delete_admin" on public.application_tasks;
      create policy "application_tasks_delete_admin"
        on public.application_tasks for delete to authenticated
        using (public.admin_can_access_student(student_id));
    $p$;
  end if;
end $$;
