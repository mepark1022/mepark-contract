-- ═══════════════════════════════════════════════════
-- ME.PARK 근로계약서 관리 시스템 v6.0 마이그레이션
-- 복합근무/알바 계약서 지원을 위한 컬럼 추가
-- ═══════════════════════════════════════════════════

-- contracts 테이블에 주말 근무시간 컬럼 추가 (복합근무용)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS we_work_start TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS we_work_end TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS we_break_min INTEGER DEFAULT 60;
