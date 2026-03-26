-- ═══════════════════════════════════════════════════════════
-- 미팍ERP v10.0 — 현금흐름표 DB 셋업
-- Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════════

-- 1. cashflow_items (현금유입/유출/카드 통합)
CREATE TABLE cashflow_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month           TEXT NOT NULL,                -- '2026-03'
  flow_type       TEXT NOT NULL CHECK (flow_type IN ('inflow','outflow','card_in','card_out')),
  cost_group      TEXT NOT NULL CHECK (cost_group IN ('fixed','fixed_prepaid','variable_prepaid','variable')),
  account_label   TEXT,                         -- 계정과목 (상품매출/보험/통신비/급여 등)
  vendor          TEXT,                         -- 거래처/범주 (미니쉬/네이버/모모빌딩 등)
  target_person   TEXT,                         -- 선지급 대상자 (최훈/이지섭 등)
  week_no         INTEGER,                      -- 주차 (선지급 1~5)
  expected_day    INTEGER,                      -- 매월 예정일 (1~31)
  expected_amount NUMERIC DEFAULT 0,            -- 예상금액
  actual_date     DATE,                         -- 실제 입금/지급일
  actual_amount   NUMERIC DEFAULT 0,            -- 실제금액
  memo            TEXT,                         -- 비고
  sort_order      INTEGER DEFAULT 0,            -- 표시 순서
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cf_month ON cashflow_items(month);
CREATE INDEX idx_cf_flow ON cashflow_items(flow_type);

ALTER TABLE cashflow_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access cashflow_items"
  ON cashflow_items FOR ALL USING (auth.role() = 'authenticated');

-- 2. cashflow_balances (전월이월 관리)
CREATE TABLE cashflow_balances (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month           TEXT NOT NULL UNIQUE,          -- '2026-03'
  balance_062     NUMERIC DEFAULT 0,             -- 하나은행(062) 이월잔액
  balance_928     NUMERIC DEFAULT 0,             -- 국민은행(928) 이월잔액
  card_balance    NUMERIC DEFAULT 0,             -- 법인카드 잔액
  memo            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cashflow_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access cashflow_balances"
  ON cashflow_balances FOR ALL USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════
-- 아래는 clobe.ai 관련 테이블 삭제 (P1 완료 후 실행)
-- ⚠️ 기존 데이터가 필요하면 백업 먼저 실행:
--   CREATE TABLE backup_financial_transactions AS SELECT * FROM financial_transactions;
--   CREATE TABLE backup_monthly_summary AS SELECT * FROM monthly_summary;
-- ═══════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS financial_transactions CASCADE;
-- DROP TABLE IF EXISTS monthly_summary CASCADE;
-- DROP FUNCTION IF EXISTS refresh_monthly_summary(TEXT);
