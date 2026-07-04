-- ================================================================
-- 메뉴 중복 방지: DB 레벨
-- ================================================================

-- 1. 중복 방지 unique index (대소문자 무시)
-- brand_id + restaurant_id + 이름(소문자) 조합이 유니크
-- restaurant_id가 NULL인 경우(체인 공유 메뉴)도 처리
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_no_dupe
ON menu_items (brand_id, COALESCE(restaurant_id, 0), LOWER(TRIM(name)))
WHERE off_code = FALSE;

-- 이렇게 하면:
-- ✅ 같은 식당에 "Chicken Rice" 두 번 등록 불가
-- ✅ "chicken rice" = "Chicken Rice" (대소문자 무시)
-- ✅ off_code=TRUE인 건 제외 (비활성 메뉴는 중복 허용)
-- ✅ 체인 공유 메뉴(restaurant_id=NULL)도 중복 방지

-- 2. 유저가 같은 메뉴 등록 시 → 가격 업데이트 (UPSERT)
-- 프론트에서 INSERT 대신 이걸 사용:
--
-- INSERT INTO menu_items (name, price, brand_id, restaurant_id, source)
-- VALUES ('Chicken Rice', 12.99, 25, 23, 'user_added')
-- ON CONFLICT ON CONSTRAINT idx_menu_items_no_dupe  -- 이미 있으면
-- DO UPDATE SET
--   price = EXCLUDED.price,           -- 새 가격으로 갱신
--   source = EXCLUDED.source,         -- source 갱신
--   updated_at = NOW();               -- 시간 갱신
--
-- → 이러면 중복 INSERT가 자동으로 UPDATE로 전환됨

-- 3. 검증: 현재 중복 있으면 에러남 → 먼저 확인
SELECT brand_id, COALESCE(restaurant_id, 0) as rid, LOWER(TRIM(name)) as n, COUNT(*) as cnt
FROM menu_items
WHERE off_code = FALSE
GROUP BY brand_id, COALESCE(restaurant_id, 0), LOWER(TRIM(name))
HAVING COUNT(*) > 1;
