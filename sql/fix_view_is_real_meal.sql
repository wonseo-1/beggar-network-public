-- ================================================================
-- VIEW 수정: is_real_meal=TRUE 필터 추가
-- 문제: House Hot Sauce $0.50, Diet Coke $2.50 등이 최저가로 잡힘
-- 해결: cheapest는 is_real_meal=TRUE인 메뉴만, menu_count는 전체 유지
-- ================================================================

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
    -- cheapest: 식사 메뉴만 (is_real_meal = TRUE)
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
    -- menu_count: 전체 메뉴 (사이드 포함)
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

-- the_court_queue 재생성 (위 VIEW에 의존)
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

-- 검증: Charles Pan-Fried Chicken이 $0.50이 아니라 $11이어야 함
SELECT name, cheapest_price, cheapest_menu_name, marker_grade
FROM restaurants_with_cheapest
WHERE name ILIKE '%Charles%Pan%';

-- 검증: 7th Street Burger가 Diet Coke $2.50이 아니라 Cheeseburger $6.50이어야 함
SELECT name, cheapest_price, cheapest_menu_name, marker_grade
FROM restaurants_with_cheapest
WHERE name ILIKE '%7th Street%';
