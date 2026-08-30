-- 生徒向け参考書検索に表示するか（管理者本棚の正式登録のみ true）
ALTER TABLE textbook_catalog
  ADD COLUMN IF NOT EXISTS is_searchable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN textbook_catalog.is_searchable IS 'false=生徒の参考書検索に非表示（生徒登録教材由来のマスタ等）';

CREATE INDEX IF NOT EXISTS idx_textbook_catalog_student_search
  ON textbook_catalog (visibility, is_searchable)
  WHERE visibility = 'public' AND is_searchable = true;
