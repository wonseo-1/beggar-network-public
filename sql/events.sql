-- ================================================================
-- events — 자가발전 플라이휠의 측정 substrate (계기판)
-- 설계: docs/growth-flywheel.md §4 (측정 substrate)
--
-- 철학: 3rd-party SDK(GA/PostHog) 대신 Supabase 단일 테이블 + ~12줄 track().
-- 이미 가진 sb 클라이언트 · getVoterId() anon_id · RLS insert 패턴을 그대로 재사용.
-- anon insert만 허용, 조회는 admin. 개인정보 비저장(anon_id/user_id만).
--
-- ⚠️ 이 SQL은 Supabase SQL 에디터에서 사용자가 직접 실행한다 (앱 배포와 무관).
-- ================================================================

CREATE TABLE IF NOT EXISTS events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  anon_id     text,
  user_id     uuid REFERENCES auth.users(id),
  recipe_key  uuid,                       -- generated_recipes.access_key 와 자연 조인
  props       jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- RLS: anon은 INSERT만, 조회는 admin만 (지도 verifications 패턴과 동일 철학)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_anon_insert ON events;
CREATE POLICY events_anon_insert ON events
  FOR INSERT WITH CHECK (true);

-- admin 이메일은 sql/admin_config.sql의 app.admin_email 설정을 참조 (is_admin() 함수)
-- (auth.js / admin.js / DEPLOY_ALL.sql / contributions.sql 모두 동일.)
DROP POLICY IF EXISTS events_admin_select ON events;
CREATE POLICY events_admin_select ON events
  FOR SELECT USING (is_admin());

-- 역할 권한 (기존 테이블과 동일하게 anon/authenticated insert 보장)
GRANT INSERT ON events TO anon, authenticated;

-- 집계 인덱스
CREATE INDEX IF NOT EXISTS idx_events_name_time   ON events (name, created_at);
CREATE INDEX IF NOT EXISTS idx_events_recipe      ON events (recipe_key);
CREATE INDEX IF NOT EXISTS idx_events_recipe_name ON events (recipe_key, name);

-- ================================================================
-- 가드레일: 제보 누적 시 공개 노출 자동 숨김 (저품질 자동 숨김)
-- 설계 §5 ⑤ / §7: report >= 5 AND up = 0 → generated_recipes.published = false
-- 지도의 auto_hide_spam 트리거(cap>=5 AND legit=0) 패턴을 레시피 품질 루프에 이식.
-- 삭제가 아니라 "숨김" — 사람(admin)은 예외 큐만 본다.
-- SECURITY DEFINER: events는 RLS로 anon이 못 읽으므로 집계는 정의자 권한으로.
-- ================================================================
CREATE OR REPLACE FUNCTION auto_hide_reported_recipe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_n int;
  up_n     int;
BEGIN
  -- feedback 이벤트만 처리, recipe_key 필수
  IF NEW.name <> 'feedback' OR NEW.recipe_key IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    count(*) FILTER (WHERE props->>'verdict' = 'report'),
    count(*) FILTER (WHERE props->>'verdict' = 'up')
  INTO report_n, up_n
  FROM events
  WHERE recipe_key = NEW.recipe_key AND name = 'feedback';

  IF report_n >= 5 AND up_n = 0 THEN
    UPDATE generated_recipes
       SET published = false
     WHERE access_key = NEW.recipe_key
       AND published = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_hide_reported ON events;
CREATE TRIGGER trg_auto_hide_reported
  AFTER INSERT ON events
  FOR EACH ROW
  WHEN (NEW.name = 'feedback')
  EXECUTE FUNCTION auto_hide_reported_recipe();

-- 검증
SELECT 'events ready' AS status;
