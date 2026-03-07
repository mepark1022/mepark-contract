-- ═══════════════════════════════════════════════════════
-- ME.PARK 근로계약서 관리 시스템 — Supabase 테이블 생성
-- ═══════════════════════════════════════════════════════

-- 1. profiles (관리자 프로필 — auth.users와 연동)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. invitations (관리자 초대)
CREATE TABLE public.invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  invited_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- 3. employees (직원대장)
CREATE TABLE public.employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  emp_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  position TEXT DEFAULT '일반',
  site_code_1 TEXT,
  site_code_2 TEXT,
  work_code TEXT NOT NULL DEFAULT 'C',
  hire_date DATE,
  resign_date DATE,
  status TEXT DEFAULT '재직',
  employment_type TEXT DEFAULT '정규직',
  probation_months INTEGER DEFAULT 0,
  base_salary INTEGER DEFAULT 0,
  weekend_daily INTEGER DEFAULT 0,
  meal_allow INTEGER DEFAULT 0,
  leader_allow INTEGER DEFAULT 0,
  childcare_allow INTEGER DEFAULT 0,
  car_allow INTEGER DEFAULT 0,
  tax_type TEXT DEFAULT '3.3%',
  reporter_name TEXT,
  reporter_ssn TEXT,
  account_holder TEXT,
  bank_name TEXT,
  account_number TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- RLS (Row Level Security) 정책
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- profiles: 로그인한 사용자는 모든 프로필 조회 가능
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  TO authenticated USING (true);

-- profiles: 본인 프로필만 수정
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid());

-- profiles: super_admin은 모든 프로필 수정/삭제 가능
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- invitations: 로그인한 사용자는 조회 가능
CREATE POLICY "invitations_select" ON public.invitations FOR SELECT
  TO authenticated USING (true);

-- invitations: super_admin만 생성/수정
CREATE POLICY "invitations_insert" ON public.invitations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "invitations_update" ON public.invitations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- employees: 로그인한 사용자 모두 조회
CREATE POLICY "employees_select" ON public.employees FOR SELECT
  TO authenticated USING (true);

-- employees: admin 이상만 추가/수정/삭제
CREATE POLICY "employees_insert" ON public.employees FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "employees_update" ON public.employees FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "employees_delete" ON public.employees FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

-- ═══════════════════════════════════════════════════════
-- 회원가입 시 자동 프로필 생성 함수
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  inv_record RECORD;
  user_role TEXT;
  user_name TEXT;
BEGIN
  -- 초대 토큰 확인 (metadata에서)
  SELECT * INTO inv_record FROM public.invitations
    WHERE email = NEW.email AND status = 'pending' AND expires_at > NOW()
    LIMIT 1;

  IF inv_record IS NOT NULL THEN
    user_role := inv_record.role;
    -- 초대 상태 업데이트
    UPDATE public.invitations SET status = 'accepted' WHERE id = inv_record.id;
  ELSE
    user_role := 'viewer';
  END IF;

  user_name := COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, name, role)
  VALUES (NEW.id, NEW.email, user_name, user_role);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 등록
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════
-- 샘플 데이터 (직원) — 선택사항
-- ═══════════════════════════════════════════════════════

INSERT INTO public.employees (emp_no, name, position, site_code_1, work_code, hire_date, status, base_salary, weekend_daily, meal_allow, leader_allow, childcare_allow, tax_type, employment_type, phone, probation_months) VALUES
  ('MP17001', '이지섭', '대표', 'V000', 'C', '2018-09-10', '재직', 5000000, 0, 200000, 0, 0, '4대보험', '정규직', '010-1234-5678', 0),
  ('MP23003', '이효정', '수석팀장', 'V000', 'C', '2023-03-01', '재직', 3500000, 0, 200000, 150000, 200000, '4대보험', '정규직', '010-2345-6789', 0),
  ('MP25175', '박민석C', '일반', 'V001', 'C', '2025-10-15', '재직', 2400000, 0, 200000, 0, 0, '3.3%', '정규직', '010-3456-7890', 4),
  ('MP24115', '강희철', '일반', 'V011', 'E', '2024-06-01', '재직', 0, 160000, 0, 0, 0, '3.3%', '정규직', '010-4567-8901', 4),
  ('MP24120', '성치원', '일반', 'V007', 'CG', '2024-08-01', '재직', 2700000, 0, 200000, 0, 0, '3.3%', '정규직', '010-5678-9012', 4),
  ('MPA18', '김우진', '일반', 'V000', 'W', '2025-12-01', '재직', 0, 72000, 0, 0, 0, '미신고', '알바', '010-6789-0123', 0),
  ('MP25180', '김서연', '일반', 'V013', 'F', '2025-11-20', '재직', 0, 140000, 0, 0, 0, '3.3%', '정규직', '010-7890-1234', 3),
  ('MP22050', '정대영', '센터장', 'V007', 'C', '2022-04-01', '퇴사', 3200000, 0, 200000, 150000, 0, '4대보험', '정규직', '010-8901-2345', 0);

-- 퇴사일 업데이트
UPDATE public.employees SET resign_date = '2025-12-31' WHERE emp_no = 'MP22050';
