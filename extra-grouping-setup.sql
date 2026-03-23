-- =====================================================
-- v9.4 추가근무 그룹핑 + 행사자동감지 — SQL 마이그레이션
-- Supabase Dashboard → SQL Editor에서 실행
-- =====================================================

-- 1) site_extra_types 테이블에 4컬럼 추가
ALTER TABLE site_extra_types ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT NULL;
ALTER TABLE site_extra_types ADD COLUMN IF NOT EXISTS includes_meal BOOLEAN DEFAULT false;
ALTER TABLE site_extra_types ADD COLUMN IF NOT EXISTS min_participants INTEGER DEFAULT NULL;
ALTER TABLE site_extra_types ADD COLUMN IF NOT EXISTS meal_per_person INTEGER DEFAULT NULL;

-- 2) daily_report_staff 테이블에 출퇴근 시간 2컬럼 추가
ALTER TABLE daily_report_staff ADD COLUMN IF NOT EXISTS check_in TEXT DEFAULT NULL;
ALTER TABLE daily_report_staff ADD COLUMN IF NOT EXISTS check_out TEXT DEFAULT NULL;

-- 완료 확인
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'site_extra_types'
  AND column_name IN ('group_name', 'includes_meal', 'min_participants', 'meal_per_person')
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'daily_report_staff'
  AND column_name IN ('check_in', 'check_out')
ORDER BY ordinal_position;
