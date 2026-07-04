-- ================================================================
-- generated_recipes — YouTube 링크로 생성된 개인 레시피
-- 접근: Edge Function(service role)만 읽고 씀.
-- anon에게는 정책 없음 → RLS가 전부 차단 (access_key로만 조회 가능)
-- ================================================================

CREATE TABLE IF NOT EXISTS generated_recipes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  video_id text NOT NULL,
  video_url text NOT NULL,
  video_title text,
  servings int,
  budget numeric,
  recipe jsonb NOT NULL,
  access_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  had_transcript boolean DEFAULT false,
  client_ip text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE generated_recipes ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = anon/authenticated 접근 불가. service role은 RLS 우회.

CREATE INDEX IF NOT EXISTS idx_genrec_video ON generated_recipes (video_id, servings);
CREATE INDEX IF NOT EXISTS idx_genrec_ip_time ON generated_recipes (client_ip, created_at);
