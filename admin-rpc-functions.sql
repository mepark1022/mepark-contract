-- ═══════════════════════════════════════════════════════
-- ME.PARK ERP — 관리자 계정 생성용 RPC 함수
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════

-- 1. 이메일로 user_id 조회 (이미 가입된 유저 복구용)
CREATE OR REPLACE FUNCTION get_user_id_by_email(user_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id UUID;
BEGIN
  SELECT id INTO found_id FROM auth.users WHERE email = user_email LIMIT 1;
  RETURN found_id;
END;
$$;

-- 2. 이메일 자동 확인 (슈퍼관리자가 계정 생성 시 즉시 확인 처리)
CREATE OR REPLACE FUNCTION confirm_user_by_email(user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmed_at = COALESCE(confirmed_at, NOW()),
      updated_at = NOW()
  WHERE email = user_email
    AND email_confirmed_at IS NULL;
END;
$$;

-- 확인
SELECT proname FROM pg_proc WHERE proname IN ('get_user_id_by_email', 'confirm_user_by_email');
