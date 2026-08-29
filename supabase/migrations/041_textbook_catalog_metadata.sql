-- 参考書カタログ: 表紙・出版社・大学・使用目的・詳細タグ
ALTER TABLE textbook_catalog
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS target_universities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS study_purposes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detail_tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE textbooks
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS detail_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_textbook_catalog_publisher
  ON textbook_catalog (publisher);

CREATE INDEX IF NOT EXISTS idx_textbook_catalog_detail_tags
  ON textbook_catalog USING GIN (detail_tags);

CREATE INDEX IF NOT EXISTS idx_textbook_catalog_study_purposes
  ON textbook_catalog USING GIN (study_purposes);

CREATE INDEX IF NOT EXISTS idx_textbook_catalog_target_universities
  ON textbook_catalog USING GIN (target_universities);
