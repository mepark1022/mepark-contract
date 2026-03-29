---
name: mrpark-contract
description: (주)미스터팍 미팍ERP_SYSTEM 통합 스킬 (v10.1). 4개 섹션 21개 화면: [HR&계약관리] HR대시보드(12KPI+Recharts차트)/직원현황(계정관리통합+수습뱃지+퇴직관리탭)/계약이력/조항변경, [수익성분석] 분석대시보드/사업장PL/비용입력(6탭:매출+계약+간접비+현금유입+현금유출+카드)/급여대장(은행이체+급여내역서)/월주차관리/발렛비관리/비교분석/배부설정, [사업장현황] 사업장관리/현장일보/마감보고현황/근태현황/전체캘린더, [견적계산기] 인건비견적. "계약서", "근로계약서", "직원현황", "사번관리", "사번중복", "동명이인", "contract", "임금테이블", "수습", "수습뱃지", "수습만료", "계약이력", "퇴직관리", "퇴직금", "퇴사사유", "수익성", "사업장 분석", "PL", "손익", "간접비 배부", "매출 분석", "대시보드", "사업장 관리", "월주차", "주차", "견적서", "발렛 견적", "인건비", "현금흐름", "현금유입", "현금유출", "카드", "급여대장", "은행이체", "급여내역서", "payslip", "현장일보", "일보", "마감보고", "근태", "캘린더", "출결", "전화번호", "로그인", "연락처", "선택발송", "근태분석", "이상감지", "사업장삭제", "사업장명변경", "피크근무", "지원근무", "타사업장", "발렛비관리", "발렛비캘린더", "입퇴사추이", "근무유형" 등을 언급하면 이 스킬을 사용한다.
---

# 미팍ERP_SYSTEM 통합 스킬 (v10.1)

## 1. 개요

(주)미스터팍의 HR + 수익성분석 + 사업장현황 + 현금흐름 + 견적을 통합한 React(JSX) 기반 ERP 웹앱.
4개 메뉴 섹션, 메인대시보드(HR+수익+현금흐름 KPI), **총 21개 화면**.
별도 현장 앱(mepark-field)으로 현장직원 일보 제출 + 급여내역서 조회.

| 항목 | 값 |
|------|-----|
| **시스템명** | 미팍ERP_SYSTEM (ME.PARK ERP) |
| **GitHub (ERP)** | `mepark1022/mepark-contract` → `mepark-contract.vercel.app` |
| **GitHub (현장앱)** | `mepark1022/mepark-field` → 별도 도메인 |
| **GitHub (견적)** | `mepark1022/mr.park_salary` → `mr-park-salary.vercel.app` |
| **Supabase** | `rtmdvzavbatzjqaoltfd.supabase.co` |
| **슈퍼관리자** | `mepark1022@gmail.com` |
| **스택** | React + Vite (인라인 스타일, Tailwind 미사용) |
| **폰트** | Noto Sans KR (Google Fonts) |
| **DB** | Supabase (Auth + PostgreSQL + RLS + Storage + Edge Functions) |
| **패키지** | xlsx, docx, file-saver, recharts |
| **소스코드** | `App.jsx` (~16,596줄) |
| **최신 커밋** | `3224211` (2026.03.30) |

수정·확장 시 반드시 **현재 배포된 GitHub App.jsx**를 기반으로 작업할 것.

## 2. 브랜드 가이드

| 항목 | 값 |
|------|-----|
| Primary (다크네이비) | `#1428A0` — 헤더, 제목, 섹션 배경 |
| Gold (골드) | `#F5B731` — 강조, CTA, 구분선, 메인대시보드 활성 |
| Dark | `#222222` — 본문 텍스트 |
| Gray | `#666666` — 보조 텍스트 |
| LightGray | `#E8E8E8` — 배경, 줄무늬 행 |
| Error (레드) | `#E53935` — 경고, 퇴사, 적자 |
| Success (그린) | `#43A047` — 재직, 완료, 흑자 |
| Orange | `#E97132` — 주말 계약서, 수습 알림, 인건비, 지원근무 |
| Blue | `#156082` — 보조 차트 |
| SkyBlue | `#0F9ED5` — 복합 카테고리 |

> 상세 브랜드 가이드: 프로젝트 파일 `mrpark-design-output.md` 참조

## 3. 전체 화면 구조 (v10.1)

### 사이드바 4섹션 (아코디언, 페이지 변경 시 해당 섹션 자동 펼침)

```
🏠 메인 대시보드          ← 최상위, 골드 활성화 (기본)
─────────────────
● HR & 계약관리
  📊 HR 대시보드
  👥 직원현황               ← 계정관리 통합 (일괄생성/수정/다운/삭제/내비밀번호)
  📋 계약 이력
  ⚙️ 계약서 조항변경         ← super_admin/admin만
─────────────────
● 수익성 분석
  📊 분석대시보드
  🏢 사업장 PL
  ✏️ 비용 입력              ← 6탭: 매출+계약현황+간접비+현금유입+현금유출+카드
  💰 급여대장               ← 3탭: 급여대장/은행이체/급여내역서
  🅿️ 월주차 관리
  🎫 발렛비 관리             ← v9.5 신규
  📈 비교 분석
  ⚙️ 배부 설정
─────────────────
● 사업장 현황
  🏢 사업장 관리
  📋 현장 일보              ← 크루: 이것만 표시
  📊 마감보고현황
  📅 근태현황
  📆 전체 캘린더
─────────────────
● 견적 계산기
  📋 인건비 견적
─────────────────
● 관리 (super_admin/admin만)
  🐛 오류 보고
```

> ⚠️ v10.0 변경: `📥 데이터 Import` 메뉴 삭제 (clobe.ai Import 백지화 → 현금흐름표로 대체)

### 역할별 메뉴 가시성 (4역할)
| 역할 | 접근 가능 |
|------|----------|
| `super_admin` | 전체 화면 |
| `admin` | 전체 (조항변경 제외) |
| `crew` | 현장일보만 (사이드바 사업장현황에 현장일보 1개만 표시) |
| `field_member` | ERP 접근 불가 → 마감앱(mepark-field)만 사용 |

## 4. DB 구조 (Supabase) — 17개 테이블

### 기존 핵심 테이블
| 테이블 | 용도 |
|--------|------|
| `profiles` | 관리자 프로필 (Supabase Auth 연동, role/site_code/emp_no) |
| `invitations` | 관리자 초대 (레거시) |
| `employees` | 직원 마스터 데이터 (~150명, phone/bank/salary + v10.1 퇴직관리 5컬럼) |
| `contracts` | 계약서 데이터 (4종) |

### 수익·현금흐름 테이블
| 테이블 | 용도 |
|--------|------|
| `cashflow_items` | ★ v10.0 현금유입/유출/카드 통합 (month별 CRUD) |
| `cashflow_balances` | ★ v10.0 전월이월 잔액 (월별 UNIQUE, 하나/국민/카드 3필드) |
| `site_revenue` | 사업장 매출 + 발렛비(`valet_fee`) + 인건비고정/대체 |
| `site_overhead` | 간접비 14항목 — 수기입력 |
| `site_details` | 사업장 상세정보 (시작일/만기일/월계약금/계약서파일) |
| `site_parking` | 외부주차장 사용현황 |
| `monthly_parking` | 월주차 계약 (차량번호/고객명/연락처/계약기간/월주차비) |

### 현장일보 테이블 (v8.3)
| 테이블 | 용도 |
|--------|------|
| `daily_reports` | 일보 마스터 (날짜/사업장/상태/메모) |
| `daily_report_staff` | 근무인원 상세 (직원별 출근/퇴근/역할) |
| `daily_report_payment` | 결제 수단별 매출 (카드/현금/발렛비) |
| `daily_report_extra` | 추가항목 (사진첨부 등) |

### 급여 테이블 (v8.2)
| 테이블 | 용도 |
|--------|------|
| `payroll_records` | 월별 급여 레코드 (직원별 기본급/수당/공제/실지급) |
| `payslips` | 급여내역서 발송 (employee_id+year+month UNIQUE, is_read 조회상태) |

### ⚠️ 폐기/미사용 테이블
| 테이블 | 상태 |
|--------|------|
| `financial_transactions` | v10.0에서 미사용 (clobe.ai Import 백지화, Supabase에 잔존 가능) |
| `monthly_summary` | v10.0에서 미사용 (동상) |

### Storage
| 버킷 | 용도 |
|------|------|
| `site-contracts` | 사업장 계약서 파일 (PDF/DOC/HWP, 10MB) |
| `daily-report-images` | 현장일보 사진첨부 |

### Edge Functions
| 함수 | 용도 |
|------|------|
| `admin-api` (v6) | 계정관리 (create_user, ban_user, reset_password, unban_user, bulk_create_field, field_login, phone_login) |

> ⚠️ Edge Function은 GitHub 푸시로 자동 배포되지 않음 — Supabase Dashboard에서 수동 배포 필요
> ⚠️ employees 테이블 컬럼명: `status` ("재직"/"퇴사"), NOT `is_active` — Edge Function에서 퇴사자 차단 시 `emp.status === "퇴사"` 사용

### v10.1 DB 변경 — employees 테이블 5컬럼 ALTER (`docs/hr-v101-setup.sql`)
```sql
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resign_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resign_reason TEXT;       -- 자진퇴사/권고사직/계약만료/기타
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resign_detail TEXT;       -- 자유 텍스트
ALTER TABLE employees ADD COLUMN IF NOT EXISTS severance_amount NUMERIC DEFAULT 0; -- 퇴직금 확정액
ALTER TABLE employees ADD COLUMN IF NOT EXISTS final_pay_date DATE;     -- 최종 급여 지급일
```

## 5. 현금흐름표 시스템 (v10.0 핵심)

### 5-1. 개요
clobe.ai Import 방식을 백지화(P1, 759줄 삭제)하고, 수기 입력 기반 **현금흐름표**로 전면 교체.
비용입력 화면에 3탭 추가 (현금유입/현금유출/카드) → 총 6탭 구성.

### 5-2. DB 스키마

#### `cashflow_items` (현금유입/유출/카드 통합)
```sql
CREATE TABLE cashflow_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month           TEXT NOT NULL,                -- '2026-03'
  flow_type       TEXT NOT NULL,                -- 'inflow' / 'outflow' / 'card'
  cost_group      TEXT NOT NULL,                -- 'fixed' / 'fixed_prepaid' / 'variable_prepaid' / 'variable' / 'billing'(카드정산)
  account_label   TEXT,                         -- 계정과목 (상품매출/보험/통신비/급여 등)
  vendor          TEXT,                         -- 거래처/범주
  target_person   TEXT,                         -- 선지급 대상자
  week_no         INTEGER,                      -- 주차 (선지급 1~5)
  expected_day    INTEGER,                      -- 매월 예정일 (1~31)
  expected_amount NUMERIC DEFAULT 0,            -- 예상금액
  actual_date     DATE,                         -- 실제 입금/지급일
  actual_amount   NUMERIC DEFAULT 0,            -- 실제금액
  memo            TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

> ⚠️ `flow_type` 실제 사용값: `"inflow"`, `"outflow"`, `"card"` (SQL CHECK 제약과 다름 — 코드 기준)
> ⚠️ 카드 구분: `cost_group === "billing"` → 카드정산, 그 외 → 카드결제

#### `cashflow_balances` (전월이월 잔액)
```sql
CREATE TABLE cashflow_balances (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month           TEXT NOT NULL UNIQUE,
  balance_062     NUMERIC DEFAULT 0,             -- 기업자유예금(062) 이월잔액
  balance_928     NUMERIC DEFAULT 0,             -- 주거래통장(928) 이월잔액
  card_balance    NUMERIC DEFAULT 0,             -- 법인카드 잔액
  memo            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5-3. 상태 관리 (MainApp)
```javascript
const [cashflowItems, setCashflowItems] = useState({});     // { "2026-03": [...items] }
const [cashflowBalances, setCashflowBalances] = useState({}); // { "2026-03": { balance_062, balance_928, card_balance } }

const loadCashflow = async () => { /* cashflow_items + cashflow_balances 전체 로드 → month별 맵 */ };
const saveCashflowItem = useCallback(async (item) => { /* upsert: id있으면 update, 없으면 insert+select */ });
const deleteCashflowItem = useCallback(async (id) => { /* delete by id */ });
const saveCashflowBalance = useCallback(async (month, field, value) => { /* upsert on month conflict */ });
```

### 5-4. 비용입력 6탭 구조
| 탭 키 | 아이콘+이름 | 내용 |
|--------|-------------|------|
| `revenue` | 💰 사업장 매출 | 기존 — 16사업장 × 월계약금/발렛비/월주차/인건비 |
| `contract` | 📄 계약현황 | 기존 — 사업장별 계약 상태 |
| `overhead` | 🏢 간접비 | 기존 — 14항목 + 간접비↔현금유출 연동(P7) |
| `inflow` | 📈 현금유입 | ★ v10 — 계정과목/거래처/예상일/예상금액/실제일/실제금액/상태판정 |
| `outflow` | 📉 현금유출 | ★ v10 — 비용구분드롭다운+대상자/주차+상태판정(지급완료/미지급/일부지급)+KPI+소계뱃지 |
| `card` | 💳 카드 | ★ v10 — 카드결제/카드정산 서브뷰+KPI+카드사별소계+상태판정 |

### 5-5. 현금흐름 요약패널 (P6)
현금유입/현금유출/카드 탭 활성화 시 상단에 자동 표시:
- 4블록 KPI: 현금유입(실제/예상+상태) / 현금유출 / 카드결제 / 순현금흐름(흑자/적자)
- 유입 vs 유출 비율 바
- 항목 건수 요약 (유입/유출/카드결제/카드정산)
- 전월이월 표시 + Excel Export 버튼

### 5-6. 비용구분 (cost_group)
| 코드 | 표시명 | 용도 |
|------|--------|------|
| `fixed` | 고정비 | 유입/유출 공통 |
| `fixed_prepaid` | 고정(선지급) | 유출 — 선지급 대상자/주차 입력 가능 |
| `variable_prepaid` | 변동(선지급) | 유출 — 동상 |
| `variable` | 변동비 | 유입/유출 공통 |
| `billing` | 카드정산 | 카드 탭 전용 (카드정산 서브뷰) |

### 5-7. 상태판정 로직
```javascript
// 공통 상태 판정 함수
const flowStatus = (actual, expected, doneLabel, partLabel, noneLabel) => {
  if (act <= 0 && exp > 0) return { label: noneLabel, color: C.error };
  if (exp > 0 && act < exp) return { label: partLabel, color: C.orange };
  if (exp > 0 && act >= exp) return { label: doneLabel, color: C.success };
  return { label: "—", color: C.gray };
};

// 유입: 입금완료 / 일부입금 / 미입금
// 유출: 지급완료 / 일부지급 / 미지급
// 카드정산: 정산완료 / 일부정산 / 미정산
```

### 5-8. 간접비↔현금유출 연동 (P7)
- 간접비 탭 상단에 `📊 현금유출 연동` 배너
- 현금유출 항목의 `account_label`과 간접비 14항목 키워드 매칭
- "가져오기" 버튼 → 매칭된 간접비 금액을 현금유출 실제금액으로 덮어쓰기
- 현금흐름 컬럼 추가 (간접비 행에 매칭된 현금유출 금액 + 차이 표시)

### 5-9. 대시보드 연결 (P8)
- **가용자금 KPI**: `전월이월(062+928) + 현금유입실제 - 현금유출실제 - 카드결제`
- **현금흐름 차트**: Recharts ComposedChart (월별 유입Bar + 유출Bar + 잔액Line)
- 기간탭: 이번달/3개월/6개월/12개월/YTD

### 5-10. 이전달 복사 (P9)
- 비용입력 "📋 이전달 복사" 버튼에 현금흐름 항목+잔액 포함
- 복사 규칙: 예상금액 유지, 실제금액/실제일 초기화
- 현재월에 데이터 존재 시 "덮어쓰기" 확인 모달

### 5-11. Excel Export (P10)
4시트 구성:
1. **요약**: 전월이월 + 현금유입/유출/카드 예상vs실제 + 순현금흐름
2. **현금유입**: 전 항목 (No/계정과목/거래처/예상일/예상금액/실제일/실제금액/상태)
3. **현금유출**: 비용구분별 소계 포함 (고정비/고정선지급/변동선지급/변동비)
4. **카드**: 카드결제 + 카드정산 소계 분리, 카드사별 매핑(KB→KB국민 등)

## 6. 메인 대시보드

### 레이아웃 구조
```
┌─ 기간선택 (해당월/주간/월간/분기/연간) ────────────┐
├─ A. 핵심 지표 5컬럼 ───────────────────────────────┤
│ 재직인원 │ 총매출 │ 영업이익 │ 가용자금 │ 인건비율  │
├─────────┬──────────────────────────────────────────┤
│ 수익구조 │                                         │
│ 사업장현황│      현금흐름 차트 (Recharts)             │
│ 재무현황 │      기간탭: 이번달/3개월/6개월/12개월/YTD │
├─────────┴──────────────────────────────────────────┤
│ ⚠️ 수습 만료 임박 배너 (v10.1 P7)                   │
│ P&L 테이블 (10열 + 합계 + 평균)                     │
├────────────────────────────────────────────────────┤
│ ⚠️ 월주차 만기 D-7 알림                             │
│ 업장별 매출 카드 (발렛비 + 월주차 뱃지)              │
└────────────────────────────────────────────────────┘
```

### 수습 만료 알림 배너 (v10.1)
- 수습만료 ±7일 이내 직원 자동 감지 (`probation_months` + `hire_date` 기준)
- 카드형 경고: D-day(빨강/주황) + 이름 + 사업장 + 종료일
- HR 대시보드 바로가기 링크

### 가용자금 KPI 계산 (v10.0)
```javascript
const prevBalance = toNum(bal.balance_062) + toNum(bal.balance_928);
const inflowAct = mi.filter(it => it.flow_type === "inflow").reduce(sum actual_amount);
const outflowAct = mi.filter(it => it.flow_type === "outflow").reduce(sum actual_amount);
const cardAct = mi.filter(it => it.flow_type === "card" && it.cost_group !== "billing").reduce(sum expected_amount);
const availableFund = prevBalance + inflowAct - outflowAct - cardAct;
```

## 7. HR & 계약관리 (4개 화면)

### HR 대시보드 (Dashboard) — v10.1 전면 개편
- **12 KPI 스트립** (6×2 grid, borderTop 컬러 구분):
  1. 👥 총 재직 (navy) — 전체 N명
  2. 📥 이달 입사 (green/gray) — 해당월
  3. 📤 이달 퇴직 (red/gray) — 해당월
  4. 📅 평일 근무 (navy) — A~D/AP~DP
  5. 🗓 주말 근무 (orange) — E~G/EP~GP
  6. 🔄 복합 근무 (skyblue) — AE·CG·CPF 등
  7. 🕐 알바 (gray) — W코드
  8. ⏳ 수습 중 (orange) — 만료 8일+ 남음
  9. ⚠️ 수습 만료임박 (red/gray) — ±7일 이내
  10. 💰 월 고정급 (green) — 재직자 합계 (억/천만 단위)
  11. 🏢 운영 사업장 (navy) — 재직자 기준 개수
  12. 🔴 이달 퇴사율 (red/gray) — 퇴사/전체 %
- **수습 만료 임박 알림** (probExpiring): ±7일 이내 직원 카드 (D-day + 이름 + 사업장 + 종료일)
- **사업장별 인원표**: 코드별 평일/주말/복합/알바/계 테이블 + 합계행
- **퇴사 현황**: 퇴사사유 분포 (resign_reason별 카운트)
- **Recharts 차트 2종** (v10.1 P6):
  - `BarChart` 입퇴사 추이 (최근 12개월, 입사=navy / 퇴사=orange)
  - `PieChart` 근무유형 도넛 (평일/주말/복합/알바, innerRadius=50 outerRadius=80)
- **recharts import 확장**: `BarChart, Cell, Legend, PieChart, Pie` 추가

### 직원현황 (EmployeeRoster) — v10.1 통합
- **테이블 10열**: 사번 | 이름 | 직위 | 사업장 | 근무형태 | 기본급 | 일당 | 계정 | 상태 | 액션
  - v10.1: 이름셀에 **수습 뱃지** (`수습중 D-X` 주황 / `수습만료 D-X` 빨강 / `수습종료` 주황)
  - v10.1: 상태셀에 퇴사자의 **퇴사사유 + 퇴사일** 자동 표시
- **6탭 상세 패널** (슬라이드 오버): 기본정보 / 급여조건 / 계정관리 / 계약이력 / 문서 / **🚪 퇴직관리 (v10.1)**
- **계정관리 통합** (AdminInvitePanel 873줄 삭제):
  - 일괄 계정 생성 (Excel Import → Edge Function bulk_create_field)
  - 개별 계정 생성/수정/삭제/정지/해제
  - 비밀번호 규칙: `mp` + 전화번호 뒤 4자리 (자동 생성, 6자 이상)
  - 계정 없는 직원 다운로드 + 필터 + 테이블 컬럼
- **필터 6종**: 사업장 / 유형 / 재직상태 / 계정상태 / 역할 / 검색
- **employees 필드**: emp_no, name, position, site_code_1, work_code, base_salary, weekend_daily, phone, bank_name, bank_account, bank_holder, tax_type, employment_type, probation_months, resign_date, resign_reason, resign_detail, severance_amount, final_pay_date, etc.

### 수습뱃지 헬퍼 — `getProbInfo(e)` (v10.1 F2)
```javascript
// probation_months + hire_date → 수습종료일 계산 → D-day
// d < -7: 표시 안 함 (수습 완전 종료)
// d < 0: "수습종료" (주황, 만료 후 7일 이내)
// d <= 7: "수습만료 D-X" (빨강, 임박)
// d > 7: "수습중 D-X" (주황)
```

### 퇴직관리 탭 (v10.1 F3 — 직원상세 6번째 탭)
- **퇴직금 자동 계산**: `1일평균임금 × 30 × (재직일수 / 365)`
  - 1일평균임금 = (base_salary + meal_allow + leader_allow) / 30
  - 재직 1년 미만 시 "미발생" 표시
- **편집 필드**: 상태(재직/퇴사) / 퇴사일 / 퇴사사유(드롭다운: 자진퇴사/권고사직/계약만료/기타) / 최종급여지급일 / 상세사유(텍스트) / 퇴직금(NumInput)
- **계산액 vs 입력액 차이** 실시간 표시 + "계산액 적용" 원클릭 버튼
- 저장 시 `employees` 테이블 resign_* + severance_amount + final_pay_date 업데이트

### 사번 관리 강화 (v10.1 F4)
- **실시간 중복 체크**: 사번 입력 즉시 employees 테이블 대조 → 빨간 테두리 + "❌ 이미 사용 중 — {이름}" 표시
- **동명이인 경고**: 이름 입력 시 → 주황 테두리 + "⚠️ 동명이인 N명 — 사번(사업장)" 목록
- **사번 형식 힌트**: `MPA숫자` → "✅ 알바 사번", `MP6자리(≤100)` → "✅ 운영팀", `MP6자리(>100)` → "✅ 현장", 그 외 → "⚠️ 형식 확인"

### 사번 체계
| 구분 | 형식 | 예시 |
|------|------|------|
| 운영팀(본사) | MP + 연도(2) + 순번(001~100) | MP17001 |
| 현장 근무자 | MP + 연도(2) + 순번(101~999) | MP24110 |
| 알바 | MPA + 순번(1~100) | MPA1 |
| 타인신고자 | 근무자사번 + "-" + 숫자 | MP24127-1 |

### 거래처(사업장) 코드 — 17개 기본 + 추가 가능
V000 기획운영팀(본사, isHQ), V001~V016 현장

### 근무형태 코드 — 23가지
평일(A~D, AP~DP), 주말(E~G, EP~GP), 복합(AE,CF,CG,CPF,FPG), 알바(W), 기타(X,Y,Z)

### 계약서 4종 (ContractWriter)
| 유형 | 대상 | 급여 | 조항 |
|------|------|------|------|
| 평일제 | A~D, AP~DP | 월급 | 11조 |
| 주말제 | E~G, EP~GP | 일당 | 10조 |
| 복합근무 | AE, CG, CPF 등 | 월급+일당 | 11조+주말일당 |
| 알바 | W | 일당/시급 | 8조 |

### 임금테이블 (제7조) — 포괄임금 산출
기본급 + 연차수당 + 연장수당 + 공휴수당 = 월급 (정확 일치 보정)

## 8. 수익성 분석 (8개 화면)

### 분석대시보드 (전체 요약)
KPI 5개 + 수익구조바 + P&L 테이블 + 본사귀속 차감

### 사업장 PL
사업장 선택 → PL 카드 4개 + 인원 테이블 + 간접비 상세

### 비용 입력 → DB 자동 저장 (6탭)
- **매출탭**: 16사업장 × 컬럼(코드|사업장|월계약금(자동)|발렛비(입력)|월주차(자동)|인원|인건비고정(파랑)|인건비대체(골드)|이익률)
- **계약현황탭**: 사업장별 계약 상태
- **간접비탭**: 14항목 × NumInput → `site_overhead` upsert + 현금유출 연동 배너(P7)
- **현금유입탭**: ★ v10 — cashflow_items (flow_type="inflow") CRUD + KPI + 상태판정
- **현금유출탭**: ★ v10 — cashflow_items (flow_type="outflow") CRUD + 비용구분소계 + 상태판정
- **카드탭**: ★ v10 — cashflow_items (flow_type="card") + 카드결제/카드정산 서브뷰 + 카드사별소계
- 저장: 800ms debounce, "💾 저장 중..." → "✅ DB 저장 완료"
- 이전달 복사 → 기존 데이터 + 현금흐름 항목+잔액 일괄 복사

### 급여대장 (PayrollPage) — v9.3
3탭 구성:
- **급여대장**: 월별 급여 계산 + Excel Import/Export (급여명세 + 은행이체목록 + 사업장별집계 3시트)
- **은행이체**: 은행이체 뷰 + 타인입금 자동감지 + 계좌미등록 경고 + KPI 4개
- **급여내역서**: pyRecords 기반 전체 목록 + 체크박스 선택발송 + 발송상태/열람상태 뱃지
  - `psSelectedIds` (Set): 체크박스 기반 직원 선택
  - `handleSendPayslips("selected")`: 선택 발송 / `handleSendPayslips("all")`: 전체 발송
  - `buildSlip(r)`: payroll_records → payslips 변환 헬퍼
  - KPI 4카드: 급여대상 / 발송완료 / 미발송 / 열람확인

### 🅿️ 월주차 관리
- CRUD: 사업장/차량번호/고객명/연락처/계약기간/월주차비/메모
- D-day 컬러: 7일↓ 빨강, 30일↓ 주황, 그외 초록

### 🎫 발렛비 관리 (v9.5)
- 발렛비 캘린더 + 업장 필터 (발렛비 있는 업장만/전체 토글)
- 발렛비 미확정 KPI카드 클릭 → 모달 목록 + 현장일보 바로가기

### 비교 분석
정렬 4종 + 매출vs이익 바차트 + 인건비 도넛

### 배부 설정
14항목 × 4종 배부방식 (매출비중/인원비중/사업장수/본사귀속)

### 간접비 14항목 (기본값)
hq_salary, severance, misc_wage, welfare, insurance, commission, ad, vehicle, tax_local, rent, telecom, tax_duty, supplies, travel

## 9. 사업장 현황 (5개 화면)

### 사업장 관리 (SiteManagementPage) — v9.4
- 좌: 사업장 카드 그리드 (기본16개 + DB 추가분 병합)
  - 카드 KPI: 월계약금 + **평일인원**(employees 실시간) + **주말인원**(employees 실시간) + 총인원 뱃지
  - `activeSiteEmps`: employees 테이블에서 `getWorkCat()` 기반 평일/주말/복합/알바 자동 카운트
- 우: 상세 관리 (기본정보 + 계약서 업로드/뷰어/삭제 + 외부주차장 CRUD)
- **사업장명 변경**: 모든 사업장(기본+커스텀) 이름 변경 가능, 800ms debounce 자동저장
  - `_refreshGlobalSites()`: DB `site_name` → 기본 사업장 이름도 덮어쓰기
  - 카드/패널: `siteDetails[code]?.site_name || site.name` (DB 우선)
- **사업장 삭제**: 모든 사업장 삭제 가능
  - 기본 사업장(V001~V016): `site_details.site_name = "__HIDDEN__"` 숨김 마커 저장 → 카드 숨김
  - 커스텀 사업장: `site_details` + `site_parking` 완전 삭제
  - `hiddenSites` (Set): 숨김 사업장 관리, `allSites` 필터링
- **삭제 사업장 복구 UI**: 카드 그리드 하단 주황색 복구 박스
- 사업장 추가 기능 (커스텀 코드, `nextSiteCode` 자동 생성)

### 현장 일보 (DailyReportPage) — v8.3
- 일괄확정, Excel Export 3시트, 대시보드 연동
- 발렛비 단가 per-site (`site_revenue.valet_fee`)
- 사진첨부 (Supabase Storage `daily-report-images`), 중복방지, 결제수단 검증
- 캘린더 뷰 + 리스트 뷰 전환

### 마감보고현황 (ClosingReportPage) — v9.0
- 월별 사업장별 일보 제출 현황 테이블
- 확정/미확정/미제출 상태 색상 구분

### 근태현황 (AttendancePage) — v9.5
- `daily_reports` + `daily_report_staff` 기반
- 4탭 구조: 근태현황(status) / 개인분석(personal) / 사업장분석(site) / 이상감지(anomaly)
- **ATT_STATUSES 8종**: 출근/추가/피크/지원/지각/결근/휴무/연차
- **KPI 8개 스트립**: 표시인원/출근률/추가근무/피크/지원/추가수당합계/지각/결근/연차
- 캘린더뷰 / 카드뷰 / 추가근무뷰 전환
- **타사업장 지원근무 (v9.5)**:
  - `autoAttMap` → `{ autoAttMap, supportDetailMap }` 구조분해
  - `repSiteMap` (report_id→site_code) + `empSiteMap` (emp_id→site_code_1) 구축
  - 지원 판정: `staff_type='support'` OR 정규근무인데 `reportSite !== empSite` (타사업장 감지)
  - `supportDetailMap`: `{ "empId-date": { siteCode, siteName, checkIn, checkOut, memo } }`
  - 우선순위: 출근 > 피크 > 지원 > 추가
- **캘린더 테이블 (v9.4 컴팩트)**:
  - 이름 칸 1줄 (사번은 마우스오버 툴팁), 근무코드 뱃지 인라인
  - 날짜 셀 28px, 상태 1글자 단축 (출/추/지/결/연/피)
  - 우측 **8컬럼 인라인 유형별 횟수**: 평일/주말/추가/피크/지원/🔑/공휴/합계
  - 헤더에 해당월 일수 표시 (예: 평일 22일 / 주말 8일 / 공휴 1일 / 합계 31일)
  - **사업장별 소계행** (📌 주황색 배경, 인원수 표시)
- 공휴일 2026년 JSON 내장

### 전체 캘린더 (FullCalendarPage) — v9.0
- 전체/매장별/근무자별 3뷰
- 상태별 색상 (확정=초록/미확정=주황/미제출=빨강/공휴일=연빨강)
- 직접 구현 (라이브러리 미사용)

## 10. 견적 계산기

### 발렛맨 서비스 견적 시스템 (SalaryCalculatorPage)
`mr-park-salary.vercel.app` 원본 657줄 완전 이식 (QC 스코핑)

| 영역 | 내용 |
|------|------|
| 좌측 — 견적산출표 | ❶인건비(평일월급+주말일당+4대보험+퇴직충당금) ❷운영지원금(100~500만) ❸발렛보험비(50~200만) + 에누리(금액/%) |
| 우측 — 견적서 폼 | 정보입력(현장명/계약형태/기간/시간) → A4 미리보기 → 인쇄/PDF |
| 인쇄 | DOM clone → 인라인 스타일 축소 → 1페이지 출력 |

## 11. 현장 앱 (mepark-field) — 별도 레포

### 현재 구조 (App.jsx ~3,372줄)
| 화면 | 기능 |
|------|------|
| LoginPage | 전화번호(기본) + 사번 듀얼 로그인 (phone_login / field_login Edge Function) |
| HomePage | 현장일보 목록/제출/캘린더, 근무유형별 뱃지(피크/추가 등), 하단탭 |
| ReportFormPage | 일보 작성/수정 폼, 5탭 근무유형(해당매장/피크타임/본사지원/알바지원/비번투입), 행사자동감지 배너, 추가근무 아코디언 그룹 |
| PayslipPage | 급여내역서 조회 (payslips 테이블, is_read 상태) |

### 로그인 방식 (v9.2 — 전화번호 + 사번 듀얼)
- **전화번호 모드 (기본)**: 010-XXXX-XXXX 입력 → 11자리 완성 시 자동 로그인
  - Edge Function `phone_login`: phone → employees 조회 → 사번 매핑 → 비밀번호(`mp`+뒤4자리) 자동 생성 → signInWithPassword → 세션 반환
  - field_member 계정 미존재 시 자동 생성
  - 5회 실패 → 3분 잠금
- **사번 모드 (관리자/크루)**: 사번 → 4자리 PIN → Edge Function `field_login`
- crew 계정: `사번@mepark.internal` / field_member: `사번@field.mepark.internal`

## 12. 매출 데이터 관리 방침

```
업장별 매출 (수기입력 — 현재)
├─ 발렛비: 수익성분석 → 비용입력 (site_revenue.valet_fee)
├─ 월주차: 월주차관리 (monthly_parking)
├─ 현금흐름: 비용입력 → 현금유입/유출/카드 (cashflow_items)
└─ 간접비↔현금유출 연동 (account_label 매칭)

추후 발전
└─ 신용카드 매출 데이터 → 사업장별 자동 연동 계산
```

## 13. 핵심 코드 패턴

### 인라인 스타일
```jsx
const inputStyle = { width: "100%", padding: "8px 12px",
  border: "1.5px solid #D8DCE3", borderRadius: 8, fontSize: 13,
  background: "#fff", fontFamily: "'Noto Sans KR', sans-serif" };
```

### NumInput (숫자 전용 — type="number" 사용 금지)
```jsx
function NumInput({ value, onChange, style: st, ...rest }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(String(value ?? ""));
  // focused: raw text, unfocused: formatted value
}
```

### 숫자 포맷
```jsx
const fmt = (n) => (n == null || n === "" || isNaN(n)) ? "0" : Math.round(Number(n)).toLocaleString("ko-KR");
const toNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const pFmt = (n) => { /* 1억/1만 단위 간략 */ };
```

### 견적시스템 변수 스코핑 (충돌 방지)
```
ERP 전역: C, WEEKS 없음, fmt
견적시스템: QC, QC_WEEKS, qFmt
```

### 전화번호 → 비밀번호 변환
```jsx
const phoneToPass = (ph, empNo) => {
  const digits = ph.replace(/\D/g, "");
  if (digits.length >= 4) return "mp" + digits.slice(-4);  // mp + 뒤4자리
  return "mp" + empNo.replace(/\D/g, "").slice(-4).padStart(4, "0");  // fallback
};
```

### useConfirm — 확인 모달 (okLabel/okColor 지원)
```jsx
const confirm = useConfirm();
await confirm("삭제하시겠습니까?", "복구 불가능합니다.", { okLabel: "삭제", okColor: C.error });
await confirm("발송하시겠습니까?", "대상: 59명", { okLabel: "발송", okColor: C.navy });
await confirm("진행하시겠습니까?", "설명...");  // 기본: "확인" 네이비
```

### Named imports only
```jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
// ❌ React.useEffect() 사용 금지
```

### debounceSave 패턴 (현금흐름 항목 저장)
```jsx
debounceSave(`cf_${updated[idx].id || idx}_${field}`, () => saveCashflowItem({ ...updated[idx], [field]: value }));
```

## 14. 회사 고정 정보

```
상호: ㈜미스터팍 (Mr. Park Co., Ltd.)
대표: 이지섭
사업자등록번호: 102-88-01109
주소: 인천광역시 연수구 갯벌로 12, 인천테크노파크 갯벌타워 1501A,B호
전화: 1899-1871
```

## 15. 개발 이력

### v6.0 — MVP ✅
사업장 마스터 + 직원대장 + 계약서 2종 + 대시보드 + Supabase Auth

### v7.0~7.2 — 고도화 ✅
엑셀Import + Word출력 + 계약이력 + 복합/알바계약서 + 사직서 + 수익성분석 5화면 + 메인대시보드

### v8.0 — 재무 통합 ✅
clobe.ai Import + DB테이블 + 재무KPI + 현금흐름차트 + 비용입력 DB저장 + 사업장관리 + 월주차 + 견적시스템

### v8.1~8.2 — 급여대장 ✅
급여대장 3탭 (급여대장/은행이체/급여내역서) + Excel 3시트 Export + 인원현황 Import 확장 + 직원편집폼 3섹션 확장

### v8.3 — 현장일보 ✅
DailyReportPage + 4개 DB테이블 + 일괄확정 + Excel 3시트 + 사진첨부 + 대시보드 연동

### v9.0~9.1 — 3대 기능 + 사이드바 리뉴얼 ✅
- 사이드바 v9.1: 아코디언 4섹션, AdminInvitePanel 삭제
- 직원현황 통합: 5탭 상세패널, 필터 6종
- 마감보고현황 / 근태현황 / 전체 캘린더 / 급여내역서 발송

### v9.2 — 전화번호 로그인 ✅
- admin-api Edge Function v6: phone_login 액션
- mepark-field LoginPage: 전화번호/사번 듀얼 모드
- field_member 계정 자동 생성 + auth_id 동기화

### v9.3 — 근태분석 고도화 + 급여내역서 선택발송 ✅
- 근태현황 4탭: 근태현황/개인분석/사업장분석/이상감지
- 근태분석 종합 Excel Export 3시트
- 급여내역서 선택발송 + ConfirmProvider okLabel/okColor

### v9.4 — 근태캘린더 최적화 + 사업장관리 고도화 + 피크근무 ✅
- 피크근무 통합, 근태캘린더 유형별횟수 인라인, 컴팩트 최적화
- 사업장 이름변경/삭제/복구, 사업장카드 인원현황 연동

### v9.5 — 타사업장 지원근무 + 발렛비 관리 + 급여 고도화 ✅
- ATT_STATUSES 8종 (지원 추가), supportDetailMap, 캘린더 8컬럼
- 발렛비 관리 (캘린더+업장필터+미확정KPI+모달)
- 급여대장 전체뷰 확장 (접기/펼치기, sticky 3열, 합계행)
- 공제내역 인라인 편집 (펼치기→직접수정, 슬라이드패널 유지)

### v10.0 — 현금흐름표 통합 ✅
clobe.ai Import 방식 전면 폐기 → 수기 현금흐름표로 교체.

| Phase | 커밋 | 내용 |
|-------|------|------|
| **P1** | `2da7725` | clobe.ai Import 백지화 (코드 759줄 삭제) + cashflow-setup.sql |
| **P2** | — | cashflow_items + cashflow_balances 테이블 Supabase 생성 |
| **P3** | `209b1f6` | 현금유입 탭 UI (테이블+상태판정+CRUD+KPI스트립) |
| **P3-fix** | `26b424c` | loadSiteDetails 스코프 복원 (saveCashflowItem ReferenceError 수정) |
| **P4** | `51385fd` | 현금유출 탭 (비용구분드롭다운+대상자/주차+상태판정+KPI+소계뱃지) |
| **P5** | `e1b3aef` | 카드 탭 (카드결제/카드정산 서브뷰+KPI+카드사별소계+상태판정+합계행) |
| **P6** | `2982bb9` | 현금흐름 요약패널 (inflow/outflow/card 탭 상단 통합 서머리 4블록KPI+순현금흐름+비율바+건수요약) |
| **P7** | `398bb31` | 간접비↔현금유출 연동 (매칭배너+현금흐름컬럼+차이표시+동기화버튼) |
| **P8** | `4b4a5f2` | 대시보드 연결 (가용자금KPI+현금흐름차트 Recharts ComposedChart) |
| **P9** | `94725ab` | 이전달 복사 (현금흐름 항목+잔액 복사, 예상유지/실제초기화, 덮어쓰기확인) |
| **P10** | `f056559` | Excel Export 4시트 (요약/유입/유출/카드 + 상태판정+비용구분소계) |

### v10.1 — HR 고도화 ✅ (현재)
HR 대시보드 전면 개편 + 수습뱃지 + 퇴직관리 + 사번 강화 + Recharts 차트 + 메인대시보드 수습 알림.

| Phase | 커밋 | 내용 |
|-------|------|------|
| **P1** | `e569301` | DB 마이그레이션 — employees 5컬럼 ALTER (resign_reason/detail, severance_amount, final_pay_date) |
| **P2** | `5ebd8a9` | F2 수습 뱃지 + F3 퇴사사유 — 이름셀 수습중/만료임박 뱃지, 상태셀 퇴사사유/퇴사일 표시, 편집폼 resign 입력 |
| **P3** | `e3f1485` | F5 HR 대시보드 12KPI 스트립 + 사업장별 인원표 + 근무유형분포바 + 퇴사현황 |
| **P4** | `a95fb82` | F3 퇴직관리 탭 — 6번째 탭, 퇴직금 자동계산(1일평균임금×30×재직일수/365), 퇴사 alert 뱃지 |
| **P5** | `03247b9` | F4 사번 강화 — 실시간 중복체크(빨간 테두리+이름), 동명이인 경고(주황+사번/사업장), 형식 힌트 |
| **P6** | `ba60c83` | Recharts 차트 2종 — 입퇴사 추이 BarChart(12개월) + 근무유형 도넛 PieChart |
| **P7** | `3224211` | 메인대시보드 수습만료 D-7 알림 배너 — 수습 만료 ±7일 이내 직원 경고카드 + HR대시보드 바로가기 |

### Phase D — 미래
- [ ] AI 기능 Phase 1: 버튼형 AI 분석 (일보 요약, 근태 이상, 현금흐름 코멘터리)
- [ ] 은행 거래 → 사업장 자동 매칭 (거래처라벨 ↔ V코드)
- [ ] 신용카드 매출 → 사업장별 자동 연동
- [ ] 연간 결산 보고서
- [ ] 전자서명 연동 (모두싸인 Modusign API)

## 16. 참조 파일

### 프로젝트 파일
| 파일 | 용도 |
|------|------|
| `mrpark-design-output.md` | 브랜드 가이드 + 문서/PPT 생성 |
| `mepark-dashboard-v8-plan.md` | v8.0 재무 통합 설계서 (레거시 참조) |
| `salary-calculator-2026.jsx` | 인건비 계산기 원본 코드 |

### GitHub 내 기획서 (docs/)
| 파일 | 용도 |
|------|------|
| `cashflow-setup.sql` | ★ v10.0 현금흐름 DB 셋업 |
| `hr-v101-setup.sql` | ★ v10.1 HR고도화 DB 마이그레이션 (employees 5컬럼 ALTER) |
| `미팍ERP_3대기능_기획서.docx` | 근태현황+전체캘린더+급여내역서 기획 |
| `미팍ERP_급여대장모듈_통합기획서_v8.2.docx` | 급여대장 고도화 설계 |
| `미팍ERP_현장일보모듈_기획서_v8.3.docx` | 현장일보 모듈 설계 |
| `미팍ERP_전화번호로그인_기획서_v9.2.docx` | 전화번호 로그인 기획 |
| `미팍ERP_추가근무_그룹핑_행사자동감지_기획서_v9.4.docx` | 추가근무/행사감지 기획 |

### SQL 마이그레이션 (repo root + docs/)
`supabase-setup.sql`, `contracts-table.sql`, `site-management-setup.sql`, `monthly-parking-setup.sql`, `payroll-setup.sql`, `payslip-setup.sql`, `daily-report-setup.sql`, `attendance-setup.sql`, `extra-grouping-setup.sql`, `admin-rpc-functions.sql`, `docs/cashflow-setup.sql`, `docs/hr-v101-setup.sql`

### 스킬 파일 (skills/)
| 파일 | 용도 |
|------|------|
| `mrpark-contract-skill-v10.md` | 현재 스킬 (v10.1) |
| `mrpark-payroll-SKILL.md` | 급여대장 모듈 상세 스킬 |

수정·확장 시 현재 배포된 **GitHub 소스코드**를 기반으로 작업할 것.
