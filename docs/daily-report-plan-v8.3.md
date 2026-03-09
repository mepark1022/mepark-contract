# 미팍ERP 현장 일보 모듈 기획서 (v8.3)

> TimeTree → 미팍ERP 완전 내재화 | 현장 입력 → 4방향 자동 연동

## 1. 개요

| 항목 | 내용 |
|------|------|
| **현재 방식** | 각 사업장 근무자가 퇴근 전 TimeTree 앱에 근무자/매출/추가수당 수기 입력 |
| **핵심 문제** | 월별 통계 없음 / 급여 자동 반영 안됨 / 매출 데이터 정리 불편 / PC 접근 불편 |
| **목표** | 동일한 모바일 입력 경험 유지 + 4방향 ERP 자동 연동으로 수작업 완전 제거 |

### 4방향 자동 연동 흐름

```
현장 일보 입력 1번
  ├─ [연동①] 발렛비         → site_revenue.valet_fee    (수익성분석 자동 반영)
  ├─ [연동②] 추가수당       → payroll_records.extra_work (급여대장 자동 반영)
  ├─ [연동③] 근무자 목록    → payroll_daily.work_code   (근태 자동 집계)
  └─ [연동④] 결제수단 건수  → monthly_summary           (매출통계 자동 집계)
```

## 2. TimeTree vs 미팍ERP 비교

| 항목 | TimeTree (현재) | 미팍ERP 일보 (목표) |
|------|----------------|-------------------|
| 입력 방식 | 모바일 캘린더 텍스트 수기 | 모바일 최적화 전용 UI |
| 월별 통계 | ❌ 없음 | ✅ 자동 집계 + 차트 |
| 급여 연동 | ❌ 없음 | ✅ 추가근무 자동 반영 |
| 매출 연동 | ❌ 없음 | ✅ 발렛비 자동 누적 |
| 근태 연동 | ❌ 없음 | ✅ payroll_daily 자동 생성 |
| 미제출 감지 | ❌ 없음 | ✅ 미제출 알림 + 대시보드 |

## 3. DB 설계 — 신규 4테이블

```sql
-- 일보 헤더
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  site_code TEXT NOT NULL,
  reporter_id UUID REFERENCES employees(id),
  valet_count INTEGER DEFAULT 0,
  valet_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'submitted',   -- submitted / confirmed
  confirmed_by UUID REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  memo TEXT,
  UNIQUE(report_date, site_code)
);

-- 당일 근무자
CREATE TABLE IF NOT EXISTS daily_report_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  name_raw TEXT,
  staff_type TEXT DEFAULT 'regular',  -- regular / substitute / support
  work_hours NUMERIC DEFAULT 0
);

-- 결제수단별 매출
CREATE TABLE IF NOT EXISTS daily_report_payment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,  -- card / transfer / free / unknown / cash
  count INTEGER DEFAULT 0,
  amount INTEGER DEFAULT 0,
  memo TEXT
);

-- 추가수당
CREATE TABLE IF NOT EXISTS daily_report_extra (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  extra_type TEXT DEFAULT 'overtime',  -- overtime / support / bonus / deduct
  extra_hours NUMERIC DEFAULT 0,
  extra_amount INTEGER DEFAULT 0,
  memo TEXT,
  synced_to_payroll BOOLEAN DEFAULT false
);

-- site_revenue 발렛비 컬럼 추가
ALTER TABLE site_revenue ADD COLUMN IF NOT EXISTS valet_fee INTEGER DEFAULT 0;

-- profiles 현장 계정용 컬럼
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS site_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'manager';

-- RLS
ALTER TABLE daily_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_staff   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_extra   ENABLE ROW LEVEL SECURITY;
```

## 4. 화면 구성

### 4-1. 현장 입력 화면 (모바일 최적화)

| 영역 | 내용 |
|------|------|
| ① 헤더 | 사업장 자동표시 + 날짜 (기본값: 오늘) |
| ② 근무자 | 해당 사업장 재직자 드롭다운, 정규/대체/지원 구분 |
| ③ 매출 | 대수 + 금액 숫자 패드 |
| ④ 결제수단 | 카드/이체/프리/미확인 카운터(+/-), 합계 자동 검증 |
| ⑤ 추가수당 | 직원 선택 + 유형 + 금액, 복수 추가 가능 |
| ⑥ 메모 | 특이사항 자유 입력 |
| ⑦ 제출 | 요약 확인 모달 → [📤 마감 제출] → 4방향 연동 실행 |

### 4-2. 관리자 대시보드

- KPI 스트립: 제출완료 N개 / 미제출 N개 / 오늘 총 대수 / 오늘 총 매출
- 미제출 알림 카드 (빨간 배지, 대리 입력 가능)
- 일보 목록: 날짜/사업장/상태 필터 + [확인/수정]
- 우측 슬라이드 패널: 근무자 + 결제수단 + 추가수당 상세
- 월별 사업장별 통계 차트 (Recharts)

## 5. 계정 체계 (현장 계정 추가)

| 역할 | 설명 | 접근 가능 |
|------|------|-----------|
| super_admin | 대표/본사 관리자 | 전체 ERP |
| manager | 운영팀 담당자 | 전체 (일보 확인 포함) |
| field_leader | 현장 팀장 | 일보 입력 + 해당 사업장 조회 |
| field_staff | 현장 근무자 | 일보 입력만 |

## 6. 개발 로드맵 (Phase A~C)

| Phase | 내용 | 기간 |
|-------|------|------|
| A | 입력 UI + DB 4테이블 + 발렛비 자동연동(연동①) + 현장 계정 발급 | 4~5일 |
| B | 관리자 대시보드 + 미제출 알림 + 결제수단 통계(연동④) + 근태 자동 연동(연동③) | 3~4일 |
| C | 추가수당 → 급여대장 자동 반영(연동②) + 비용입력 발렛비 자동화 | 2~3일 |

## 7. Before / After — 월말 마감 업무 변화

| 업무 | 현재 소요시간 | ERP v8.3 후 |
|------|-------------|------------|
| 발렛비 집계 → 비용입력 (16사업장) | 30~60분 | **0분** (자동 누적) |
| 추가수당 → 급여 반영 | 30분+ | **0분** (자동 populate) |
| 근태 확인 → 급여 캘린더 | 매달 반복 | **0분** (confirm 시 자동) |
| 월 매출 통계 정리 | 별도 엑셀 | **0분** (자동 집계+차트) |
| 결제수단별 분석 | 불가능 | 즉시 확인 가능 |
