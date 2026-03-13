-- ═══════════════════════════════════════════════════════════
-- 근태현황 테이블: attendance_records
-- 현장일보(daily_reports) 자동반영 + 수동 편집 지원
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS attendance_records (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  att_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT '출근',   -- 출근/추가/지각/결근/휴무/연차
  memo            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, att_date)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance_records(att_date);
CREATE INDEX IF NOT EXISTS idx_att_emp ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendance_records(employee_id, att_date);

-- RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access attendance" ON attendance_records
  FOR ALL USING (auth.role() = 'authenticated');

-- 확인
SELECT 'attendance_records 테이블 생성 완료' AS result;
