-- List scalability helpers: catalog search, study subject aggregates, latest chat messages

CREATE OR REPLACE FUNCTION public.search_textbook_catalog(
  p_query text DEFAULT NULL,
  p_publisher text DEFAULT NULL,
  p_university text DEFAULT NULL,
  p_purpose text DEFAULT NULL,
  p_detail_tags text[] DEFAULT NULL,
  p_public_only boolean DEFAULT true,
  p_searchable_only boolean DEFAULT true,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  subjects text[],
  usage_tags text[],
  detail_tags text[],
  cover_url text,
  publisher text,
  target_universities text[],
  study_purposes text[],
  visibility text,
  is_searchable boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH filtered AS (
    SELECT c.*
    FROM public.textbook_catalog c
    WHERE (NOT p_public_only OR c.visibility = 'public')
      AND (NOT p_searchable_only OR c.is_searchable = true)
      AND (
        p_publisher IS NULL
        OR btrim(p_publisher) = ''
        OR c.publisher = p_publisher
      )
      AND (
        p_university IS NULL
        OR btrim(p_university) = ''
        OR p_university = ANY (c.target_universities)
      )
      AND (
        p_purpose IS NULL
        OR btrim(p_purpose) = ''
        OR p_purpose = ANY (c.study_purposes)
      )
      AND (
        p_detail_tags IS NULL
        OR cardinality(p_detail_tags) = 0
        OR c.detail_tags && p_detail_tags
        OR c.subjects && p_detail_tags
      )
      AND (
        p_query IS NULL
        OR btrim(p_query) = ''
        OR c.name ILIKE '%' || btrim(p_query) || '%'
        OR coalesce(c.publisher, '') ILIKE '%' || btrim(p_query) || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(c.subjects) AS s(value)
          WHERE s.value ILIKE '%' || btrim(p_query) || '%'
        )
        OR EXISTS (
          SELECT 1 FROM unnest(c.detail_tags) AS s(value)
          WHERE s.value ILIKE '%' || btrim(p_query) || '%'
        )
        OR EXISTS (
          SELECT 1 FROM unnest(c.study_purposes) AS s(value)
          WHERE s.value ILIKE '%' || btrim(p_query) || '%'
        )
        OR EXISTS (
          SELECT 1 FROM unnest(c.target_universities) AS s(value)
          WHERE s.value ILIKE '%' || btrim(p_query) || '%'
        )
      )
  )
  SELECT
    f.id,
    f.name,
    f.subjects,
    f.usage_tags,
    f.detail_tags,
    f.cover_url,
    f.publisher,
    f.target_universities,
    f.study_purposes,
    f.visibility,
    f.is_searchable,
    f.created_by,
    f.created_at,
    f.updated_at,
    (SELECT count(*) FROM filtered)::bigint AS total_count
  FROM filtered f
  ORDER BY f.name ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.search_textbook_catalog(
  text, text, text, text, text[], boolean, boolean, int, int
) TO authenticated;

CREATE OR REPLACE FUNCTION public.study_logs_subject_minutes(
  p_student_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (subject text, minutes bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    sl.subject,
    SUM(sl.duration_minutes)::bigint AS minutes
  FROM public.study_logs sl
  WHERE sl.student_id = p_student_id
    AND (p_from IS NULL OR sl.studied_on >= p_from)
    AND (p_to IS NULL OR sl.studied_on <= p_to)
  GROUP BY sl.subject;
$$;

GRANT EXECUTE ON FUNCTION public.study_logs_subject_minutes(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.latest_chat_messages_for_students(
  p_student_ids uuid[]
)
RETURNS SETOF public.chat_messages
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT ON (cm.student_id) cm.*
  FROM public.chat_messages cm
  WHERE cm.student_id = ANY (p_student_ids)
  ORDER BY cm.student_id, cm.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.latest_chat_messages_for_students(uuid[]) TO authenticated;

CREATE INDEX IF NOT EXISTS textbooks_student_name_idx
  ON public.textbooks (student_id, name);

CREATE INDEX IF NOT EXISTS study_logs_student_subject_idx
  ON public.study_logs (student_id, subject);

CREATE INDEX IF NOT EXISTS announcements_created_at_desc_idx
  ON public.announcements (created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_role_full_name_idx
  ON public.profiles (role, full_name);
