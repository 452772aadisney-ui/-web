-- 056 smoke（読み取り中心）
--
-- SQL Editor では JWT が service_role ではないため、auth.role()='service_role'
-- ゲート付き RPC を成功実行できません。認証を偽装しない方針のため、
-- 成功パスの INSERT スモークは Admin Client（アプリ）側で確認してください。
--
-- このスクリプトが確認すること:
-- 1) 関数定義に qualified RETURNING が入っている
-- 2) SQL Editor ロールから呼ぶと 42501（service_role only）になる
-- 3) 呼んでも行が残らない（失敗のため INSERT 未到達、または ROLLBACK）

begin;

do $$
declare
  v_def text;
  v_caught boolean := false;
  v_sqlstate text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_class_schedule_day_with_sessions'
    and oidvectortypes(p.proargtypes) = 'date, text, text, text, text, jsonb, uuid';

  if v_def is null then
    raise exception '056 smoke FAIL: 7-arg create RPC missing';
  end if;

  if v_def !~* 'returning[[:space:]]+csd\.id[[:space:]]*,[[:space:]]*csd\.notify_revision' then
    raise exception '056 smoke FAIL: qualified RETURNING csd.id, csd.notify_revision missing';
  end if;

  if v_def ~* 'returning[[:space:]]+id[[:space:]]*,[[:space:]]*notify_revision' then
    raise exception '056 smoke FAIL: bare returning id, notify_revision still present';
  end if;

  begin
    -- Intentionally invalid actor; should fail on auth.role() before writes when
    -- SQL Editor is not service_role. Do not substitute a real admin UUID.
    perform *
    from public.create_class_schedule_day_with_sessions(
      date '2099-01-01',
      'smoke-venue',
      null,
      null,
      null,
      '[{"start_time":"10:00","end_time":"11:00","subject":"英語","note":null}]'::jsonb,
      '00000000-0000-4000-8000-000000000099'::uuid
    );
  exception
    when others then
      v_sqlstate := sqlstate;
      if sqlstate = '42501' then
        v_caught := true;
      else
        raise exception '056 smoke FAIL: expected 42501 from non-service_role, got % (%)',
          sqlstate, sqlerrm;
      end if;
  end;

  if not v_caught then
    raise exception '056 smoke FAIL: RPC unexpectedly succeeded without service_role';
  end if;

  raise notice '056 smoke PASS: qualified RETURNING present; non-service_role denied (42501)';
end;
$$;

-- Ensure no leftover smoke date even if a future change bypassed the gate.
delete from public.class_schedule_days
where schedule_date = date '2099-01-01'
  and venue_name = 'smoke-venue';

rollback;

-- Why a successful create+ROLLBACK is not included here:
-- SQL Editor cannot set auth.role() to service_role without forging JWT claims.
-- Forging/switching to service_role in-repo scripts is intentionally avoided.
-- After 056 + verify PASS, re-test create from /admin/class-schedule/new (legacy = no notify).
