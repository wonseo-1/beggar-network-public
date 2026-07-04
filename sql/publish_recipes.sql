-- ================================================================
-- 레시피 공개(Publish) + 리믹스 — generated_recipes 확장
-- 공개된 레시피만 anon이 읽을 수 있게 (SEO 페이지용)
-- ================================================================

ALTER TABLE generated_recipes ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;
ALTER TABLE generated_recipes ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE generated_recipes ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE generated_recipes ADD COLUMN IF NOT EXISTS author_nickname text;
ALTER TABLE generated_recipes ADD COLUMN IF NOT EXISTS remix_request text;
ALTER TABLE generated_recipes ADD COLUMN IF NOT EXISTS remix_of bigint REFERENCES generated_recipes(id);

-- 공개된 것만 누구나 SELECT 가능 (비공개는 여전히 차단)
DROP POLICY IF EXISTS "public_can_read_published" ON generated_recipes;
CREATE POLICY "public_can_read_published" ON generated_recipes
  FOR SELECT USING (published = true);

CREATE INDEX IF NOT EXISTS idx_genrec_slug ON generated_recipes (slug) WHERE published = true;
