-- ═══════════════════════════════════════════════════════════
-- 미팍ERP v11.1 — P1 DB 마이그레이션
-- 직원현황 급여조건 재설계 + 임금명세서 계산식 통합
-- 실행: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ──────────────────────────────────────
-- 1. employees 테이블 — 평일 임금테이블 5컬럼
-- ──────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wd_basic NUMERIC DEFAULT 0;        -- 평일 기본급
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wd_annual NUMERIC DEFAULT 0;       -- 평일 연차수당
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wd_overtime NUMERIC DEFAULT 0;     -- 평일 연장수당
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wd_holiday NUMERIC DEFAULT 0;      -- 평일 공휴수당
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wd_hourly_rate NUMERIC DEFAULT 0;  -- 평일 통상시급

-- ──────────────────────────────────────
-- 2. employees 테이블 — 주말 임금테이블 5컬럼
-- ──────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS we_basic NUMERIC DEFAULT 0;        -- 주말 기본급
ALTER TABLE employees ADD COLUMN IF NOT EXISTS we_overtime NUMERIC DEFAULT 0;     -- 주말 연장수당
ALTER TABLE employees ADD COLUMN IF NOT EXISTS we_weekly_hol NUMERIC DEFAULT 0;   -- 주말 주휴수당
ALTER TABLE employees ADD COLUMN IF NOT EXISTS we_holiday NUMERIC DEFAULT 0;      -- 주말 공휴수당
ALTER TABLE employees ADD COLUMN IF NOT EXISTS we_hourly_rate NUMERIC DEFAULT 0;  -- 주말 통상시급

-- ──────────────────────────────────────
-- 3. payslips 테이블 — 계산방법/근로정보 필드
-- ──────────────────────────────────────
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS wage_breakdown JSONB;  -- 임금테이블 분해값
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS work_info JSONB;       -- 근로정보 (근로일수/시간/통상시급 등)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS memo TEXT;             -- 메모 (급여인상 이력 등)

-- ──────────────────────────────────────
-- 검증 쿼리
-- ──────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'employees'
  AND column_name IN ('wd_basic','wd_annual','wd_overtime','wd_holiday','wd_hourly_rate',
                       'we_basic','we_overtime','we_weekly_hol','we_holiday','we_hourly_rate')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payslips'
  AND column_name IN ('wage_breakdown','work_info','memo');
