-- 浪人タグを削除（既卒タグで代替）

delete from public.profile_student_tags
where tag_id in (
  select id from public.student_tags where category = '学年' and name = '浪人'
);

delete from public.announcement_target_tags
where tag_id in (
  select id from public.student_tags where category = '学年' and name = '浪人'
);

delete from public.student_tags
where category = '学年' and name = '浪人';
