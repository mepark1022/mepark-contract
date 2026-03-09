-- ============================================================
-- 미팍ERP 현장 일보 모듈 DB 스키마 (v8.3)
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  site_code TEXT NOT NULL,
  reporter_id UUID REFERENCES employees(id),
  valet_count INTEGER DEFAULT 0,
  valet_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'submitted',
  confirmed_by UUID REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  memo TEXT,
  UNIQUE(report_date, site_code)
);

CREATE TABLE IF NOT EXISTS daily_report_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  name_raw TEXT,
  staff_type TEXT DEFAULT 'regular',
  work_hours NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_report_payment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  amount INTEGER DEFAULT 0,
  memo TEXT
);

CREATE TABLE IF NOT EXISTS daily_report_extra (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  extra_type TEXT DEFAULT 'overtime',
  extra_hours NUMERIC DEFAULT 0,
  extra_amount INTEGER DEFAULT 0,
  memo TEXT,
  synced_to_payroll BOOLEAN DEFAULT false
);

ALTER TABLE site_revenue ADD COLUMN IF NOT EXISTS valet_fee INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS site_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'manager';

ALTER TABLE daily_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_staff   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_extra   ENABLE ROW LEVEL SECURITY;

CREATE POLICY dr_auth   ON daily_reports        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY drs_auth  ON daily_report_staff   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY drp_auth  ON daily_report_payment FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY dre_auth  ON daily_report_extra   FOR ALL USING (auth.role() = 'authenticated');
