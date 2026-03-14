---
name: mrpark-contract
description: (주)미스터팍 미팍ERP_SYSTEM 통합 스킬 (v9.2). 4개 섹션 22개 화면: [HR&계약관리] HR대시보드/직원현황(계정관리통합)/계약이력/조항변경, [수익성분석] 전체요약/사업장PL/비용입력/급여대장(은행이체+급여내역서)/월주차관리/비교분석/배부설정/데이터Import, [사업장현황] 사업장관리/현장일보/마감보고현황/근태현황/전체캘린더, [견적계산기] 인건비견적. "계약서", "근로계약서", "직원현황", "사번관리", "contract", "임금테이블", "수습", "계약이력", "수익성", "사업장 분석", "PL", "손익", "간접비 배부", "매출 분석", "대시보드", "사업장 관리", "월주차", "주차", "견적서", "발렛 견적", "인건비", "import", "현금흐름", "급여대장", "은행이체", "급여내역서", "payslip", "현장일보", "일보", "마감보고", "근태", "캘린더", "출결", "전화번호", "로그인", "연락처" 등을 언급하면 이 스킬을 사용한다.
---

# 미팍ERP_SYSTEM 통합 스킬 (v9.2)

## 1. 개요

(주)미스터팍의 HR + 수익성분석 + 사업장현황 + 재무 + 견적을 통합한 React(JSX) 기반 ERP 웹앱.
4개 메뉴 섹션, 메인대시보드(HR+수익+재무 KPI), **총 22개 화면**.
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
| **소스코드** | `App.jsx` (~11,762줄) |
| **최신 커밋** | `9610c66` (2026.03.14) |

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
| Orange | `#E97132` — 주말 계약서, 수습 알림, 인건비 |
| Blue | `#156082` — 보조 차트 |
| SkyBlue | `#0F9ED5` — 복합 카테고리 |

> 상세 브랜드 가이드: 프로젝트 파일 `mrpark-output.md` 참조

## 3. 전체 화면 구조 (v9.1)

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
  📊 전체 요약
  🏢 사업장 PL
  ✏️ 비용 입력              ← 3탭: 사업장매출+계약현황+간접비, DB 자동 저장
  💰 급여대장               ← 3탭: 급여대장/은행이체/급여내역서
  🅿️ 월주차 관리
  📈 비교 분석
  ⚙️ 배부 설정
  📥 데이터 Import           ← clobe.ai 엑셀 6종
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
```

### 역할별 메뉴 가시성 (4역할)
| 역할 | 접근 가능 |
|------|----------|
| `super_admin` | 전체 22개 화면 |
| `admin` | 전체 (조항변경 제외) |
| `crew` | 현장일보만 (사이드바 사업장현황에 현장일보 1개만 표시) |
| `field_member` | ERP 접근 불가 → 마감앱(mepark-field)만 사용 |

## 4. DB 구조 (Supabase) — 17개 테이블

### 기존 핵심 테이블
| 테이블 | 용도 |
|--------|------|
| `profiles` | 관리자 프로필 (Supabase Auth 연동, role/site_code/emp_no) |
| `invitations` | 관리자 초대 (레거시) |
| `employees` | 직원 마스터 데이터 (~150명, phone/bank/salary 필드 포함) |
| `contracts` | 계약서 데이터 (4종) |

### 재무·수익 테이블
| 테이블 | 용도 |
|--------|------|
| `financial_transactions` | clobe.ai Import 재무 거래 (은행/카드/세금계산서/현금영수증) |
| `monthly_summary` | 월별 재무 요약 캐시 (RPC 갱신) |
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

### Storage
| 버킷 | 용도 |
|------|------|
| `site-contracts` | 사업장 계약서 파일 (PDF/DOC/HWP, 10MB) |
| `daily-report-images` | 현장일보 사진첨부 |

### Edge Functions
| 함수 | 용도 |
|------|------|
| `admin-api` | 계정관리 (create_user, ban_user, reset_password, unban_user, bulk_create_field, field_login) |

## 5. 메인 대시보드

### 레이아웃 구조
```
┌─ 기간선택 (해당월/주간/월간/분기/연간) ────────────┐
├─ A. 핵심 지표 5컬럼 ───────────────────────────────┤
│ 재직인원 │ 총매출 │ 영업이익 │ 가용자금 │ 인건비율  │
├─────────┬──────────────────────────────────────────┤
│ 수익구조 │                                         │
│ 사업장현황│      현금흐름 차트 (Recharts)             │
│ 재무현황 │      기간탭: 이번달/3개월/6개월/12개월/YTD │
│ 세금계산서│                                         │
├─────────┴──────────────────────────────────────────┤
│ P&L 테이블 (10열 + 합계 + 평균)                     │
├────────────────────────────────────────────────────┤
│ ⚠️ 월주차 만기 D-7 알림                             │
│ 업장별 매출 카드 (발렛비 + 월주차 뱃지)              │
└────────────────────────────────────────────────────┘
```

## 6. HR & 계약관리 (4개 화면)

### 직원현황 (EmployeeRoster) — v9.1 통합
- **테이블 10열**: 사번 | 이름 | 직위 | 사업장 | 근무형태 | 기본급 | 일당 | 계정 | 상태 | 액션
- **5탭 상세 패널** (슬라이드 오버): 기본정보 / 급여조건 / 계정관리 / 계약이력 / 문서
- **계정관리 통합** (AdminInvitePanel 873줄 삭제):
  - 일괄 계정 생성 (Excel Import → Edge Function bulk_create_field)
  - 개별 계정 생성/수정/삭제/정지/해제
  - 비밀번호 규칙: `mp` + 전화번호 뒤 4자리 (자동 생성, 6자 이상)
  - 계정 없는 직원 다운로드 + 필터 + 테이블 컬럼
- **필터 6종**: 사업장 / 유형 / 재직상태 / 계정상태 / 역할 / 검색
- **employees 필드**: emp_no, name, position, site_code_1, work_code, base_salary, weekend_daily, phone, bank_name, bank_account, bank_holder, tax_type, employment_type, probation_months, etc.

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

## 7. 수익성 분석 (8개 화면)

### 전체 요약
KPI 5개 + 수익구조바 + P&L 테이블 + 본사귀속 차감

### 사업장 PL
사업장 선택 → PL 카드 4개 + 인원 테이블 + 간접비 상세

### 비용 입력 → DB 자동 저장
- **매출탭**: 16사업장 × 컬럼(코드|사업장|월계약금(자동)|발렛비(입력)|월주차(자동)|인원|인건비고정(파랑)|인건비대체(골드)|이익률)
- **계약현황탭**: 사업장별 계약 상태
- **간접비탭**: 14항목 × NumInput → `site_overhead` upsert
- 저장: 800ms debounce, "💾 저장 중..." → "✅ DB 저장 완료"
- 이전달 복사 → DB 배치 저장

### 급여대장 (PayrollPage) — v8.2
3탭 구성:
- **급여대장**: 월별 급여 계산 + Excel Import/Export (급여명세 + 은행이체목록 + 사업장별집계 3시트)
- **은행이체**: 은행이체 뷰 + 타인입금 자동감지 + 계좌미등록 경고 + KPI 4개
- **급여내역서**: payslips 일괄 발송 (payroll_records → payslips 복사) + 개별 삭제 + is_read 조회상태

### 🅿️ 월주차 관리
- CRUD: 사업장/차량번호/고객명/연락처/계약기간/월주차비/메모
- D-day 컬러: 7일↓ 빨강, 30일↓ 주황, 그외 초록

### 비교 분석
정렬 4종 + 매출vs이익 바차트 + 인건비 도넛

### 배부 설정
14항목 × 4종 배부방식 (매출비중/인원비중/사업장수/본사귀속)

### 데이터 Import (clobe.ai)
- 드래그&드롭 파일 업로드
- 자동 감지: 은행거래라벨/세금계산서/카드승인/현금영수증 (7종 파서)
- 중복 방지 (import_batch)
- Import 후 `monthly_summary` RPC 자동 갱신

### 간접비 14항목 (기본값)
hq_salary, severance, misc_wage, welfare, insurance, commission, ad, vehicle, tax_local, rent, telecom, tax_duty, supplies, travel

## 8. 사업장 현황 (5개 화면)

### 사업장 관리 (SiteManagementPage)
- 좌: 사업장 목록 (기본16개 + DB 추가분 병합, 인원/월계약/만기D-day)
- 우: 상세 관리 (기본정보 + 계약서 업로드/뷰어/삭제 + 외부주차장 CRUD)
- 사업장 추가/삭제 기능 (커스텀 코드)

### 현장 일보 (DailyReportPage) — v8.3
- 일괄확정, Excel Export 3시트, 대시보드 연동
- 발렛비 단가 per-site (`site_revenue.valet_fee`)
- 사진첨부 (Supabase Storage `daily-report-images`), 중복방지, 결제수단 검증
- 캘린더 뷰 + 리스트 뷰 전환

### 마감보고현황 (ClosingReportPage) — v9.0
- 월별 사업장별 일보 제출 현황 테이블
- 확정/미확정/미제출 상태 색상 구분

### 근태현황 (AttendancePage) — v9.0
- `daily_reports` + `daily_report_staff` 기반
- 기간필터 (일/주/월), 매장별 카드뷰
- KPI 5개 스트립, 공휴일 2026년 JSON 내장
- 캘린더뷰 / 카드뷰 전환

### 전체 캘린더 (FullCalendarPage) — v9.0
- 전체/매장별/근무자별 3뷰
- 상태별 색상 (확정=초록/미확정=주황/미제출=빨강/공휴일=연빨강)
- 직접 구현 (라이브러리 미사용)

## 9. 견적 계산기

### 발렛맨 서비스 견적 시스템 (SalaryCalculatorPage)
`mr-park-salary.vercel.app` 원본 657줄 완전 이식 (QC 스코핑)

| 영역 | 내용 |
|------|------|
| 좌측 — 견적산출표 | ❶인건비(평일월급+주말일당+4대보험+퇴직충당금) ❷운영지원금(100~500만) ❸발렛보험비(50~200만) + 에누리(금액/%) |
| 우측 — 견적서 폼 | 정보입력(현장명/계약형태/기간/시간) → A4 미리보기 → 인쇄/PDF |
| 인쇄 | DOM clone → 인라인 스타일 축소 → 1페이지 출력 |

## 10. 현장 앱 (mepark-field) — 별도 레포

### 현재 구조 (App.jsx ~1,964줄)
| 화면 | 기능 |
|------|------|
| LoginPage | 사번 + 4자리 PIN 로그인 (Supabase Auth signInWithPassword 또는 field_login Edge Function) |
| HomePage | 현장일보 목록/제출/캘린더, 하단탭 |
| ReportFormPage | 일보 작성/수정 폼 |
| PayslipPage | 급여내역서 조회 (payslips 테이블, is_read 상태) |

### 로그인 방식 (현재 v9.1)
- Step 1: 사번 입력 (MP24101) → Step 2: 4자리 PIN 입력
- email: `사번@mepark.internal` / password: PIN (= mp + 전화번호뒤4자리에서 뒤4자리만)
- crew 계정: Supabase Auth 직접 로그인
- field_member 계정: Edge Function field_login fallback

## 11. v9.2 기획 — 전화번호 기반 로그인 (예정)

### 개요
마감앱(mepark-field) 로그인을 전화번호 1단계로 간소화.
사번 기억 불필요 — 본인 전화번호만 입력하면 자동 로그인.

### 변경 사항
| 구분 | 현재 | 변경 |
|------|------|------|
| 아이디 | 사번 (MP24101) | 전화번호 (010-1234-5678) |
| 비밀번호 | 4자리 PIN 수동 입력 | 뒤 4자리 자동 추출 (입력 불필요) |
| 로그인 단계 | 2단계 (사번→PIN) | 1단계 (전화번호만) |

### 구현 범위
1. **ERP 직원현황 테이블에 '연락처' 컬럼 추가** (현재 10열 → 11열)
2. **employees.phone UNIQUE 인덱스** (Supabase SQL)
3. **admin-api Edge Function에 phone_login 액션 추가**: phone → employees 조회 → 사번 매핑 → signInWithPassword 대행 → 세션 반환
4. **마감앱 LoginPage 리뉴얼**: 전화번호/사번 모드 전환 토글, 전화번호 입력 시 하이픈 자동삽입, 11자리 완성 시 즉시 로그인
5. 보안: 5회 실패 시 3분 잠금, Rate Limit, 퇴사자(is_active=false) 차단

### 핵심 원리
Supabase Auth 구조 변경 없음. Edge Function이 "전화번호 → 사번 번역" 레이어 역할만 수행:
```
전화번호 입력 → Edge Function(phone_login)
→ employees에서 phone 조회 → emp_no 추출
→ email = 사번@mepark.internal / password = mp + 뒤4자리
→ signInWithPassword → 세션 토큰 반환
```

기획서: `docs/미팍ERP_전화번호로그인_기획서_v9.2.docx`

## 12. 매출 데이터 관리 방침

```
업장별 매출 (수기입력 — 현재)
├─ 발렛비: 수익성분석 → 비용입력 (site_revenue.valet_fee)
├─ 월주차: 월주차관리 (monthly_parking)
└─ clobe.ai Import(financial_transactions)와는 분리

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

### Named imports only
```jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
// ❌ React.useEffect() 사용 금지
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
급여대장 3탭 (급여대장/은행이체/급여내역서) + Excel 3시트 Export + 인원현황 Import 확장 (급여조건+계좌+보험+퇴사처리) + 직원편집폼 3섹션 확장 + BANKS 상수 21개

### v8.3 — 현장일보 ✅
DailyReportPage + 4개 DB테이블 + 일괄확정 + Excel 3시트 + 사진첨부 + 대시보드 연동

### v9.0~9.1 — 3대 기능 + 사이드바 리뉴얼 ✅ (현재)
- **사이드바 v9.1**: 아코디언 4섹션, AdminInvitePanel 873줄 삭제
- **직원현황 통합**: 5탭 상세패널 (기본정보/급여조건/계정관리/계약이력/문서), 필터 6종
- **마감보고현황**: ClosingReportPage (월별 사업장별 일보 현황)
- **근태현황**: AttendancePage (캘린더뷰/카드뷰, KPI 5개, 공휴일 JSON)
- **전체 캘린더**: FullCalendarPage (전체/매장별/근무자별 3뷰, 상태색상)
- **급여내역서 발송**: payslips 테이블 + ERP 급여탭 3번째 탭 + mepark-field PayslipPage

### v9.2 — 전화번호 로그인 (기획 완료, 구현 예정)
- ERP 직원현황 연락처 컬럼 추가
- employees.phone UNIQUE 인덱스
- admin-api phone_login 액션
- 마감앱 LoginPage 전화번호 모드 추가

### Phase D — 미래
- [ ] 은행 거래 → 사업장 자동 매칭 (거래처라벨 ↔ V코드)
- [ ] 신용카드 매출 → 사업장별 자동 연동
- [ ] 연간 결산 보고서
- [ ] 전자서명 연동 (모두싸인 Modusign API)

## 16. 참조 파일

### 프로젝트 파일
| 파일 | 용도 |
|------|------|
| `mrpark-output.md` | 브랜드 가이드 + 문서/PPT 생성 |
| `mepark-dashboard-v8-plan.md` | v8.0 재무 통합 설계서 |
| `salary-calculator-2026.jsx` | 인건비 계산기 원본 코드 |

### GitHub 내 기획서 (docs/)
| 파일 | 용도 |
|------|------|
| `미팍ERP_3대기능_기획서.docx` | 근태현황+전체캘린더+급여내역서 기획 |
| `미팍ERP_급여대장모듈_통합기획서_v8.2.docx` | 급여대장 고도화 설계 |
| `미팍ERP_현장일보모듈_기획서_v8.3.docx` | 현장일보 모듈 설계 |
| `미팍ERP_전화번호로그인_기획서_v9.2.docx` | 전화번호 로그인 기획 (최신) |

### SQL 마이그레이션 (repo root)
`supabase-setup.sql`, `contracts-table.sql`, `site-management-setup.sql`, `monthly-parking-setup.sql`, `payroll-setup.sql`, `payslip-setup.sql`, `daily-report-setup.sql`, `attendance-setup.sql`, `admin-rpc-functions.sql`

### 스킬 파일 (skills/)
| 파일 | 용도 |
|------|------|
| `mrpark-payroll-SKILL.md` | 급여대장 모듈 상세 스킬 |

수정·확장 시 현재 배포된 **GitHub 소스코드**를 기반으로 작업할 것.
