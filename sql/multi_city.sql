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
