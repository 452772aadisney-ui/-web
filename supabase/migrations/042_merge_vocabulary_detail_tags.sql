-- 英単語・英熟語を「単語・熟語」に統合

CREATE OR REPLACE FUNCTION merge_vocabulary_detail_tags(tags text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT mapped ORDER BY mapped),
    '{}'::text[]
  )
  FROM (
    SELECT CASE
      WHEN tag IN ('英単語', '英熟語') THEN '単語・熟語'
      ELSE tag
    END AS mapped
    FROM unnest(tags) AS tag
  ) AS normalized;
$$;

UPDATE textbook_catalog
SET detail_tags = merge_vocabulary_detail_tags(detail_tags)
WHERE detail_tags && ARRAY['英単語', '英熟語']::text[];

UPDATE textbooks
SET detail_tags = merge_vocabulary_detail_tags(detail_tags)
WHERE detail_tags && ARRAY['英単語', '英熟語']::text[];

DROP FUNCTION merge_vocabulary_detail_tags(text[]);
