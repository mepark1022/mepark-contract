-- ═══════════════════════════════════════════════════════
-- ME.PARK 계약서 이력 관리 — contracts 테이블 생성
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════

CREATE TABLE public.contracts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id     UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  emp_no          TEXT NOT NULL,
  emp_name        TEXT NOT NULL,

  -- 계약 유형/상태
  contract_type   TEXT NOT NULL DEFAULT 'weekday',   -- weekday / weekend / mixed / parttime
  status          TEXT NOT NULL DEFAULT '작성중' CHECK (status IN ('작성중', '확정', '만료', '갱신')),

  -- 계약 기간
  start_date      DATE NOT NULL,
  end_date        DATE,

  -- 근무 조건
  work_site       TEXT,
  work_start      TEXT,
  work_end        TEXT,
  break_min       INTEGER DEFAULT 60,
  work_days       TEXT,

  -- 급여
  total_salary    INTEGER DEFAULT 0,
  base_salary     INTEGER DEFAULT 0,
  weekend_daily   INTEGER DEFAULT 0,
  meal_allow      INTEGER DEFAULT 0,
  leader_allow    INTEGER DEFAULT 0,
  pay_day         INTEGER DEFAULT 10,

  -- 시간 산출
  basic_hours     NUMERIC(8,2) DEFAULT 0,
  annual_hours    NUMERIC(8,2) DEFAULT 0,
  overtime_hours  NUMERIC(8,2) DEFAULT 0,
  holiday_hours   NUMERIC(8,2) DEFAULT 0,

  -- 수습
  probation       BOOLEAN DEFAULT FALSE,
  probation_months INTEGER DEFAULT 0,

  -- 특약/메모
  special_terms   TEXT,
  memo            TEXT,

  -- 조항 데이터 (JSON)
  articles        JSONB,

  -- 메타
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_contracts_employee ON public.contracts(employee_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_contracts_date ON public.contracts(start_date DESC);

-- RLS 활성화
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- 로그인한 사용자 모두 조회 가능
CREATE POLICY "contracts_select" ON public.contracts FOR SELECT
  TO authenticated USING (true);

-- admin 이상만 추가/수정/삭제
CREATE POLICY "contracts_insert" ON public.contracts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "contracts_update" ON public.contracts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "contracts_delete" ON public.contracts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );
