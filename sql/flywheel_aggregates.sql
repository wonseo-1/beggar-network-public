-- ================================================================
-- flywheel_aggregates — 북극성 집계 + 커뮤니티 자동 랭킹 (자동개선)
-- 설계: docs/growth-flywheel.md §2(북극성), §6.1(랭킹 자동화)
--
-- 선행조건: events.sql, generated_recipes 존재.
-- 두 함수 모두 SECURITY DEFINER — events는 RLS로 anon이 못 읽으므로
-- "집계만" 정의자 권한으로 노출하고 원시 이벤트는 비공개로 유지한다.
--
-- ⚠️ Supabase SQL 에디터에서 사용자가 직접 실행.
-- ================================================================

-- ── 북극성: 누적 절약액 (커뮤니티 공개 레시피) ──────────────────
-- Σ(restaurant_price.amount − home_price.amount_high), 공개된 레시피만.
-- 정적 레시피 분(分)은 클라이언트가 이미 계산하므로 여기선 커뮤니티 생성분만.
CREATE OR REPLACE FUNCTION public_savings_total()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(SUM(
    GREATEST(
      0,
      COALESCE((recipe->'restaurant_price'->>'amount')::numeric, 0)
      - COALESCE(
          (recipe->'home_price'->>'amount_high')::numeric,
          (recipe->'home_price'->>'amount')::numeric,
          0)
    )
  ), 0)
  FROM generated_recipes
  WHERE published = true;
$$;

GRANT EXECUTE ON FUNCTION public_savings_total() TO anon, authenticated;

-- ── 커뮤니티 자동 랭킹 (인기/품질 자동 노출) ────────────────────
-- 최신순(published_at) 대신 참여·품질 점수로 정렬.
-- 점수 = 참여(저장>공유>👍>amazon클릭>조회) + 신선도(콜드스타트 보호).
-- 가중치는 데이터 쌓이면 재튜닝 (설계 §6.1).
CREATE OR REPLACE FUNCTION community_recipe_scores(p_limit int DEFAULT 12)
RETURNS TABLE (
  slug            text,
  author_nickname text,
  name            text,
  emoji           text,
  tagline         text,
  published_at    timestamptz,
  score           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH agg AS (
    SELECT
      recipe_key,
      count(*) FILTER (WHERE name = 'recipe_view')                                AS views,
      count(*) FILTER (WHERE name = 'save')                                       AS saves,
      count(*) FILTER (WHERE name = 'share_click')                                AS shares,
      count(*) FILTER (WHERE name = 'amazon_click')                               AS amazon_clicks,
      count(*) FILTER (WHERE name = 'feedback' AND props->>'verdict' = 'up')      AS ups
    FROM events
    WHERE recipe_key IS NOT NULL
    GROUP BY recipe_key
  )
  SELECT
    g.slug,
    g.author_nickname,
    (g.recipe->>'name')    AS name,
    (g.recipe->>'emoji')   AS emoji,
    (g.recipe->>'tagline') AS tagline,
    g.published_at,
    (
      COALESCE(a.saves, 0)         * 4.0
      + COALESCE(a.shares, 0)      * 3.0
      + COALESCE(a.ups, 0)         * 2.0
      + COALESCE(a.amazon_clicks, 0) * 1.0
      + COALESCE(a.views, 0)       * 0.2
      -- 신선도: 오늘이면 +5, 하루 지날수록 감쇠 → 신규 레시피 콜드스타트 보호
      + 5.0 / (1.0 + GREATEST(0, EXTRACT(EPOCH FROM (now() - g.published_at)) / 86400.0))
    )::numeric AS score
  FROM generated_recipes g
  LEFT JOIN agg a ON a.recipe_key = g.access_key
  WHERE g.published = true
  ORDER BY score DESC, g.published_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION community_recipe_scores(int) TO anon, authenticated;

-- 검증
SELECT 'flywheel aggregates ready' AS status, public_savings_total() AS community_savings;
