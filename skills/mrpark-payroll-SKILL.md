---
name: mrpark-payroll
description: (주)미스터팍 미팍ERP_SYSTEM 급여대장 모듈 스킬 (v8.2). 현장 엑셀 2종(12월 급여대장 + 1월 인원현황) 실물 분석 기반 설계. employees 테이블 확장 + payroll 3테이블(payroll_months/records/daily) + 인원현황 Import 파서 + 근무 캘린더 UI + 4대보험 5종 자동계산 + 은행 이체 목록 자동 생성 + 해안용 엑셀 Export. "급여", "급여대장", "payroll", "월급", "인건비 계산", "4대보험", "이체 목록", "근무 캘린더", "인원현황 import", "급여 확정", "공제", "근태", "해안용", "급여명세서" 등을 언급하면 이 스킬을 사용한다.
---

# 미팍ERP 급여대장 모듈 스킬 (v8.2)

## 1. 모듈 개요

| 항목 | 값 |
|------|-----|
| **시스템** | 미팍ERP_SYSTEM — 수익성 분석 섹션 내 [💰 급여대장] |
| **분석 소스** | 2025년 12월 급여대장(해안발송_2차) + 2026년 1월 인원및고객사현황 |
| **인원 규모** | 총 150명 (재직 70 + 퇴사 80) / 15개 사업장 / 10개 시트 |
| **핵심 발견** | 엑셀 2계층(인원현황마스터 → 매장별근무현황) = ERP 2테이블(employees → payroll_records) |
| **스택** | React + Vite + Supabase (기존 ERP와 동일) |

## 2. 핵심 설계 원칙

### 엑셀 2계층 → ERP 직접 매핑
```
인원현황 시트 (마스터DB, 55컬럼)
  └─ VLOOKUP → 매장별근무현황 (월별 급여계산)
  └─ XLOOKUP → 성명으로 사번 자동 조회

↕ 완전 일치 구조

employees 테이블 (확장)
  └─ FK → payroll_records (월별 급여 레코드)
         └─ FK → payroll_daily (일별 근무코드)
```

### 개발 전 반드시 확인할 것
- **현재 App.jsx 기준**: GitHub `mepark1022/mepark-contract` 최신 커밋
- **인라인 스타일만 사용**: Tailwind 금지
- **NumInput 패턴 유지**: `type="number"` 사용 금지 (입력 리셋 버그)
- **MeParkDatePicker**: 날짜 입력은 기존 커스텀 달력 컴포넌트 사용

## 3. DB 스키마

### employees 테이블 확장 컬럼 (ALTER TABLE)

```sql
-- 인사정보
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_type2 TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS combined_code TEXT;

-- 급여조건
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekday_pay INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekend_pay INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_allowance INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS holiday_bonus INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS meal INTEGER DEFAULT 200000;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS childcare INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS car_allowance INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS incentive INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS extra1 INTEGER DEFAULT 0;

-- 세금정보
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_type TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_enroll_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_loss_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporter_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporter_rrn TEXT;

-- 계좌정보 (★ 이체 자동화 핵심)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_holder TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_third_party_payment BOOLEAN DEFAULT false;
```

### 신규 3테이블

```sql
CREATE TABLE IF NOT EXISTS payroll_months (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT DEFAULT 'draft',      -- draft / confirmed / locked
  total_gross NUMERIC DEFAULT 0,
  total_net NUMERIC DEFAULT 0,
  closed_at TIMESTAMPTZ,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month_id UUID REFERENCES payroll_months(id),
  employee_id UUID REFERENCES employees(id),
  site_code TEXT, work_type TEXT,
  basic_pay INTEGER DEFAULT 0, meal INTEGER DEFAULT 0,
  childcare INTEGER DEFAULT 0, car_allow INTEGER DEFAULT 0,
  team_allow INTEGER DEFAULT 0, holiday_bonus INTEGER DEFAULT 0,
  incentive INTEGER DEFAULT 0, extra_work INTEGER DEFAULT 0,
  manual_write INTEGER DEFAULT 0, extra1 INTEGER DEFAULT 0,
  gross_pay INTEGER DEFAULT 0,
  accident_deduct INTEGER DEFAULT 0, prepaid INTEGER DEFAULT 0,
  tax_type TEXT,
  np INTEGER DEFAULT 0, hi INTEGER DEFAULT 0,
  ei INTEGER DEFAULT 0, lt INTEGER DEFAULT 0,
  income_tax INTEGER DEFAULT 0, local_tax INTEGER DEFAULT 0,
  net_pay INTEGER DEFAULT 0,
  reporter_name TEXT, reporter_rrn TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID REFERENCES payroll_records(id),
  day INTEGER NOT NULL,  -- 1~31
  work_code TEXT,
  memo TEXT
);

-- RLS
ALTER TABLE payroll_months  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_daily   ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_months  ON payroll_months  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY p_records ON payroll_records FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY p_daily   ON payroll_daily   FOR ALL USING (auth.role() = 'authenticated');
```

## 4. 사번 체계 (4패턴)

| 유형 | 형식 | 예시 | 인원 |
|------|------|------|------|
| 운영팀(본사) | MP + 입사년도(2) + 001~100 | MP17001 | 4명 |
| 현장 근무자 | MP + 입사년도(2) + 101~999 | MP24127 | 120명 |
| 타인신고자 | 근무자사번 + '-' + 숫자 | MP24127-1 | 3명 |
| 알바 | MPA + 순번(1~100) | MPA18 | 23명 |

## 5. 세금 처리방식 5종 자동계산

| 처리방식 | 계산 로직 |
|----------|-----------|
| 4대보험 | 국민연금(4.5%) + 건강보험(3.545%) + 장기요양(×12.95%) + 고용보험(0.9%) + 소득세(간이세액표) |
| 0.033 (3.3%) | (기본급+수당) × 3.3% |
| 3.30% (타인신고) | 3.3% 동일 + reporter_name/rrn 자동 표시 |
| 고용&산재 | 고용보험(0.9%) + 산재(수기) |
| 신고X | 공제 없음 (net = gross) |

## 6. 화면 구조 (5개)

### 6-1. 급여대장 목록
- 월 선택 (MeParkDatePicker)
- 상태 배지: 🟡 작성중 / 🟢 확정 / 🔒 잠금
- KPI 카드 4개: 총인원 / 급여총계 / 실입금합계 / 공제합계
- [전체] + V001~V016 사업장 탭
- 직원 테이블: # / 사번 / 성명 / 근무형태 / 기본급 / 식대 / 수당계 / 공제계 / 실입금 / [편집]
- **[급여 확정]** → `site_revenue.labor_fixed` 자동 업데이트

### 6-2. 직원 급여 편집 (3탭 슬라이드 패널)
- **Tab 1 📅 근무 캘린더**: 31일 그리드, 근무코드 드롭다운, 일별 payroll_daily 저장
- **Tab 2 💰 급여 계산**: 고정급(employees 자동로드) + 변동급, 총계 실시간
- **Tab 3 📊 공제 내역**: 처리방식 선택 → 자동계산, 실입금 실시간

### 6-3. 인원현황 Import (Phase A 선행)
- 인원_및_고객사_현황 엑셀 → 인원현황 시트 자동 파싱
- 사번 기반 Upsert (UPDATE or INSERT)
- Preview → 확인 → 적용
- 퇴사자: is_active = false 자동 처리

### 6-4. 급여 집계 요약
- 사업장별 합계 테이블
- 전월 대비 증감
- [급여 확정] → site_revenue.labor_fixed + monthly_summary.total_labor 갱신

### 6-5. 은행 이체 목록 + Export
- 예금주 / 은행명 / 계좌번호 / 이체금액 자동 생성
- 타인입금 자동 감지 (성명 ≠ 예금주 → ⚠ 배지)
- 해안용 포맷 엑셀 Export (기존 88컬럼 양식 재생성)

## 7. 핵심 코드 패턴

### 급여 계산 함수 (세금처리방식별)
```jsx
function calcPayroll(record) {
  const taxable = record.basic_pay + record.meal + record.team_allow
    + record.holiday_bonus + record.incentive + record.extra_work + record.manual_write;

  let np=0, hi=0, lt=0, ei=0, income_tax=0, local_tax=0;

  if (record.tax_type === '4대보험') {
    np = Math.round(Math.min(taxable, 6170000) * 0.045);
    hi = Math.round(taxable * 0.03545);
    lt = Math.round(hi * 0.1295);
    ei = Math.round(taxable * 0.009);
    income_tax = getIncomeTax(taxable - np - hi - lt - ei);
    local_tax = Math.round(income_tax * 0.1);
  } else if (record.tax_type === '0.033') {
    income_tax = Math.round(taxable * 0.03);
    local_tax = Math.round(taxable * 0.003);
  }
  // 고용&산재, 신고X 등...

  const tot_ded = np + hi + lt + ei + income_tax + local_tax
    + record.accident_deduct + record.prepaid;
  const net_pay = taxable - tot_ded;
  return { np, hi, lt, ei, income_tax, local_tax, net_pay };
}
```

### 인원현황 Import 컬럼 매핑 (핵심)
```javascript
// Col 번호 → employees 컬럼 매핑 (실물 분석 기준)
const COLUMN_MAP = {
  1:  'employee_number',   // 사번 (UPSERT key)
  2:  'name',              // 성명
  3:  'resident_number',   // 주민번호
  7:  'site_code',         // 근무처코드(1)
  11: 'work_type',         // 근무형태1
  29: 'weekday_pay',       // 평일수당
  30: 'weekend_pay',       // 주말수당
  33: 'meal',              // 식대
  34: 'childcare',         // 보육수당
  35: 'car_allowance',     // 자가운전
  36: 'incentive',         // 인센티브
  40: 'tax_type',          // 신고여부
  45: 'account_holder',    // 예금주 ★
  46: 'bank_name',         // 은행명 ★
  47: 'account_number',    // 계좌번호 ★
  24: 'is_active',         // 퇴사여부 ('퇴사' → false)
};
```

### [급여 확정] 버튼 핸들러
```jsx
async function handleConfirmPayroll(monthId, year, month) {
  // 1. 사업장별 합산
  const bysite = groupBySite(payrollRecords);

  // 2. site_revenue.labor_fixed 자동 업데이트
  for (const [siteCode, total] of Object.entries(bysite)) {
    await supabase.from('site_revenue')
      .upsert({ site_code: siteCode, month: `${year}-${String(month).padStart(2,'0')}`,
                labor_fixed: total },
               { onConflict: 'site_code,month' });
  }

  // 3. payroll_months 상태 confirmed로 변경
  await supabase.from('payroll_months')
    .update({ status: 'confirmed', closed_at: new Date() })
    .eq('id', monthId);
}
```

## 8. 변수 스코핑 (ERP 전역 충돌 방지)

```
// 견적시스템 변수와 충돌 방지
급여대장 전용: PY_  접두사 사용
  PY_WEEKS = 4.345
  PY_MIN_WAGE = 10320
  pyFmt = (n) => ...
  calcPyRecord = (record) => ...
```

## 9. Phase 개발 순서

| Phase | 내용 | 선행 |
|-------|------|------|
| A-SQL | Supabase ALTER TABLE + 3테이블 생성 (SQL Editor) | - |
| A-Import | 인원현황 파서 (데이터Import 화면 확장) | A-SQL |
| B-UI | 급여 목록 + 편집 패널 (3탭) | A |
| B-마이그레이션 | 12월 엑셀 → payroll_records 이관 | B-UI |
| C-집계 | 사업장별 합계 + labor_fixed 연동 | B |
| C-이체 | 은행 이체 목록 생성 | C |
| D-Export | 해안용 엑셀 + 급여명세서 출력 | C |

## 10. 연동 테이블

| 급여 테이블 | 기존 테이블 | 연동 타이밍 |
|-------------|-------------|-------------|
| payroll_records.extra_work | daily_report_extra 합산 | 월 급여 생성 시 |
| payroll_months 확정 | site_revenue.labor_fixed | [급여 확정] 클릭 시 |
| payroll_months 확정 | monthly_summary.total_labor | [급여 확정] 클릭 시 |
| payroll_daily.work_code | daily_reports confirm 시 자동 생성 | 일보 confirm 시 |

## 11. 참조 파일

| 파일 | 위치 |
|------|------|
| 통합 기획서 | `docs/미팍ERP_급여대장모듈_통합기획서_v8.2.docx` |
| 현장 일보 기획서 | `docs/미팍ERP_현장일보모듈_기획서_v8.3.docx` |
| 브랜드 가이드 | 프로젝트 파일 `mrpark-output.md` |
| ERP 메인 스킬 | 프로젝트 파일 `mrpark-contract-skill-v8_0.md` |
| 소스코드 기준 | GitHub `mepark1022/mepark-contract` App.jsx |
