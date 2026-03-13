-- ============================================================
-- 급여내역서(Payslip) 테이블 설정
-- 미팍ERP v8.4 — 급여내역서 발송 기능
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 1. payslips 테이블 생성
CREATE TABLE IF NOT EXISTS payslips (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 기간
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL,
  
  -- 직원 연결
  employee_id     UUID NOT NULL REFERENCES employees(id),
  emp_no          TEXT,                          -- 사번 (조회용 캐시)
  emp_name        TEXT,                          -- 이름 (조회용 캐시)
  site_code       TEXT,                          -- 사업장코드
  
  -- 급여 항목 (payroll_records에서 복사)
  basic_pay       INTEGER DEFAULT 0,
  meal            INTEGER DEFAULT 0,
  childcare       INTEGER DEFAULT 0,
  car_allow       INTEGER DEFAULT 0,
  team_allow      INTEGER DEFAULT 0,
  holiday_bonus   INTEGER DEFAULT 0,
  incentive       INTEGER DEFAULT 0,
  extra_work      INTEGER DEFAULT 0,
  manual_write    INTEGER DEFAULT 0,
  extra1          INTEGER DEFAULT 0,
  gross_pay       INTEGER DEFAULT 0,             -- 지급 합계
  
  -- 공제 항목
  tax_type        TEXT DEFAULT '4대보험',
  np              INTEGER DEFAULT 0,             -- 국민연금
  hi              INTEGER DEFAULT 0,             -- 건강보험
  lt              INTEGER DEFAULT 0,             -- 장기요양
  ei              INTEGER DEFAULT 0,             -- 고용보험
  income_tax      INTEGER DEFAULT 0,             -- 소득세
  local_tax       INTEGER DEFAULT 0,             -- 지방소득세
  accident_deduct INTEGER DEFAULT 0,             -- 사고공제
  prepaid         INTEGER DEFAULT 0,             -- 선지급
  total_deduct    INTEGER DEFAULT 0,             -- 공제 합계
  net_pay         INTEGER DEFAULT 0,             -- 실수령액
  
  -- 계좌 정보 (은행이체용)
  bank_name       TEXT,
  account_no      TEXT,
  account_holder  TEXT,
  
  -- 발송/조회 상태
  status          TEXT DEFAULT 'sent',           -- sent / read
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,                   -- 최초 열람 시각
  sent_at         TIMESTAMPTZ DEFAULT NOW(),     -- 발송 시각
  sent_by         UUID,                          -- 발송자 (admin)
  
  -- 메모
  memo            TEXT,
  
  -- 메타
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  -- 중복 방지: 같은 직원+같은 월 1건만
  UNIQUE(employee_id, year, month)
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(year, month);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON payslips(is_read);

-- 3. RLS 정책
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- 관리자: 전체 접근
CREATE POLICY "Admin full access on payslips" ON payslips
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_payslips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payslips_updated_at
  BEFORE UPDATE ON payslips
  FOR EACH ROW
  EXECUTE FUNCTION update_payslips_updated_at();

-- ============================================================
-- 완료! ERP에서 급여내역서 발송 → Field 앱에서 조회 가능
-- ============================================================
