-- ================================================================
-- 비회원 제보 활성화
-- 기존 created_by(UUID FK) 안 건드림
-- 새 TEXT 컬럼 추가 + RLS 정책
-- ================================================================

-- 1. 새 컬럼 추가 (기존 구조 안 건드림)
--    submitted_by: 회원이면 'auth:uuid', 비회원이면 'anon:닉네임'
--    submitted_nickname: 표시용 닉네임
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS submitted_nickname TEXT;

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS submitted_nickname TEXT;

-- 2. RLS 정책 — 비회원(anon)이 제보 가능하게
-- 먼저 기존에 같은 이름 정책 있으면 드롭
DROP POLICY IF EXISTS "anon_can_submit_restaurant" ON restaurants;
DROP POLICY IF EXISTS "anon_can_add_menu_item" ON menu_items;
DROP POLICY IF EXISTS "anon_can_create_brand" ON brands;

-- SELECT: 누구나 읽기 가능 (기존 유지 확인)
-- 이미 있으면 스킵됨
DO $$ BEGIN
  CREATE POLICY "restaurants_select_public" ON restaurants FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "menu_items_select_public" ON menu_items FOR SELECT USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- INSERT: anon이 pending_review로만 INSERT 가능
CREATE POLICY "anon_can_submit_restaurant" ON restaurants
  FOR INSERT WITH CHECK (status = 'pending_review');

-- INSERT: anon이 user_added source로만 INSERT 가능
CREATE POLICY "anon_can_add_menu_item" ON menu_items
  FOR INSERT WITH CHECK (source = 'user_added');

-- INSERT: anon이 새 brand 생성 가능 (제보 시 새 식당)
CREATE POLICY "anon_can_create_brand" ON brands
  FOR INSERT WITH CHECK (TRUE);

-- 3. 검증
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'restaurants'
  AND column_name IN ('created_by', 'submitted_by', 'submitted_nickname')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'menu_items'
  AND column_name IN ('added_by', 'submitted_by', 'submitted_nickname')
ORDER BY column_name;
