-- ═══════════════════════════════════════════════════════════════
-- ANON WRITES — 로그인 제거 후 익명 기여 허용
-- (b) sign-in 익명화 전환: 검증/북마크는 이미 익명. 여기서 나머지를 익명화한다.
--   대상 테이블: worth_votes, comments, reports, pending_changes
--   패턴: user_id nullable + anon_id text + 익명 INSERT RLS
--         (기존 verifications 익명 패턴과 동일 — DEPLOY_ALL.sql §검증 참고)
--   카운트/상태 부수효과는 anon이 restaurants를 직접 못 쓰므로
--   SECURITY DEFINER 트리거로 서버측에서 유지한다.
--
-- 실행: Supabase SQL Editor에서 한 번 실행. 멱등(여러 번 실행해도 안전).
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1) WORTH VOTES (🔥 / 💩 평가)
-- ───────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE worth_votes ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE worth_votes ADD COLUMN IF NOT EXISTS anon_id text;
  ALTER TABLE worth_votes ENABLE ROW LEVEL SECURITY;

  -- 디바이스당 1표 (anon_id NULL은 서로 distinct → 로그인 행과 충돌 안 함)
  CREATE UNIQUE INDEX IF NOT EXISTS worth_votes_rest_anon ON worth_votes (restaurant_id, anon_id);

  -- 읽기: 공개 (집계 표시용)
  DROP POLICY IF EXISTS worth_select_all ON worth_votes;
  CREATE POLICY worth_select_all ON worth_votes FOR SELECT USING (true);

  -- 익명: anon_id로만 INSERT/UPDATE/DELETE
  DROP POLICY IF EXISTS worth_anon_insert ON worth_votes;
  CREATE POLICY worth_anon_insert ON worth_votes FOR INSERT
    WITH CHECK (user_id IS NULL AND anon_id IS NOT NULL);
  DROP POLICY IF EXISTS worth_anon_update ON worth_votes;
  CREATE POLICY worth_anon_update ON worth_votes FOR UPDATE
    USING (user_id IS NULL) WITH CHECK (user_id IS NULL);
  DROP POLICY IF EXISTS worth_anon_delete ON worth_votes;
  CREATE POLICY worth_anon_delete ON worth_votes FOR DELETE
    USING (user_id IS NULL);

  -- 로그인(관리자 본인 등): user_id 경로 유지
  DROP POLICY IF EXISTS worth_auth_all ON worth_votes;
  CREATE POLICY worth_auth_all ON worth_votes FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'worth_votes 테이블 없음 — 스킵'; END $$;

-- restaurants.worth_it_count / not_worth_count 를 worth_votes에서 서버측 재계산
CREATE OR REPLACE FUNCTION recompute_worth_counts() RETURNS trigger AS $$
BEGIN
  UPDATE restaurants r SET
    worth_it_count  = (SELECT count(*) FROM worth_votes w WHERE w.restaurant_id = r.id AND w.vote = 'worth_it'),
    not_worth_count = (SELECT count(*) FROM worth_votes w WHERE w.restaurant_id = r.id AND w.vote = 'not_worth')
  WHERE r.id = COALESCE(NEW.restaurant_id, OLD.restaurant_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_recompute_worth ON worth_votes;
  CREATE TRIGGER trg_recompute_worth
    AFTER INSERT OR UPDATE OR DELETE ON worth_votes
    FOR EACH ROW EXECUTE FUNCTION recompute_worth_counts();
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'worth_votes 없음 — 트리거 스킵'; END $$;

-- ───────────────────────────────────────────────
-- 2) COMMENTS (댓글)
-- ───────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE comments ADD COLUMN IF NOT EXISTS anon_id text;
  ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS comments_select_all ON comments;
  CREATE POLICY comments_select_all ON comments FOR SELECT USING (true);

  DROP POLICY IF EXISTS comments_anon_insert ON comments;
  CREATE POLICY comments_anon_insert ON comments FOR INSERT
    WITH CHECK (user_id IS NULL AND anon_id IS NOT NULL);

  DROP POLICY IF EXISTS comments_auth_insert ON comments;
  CREATE POLICY comments_auth_insert ON comments FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'comments 테이블 없음 — 스킵'; END $$;

-- ───────────────────────────────────────────────
-- 3) REPORTS (폐업/오류 신고)
-- ───────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE reports ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE reports ADD COLUMN IF NOT EXISTS anon_id text;
  ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

  -- 읽기: 공개 (클라가 'closed' pending 카운트를 셈)
  DROP POLICY IF EXISTS reports_select_all ON reports;
  CREATE POLICY reports_select_all ON reports FOR SELECT USING (true);

  DROP POLICY IF EXISTS reports_anon_insert ON reports;
  CREATE POLICY reports_anon_insert ON reports FOR INSERT
    WITH CHECK (user_id IS NULL AND anon_id IS NOT NULL);

  DROP POLICY IF EXISTS reports_auth_insert ON reports;
  CREATE POLICY reports_auth_insert ON reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'reports 테이블 없음 — 스킵'; END $$;

-- 'closed' 신고 3건↑(pending) → 자동 폐업 처리 (anon이 restaurants 직접 못 쓰므로 트리거로)
CREATE OR REPLACE FUNCTION autoclose_on_reports() RETURNS trigger AS $$
BEGIN
  IF NEW.report_type = 'closed' THEN
    IF (SELECT count(*) FROM reports
          WHERE restaurant_id = NEW.restaurant_id
            AND report_type = 'closed' AND status = 'pending') >= 3 THEN
      UPDATE restaurants SET status = 'closed' WHERE id = NEW.restaurant_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_autoclose_reports ON reports;
  CREATE TRIGGER trg_autoclose_reports
    AFTER INSERT ON reports
    FOR EACH ROW EXECUTE FUNCTION autoclose_on_reports();
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'reports 없음 — 트리거 스킵'; END $$;

-- ───────────────────────────────────────────────
-- 4) PENDING_CHANGES (메뉴 편집 → 검토 큐)
--    이미 admin 검토 경유라 안전. 익명 INSERT만 허용.
-- ───────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE pending_changes ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE pending_changes ADD COLUMN IF NOT EXISTS anon_id text;
  ALTER TABLE pending_changes ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS pending_anon_insert ON pending_changes;
  CREATE POLICY pending_anon_insert ON pending_changes FOR INSERT
    WITH CHECK (user_id IS NULL AND anon_id IS NOT NULL);

  DROP POLICY IF EXISTS pending_auth_insert ON pending_changes;
  CREATE POLICY pending_auth_insert ON pending_changes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  -- (조회/승인은 기존 admin_all_pending 정책 유지)
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'pending_changes 테이블 없음 — 스킵'; END $$;

-- ───────────────────────────────────────────────
-- 검증 쿼리 (선택)
-- ───────────────────────────────────────────────
-- SELECT table_name, column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('worth_votes','comments','reports','pending_changes')
--   AND column_name IN ('user_id','anon_id') ORDER BY 1,2;
