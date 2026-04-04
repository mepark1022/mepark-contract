-- ============================================================
-- v11 P4: 급여내역서에 임금분해 + 근무일수 컬럼 추가
-- Supabase SQL Editor에서 수동 실행
-- ============================================================
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS work_type TEXT;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS work_days INTEGER DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS wage_breakdown JSONB;
-- wage_breakdown 구조:
-- {
--   "weekday": { "basic": 기본급, "annual": 연차, "overtime": 연장, "holiday": 공휴, "hourly_rate": 통상시급, "total_pay": 월급여 },
--   "weekend": { "basic": 기본급, "overtime": 연장, "weekly_hol": 주휴, "holiday": 공휴, "hourly_rate": 통상시급, "daily_pay": 일당, "work_days": 근무일수 }
-- }
