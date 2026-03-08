-- ═══════════════════════════════════════════════════════
-- ME.PARK ERP — 관리자 계정 생성용 RPC 함수 (v2)
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════

-- pgcrypto 확장 (비밀번호 해싱용 — Supabase에는 기본 설치됨)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. 관리자 계정 직접 생성 (signUp 우회)
CREATE OR REPLACE FUNCTION admin_create_user(
  user_email TEXT,
  user_password TEXT,
  user_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_user_id UUID;
  existing_id UUID;
BEGIN
  -- 이미 존재하는 유저 체크
  SELECT id INTO existing_id FROM auth.users WHERE email = user_email;
  IF existing_id IS NOT NULL THEN
    UPDATE auth.users SET
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmed_at = COALESCE(confirmed_at, NOW()),
      updated_at = NOW()
    WHERE id = existing_id;
    RETURN existing_id;
  END IF;

  -- 새 유저 생성
  new_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    user_email,
    crypt(user_password, gen_salt('bf')),
    NOW(), NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('name', user_name),
    'authenticated', 'authenticated',
    NOW(), NOW()
  );

  -- identity 생성 (로그인에 필수)
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    user_email,
    'email',
    jsonb_build_object('sub', new_user_id::text, 'email', user_email, 'email_verified', true),
    NOW(), NOW(), NOW()
  );

  RETURN new_user_id;
END;
$$;

-- 2. 이메일로 user_id 조회
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

-- 3. 이메일 자동 확인
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
