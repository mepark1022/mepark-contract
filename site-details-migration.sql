-- ═══════════════════════════════════════════════════════
-- ME.PARK ERP v8.1 — site_details 테이블 site_name 컬럼 추가
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════

-- 사업장 추가 기능에서 사업장명을 저장하기 위한 컬럼
ALTER TABLE site_details ADD COLUMN IF NOT EXISTS site_name TEXT;

-- 확인
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'site_details' ORDER BY ordinal_position;
