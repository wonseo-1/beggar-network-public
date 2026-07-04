-- ════════════════════════════════════════════════════════════════
-- DEPLOY_ALL — 출시 전 한 번에 실행 (순서 중요)
-- SQL Editor에 통째로 붙여넣고 Run.
-- 1) 멀티시티  2) 익명검증  3) 출시 하드닝
-- ════════════════════════════════════════════════════════════════

-- ┌─ 1. MULTI-CITY ─────────────────────────────────────────────┐
-- ================================================================
-- 멀티시티 — restaurants.city 컬럼 추가 + 뷰 재생성
-- 뷰는 r.* 를 생성 시점에 확장하므로 컬럼 추가 후 반드시 재생성
-- ================================================================

-- 1. 컬럼 추가
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city text DEFAULT 'nyc';
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants (city);

-- 2. 백필: 기존 스팟 전부 NYC, 오늘 시딩한 LA 7곳만 LA
UPDATE restaurants SET city = 'nyc' WHERE city IS NULL;
UPDATE restaurants SET city = 'la' WHERE submitted_by = 'seed:youtube' AND lng < -100;

-- 3. 뷰 재생성 (fix_view_is_real_meal.sql 기준 + city 포함)
DROP VIEW IF EXISTS the_court_queue CASCADE;
DROP VIEW IF EXISTS restaurants_with_cheapest CASCADE;

CREATE OR REPLACE VIEW restaurants_with_cheapest AS
SELECT
  r.*,
  b.spot_type,
  b.slug AS brand_slug,
  b.abbr AS brand_abbr,
  b.name AS brand_name,
  COALESCE(b.category, r.category) AS effective_category,
  cm.cheapest_price,
  cm.cheapest_menu_id,
  cm.cheapest_menu_name,
  cm.menu_count,
  CASE
    WHEN cm.cheapest_price IS NULL THEN 'unknown'
    WHEN cm.cheapest_price <= 4 THEN 'legend'
    WHEN cm.cheapest_price <= 8 THEN 'solid'
    WHEN cm.cheapest_price <= 11 THEN 'fair'
    WHEN cm.cheapest_price <= 14 THEN 'border'
    ELSE 'over'
  END AS marker_grade
FROM restaurants r
LEFT JOIN brands b ON r.brand_id = b.id
LEFT JOIN LATERAL (
  SELECT
    (SELECT price FROM menu_items
       WHERE off_code = FALSE AND is_real_meal = TRUE
       AND (
         (brand_id = r.brand_id AND restaurant_id IS NULL AND is_override = FALSE
          AND (tags IS NULL OR tags <@ r.tags OR r.tags IS NULL))
         OR (restaurant_id = r.id AND is_override = TRUE)
         OR (restaurant_id = r.id AND is_override = FALSE)
       )
       ORDER BY price ASC LIMIT 1
    ) AS cheapest_price,
    (SELECT id FROM menu_items
       WHERE off_code = FALSE AND is_real_meal = TRUE
       AND (
         (brand_id = r.brand_id AND restaurant_id IS NULL AND is_override = FALSE
          AND (tags IS NULL OR tags <@ r.tags OR r.tags IS NULL))
         OR (restaurant_id = r.id AND is_override = TRUE)
         OR (restaurant_id = r.id AND is_override = FALSE)
       )
       ORDER BY price ASC LIMIT 1
    ) AS cheapest_menu_id,
    (SELECT name FROM menu_items
       WHERE off_code = FALSE AND is_real_meal = TRUE
       AND (
         (brand_id = r.brand_id AND restaurant_id IS NULL AND is_override = FALSE
          AND (tags IS NULL OR tags <@ r.tags OR r.tags IS NULL))
         OR (restaurant_id = r.id AND is_override = TRUE)
         OR (restaurant_id = r.id AND is_override = FALSE)
       )
       ORDER BY price ASC LIMIT 1
    ) AS cheapest_menu_name,
    (SELECT COUNT(*) FROM menu_items
       WHERE off_code = FALSE
       AND (
         (brand_id = r.brand_id AND restaurant_id IS NULL AND is_override = FALSE
          AND (tags IS NULL OR tags <@ r.tags OR r.tags IS NULL))
         OR (restaurant_id = r.id AND is_override = TRUE)
         OR (restaurant_id = r.id AND is_override = FALSE)
       )
    ) AS menu_count
) cm ON TRUE;

CREATE OR REPLACE VIEW the_court_queue AS
SELECT
  m.*,
  r.name AS restaurant_name,
  r.address AS restaurant_address,
  COALESCE(b.category, r.category) AS restaurant_category,
  b.spot_type,
  b.name AS brand_name,
  CASE m.verification_state
    WHEN 'disputed' THEN 1
    WHEN 'outdated' THEN 2
    WHEN 'seed' THEN 3
    WHEN 'recent' THEN 4
    WHEN 'verified' THEN 5
  END AS sort_priority
FROM menu_items_with_state m
JOIN restaurants r ON r.id = m.restaurant_id
LEFT JOIN brands b ON r.brand_id = b.id
WHERE r.status = 'approved'
  AND m.off_code = FALSE
ORDER BY sort_priority, m.legit_count DESC, m.updated_at DESC;

-- 4. 검증
SELECT city, COUNT(*) FROM restaurants GROUP BY city;
SELECT name, city FROM restaurants_with_cheapest WHERE city = 'la';

-- ┌─ 2. ANONYMOUS VERIFICATIONS ────────────────────────────────┐
-- ================================================================
-- 익명 검증 — 로그인 없이 가격 검증(legit/cap) 가능하게
-- 위키 방식: 누구나 기여, 신뢰는 사후(합의·자동숨김)로 관리
-- ================================================================

-- 1. user_id를 nullable로, anon_id 컬럼 추가
ALTER TABLE verifications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS anon_id text;

-- 2. 익명 dedup용 unique 인덱스
--    (menu_item_id, anon_id) — 로그인 행은 anon_id=NULL이라 충돌 안 함(NULL distinct)
--    upsert onConflict 'menu_item_id,anon_id' 의 arbiter
CREATE UNIQUE INDEX IF NOT EXISTS uniq_verif_anon
  ON verifications (menu_item_id, anon_id);

-- 3. RLS — 기존 로그인 정책은 유지, 익명 정책 추가
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verif_select_all ON verifications;
CREATE POLICY verif_select_all ON verifications
  FOR SELECT USING (true);

-- 익명: user_id 없이 anon_id로만 INSERT 가능
DROP POLICY IF EXISTS verif_anon_insert ON verifications;
CREATE POLICY verif_anon_insert ON verifications
  FOR INSERT WITH CHECK (user_id IS NULL AND anon_id IS NOT NULL);

-- 익명: 자기 디바이스 행(user_id NULL) UPDATE 허용 (legit→cap 재투표)
DROP POLICY IF EXISTS verif_anon_update ON verifications;
CREATE POLICY verif_anon_update ON verifications
  FOR UPDATE USING (user_id IS NULL) WITH CHECK (user_id IS NULL);

-- 로그인 사용자 정책이 없을 수도 있으니 보강 (있으면 무시됨)
DO $$ BEGIN
  CREATE POLICY verif_auth_insert ON verifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY verif_auth_update ON verifications
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. contributions에도 익명 닉네임 컬럼 (없으면)
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS nickname text;

-- 5. 검증
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'verifications' AND column_name IN ('user_id','anon_id')
ORDER BY column_name;

-- ┌─ 3. LAUNCH HARDENING ───────────────────────────────────────┐
-- ================================================================
-- 출시 전 하드닝 — 익명 개방에 따른 필수 보강
-- 1) 검증 트리거가 RLS 무시하고 카운트/승인 쓰게 (SECURITY DEFINER)
-- 2) 관리자 모더레이션 권한 (스팸 정리 필수)
-- 3) 관리자 이메일 통일
-- ================================================================

-- 관리자 이메일 (admin.js와 반드시 일치)
-- admin 이메일은 sql/admin_config.sql의 app.admin_email 설정을 참조 (is_admin() 함수)
-- 다른 이메일로 로그인한다면 아래 두 곳의 주소를 바꾸세요.

-- ── 1. 트리거 함수를 SECURITY DEFINER로 ──────────────────────────
-- 익명 사용자가 verifications에 INSERT하면 트리거가 menu_items/restaurants를
-- UPDATE하는데, 익명에겐 그 권한이 없어 RLS에 막힘 → INSERT 전체 실패.
-- DEFINER로 바꾸면 함수 소유자(=관리자) 권한으로 실행되어 통과.

DO $$ BEGIN
  ALTER FUNCTION update_menu_verification() SECURITY DEFINER;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_menu_verification() 없음 — 스킵'; END $$;

DO $$ BEGIN
  ALTER FUNCTION auto_approve_restaurant() SECURITY DEFINER;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'auto_approve_restaurant() 없음 — 스킵'; END $$;

DO $$ BEGIN
  ALTER FUNCTION auto_hide_spam_menu() SECURITY DEFINER;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'auto_hide_spam_menu() 없음 — 스킵'; END $$;

-- ── 2. 관리자 모더레이션 정책 ────────────────────────────────────
-- 관리자는 모든 행을 UPDATE/DELETE 가능 (승인/거부/스팸삭제/가격수정)

DROP POLICY IF EXISTS "admin_all_restaurants" ON restaurants;
CREATE POLICY "admin_all_restaurants" ON restaurants
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_all_menu_items" ON menu_items;
CREATE POLICY "admin_all_menu_items" ON menu_items
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_reports" ON reports;
  CREATE POLICY "admin_all_reports" ON reports
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'reports 테이블 없음 — 스킵'; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_pending" ON pending_changes;
  CREATE POLICY "admin_all_pending" ON pending_changes
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'pending_changes 테이블 없음 — 스킵'; END $$;

-- ── 3. contributions 관리자 정책 이메일 수정 ─────────────────────
DROP POLICY IF EXISTS "Admin sees all contributions" ON contributions;
CREATE POLICY "Admin sees all contributions" ON contributions
  FOR ALL TO authenticated
  USING (is_admin());

-- ── 4. 검증 ──────────────────────────────────────────────────────
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('update_menu_verification','auto_approve_restaurant','auto_hide_spam_menu');
