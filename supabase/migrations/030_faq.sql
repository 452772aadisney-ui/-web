-- よくある質問（FAQ）
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.faq_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

comment on table public.faq_categories is 'FAQカテゴリ';

create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.faq_categories (id) on delete cascade,
  question text not null,
  answer text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.faq_items is 'FAQの質問と回答';

create index if not exists faq_categories_sort_order_idx
  on public.faq_categories (sort_order, name);

create index if not exists faq_items_category_sort_idx
  on public.faq_items (category_id, sort_order);

drop trigger if exists faq_categories_updated_at on public.faq_categories;
create trigger faq_categories_updated_at
  before update on public.faq_categories
  for each row execute function public.handle_updated_at();

drop trigger if exists faq_items_updated_at on public.faq_items;
create trigger faq_items_updated_at
  before update on public.faq_items
  for each row execute function public.handle_updated_at();

alter table public.faq_categories enable row level security;
alter table public.faq_items enable row level security;

drop policy if exists "faq_categories_select_authenticated" on public.faq_categories;
create policy "faq_categories_select_authenticated"
  on public.faq_categories for select to authenticated using (true);

drop policy if exists "faq_categories_insert_admin" on public.faq_categories;
create policy "faq_categories_insert_admin"
  on public.faq_categories for insert to authenticated
  with check (public.is_admin());

drop policy if exists "faq_categories_update_admin" on public.faq_categories;
create policy "faq_categories_update_admin"
  on public.faq_categories for update to authenticated
  using (public.is_admin());

drop policy if exists "faq_categories_delete_admin" on public.faq_categories;
create policy "faq_categories_delete_admin"
  on public.faq_categories for delete to authenticated
  using (public.is_admin());

drop policy if exists "faq_items_select_published_or_admin" on public.faq_items;
create policy "faq_items_select_published_or_admin"
  on public.faq_items for select to authenticated
  using (is_published = true or public.is_admin());

drop policy if exists "faq_items_insert_admin" on public.faq_items;
create policy "faq_items_insert_admin"
  on public.faq_items for insert to authenticated
  with check (public.is_admin());

drop policy if exists "faq_items_update_admin" on public.faq_items;
create policy "faq_items_update_admin"
  on public.faq_items for update to authenticated
  using (public.is_admin());

drop policy if exists "faq_items_delete_admin" on public.faq_items;
create policy "faq_items_delete_admin"
  on public.faq_items for delete to authenticated
  using (public.is_admin());

-- 初期データ
insert into public.faq_categories (name, sort_order) values
  ('はじめての方へ', 1),
  ('学習記録', 2),
  ('参考書・教材', 3),
  ('予定・コーチング', 4),
  ('お知らせ・連絡', 5),
  ('アカウント・ログイン', 6),
  ('既卒の方へ', 7)
on conflict (name) do nothing;

insert into public.faq_items (category_id, question, answer, sort_order)
select c.id, v.question, v.answer, v.sort_order
from public.faq_categories c
join (
  values
    (
      'はじめての方へ',
      1,
      'このアプリで何ができますか？',
      '主な機能は次のとおりです。' || E'\n'
        || '・毎日の学習時間・内容を記録する' || E'\n'
        || '・参考書（教材）を登録して管理する' || E'\n'
        || '・模試・小テスト・宿題などの予定をカレンダーで確認する' || E'\n'
        || '・コーチングを予約する' || E'\n'
        || '・塾からのお知らせ・メッセージを受け取る' || E'\n'
        || '・ToDoを管理する'
    ),
    (
      'はじめての方へ',
      2,
      'まず何から始めればいいですか？',
      '次の順番がおすすめです。' || E'\n'
        || '1. プロフィール編集で使用科目を設定する' || E'\n'
        || '2. 教材登録で参考書を登録する' || E'\n'
        || '3. マイページの「学習を記録する」で記録を始める' || E'\n'
        || '4. カレンダーとお知らせをこまめに確認する'
    ),
    (
      'はじめての方へ',
      3,
      '各機能はどこから開けますか？',
      '画面右上のメニュー（三本線）から主要機能に移動できます。' || E'\n'
        || 'マイページのボタンからも、学習記録・本棚・カレンダーなどにアクセスできます。'
    ),
    (
      '学習記録',
      1,
      '学習記録はどうやってつけますか？',
      'マイページの「学習を記録する」から、学習日・科目・教材・学習時間（分）を入力して保存します。' || E'\n'
        || '科目は英語・数学・現代文など、本棚と同じ区分で選びます。'
    ),
    (
      '学習記録',
      2,
      '学習記録ができません',
      'プロフィールの使用科目が未設定だと、学習記録も教材登録もできません。' || E'\n'
        || 'プロフィール編集で科目を選んでから、もう一度お試しください。'
    ),
    (
      '学習記録',
      3,
      '記録を間違えました。直せますか？',
      '「学習履歴」から該当の記録を開き、編集または削除できます。'
    ),
    (
      '学習記録',
      4,
      '学習履歴のバッジは何ですか？',
      '先生からフィードバックが届いている日がある場合、学習履歴メニューに未読バッジが表示されます。'
    ),
    (
      '参考書・教材',
      1,
      '本棚と教材登録の違いは？',
      '「本棚」は登録済みの参考書一覧の確認・編集用です。' || E'\n'
        || '「教材登録」は、管理者本棚から選ぶ／新規作成して参考書を追加する画面です。'
    ),
    (
      '参考書・教材',
      2,
      '教材が選べません',
      '学習記録では、先に教材登録で参考書を登録しておく必要があります。' || E'\n'
        || '科目を選んでも教材が出ない場合は、その科目に対応する参考書が未登録です。'
    ),
    (
      '参考書・教材',
      3,
      'リストから選ぶで参考書が出ません',
      '科目を選んだうえで、管理者本棚に公開されている参考書だけが表示されます。' || E'\n'
        || '該当する参考書がない場合は「新規作成」から登録してください。'
    ),
    (
      '予定・コーチング',
      1,
      'カレンダーには何が表示されますか？',
      '塾側が登録した模試・小テスト・宿題・申込タスクなどの予定が表示されます。'
    ),
    (
      '予定・コーチング',
      2,
      'コーチングはどう予約しますか？',
      'マイページ上部の案内、またはメニューの「コーチング」から予約・変更できます。'
    ),
    (
      '予定・コーチング',
      3,
      '「授業予定」とは何ですか？',
      '別サイト（生徒web）の授業スケジュールへのリンクです。' || E'\n'
        || 'タップすると外部リンク確認のポップアップが表示されます。'
    ),
    (
      'お知らせ・連絡',
      1,
      'お知らせとメッセージの違いは？',
      '「お知らせ」は塾からの一斉連絡です。' || E'\n'
        || '「メッセージ」は個別のチャット形式の連絡です。未読があるとバッジが表示されます。'
    ),
    (
      'お知らせ・連絡',
      2,
      '使い方がわからないときは？',
      'このFAQを確認しても解決しない場合は、メッセージ機能で塾に質問してください。'
    ),
    (
      'アカウント・ログイン',
      1,
      'パスワードを忘れました',
      'ログイン画面の「パスワードを忘れた方」から再設定できます。'
    ),
    (
      'アカウント・ログイン',
      2,
      '生徒ID（QRコード）はどこで見られますか？',
      'マイページ下部に表示されます。出席確認などにご利用ください。' || E'\n'
        || '※ 学年タグが「既卒」の方には表示されません。'
    ),
    (
      '既卒の方へ',
      1,
      '既卒生徒で使えない機能はありますか？',
      '学年タグが「既卒」の場合、「授業予定」ボタンと生徒ID（QRコード）は表示されません。' || E'\n'
        || '学習記録・本棚・お知らせなど、その他の機能は通常どおりご利用いただけます。'
    )
) as v(category_name, sort_order, question, answer)
  on c.name = v.category_name
where not exists (
  select 1
  from public.faq_items existing
  where existing.category_id = c.id
    and existing.question = v.question
);
