-- ============================================================
-- ME.PARK v9.0 — 직원정보 통합 Phase 1: employees ↔ auth 연결
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 프로젝트: rtmdvzavbatzjqaoltfd.supabase.co
-- 작성일: 2026-03-14
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  Step 1: employees 테이블에 계정 연결 컬럼 추가           │
-- └─────────────────────────────────────────────────────────┘

-- auth_id: Supabase Auth user ID (profiles.id와 동일)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_id UUID;

-- system_role: ERP 역할 (none/field_member/viewer/crew/admin/super_admin)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS system_role TEXT DEFAULT 'none';

-- account_email: 로그인 이메일 (profiles.email과 동일)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_email TEXT;

-- account_status: 계정 상태 (none/active/suspended/deactivated)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'none';

-- ┌─────────────────────────────────────────────────────────┐
-- │  Step 2: 인덱스 생성                                     │
-- └─────────────────────────────────────────────────────────┘

-- auth_id 유니크 인덱스 (NULL은 허용, 값이 있으면 유니크)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_auth_id 
  ON employees(auth_id) WHERE auth_id IS NOT NULL;

-- account_email 인덱스 (검색용)
CREATE INDEX IF NOT EXISTS idx_employees_account_email 
  ON employees(account_email) WHERE account_email IS NOT NULL;

-- ┌─────────────────────────────────────────────────────────┐
-- │  Step 3: 기존 profiles ↔ employees 매핑                  │
-- │  emp_no 기준으로 매칭하여 auth 정보를 employees에 기록     │
-- └─────────────────────────────────────────────────────────┘

-- 기존 profiles 중 emp_no가 있는 계정 → employees에 매핑
UPDATE employees e
SET 
  auth_id = p.id,
  system_role = p.role,
  account_email = p.email,
  account_status = 'active'
FROM profiles p
WHERE p.emp_no IS NOT NULL 
  AND p.emp_no != ''
  AND p.emp_no = e.emp_no;

-- emp_no가 없는 슈퍼어드민(mepark1022@gmail.com) 매핑
-- → employees에 대표이사 레코드가 있다면 이메일로 매칭
-- (수동 확인 후 필요시 아래 주석 해제)
-- UPDATE employees e
-- SET auth_id = p.id, system_role = 'super_admin', 
--     account_email = 'mepark1022@gmail.com', account_status = 'active'
-- FROM profiles p
-- WHERE p.email = 'mepark1022@gmail.com'
--   AND e.name = '이지섭';

-- ┌─────────────────────────────────────────────────────────┐
-- │  Step 4: 매핑 결과 확인                                   │
-- └─────────────────────────────────────────────────────────┘

-- 매핑된 직원 확인
SELECT e.emp_no, e.name, e.auth_id, e.system_role, e.account_email, e.account_status
FROM employees e
WHERE e.auth_id IS NOT NULL
ORDER BY e.system_role DESC, e.emp_no;

-- 매핑 안 된 profiles 확인 (employees에 매칭 안 된 계정)
SELECT p.id, p.email, p.name, p.role, p.emp_no
FROM profiles p
LEFT JOIN employees e ON e.auth_id = p.id
WHERE e.id IS NULL;
