-- ═══════════════════════════════════════════════════════
-- ME.PARK ERP v8.0 — 사업장 현황 관리 테이블
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════

-- 1. 사업장 상세정보
CREATE TABLE IF NOT EXISTS site_details (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_code           TEXT NOT NULL UNIQUE,         -- V001~V016
  start_date          DATE,                         -- 서비스 시작일
  contract_end_date   DATE,                         -- 계약 만기일
  monthly_contract    NUMERIC DEFAULT 0,            -- 월 계약금액
  contract_file_name  TEXT,                         -- 계약서 파일명
  contract_file_url   TEXT,                         -- 계약서 URL (Supabase Storage)
  memo                TEXT,                         -- 메모
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE site_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users on site_details" ON site_details
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. 외부주차장 사용현황
CREATE TABLE IF NOT EXISTS site_parking (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_code       TEXT NOT NULL,                   -- V001~V016
  parking_name    TEXT,                            -- 주차장 명칭
  address         TEXT,                            -- 주소
  amount          NUMERIC DEFAULT 0,              -- 월 금액
  manager_name    TEXT,                            -- 관리자 이름
  phone           TEXT,                            -- 관리자 연락처
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE site_parking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users on site_parking" ON site_parking
  FOR ALL USING (auth.role() = 'authenticated');

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_site_parking_code ON site_parking(site_code);

-- 3. Supabase Storage 버킷 (계약서 파일용)
-- Supabase Dashboard → Storage → New Bucket:
--   Name: site-contracts
--   Public: true (또는 authenticated만 접근)
--   File size limit: 10MB
--   Allowed MIME types: application/pdf, application/msword,
--     application/vnd.openxmlformats-officedocument.wordprocessingml.document
