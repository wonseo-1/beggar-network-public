-- ================================================================
-- 익명 검증 — 로그인 없이 가격 검증(legit/cap) 가능하게
-- 위키 방식: 누구나 기여, 신뢰는 사후(합의·자동숨김)로 관리
-- ================================================================

-- 1. user_id를 nullable로, anon_id 컬럼 추가
ALTER TABLE verifications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS anon_id text;

-- 2. 익명 dedup용 unique 인덱스
--    (menu_item_id, anon_id) — 로그인 행은 anon_id=NULL이라 충돌 안 함(NULL distinct)
--    upsert onConflict 'menu_item_id,anon_id' 의 arbiter
CREATE UNIQUE INDEX IF NOT EXISTS uniq_verif_anon
  ON verifications (menu_item_id, anon_id);

-- 3. RLS — 기존 로그인 정책은 유지, 익명 정책 추가
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verif_select_all ON verifications;
CREATE POLICY verif_select_all ON verifications
  FOR SELECT USING (true);

-- 익명: user_id 없이 anon_id로만 INSERT 가능
DROP POLICY IF EXISTS verif_anon_insert ON verifications;
CREATE POLICY verif_anon_insert ON verifications
  FOR INSERT WITH CHECK (user_id IS NULL AND anon_id IS NOT NULL);

-- 익명: 자기 디바이스 행(user_id NULL) UPDATE 허용 (legit→cap 재투표)
DROP POLICY IF EXISTS verif_anon_update ON verifications;
CREATE POLICY verif_anon_update ON verifications
  FOR UPDATE USING (user_id IS NULL) WITH CHECK (user_id IS NULL);

-- 로그인 사용자 정책이 없을 수도 있으니 보강 (있으면 무시됨)
DO $$ BEGIN
  CREATE POLICY verif_auth_insert ON verifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY verif_auth_update ON verifications
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. contributions에도 익명 닉네임 컬럼 (없으면)
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS nickname text;

-- 5. 검증
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'verifications' AND column_name IN ('user_id','anon_id')
ORDER BY column_name;
