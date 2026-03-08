-- ═══════════════════════════════════════════════════════
-- ME.PARK ERP — 월주차 관리 테이블
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS monthly_parking (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_code       TEXT NOT NULL,               -- V001~V016
  car_number      TEXT NOT NULL,               -- 차량번호
  customer_name   TEXT,                        -- 고객명
  phone           TEXT,                        -- 연락처
  contract_start  DATE,                        -- 계약 시작일
  contract_end    DATE,                        -- 계약 종료일
  monthly_fee     NUMERIC DEFAULT 0,           -- 월 주차비
  memo            TEXT,
  status          TEXT DEFAULT '계약중',        -- 계약중 / 만료
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE monthly_parking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users on monthly_parking" ON monthly_parking
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_mp_site ON monthly_parking(site_code);
CREATE INDEX IF NOT EXISTS idx_mp_status ON monthly_parking(status);
