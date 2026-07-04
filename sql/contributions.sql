-- Contributions table — tracks all user contributions for audit
CREATE TABLE IF NOT EXISTS contributions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id bigint REFERENCES restaurants(id),
  menu_item_id bigint REFERENCES menu_items(id),
  user_id uuid REFERENCES auth.users(id),
  nickname text,
  type text NOT NULL CHECK (type IN (
    'new_spot', 'add_menu', 'update_price',
    'update_info', 'report_closed', 'new_branch'
  )),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert contributions" ON contributions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users see own contributions" ON contributions FOR SELECT USING (user_id = auth.uid());
-- admin 이메일은 sql/admin_config.sql의 app.admin_email 설정을 참조 (is_admin() 함수)
-- (auth.js / admin.js / DEPLOY_ALL.sql 기준. prod은 DEPLOY_ALL이 이미 이 값으로 적용함.)
CREATE POLICY "Admin sees all contributions" ON contributions FOR ALL USING (
  is_admin()
);

-- Auto-hide spam: cap_count >= 5 AND legit_count = 0 → off_code = true
CREATE OR REPLACE FUNCTION auto_hide_spam_menu()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cap_count >= 5 AND NEW.legit_count = 0 THEN
    NEW.off_code := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_hide_spam ON menu_items;
CREATE TRIGGER trg_auto_hide_spam
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_hide_spam_menu();

-- Auto-approve restaurant when a menu item gets legit_count >= 2
-- Only promotes unverified/pending_review → approved
-- Admin can still reject/close manually (those statuses won't be touched)
CREATE OR REPLACE FUNCTION auto_approve_restaurant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.legit_count >= 2 AND (OLD.legit_count IS NULL OR OLD.legit_count < 2) THEN
    UPDATE restaurants
    SET status = 'approved', updated_at = now()
    WHERE id = NEW.restaurant_id
      AND status IN ('unverified', 'pending_review');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_approve_restaurant ON menu_items;
CREATE TRIGGER trg_auto_approve_restaurant
  AFTER UPDATE OF legit_count ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_approve_restaurant();
