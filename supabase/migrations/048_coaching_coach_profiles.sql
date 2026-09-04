-- コーチング講師プロフィール拡張
ALTER TABLE public.coaching_coaches
  ADD COLUMN IF NOT EXISTS stream text,
  ADD COLUMN IF NOT EXISTS school_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exam_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_internal_recommendation_experience boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strong_subjects text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS feature_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.coaching_coaches.stream IS '文系 / 理系（humanities / sciences）';
COMMENT ON COLUMN public.coaching_coaches.school_types IS '国公立 / 私立 等';
COMMENT ON COLUMN public.coaching_coaches.exam_types IS '一般受験 / 推薦 等';
COMMENT ON COLUMN public.coaching_coaches.has_internal_recommendation_experience IS '内部推薦経験';
COMMENT ON COLUMN public.coaching_coaches.strong_subjects IS '得意科目';
COMMENT ON COLUMN public.coaching_coaches.feature_tags IS 'その他特徴タグ';
COMMENT ON COLUMN public.coaching_coaches.bio IS '紹介文';
