-- ============================================================
-- v11.3: 주말제 급여대장 근무일수 컬럼 추가
-- Supabase SQL Editor에서 수동 실행
-- ============================================================
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS work_days INTEGER DEFAULT 0;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS work_days_auto BOOLEAN DEFAULT true;
-- work_days: 근무일수 (주말제/복합 주말부분)
-- work_days_auto: true=일보 자동카운트, false=관리자 수동입력 (SSOT 덮어쓰기 방지)
