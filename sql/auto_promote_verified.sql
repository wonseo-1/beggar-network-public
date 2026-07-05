-- ═══════════════════════════════════════════════════════════════
-- AUTO-PROMOTE VERIFIED SPOTS — 위키식 개편 Phase 2 (2026-07-05)
-- 사전승인 게이트 없앤 대신, 서로 다른 사람 3명이 "가격 맞음(legit)"
-- 투표하면 unverified → approved로 자동 전환한다. 로그인 불필요
-- (anon_id 포함 집계) — 익명 검증도 그대로 카운트됨.
--
-- 패턴은 기존 sql/anon_writes.sql의 "closed 신고 3건 → 자동 폐업" 트리거와
-- 동일: anon 유저는 restaurants를 직접 못 건드리므로 SECURITY DEFINER 트리거로
-- 서버측에서 대신 업데이트.
--
-- 실행: Supabase 대시보드 → SQL Editor에서 한 번 실행. 멱등(여러 번 실행해도 안전).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION promote_verified_spot() RETURNS trigger AS $$
DECLARE
  v_restaurant_id bigint;
  v_legit_voters  int;
BEGIN
  -- 'legit'(가격 맞음) 투표만 승격 신호로 카운트. 'cap'(가격 틀림)은 무시.
  IF NEW.verdict IS DISTINCT FROM 'legit' THEN
    RETURN NULL;
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM menu_items WHERE id = NEW.menu_item_id;

  -- 체인 공유 메뉴(restaurant_id NULL)는 개별 스팟 승격과 무관 → 스킵
  IF v_restaurant_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 서로 다른 사람(로그인 user_id 또는 익명 anon_id) 수를 셈
  SELECT count(DISTINCT COALESCE(v.user_id::text, v.anon_id))
    INTO v_legit_voters
  FROM verifications v
  JOIN menu_items m ON m.id = v.menu_item_id
  WHERE m.restaurant_id = v_restaurant_id
    AND v.verdict = 'legit';

  IF v_legit_voters >= 3 THEN
    UPDATE restaurants SET status = 'approved'
    WHERE id = v_restaurant_id AND status = 'unverified';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_promote_verified_spot ON verifications;
  CREATE TRIGGER trg_promote_verified_spot
    AFTER INSERT OR UPDATE ON verifications
    FOR EACH ROW EXECUTE FUNCTION promote_verified_spot();
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'verifications 테이블 없음 — 트리거 스킵'; END $$;

-- ───────────────────────────────────────────────
-- 검증 쿼리 (선택 — 실행 후 확인용)
-- ───────────────────────────────────────────────
-- SELECT proname FROM pg_proc WHERE proname = 'promote_verified_spot';
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_promote_verified_spot';
