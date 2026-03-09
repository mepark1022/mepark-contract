-- ============================================================
-- 미팍ERP 현장 일보 모듈 DB 스키마 (v8.3)
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 1. 메인 테이블: 일보 (날짜+사업장 단위)
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  site_code TEXT NOT NULL,
  reporter_id UUID REFERENCES employees(id),
  valet_count INTEGER DEFAULT 0,
  valet_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'submitted',       -- submitted | confirmed
  confirmed_by UUID REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  memo TEXT,
  UNIQUE(report_date, site_code)
);

-- 2. 근무자 목록
CREATE TABLE IF NOT EXISTS daily_report_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  name_raw TEXT,
  staff_type TEXT DEFAULT 'regular',     -- regular | extra | temp
  work_hours NUMERIC DEFAULT 0
);

-- 3. 결제수단별 매출
CREATE TABLE IF NOT EXISTS daily_report_payment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,            -- cash | card | transfer | etc
  count INTEGER DEFAULT 0,
  amount INTEGER DEFAULT 0,
  memo TEXT
);

-- 4. 추가수당 (연장/야간/휴일)
CREATE TABLE IF NOT EXISTS daily_report_extra (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  extra_type TEXT DEFAULT 'overtime',    -- overtime | night | holiday | other
  extra_hours NUMERIC DEFAULT 0,
  extra_amount INTEGER DEFAULT 0,
  memo TEXT,
  synced_to_payroll BOOLEAN DEFAULT false
);

-- 5. 기존 테이블 컬럼 추가 (IF NOT EXISTS로 안전)
ALTER TABLE site_revenue ADD COLUMN IF NOT EXISTS valet_fee INTEGER DEFAULT 0;
ALTER TABLE site_details ADD COLUMN IF NOT EXISTS valet_rate INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS site_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'manager';

-- 6. 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_dr_date_site ON daily_reports(report_date, site_code);
CREATE INDEX IF NOT EXISTS idx_dr_status ON daily_reports(status);
CREATE INDEX IF NOT EXISTS idx_drs_report ON daily_report_staff(report_id);
CREATE INDEX IF NOT EXISTS idx_drp_report ON daily_report_payment(report_id);
CREATE INDEX IF NOT EXISTS idx_dre_report ON daily_report_extra(report_id);
CREATE INDEX IF NOT EXISTS idx_dre_employee ON daily_report_extra(employee_id);

-- 7. RLS 정책
ALTER TABLE daily_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_staff   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_extra   ENABLE ROW LEVEL SECURITY;

-- RLS: 인증된 사용자 전체 접근 (관리자 전용 앱)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dr_auth') THEN
    CREATE POLICY dr_auth ON daily_reports FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'drs_auth') THEN
    CREATE POLICY drs_auth ON daily_report_staff FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'drp_auth') THEN
    CREATE POLICY drp_auth ON daily_report_payment FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dre_auth') THEN
    CREATE POLICY dre_auth ON daily_report_extra FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
