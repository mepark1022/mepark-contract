-- ═══════════════════════════════════════════════════════════
-- 미팍ERP v10.1 HR고도화 — DB 마이그레이션
-- 작성일: 2026-03-30
-- 대상: employees 테이블 컬럼 5개 추가 (ALTER)
-- ═══════════════════════════════════════════════════════════

-- 1. 퇴사일 (기존 코드에서 이미 사용 중 — IF NOT EXISTS로 안전 추가)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS resign_date DATE;

-- 2. 퇴사 사유 (F3 퇴직관리 — 드롭다운: 자진퇴사/권고사직/계약만료/기타)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS resign_reason TEXT;

-- 3. 퇴사 상세 (F3 퇴직관리 — 자유 텍스트)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS resign_detail TEXT;

-- 4. 퇴직금 (F3 퇴직관리 — 자동 계산 후 확정 저장)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS severance_amount NUMERIC DEFAULT 0;

-- 5. 최종 급여 지급일 (F3 퇴직관리 — 퇴직금 + 잔여급여 지급일)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS final_pay_date DATE;

-- ───────────────────────────────────────────────────────────
-- 확인 쿼리 (실행 후 검증용)
-- ───────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'employees'
--   AND column_name IN ('resign_date','resign_reason','resign_detail','severance_amount','final_pay_date')
-- ORDER BY column_name;
