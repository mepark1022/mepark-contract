# 미팍ERP v9.3 — 근태분석 + 급여연동 통합기획

## 전체 Phase 구조

| Phase | 시스템 | 범위 | 상태 |
|-------|--------|------|------|
| P1 | ERP | 공통 유틸 + 개인분석 탭 | ✅ 완료 |
| P2 | ERP | 사업장분석 탭 | 대기 |
| P3 | ERP | 이상감지 탭 (R1~R7) | 대기 |
| P4 | 마감앱 | 급여내역서 6개월 제한 | 대기 |
| P5 | 양쪽 | 재직증명서 (신청→승인→PDF) | 대기 |
| P6 | 양쪽 | 연차신청 (캘린더→승인→근태연동) | 대기 |

## P1 구현 내역

### 탭 구조
근태현황(AttendancePage)에 4탭 추가:
- 📅 근무현황 (기존)
- 👤 개인분석 (P1)
- 🏢 사업장분석 (P2 예정)
- ⚠️ 이상감지 (P3 예정)

### 공통 유틸 함수 (7개)
- `getExpectedWorkDays(workCode, year, month)` — 근무형태별 근무예정일 계산
- `getExpectedWeekendDays(workCode, year, month)` — 주말 근무예정일
- `calcPersonalAttStats(empId, workCode, dates, getCellStatusFn, todayStr)` — 개인 근태통계
- `calcExpectedPay(emp, stats, year, month)` — 예상급여 (월급비례/일당/복합/알바)
- `calcAnnualLeave(hireDate, targetYear)` — 근로기준법 제60조 연차일수
- `getAttendanceGrade(attRate, lateRate, absentCount)` — A/B/C/D 등급

### PersonalAnalyticsTab (~320줄)
- 직원 목록 (사업장/이름/사번 필터, 등급 뱃지)
- 프로필 카드 + KPI 4개 (출근률/지각률/결근일/추가근무)
- 💰급여비교 카드 (계약 vs 예상 vs 실지급 vs 차이)
- 연차 현황 (자동계산 + 사용 + 잔여)
- 일별 출퇴근 상세 테이블 (상태별 배경색)
- 월간 요약 (6항목 그리드)
- Excel Export 2시트

### 데이터 소스 (신규 테이블 없음)
- `daily_reports` + `daily_report_staff` → 출퇴근
- `employees` → 직원/급여 정보
- `payroll_records` → 실지급액 (있는 달만)

### 급여 계산 로직
| 유형 | 계산 |
|------|------|
| 월급제(A~D) | base_salary × (실출근 / 예정근무일) |
| 일당제(E~G) | weekend_daily × 실출근일 |
| 복합(AE,CG) | base_salary 비례 + weekend_daily × 주말실출근 |
| 알바(W) | daily × 실출근일 |
