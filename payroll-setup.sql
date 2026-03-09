-- ============================================================
-- 미팍ERP 급여대장 모듈 DB 스키마 (v8.2)
-- 실행 순서: 1) ALTER employees → 2) payroll 3테이블
-- ============================================================

-- [STEP 1] employees 테이블 컬럼 확장
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_type2 TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS combined_code TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekday_pay INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekend_pay INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_allowance INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS holiday_bonus INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS meal INTEGER DEFAULT 200000;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS childcare INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS car_allowance INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS incentive INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS extra1 INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_type TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_enroll_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_loss_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporter_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporter_rrn TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_holder TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_third_party_payment BOOLEAN DEFAULT false;

-- [STEP 2] payroll 3테이블
CREATE TABLE IF NOT EXISTS payroll_months (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT DEFAULT 'draft',
  total_gross NUMERIC DEFAULT 0,
  total_net NUMERIC DEFAULT 0,
  closed_at TIMESTAMPTZ,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month_id UUID REFERENCES payroll_months(id),
  employee_id UUID REFERENCES employees(id),
  site_code TEXT, work_type TEXT,
  basic_pay INTEGER DEFAULT 0, meal INTEGER DEFAULT 0,
  childcare INTEGER DEFAULT 0, car_allow INTEGER DEFAULT 0,
  team_allow INTEGER DEFAULT 0, holiday_bonus INTEGER DEFAULT 0,
  incentive INTEGER DEFAULT 0, extra_work INTEGER DEFAULT 0,
  manual_write INTEGER DEFAULT 0, extra1 INTEGER DEFAULT 0,
  gross_pay INTEGER DEFAULT 0,
  accident_deduct INTEGER DEFAULT 0, prepaid INTEGER DEFAULT 0,
  tax_type TEXT,
  np INTEGER DEFAULT 0, hi INTEGER DEFAULT 0,
  ei INTEGER DEFAULT 0, lt INTEGER DEFAULT 0,
  income_tax INTEGER DEFAULT 0, local_tax INTEGER DEFAULT 0,
  net_pay INTEGER DEFAULT 0,
  reporter_name TEXT, reporter_rrn TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES payroll_records(id),
  day INTEGER NOT NULL,
  work_code TEXT,
  memo TEXT
);

ALTER TABLE payroll_months  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_daily   ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_months  ON payroll_months  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY p_records ON payroll_records FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY p_daily   ON payroll_daily   FOR ALL USING (auth.role() = 'authenticated');
