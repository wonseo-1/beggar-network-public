-- ================================================================
-- 카테고리 통일 마이그레이션
-- config.js CATEGORIES 키와 DB 값 일치시키기
-- ================================================================

-- middle_eastern → halal
UPDATE restaurants SET category = 'halal' WHERE category = 'middle_eastern';
UPDATE brands SET category = 'halal' WHERE category = 'middle_eastern';

-- burgers → american
UPDATE restaurants SET category = 'american' WHERE category = 'burgers';
UPDATE brands SET category = 'american' WHERE category = 'burgers';

-- bakery_deli → sandwich_deli
UPDATE restaurants SET category = 'sandwich_deli' WHERE category = 'bakery_deli';
UPDATE brands SET category = 'sandwich_deli' WHERE category = 'bakery_deli';

-- deli → sandwich_deli
UPDATE restaurants SET category = 'sandwich_deli' WHERE category = 'deli';
UPDATE brands SET category = 'sandwich_deli' WHERE category = 'deli';

-- food_cart 태그 → spot_type='cart'
UPDATE restaurants SET spot_type = 'cart' WHERE 'food_cart' = ANY(tags);
UPDATE restaurants SET tags = array_remove(tags, 'food_cart') WHERE 'food_cart' = ANY(tags);

-- 알 수 없는 카테고리 → other
UPDATE restaurants SET category = 'other'
  WHERE category IS NOT NULL
  AND category NOT IN (
    'pizza','halal','mexican','chinese','american',
    'sandwich_deli','bagel','salad','korean','japanese',
    'thai','vietnamese','indian','mediterranean',
    'caribbean','dessert','other'
  );

UPDATE brands SET category = 'other'
  WHERE category IS NOT NULL
  AND category NOT IN (
    'pizza','halal','mexican','chinese','american',
    'sandwich_deli','bagel','salad','korean','japanese',
    'thai','vietnamese','indian','mediterranean',
    'caribbean','dessert','other'
  );
