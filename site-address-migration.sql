-- ═══════════════════════════════════════════════════════
-- ME.PARK ERP — site_details 주소 + 좌표 컬럼 추가
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════

ALTER TABLE site_details ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE site_details ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE site_details ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- 확인
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'site_details' ORDER BY ordinal_position;
