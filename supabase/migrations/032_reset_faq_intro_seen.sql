-- 既存生徒にもFAQ案内ポップアップを表示するため、既読をリセット
-- Supabase Dashboard > SQL Editor で実行してください

update public.profiles
set faq_intro_seen_at = null
where role = 'student';
