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
