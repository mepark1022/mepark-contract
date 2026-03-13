-- ================================================
-- 근태기록 테이블 (attendance_records)
-- 미팍ERP v8.5 — 전체캘린더(근태확인용)
-- Supabase Dashboard → SQL Editor에서 실행
-- ================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS attendance_records (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  att_date     TEXT NOT NULL,            -- "2026-03-13"
  status       TEXT NOT NULL DEFAULT '출근',  -- 출근/지각/결근/휴무/연차
  memo         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, att_date)
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance_records(att_date);
CREATE INDEX IF NOT EXISTS idx_att_emp ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendance_records(employee_id, att_date);

-- 3. RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attendance_records' AND policyname = 'att_auth_all'
  ) THEN
    CREATE POLICY att_auth_all ON attendance_records FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_att_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_att_updated ON attendance_records;
CREATE TRIGGER trg_att_updated
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_att_timestamp();
