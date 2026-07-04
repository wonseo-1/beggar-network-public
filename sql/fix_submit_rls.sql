-- ================================================================
-- 신규 식당 등록 오류 수정
-- 문제: submit.js는 메뉴 없는 제보를 status='unverified'로 INSERT하는데,
--       기존 정책은 'pending_review'만 허용 → RLS 위반으로 등록 실패
-- ================================================================

DROP POLICY IF EXISTS "anon_can_submit_restaurant" ON restaurants;

CREATE POLICY "anon_can_submit_restaurant" ON restaurants
  FOR INSERT WITH CHECK (status IN ('pending_review', 'unverified'));
