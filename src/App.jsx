import { useState, useMemo, useEffect, useCallback, createContext, useContext } from "react";

/* ═══════════════════════════════════════════════════════
   (주)미스터팍 근로계약서 관리 시스템 v3.0
   React + Supabase Auth + 관리자 초대 시스템
   ═══════════════════════════════════════════════════════ */

// ── 1. 상수 ──────────────────────────────────────────
const C = {
  navy: "#1428A0", gold: "#F5B731", dark: "#222222", gray: "#666666",
  lightGray: "#E8E8E8", white: "#FFFFFF", error: "#E53935", success: "#43A047",
  orange: "#E97132", blue: "#156082", skyBlue: "#0F9ED5",
  bg: "#F4F5F7", border: "#D8DCE3", cardBg: "#FAFBFC",
};

const FONT = "'Noto Sans KR', sans-serif";

const SITES = [
  { code: "V000", name: "기획운영팀(본사)" }, { code: "V001", name: "강원빌딩" },
  { code: "V002", name: "사계절한정식" }, { code: "V003", name: "신한은행(서초)" },
  { code: "V004", name: "장안면옥" }, { code: "V005", name: "한티옥(방이)" },
  { code: "V006", name: "청담우리동물병원" }, { code: "V007", name: "미니쉬치과병원" },
  { code: "V008", name: "쥬비스(삼성)" }, { code: "V009", name: "모모빌딩" },
  { code: "V010", name: "곽생로여성의원" }, { code: "V011", name: "금돈옥(청담)" },
  { code: "V012", name: "금돈옥(잠실)" }, { code: "V013", name: "써브라임" },
  { code: "V014", name: "더캐리" }, { code: "V015", name: "강서푸른빛성모어린이병원" },
  { code: "V016", name: "SC제일은행PPC(압구정)" },
];

const WORK_CODES = [
  { code: "A", label: "평(3)", cat: "weekday" }, { code: "B", label: "평(4)", cat: "weekday" },
  { code: "C", label: "평(5)", cat: "weekday" }, { code: "D", label: "평(6)", cat: "weekday" },
  { code: "AP", label: "평(3)P", cat: "weekday" }, { code: "BP", label: "평(4)P", cat: "weekday" },
  { code: "CP", label: "평(5)P", cat: "weekday" }, { code: "DP", label: "평(6)P", cat: "weekday" },
  { code: "E", label: "주(2)", cat: "weekend" }, { code: "F", label: "주(토)", cat: "weekend" },
  { code: "G", label: "주(일)", cat: "weekend" }, { code: "EP", label: "주(2)P", cat: "weekend" },
  { code: "FP", label: "주(토)P", cat: "weekend" }, { code: "GP", label: "주(일)P", cat: "weekend" },
  { code: "AE", label: "평(3)+주(2)", cat: "mixed" }, { code: "CF", label: "평(5)+주(토)", cat: "mixed" },
  { code: "CG", label: "평(5)+주(일)", cat: "mixed" }, { code: "CPF", label: "평(5)P+주(토)", cat: "mixed" },
  { code: "FPG", label: "주(토)P+주(일)", cat: "mixed" },
  { code: "W", label: "알바", cat: "parttime" },
];

const POSITIONS = ["대표", "본부장", "운영이사", "수석팀장", "센터장", "팀장", "일반"];
const TAX_TYPES = ["4대보험", "3.3%", "3.3%(타인)", "고용&산재", "미신고"];
const ROLES = { super_admin: "슈퍼관리자", admin: "일반관리자", viewer: "뷰어" };

const SITE_PRESETS = {
  V001: { wdStart: "10:00", wdEnd: "21:30", weStart: "10:00", weEnd: "21:00", breakMin: 180 },
  V007: { wdStart: "10:00", wdEnd: "20:00", weStart: "10:00", weEnd: "20:00", breakMin: 120 },
  V008: { wdStart: "09:00", wdEnd: "18:00", weStart: "", weEnd: "", breakMin: 90 },
  V010: { wdStart: "09:00", wdEnd: "17:00", weStart: "09:00", weEnd: "14:00", breakMin: 60 },
  V011: { wdStart: "10:30", wdEnd: "22:00", weStart: "10:30", weEnd: "22:00", breakMin: 150 },
};

// ── 2. 유틸리티 ───────────────────────────────────────
const fmt = (n) => (n == null || n === "" || isNaN(n)) ? "0" : Math.round(Number(n)).toLocaleString("ko-KR");
const toNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const dateFmt = (d) => d ? new Date(d).toLocaleDateString("ko-KR") : "";
const dDay = (dateStr) => { if (!dateStr) return null; const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000); return diff; };
const getSiteName = (code) => SITES.find(s => s.code === code)?.name || "";
const getWorkLabel = (code) => WORK_CODES.find(w => w.code === code)?.label || code;
const getWorkCat = (code) => WORK_CODES.find(w => w.code === code)?.cat || "weekday";

// ── 3. 스타일 ─────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8,
  fontSize: 13, background: C.white, fontFamily: FONT, outline: "none", boxSizing: "border-box",
};
const btnPrimary = {
  padding: "10px 20px", background: C.navy, color: C.white, border: "none", borderRadius: 8,
  fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: FONT,
};
const btnGold = { ...btnPrimary, background: C.gold, color: C.dark };
const btnOutline = {
  ...btnPrimary, background: C.white, color: C.navy, border: `2px solid ${C.navy}`,
};
const btnDanger = { ...btnPrimary, background: C.error };
const btnSmall = { ...btnPrimary, padding: "6px 14px", fontSize: 12 };
const cardStyle = {
  background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
  padding: 20, marginBottom: 16,
};
const sectionHeader = (title) => ({
  background: C.navy, color: C.white, padding: "10px 18px", fontSize: 13,
  fontWeight: 800, borderRadius: "10px 10px 0 0", fontFamily: FONT,
});

// ── 4. 인증 컨텍스트 (Supabase Auth Mock) ─────────────
const AuthCtx = createContext(null);

/* 🔑 실서비스 전환 시:
   - createClient("YOUR_URL", "YOUR_ANON_KEY") 로 교체
   - signIn → supabase.auth.signInWithPassword()
   - signUp → supabase.auth.signUp()
   - profiles, invitations 테이블 Supabase에 생성
*/

const DEMO_USERS = [
  { id: "u1", email: "admin@mrpark.co.kr", password: "admin1234", name: "이지섭", role: "super_admin" },
  { id: "u2", email: "manager@mrpark.co.kr", password: "mgr1234", name: "이효정", role: "admin" },
  { id: "u3", email: "viewer@mrpark.co.kr", password: "view1234", name: "김민수", role: "viewer" },
];

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState(DEMO_USERS.map(u => ({
    id: u.id, email: u.email, name: u.name, role: u.role, created_at: "2026-01-01",
  })));
  const [invitations, setInvitations] = useState([
    { id: "inv1", email: "new@example.com", role: "admin", status: "pending", invited_by: "u1", created_at: "2026-03-05", expires_at: "2026-03-12" },
  ]);

  useEffect(() => { setLoading(false); }, []);

  const signIn = (email, pw) => {
    const found = DEMO_USERS.find(u => u.email === email && u.password === pw);
    if (!found) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
    setUser(found);
    return { error: null };
  };

  const signUp = (email, pw, name, inviteId) => {
    if (DEMO_USERS.find(u => u.email === email)) return { error: "이미 등록된 이메일입니다." };
    const inv = invitations.find(i => i.id === inviteId && i.status === "pending");
    if (!inv) return { error: "유효하지 않은 초대입니다." };
    const newUser = { id: uid(), email, password: pw, name, role: inv.role };
    DEMO_USERS.push(newUser);
    setProfiles(p => [...p, { id: newUser.id, email, name, role: inv.role, created_at: today() }]);
    setInvitations(inv2 => inv2.map(i => i.id === inviteId ? { ...i, status: "accepted" } : i));
    setUser(newUser);
    return { error: null };
  };

  const signOut = () => setUser(null);

  const sendInvite = (email, role) => {
    if (invitations.find(i => i.email === email && i.status === "pending")) return { error: "이미 초대된 이메일입니다." };
    const inv = {
      id: uid(), email, role, status: "pending", invited_by: user?.id,
      created_at: today(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    };
    setInvitations(p => [...p, inv]);
    return { error: null, invitation: inv };
  };

  const cancelInvite = (id) => setInvitations(p => p.map(i => i.id === id ? { ...i, status: "cancelled" } : i));
  const resendInvite = (id) => setInvitations(p => p.map(i => i.id === id ? { ...i, expires_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) } : i));
  const removeAdmin = (id) => setProfiles(p => p.filter(pr => pr.id !== id));
  const updateRole = (id, role) => setProfiles(p => p.map(pr => pr.id === id ? { ...pr, role } : pr));

  const profile = user ? profiles.find(p => p.id === user.id) : null;
  const can = (action) => {
    if (!profile) return false;
    if (profile.role === "super_admin") return true;
    if (profile.role === "admin") return !["invite", "manage_admins", "settings"].includes(action);
    return action === "view";
  };

  return (
    <AuthCtx.Provider value={{
      user, profile, loading, signIn, signUp, signOut, sendInvite,
      cancelInvite, resendInvite, removeAdmin, updateRole,
      profiles, invitations, can,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

const useAuth = () => useContext(AuthCtx);

// ── 5. NumInput ───────────────────────────────────────
function NumInput({ value, onChange, style: st, placeholder, ...rest }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(String(value ?? ""));
  return (
    <input inputMode="decimal" placeholder={placeholder} style={{ ...inputStyle, ...st }}
      value={focused ? text : (value === "" || value == null ? "" : fmt(value))}
      onFocus={e => { setFocused(true); setText(String(value ?? "")); }}
      onChange={e => { const raw = e.target.value.replace(/,/g, ""); setText(raw); const n = Number(raw); if (!isNaN(n)) onChange(n); }}
      onBlur={() => { setFocused(false); const n = Number(text.replace(/,/g, "")); onChange(isNaN(n) ? 0 : n); }}
      {...rest}
    />
  );
}

// ── 6. 로그인 페이지 ──────────────────────────────────
function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  const handleLogin = () => {
    const { error: e } = signIn(email, pw);
    if (e) setError(e); else setError("");
  };

  if (showInvite) return <InviteAcceptPage onBack={() => setShowInvite(false)} />;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${C.navy} 0%, #0a1a5c 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ width: 400, maxWidth: "90vw" }}>
        {/* Logo area */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: C.gold, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: C.navy, marginBottom: 12 }}>MP</div>
          <h1 style={{ color: C.white, fontSize: 22, fontWeight: 900, margin: 0 }}>ME.PARK</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "4px 0 0" }}>근로계약서 관리 시스템</p>
        </div>

        <div style={{ background: C.white, borderRadius: 16, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.dark, margin: "0 0 24px", textAlign: "center" }}>관리자 로그인</h2>

          {error && <div style={{ background: "#FEE2E2", color: C.error, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@mrpark.co.kr"
              style={{ ...inputStyle, padding: "12px 14px", fontSize: 14 }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>비밀번호</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••"
              style={{ ...inputStyle, padding: "12px 14px", fontSize: 14 }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>

          <button onClick={handleLogin} style={{ ...btnPrimary, width: "100%", padding: "14px", fontSize: 15 }}>로그인</button>

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => setShowInvite(true)} style={{ background: "none", border: "none", color: C.navy, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
              초대 링크로 가입하기
            </button>
          </div>

          {/* Demo accounts */}
          <div style={{ marginTop: 24, padding: 16, background: C.bg, borderRadius: 10, fontSize: 11 }}>
            <div style={{ fontWeight: 800, color: C.navy, marginBottom: 8 }}>🔑 데모 계정</div>
            {DEMO_USERS.map(u => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ color: C.gray }}>{u.email}</span>
                <button onClick={() => { setEmail(u.email); setPw(u.password); }}
                  style={{ background: C.navy, color: C.white, border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  {ROLES[u.role]}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 7. 초대 수락 / 회원가입 페이지 ────────────────────
function InviteAcceptPage({ onBack }) {
  const { signUp, invitations } = useAuth();
  const [invCode, setInvCode] = useState("");
  const [step, setStep] = useState("code"); // code → signup
  const [inv, setInv] = useState(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");

  const verifyCode = () => {
    const found = invitations.find(i => i.id === invCode && i.status === "pending");
    if (!found) { setError("유효하지 않은 초대 코드입니다."); return; }
    if (new Date(found.expires_at) < new Date()) { setError("만료된 초대입니다."); return; }
    setInv(found); setStep("signup"); setError("");
  };

  const handleSignup = () => {
    if (!name.trim()) { setError("이름을 입력하세요."); return; }
    if (pw.length < 6) { setError("비밀번호 6자 이상 입력하세요."); return; }
    if (pw !== pw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    const { error: e } = signUp(inv.email, pw, name, inv.id);
    if (e) setError(e);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${C.navy} 0%, #0a1a5c 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ width: 420, maxWidth: "90vw" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.gold, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: C.navy, marginBottom: 8 }}>MP</div>
          <h1 style={{ color: C.white, fontSize: 20, fontWeight: 900, margin: 0 }}>초대 수락 & 가입</h1>
        </div>

        <div style={{ background: C.white, borderRadius: 16, padding: 32 }}>
          {error && <div style={{ background: "#FEE2E2", color: C.error, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

          {step === "code" ? (
            <>
              <p style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>초대 메일에서 받은 초대 코드를 입력하세요.</p>
              <input value={invCode} onChange={e => setInvCode(e.target.value)} placeholder="초대 코드 입력" style={{ ...inputStyle, padding: "12px 14px", marginBottom: 16 }} />
              <button onClick={verifyCode} style={{ ...btnPrimary, width: "100%", padding: 14 }}>초대 확인</button>

              <div style={{ marginTop: 16, padding: 12, background: C.bg, borderRadius: 8, fontSize: 11, color: C.gray }}>
                💡 데모 초대 코드: <strong style={{ color: C.navy }}>inv1</strong> (role: admin, email: new@example.com)
              </div>
            </>
          ) : (
            <>
              <div style={{ background: "#EFF6FF", padding: 14, borderRadius: 10, marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: C.navy, fontWeight: 700 }}>✅ 초대 확인 완료</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>이메일: {inv.email} · 역할: {ROLES[inv.role]}</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>이름</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="홍길동" style={{ ...inputStyle, padding: "12px 14px" }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>비밀번호</label>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="6자 이상" style={{ ...inputStyle, padding: "12px 14px" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>비밀번호 확인</label>
                <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="비밀번호 재입력" style={{ ...inputStyle, padding: "12px 14px" }} />
              </div>
              <button onClick={handleSignup} style={{ ...btnPrimary, width: "100%", padding: 14 }}>가입 완료</button>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: C.gray, fontSize: 12, cursor: "pointer" }}>← 로그인으로 돌아가기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 8. 샘플 직원 데이터 ───────────────────────────────
const SAMPLE_EMPLOYEES = [
  { id: "e1", emp_no: "MP17001", name: "이지섭", position: "대표", site_code_1: "V000", work_code: "C", hire_date: "2018-09-10", status: "재직", base_salary: 5000000, weekend_daily: 0, meal_allow: 200000, leader_allow: 0, childcare_allow: 0, car_allow: 0, tax_type: "4대보험", employment_type: "정규직", phone: "010-1234-5678", probation_months: 0 },
  { id: "e2", emp_no: "MP23003", name: "이효정", position: "수석팀장", site_code_1: "V000", work_code: "C", hire_date: "2023-03-01", status: "재직", base_salary: 3500000, weekend_daily: 0, meal_allow: 200000, leader_allow: 150000, childcare_allow: 200000, car_allow: 0, tax_type: "4대보험", employment_type: "정규직", phone: "010-2345-6789", probation_months: 0 },
  { id: "e3", emp_no: "MP25175", name: "박민석C", position: "일반", site_code_1: "V001", work_code: "C", hire_date: "2025-10-15", status: "재직", base_salary: 2400000, weekend_daily: 0, meal_allow: 200000, leader_allow: 0, childcare_allow: 0, car_allow: 0, tax_type: "3.3%", employment_type: "정규직", phone: "010-3456-7890", probation_months: 4 },
  { id: "e4", emp_no: "MP24115", name: "강희철", position: "일반", site_code_1: "V011", work_code: "E", hire_date: "2024-06-01", status: "재직", base_salary: 0, weekend_daily: 160000, meal_allow: 0, leader_allow: 0, childcare_allow: 0, car_allow: 0, tax_type: "3.3%", employment_type: "정규직", phone: "010-4567-8901", probation_months: 4 },
  { id: "e5", emp_no: "MP24120", name: "성치원", position: "일반", site_code_1: "V007", work_code: "CG", hire_date: "2024-08-01", status: "재직", base_salary: 2700000, weekend_daily: 0, meal_allow: 200000, leader_allow: 0, childcare_allow: 0, car_allow: 0, tax_type: "3.3%", employment_type: "정규직", phone: "010-5678-9012", probation_months: 4 },
  { id: "e6", emp_no: "MPA18", name: "김우진", position: "일반", site_code_1: "V000", work_code: "W", hire_date: "2025-12-01", status: "재직", base_salary: 0, weekend_daily: 72000, meal_allow: 0, leader_allow: 0, childcare_allow: 0, car_allow: 0, tax_type: "미신고", employment_type: "알바", phone: "010-6789-0123", probation_months: 0 },
  { id: "e7", emp_no: "MP25180", name: "김서연", position: "일반", site_code_1: "V013", work_code: "F", hire_date: "2025-11-20", status: "재직", base_salary: 0, weekend_daily: 140000, meal_allow: 0, leader_allow: 0, childcare_allow: 0, car_allow: 0, tax_type: "3.3%", employment_type: "정규직", phone: "010-7890-1234", probation_months: 3 },
  { id: "e8", emp_no: "MP22050", name: "정대영", position: "센터장", site_code_1: "V007", work_code: "C", hire_date: "2022-04-01", status: "퇴사", resign_date: "2025-12-31", base_salary: 3200000, weekend_daily: 0, meal_allow: 200000, leader_allow: 150000, childcare_allow: 0, car_allow: 0, tax_type: "4대보험", employment_type: "정규직", phone: "010-8901-2345", probation_months: 0 },
];

// ── 9. 기본 조항 텍스트 ───────────────────────────────
const DEFAULT_ARTICLES_WEEKDAY = {
  1: { title: "계약기간", text: "계약기간은 {start_date}부터 {end_date}까지로 한다." },
  2: { title: "근무장소", text: "근무장소는 {work_site}으로 한다." },
  3: { title: "업무내용", text: "업무내용은 발렛파킹 서비스 및 주차관리 업무로 한다." },
  4: { title: "근무시간", text: "근무시간은 {work_start}부터 {work_end}까지로 하며, 휴게시간은 {break_min}분으로 한다." },
  5: { title: "근무일", text: "근무일은 {work_days}로 한다." },
  6: { title: "휴일", text: "휴일은 근로기준법이 정하는 바에 따른다." },
  7: { title: "임금", text: "① 포괄임금제에 의하여 월 급여 금 {total_salary}원 (비과세 포함)을 지급한다.\n③ 급여 지급일은 매월 {pay_day}일로 한다.\n④ 식대 비과세 {meal_allow}원을 포함한다." },
  8: { title: "퇴직금", text: "1년 이상 근무 시 퇴직금을 지급한다." },
  9: { title: "근로조건 변경", text: "근로조건의 변경은 쌍방 합의에 의한다." },
  10: { title: "기타", text: "본 계약서에 명시되지 않은 사항은 근로기준법에 따른다. {special_terms}" },
  11: { title: "계약서 교부", text: "본 계약서는 2부를 작성하여 당사자 각각 1부씩 보관한다." },
};
const DEFAULT_ARTICLES_WEEKEND = {
  1: { title: "계약기간", text: "계약기간은 {start_date}부터 {end_date}까지로 한다." },
  2: { title: "근무장소", text: "근무장소는 {work_site}으로 한다." },
  3: { title: "업무내용", text: "업무내용은 발렛파킹 서비스 및 주차관리 업무로 한다." },
  4: { title: "근무시간", text: "근무시간은 {work_start}부터 {work_end}까지로 하며, 휴게시간은 {break_min}분으로 한다." },
  5: { title: "근무일", text: "근무일은 {work_days}로 한다." },
  6: { title: "휴일", text: "근무일 외의 날을 휴일로 한다." },
  7: { title: "임금", text: "① 일당 금 {weekend_daily}원을 지급한다.\n② 급여 지급일은 매월 {pay_day}일로 한다." },
  8: { title: "퇴직금", text: "1년 이상 근무 시 퇴직금을 지급한다." },
  9: { title: "기타", text: "본 계약서에 명시되지 않은 사항은 근로기준법에 따른다. {special_terms}" },
  10: { title: "계약서 교부", text: "본 계약서는 2부를 작성하여 당사자 각각 1부씩 보관한다." },
};

// ── 10. 대시보드 ──────────────────────────────────────
function Dashboard({ employees }) {
  const active = employees.filter(e => e.status === "재직");
  const weekday = active.filter(e => ["weekday"].includes(getWorkCat(e.work_code)));
  const weekend = active.filter(e => ["weekend"].includes(getWorkCat(e.work_code)));
  const mixed = active.filter(e => getWorkCat(e.work_code) === "mixed");
  const parttime = active.filter(e => getWorkCat(e.work_code) === "parttime");
  const totalSalary = active.reduce((s, e) => s + toNum(e.base_salary) + toNum(e.meal_allow) + toNum(e.leader_allow) + toNum(e.childcare_allow), 0);

  const probAlerts = active.filter(e => {
    if (!e.probation_months || !e.hire_date) return false;
    const end = new Date(e.hire_date);
    end.setMonth(end.getMonth() + e.probation_months);
    const d = dDay(end.toISOString().slice(0, 10));
    return d !== null && d >= -7 && d <= 14;
  }).map(e => {
    const end = new Date(e.hire_date);
    end.setMonth(end.getMonth() + e.probation_months);
    return { ...e, probEnd: end.toISOString().slice(0, 10), dday: dDay(end.toISOString().slice(0, 10)) };
  });

  const activeSites = [...new Set(active.map(e => e.site_code_1))].filter(Boolean);

  const StatCard = ({ icon, value, label, sub, color }) => (
    <div style={{ background: C.white, borderRadius: 12, padding: "18px 16px", border: `1px solid ${C.border}`, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || C.navy, fontFamily: FONT }}>{value}</div>
      <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 20px" }}>📊 대시보드</h2>

      {/* 지표 카드 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard icon="👥" value={active.length} label="총 재직 인원" sub={`퇴직 ${employees.length - active.length}명`} />
        <StatCard icon="📅" value={`${weekday.length}/${weekend.length}/${mixed.length}`} label="평일/주말/복합" />
        <StatCard icon="💰" value={`${fmt(totalSalary)}원`} label="월 고정급 합계" color={C.success} />
        <StatCard icon="🏢" value={activeSites.length} label="운영 사업장" />
        <StatCard icon="⏰" value={probAlerts.length} label="수습 종료 임박" color={probAlerts.length > 0 ? C.orange : C.gray} />
      </div>

      {/* 수습 알림 */}
      {probAlerts.length > 0 && (
        <div style={{ ...cardStyle, borderLeft: `4px solid ${C.orange}` }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: C.orange, margin: "0 0 12px" }}>⏰ 수습 종료 임박 알림</h3>
          {probAlerts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.lightGray}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{a.emp_no}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>{a.name}</span>
              <span style={{ fontSize: 11, color: C.gray }}>{getSiteName(a.site_code_1)}</span>
              <span style={{ fontSize: 11, color: C.gray }}>종료: {dateFmt(a.probEnd)}</span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 10,
                background: a.dday <= 0 ? "#FEE2E2" : "#FFF3E0",
                color: a.dday <= 0 ? C.error : C.orange,
              }}>
                D{a.dday <= 0 ? a.dday : "−" + a.dday}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 근무유형 분포 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 12px" }}>근무유형 분포</h3>
        {[
          { label: "평일계열", count: weekday.length, color: C.navy },
          { label: "주말계열", count: weekend.length, color: C.orange },
          { label: "복합", count: mixed.length, color: C.skyBlue },
          { label: "알바", count: parttime.length, color: C.gray },
        ].map(b => (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, width: 60, color: C.dark }}>{b.label}</span>
            <div style={{ flex: 1, height: 22, background: C.lightGray, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${active.length ? (b.count / active.length) * 100 : 0}%`, height: "100%", background: b.color, borderRadius: 6, transition: "width 0.5s" }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: b.color, width: 30, textAlign: "right" }}>{b.count}명</span>
          </div>
        ))}
      </div>

      {/* 사업장별 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 12px" }}>🏢 사업장별 인원</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["코드", "사업장", "평일", "주말", "복합", "알바", "합계"].map(h => (
                <th key={h} style={{ padding: "8px 6px", color: C.white, fontWeight: 700, textAlign: "center" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSites.sort().map((sc, i) => {
              const siteEmps = active.filter(e => e.site_code_1 === sc);
              const wd = siteEmps.filter(e => getWorkCat(e.work_code) === "weekday").length;
              const we = siteEmps.filter(e => getWorkCat(e.work_code) === "weekend").length;
              const mx = siteEmps.filter(e => getWorkCat(e.work_code) === "mixed").length;
              const pt = siteEmps.filter(e => getWorkCat(e.work_code) === "parttime").length;
              return (
                <tr key={sc} style={{ background: i % 2 ? C.lightGray : C.white }}>
                  <td style={{ padding: "6px", textAlign: "center", fontWeight: 700 }}>{sc}</td>
                  <td style={{ padding: "6px" }}>{getSiteName(sc)}</td>
                  <td style={{ padding: "6px", textAlign: "center" }}>{wd || "−"}</td>
                  <td style={{ padding: "6px", textAlign: "center" }}>{we || "−"}</td>
                  <td style={{ padding: "6px", textAlign: "center" }}>{mx || "−"}</td>
                  <td style={{ padding: "6px", textAlign: "center" }}>{pt || "−"}</td>
                  <td style={{ padding: "6px", textAlign: "center", fontWeight: 800 }}>{siteEmps.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 11. 직원대장 ──────────────────────────────────────
function EmployeeRoster({ employees, setEmployees, onContract, onResign }) {
  const { can } = useAuth();
  const [filter, setFilter] = useState({ site: "", cat: "", status: "재직", tax: "", search: "" });
  const [editEmp, setEditEmp] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const blankEmp = {
    id: "", emp_no: "", name: "", position: "일반", site_code_1: "", work_code: "C",
    hire_date: today(), status: "재직", base_salary: 0, weekend_daily: 0,
    meal_allow: 200000, leader_allow: 0, childcare_allow: 0, car_allow: 0,
    tax_type: "3.3%", employment_type: "정규직", phone: "", probation_months: 4,
  };

  const filtered = employees.filter(e => {
    if (filter.site && e.site_code_1 !== filter.site) return false;
    if (filter.cat && getWorkCat(e.work_code) !== filter.cat) return false;
    if (filter.status && e.status !== filter.status) return false;
    if (filter.tax && e.tax_type !== filter.tax) return false;
    if (filter.search) {
      const s = filter.search.toLowerCase();
      if (!e.name.toLowerCase().includes(s) && !e.emp_no.toLowerCase().includes(s) && !getSiteName(e.site_code_1).toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const saveEmp = (emp) => {
    if (emp.id) {
      setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
    } else {
      setEmployees(prev => [...prev, { ...emp, id: uid() }]);
    }
    setEditEmp(null); setShowForm(false);
  };

  const deleteEmp = (id) => {
    if (confirm("정말 삭제하시겠습니까?")) setEmployees(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: 0 }}>👥 직원대장</h2>
        {can("edit") && (
          <button onClick={() => { setEditEmp({ ...blankEmp }); setShowForm(true); }} style={btnPrimary}>+ 직원등록</button>
        )}
      </div>

      {/* 필터 */}
      <div style={{ ...cardStyle, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}>
        <input placeholder="🔍 검색 (이름/사번/사업장)" value={filter.search} onChange={e => setFilter(p => ({ ...p, search: e.target.value }))}
          style={{ ...inputStyle, width: 200 }} />
        <select value={filter.site} onChange={e => setFilter(p => ({ ...p, site: e.target.value }))} style={{ ...inputStyle, width: 140 }}>
          <option value="">전체 사업장</option>
          {SITES.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
        </select>
        <select value={filter.cat} onChange={e => setFilter(p => ({ ...p, cat: e.target.value }))} style={{ ...inputStyle, width: 120 }}>
          <option value="">전체 유형</option>
          <option value="weekday">평일계열</option>
          <option value="weekend">주말계열</option>
          <option value="mixed">복합</option>
          <option value="parttime">알바</option>
        </select>
        <select value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle, width: 100 }}>
          <option value="">전체</option>
          <option value="재직">재직</option>
          <option value="퇴사">퇴사</option>
        </select>
        <button onClick={() => setFilter({ site: "", cat: "", status: "재직", tax: "", search: "" })} style={{ ...btnSmall, background: C.lightGray, color: C.dark }}>초기화</button>
      </div>

      {/* 테이블 */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.white, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["사번", "이름", "직위", "사업장", "근무형태", "기본급", "일당", "상태", "액션"].map(h => (
                <th key={h} style={{ padding: "10px 8px", color: C.white, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 ? C.bg : C.white, borderBottom: `1px solid ${C.lightGray}` }}>
                <td style={{ padding: "8px", fontWeight: 700, textAlign: "center" }}>{e.emp_no}</td>
                <td style={{ padding: "8px", fontWeight: 700 }}>{e.name}</td>
                <td style={{ padding: "8px", textAlign: "center", color: C.gray }}>{e.position}</td>
                <td style={{ padding: "8px", fontSize: 11 }}>{getSiteName(e.site_code_1)}</td>
                <td style={{ padding: "8px", textAlign: "center" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: getWorkCat(e.work_code) === "weekday" ? "#EFF6FF" : getWorkCat(e.work_code) === "weekend" ? "#FFF3E0" : getWorkCat(e.work_code) === "mixed" ? "#E0F7FA" : "#F5F5F5",
                    color: getWorkCat(e.work_code) === "weekday" ? C.navy : getWorkCat(e.work_code) === "weekend" ? C.orange : getWorkCat(e.work_code) === "mixed" ? C.skyBlue : C.gray,
                  }}>
                    {getWorkLabel(e.work_code)}
                  </span>
                </td>
                <td style={{ padding: "8px", textAlign: "right", fontFamily: FONT }}>{e.base_salary ? fmt(e.base_salary) + "원" : "−"}</td>
                <td style={{ padding: "8px", textAlign: "right", fontFamily: FONT }}>{e.weekend_daily ? fmt(e.weekend_daily) + "원" : "−"}</td>
                <td style={{ padding: "8px", textAlign: "center" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: e.status === "재직" ? "#E8F5E9" : "#FFEBEE",
                    color: e.status === "재직" ? C.success : C.error,
                  }}>
                    {e.status}
                  </span>
                </td>
                <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                  {can("edit") && <button onClick={() => onContract(e)} title="계약서" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>📝</button>}
                  {can("edit") && <button onClick={() => { setEditEmp({ ...e }); setShowForm(true); }} title="편집" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>✏️</button>}
                  {can("edit") && <button onClick={() => onResign(e)} title="사직서" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>📋</button>}
                  {can("edit") && <button onClick={() => deleteEmp(e.id)} title="삭제" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>🗑</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: C.gray }}>조건에 맞는 직원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ textAlign: "right", padding: "8px 0", fontSize: 12, color: C.gray }}>총 {filtered.length}명</div>
      </div>

      {/* 직원 등록/수정 모달 */}
      {showForm && editEmp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: C.white, borderRadius: 16, padding: 28, width: 520, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: C.navy, margin: "0 0 20px" }}>{editEmp.id ? "✏️ 직원 수정" : "➕ 직원 등록"}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["사번", "emp_no", "text"], ["이름", "name", "text"], ["연락처", "phone", "text"],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>{label}</label>
                  <input value={editEmp[key] || ""} onChange={e => setEditEmp(p => ({ ...p, [key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>직위</label>
                <select value={editEmp.position} onChange={e => setEditEmp(p => ({ ...p, position: e.target.value }))} style={inputStyle}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>사업장</label>
                <select value={editEmp.site_code_1} onChange={e => setEditEmp(p => ({ ...p, site_code_1: e.target.value }))} style={inputStyle}>
                  <option value="">선택</option>
                  {SITES.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>근무형태</label>
                <select value={editEmp.work_code} onChange={e => setEditEmp(p => ({ ...p, work_code: e.target.value }))} style={inputStyle}>
                  {WORK_CODES.map(w => <option key={w.code} value={w.code}>{w.code} — {w.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>입사일</label>
                <input type="date" value={editEmp.hire_date || ""} onChange={e => setEditEmp(p => ({ ...p, hire_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>근무조건</label>
                <select value={editEmp.employment_type} onChange={e => setEditEmp(p => ({ ...p, employment_type: e.target.value }))} style={inputStyle}>
                  {["정규직", "계약직", "알바"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>신고유형</label>
                <select value={editEmp.tax_type} onChange={e => setEditEmp(p => ({ ...p, tax_type: e.target.value }))} style={inputStyle}>
                  {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>수습기간(월)</label>
                <select value={editEmp.probation_months || 0} onChange={e => setEditEmp(p => ({ ...p, probation_months: parseInt(e.target.value) }))} style={inputStyle}>
                  <option value={0}>없음</option>
                  <option value={3}>3개월</option>
                  <option value={4}>4개월</option>
                  <option value={6}>6개월</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>기본급(월급)</label>
                <NumInput value={editEmp.base_salary} onChange={v => setEditEmp(p => ({ ...p, base_salary: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>주말일당</label>
                <NumInput value={editEmp.weekend_daily} onChange={v => setEditEmp(p => ({ ...p, weekend_daily: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>식대</label>
                <NumInput value={editEmp.meal_allow} onChange={v => setEditEmp(p => ({ ...p, meal_allow: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>팀장수당</label>
                <NumInput value={editEmp.leader_allow} onChange={v => setEditEmp(p => ({ ...p, leader_allow: v }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={btnOutline}>취소</button>
              <button onClick={() => saveEmp(editEmp)} style={btnPrimary}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 12. 계약서 작성기 ─────────────────────────────────
function ContractWriter({ employees, initialEmp }) {
  const { can } = useAuth();
  const [selEmpId, setSelEmpId] = useState(initialEmp?.id || "");
  const [contract, setContract] = useState({
    type: "weekday", start_date: today(), end_date: "", work_site: "", work_start: "09:00",
    work_end: "18:00", break_min: 60, work_days: "월~금", total_salary: 0, base_salary: 0,
    weekend_daily: 0, meal_allow: 200000, leader_allow: 0, pay_day: 10,
    special_terms: "", probation: false, probation_months: 4,
    basic_hours: 173.8, annual_hours: 8.75, overtime_hours: 0, holiday_hours: 21,
  });
  const [articles, setArticles] = useState({ ...DEFAULT_ARTICLES_WEEKDAY });

  const activeEmps = employees.filter(e => e.status === "재직");

  useEffect(() => {
    if (initialEmp) selectEmployee(initialEmp.id);
  }, [initialEmp]);

  const selectEmployee = (empId) => {
    setSelEmpId(empId);
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const cat = getWorkCat(emp.work_code);
    const isWeekday = cat === "weekday" || cat === "mixed";
    const isWeekend = cat === "weekend";
    const preset = SITE_PRESETS[emp.site_code_1];

    const wStart = preset ? preset.wdStart : "09:00";
    const wEnd = preset ? preset.wdEnd : "18:00";
    const bMin = preset ? preset.breakMin : 60;

    // Calculate hours
    const [sh, sm] = wStart.split(":").map(Number);
    const [eh, em] = wEnd.split(":").map(Number);
    const dailyMin = (eh * 60 + em) - (sh * 60 + sm) - bMin;
    const dailyH = Math.max(0, dailyMin / 60);
    const workDaysN = emp.work_code.includes("3") ? 3 : emp.work_code.includes("4") ? 4 : emp.work_code.includes("6") ? 6 : 5;
    const weeklyH = dailyH * workDaysN;
    const basicH = Math.round(Math.min(weeklyH, 40) * 4.345 * 100) / 100;
    const annualH = weeklyH >= 15 ? 8.75 : 0;
    const overtimeH = Math.round(Math.max(0, dailyH - 8) * workDaysN * 4.345 * 100) / 100;
    const holidayH = Math.round(dailyH * (workDaysN / 5) * 4.84 * 100) / 100;

    const totalSal = toNum(emp.base_salary) + toNum(emp.meal_allow) + toNum(emp.leader_allow) + toNum(emp.childcare_allow) + toNum(emp.car_allow);

    setContract(p => ({
      ...p,
      type: isWeekend ? "weekend" : isWeekday ? "weekday" : "weekday",
      work_site: getSiteName(emp.site_code_1),
      work_start: wStart, work_end: wEnd, break_min: bMin,
      work_days: isWeekend ? "토, 일" : workDaysN === 5 ? "월~금" : `주 ${workDaysN}일`,
      total_salary: totalSal, base_salary: toNum(emp.base_salary),
      weekend_daily: toNum(emp.weekend_daily), meal_allow: toNum(emp.meal_allow),
      leader_allow: toNum(emp.leader_allow), pay_day: 10,
      probation: emp.probation_months > 0, probation_months: emp.probation_months || 4,
      basic_hours: basicH, annual_hours: annualH, overtime_hours: overtimeH, holiday_hours: holidayH,
    }));
    setArticles(isWeekend ? { ...DEFAULT_ARTICLES_WEEKEND } : { ...DEFAULT_ARTICLES_WEEKDAY });
  };

  // 임금테이블 산출
  const wageTable = useMemo(() => {
    if (contract.type === "weekend") return null;
    const { total_salary, basic_hours, annual_hours, overtime_hours, holiday_hours } = contract;
    const totalH = basic_hours + annual_hours + overtime_hours + holiday_hours;
    if (totalH <= 0 || total_salary <= 0) return null;
    const exactRate = total_salary / totalH;
    const annualPay = Math.round(exactRate * annual_hours);
    const overtimePay = Math.round(exactRate * overtime_hours);
    const holidayPay = Math.round(exactRate * holiday_hours);
    const basicPay = total_salary - annualPay - overtimePay - holidayPay;
    return {
      totalH: Math.round(totalH * 100) / 100,
      displayRate: Math.floor(exactRate),
      items: [
        { name: "기본급", amount: basicPay, hours: basic_hours },
        { name: "연차수당", amount: annualPay, hours: annual_hours },
        { name: "연장수당", amount: overtimePay, hours: overtime_hours },
        { name: "공휴수당", amount: holidayPay, hours: holiday_hours },
      ],
    };
  }, [contract]);

  const selEmp = employees.find(e => e.id === selEmpId);

  const replaceVars = (text) => {
    return text
      .replace(/{start_date}/g, contract.start_date)
      .replace(/{end_date}/g, contract.end_date || "____년 __월 __일")
      .replace(/{work_site}/g, contract.work_site)
      .replace(/{work_start}/g, contract.work_start)
      .replace(/{work_end}/g, contract.work_end)
      .replace(/{break_min}/g, String(contract.break_min))
      .replace(/{work_days}/g, contract.work_days)
      .replace(/{total_salary}/g, fmt(contract.total_salary))
      .replace(/{base_salary}/g, fmt(contract.base_salary))
      .replace(/{weekend_daily}/g, fmt(contract.weekend_daily))
      .replace(/{meal_allow}/g, fmt(contract.meal_allow))
      .replace(/{pay_day}/g, String(contract.pay_day))
      .replace(/{special_terms}/g, contract.special_terms);
  };

  const handlePrint = () => {
    const printContent = document.getElementById("contract-preview");
    if (!printContent) return;
    const win = window.open("", "_blank", "width=800,height=1000");
    if (!win) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요."); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>근로계약서 - ${selEmp?.name || ""}</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family:'Noto Sans KR',sans-serif; }
        @page { size:A4; margin:18mm 15mm; }
        body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
        .page-break { page-break-before:always; }
        table { border-collapse:collapse; width:100%; }
        td, th { border:1px solid #222; padding:6px 8px; font-size:12px; }
      </style></head><body>`);
    win.document.write(printContent.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.onload = () => { setTimeout(() => win.print(), 300); };
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
      {/* 좌측: 입력 */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>📝 계약서 작성</h2>

        {/* 직원 선택 */}
        <div style={cardStyle}>
          <div style={sectionHeader("직원 선택")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>👤 직원 선택</span></div>
          <div style={{ padding: 16 }}>
            <select value={selEmpId} onChange={e => selectEmployee(e.target.value)} style={{ ...inputStyle, fontSize: 14, fontWeight: 700 }}>
              <option value="">-- 직원을 선택하세요 --</option>
              {activeEmps.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.emp_no} — {emp.name} ({getSiteName(emp.site_code_1)}, {getWorkLabel(emp.work_code)})</option>
              ))}
            </select>
            {selEmp && (
              <div style={{ marginTop: 10, padding: 10, background: "#EFF6FF", borderRadius: 8, fontSize: 12 }}>
                <strong>{selEmp.name}</strong> · {selEmp.emp_no} · {getSiteName(selEmp.site_code_1)} · {getWorkLabel(selEmp.work_code)} ·
                기본급 {fmt(selEmp.base_salary)}원 {selEmp.weekend_daily ? `/ 일당 ${fmt(selEmp.weekend_daily)}원` : ""}
              </div>
            )}
          </div>
        </div>

        {/* 계약 기본정보 */}
        <div style={cardStyle}>
          <div style={sectionHeader("계약 기본정보")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>📋 계약 기본정보</span></div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>계약 시작일</label>
              <input type="date" value={contract.start_date} onChange={e => setContract(p => ({ ...p, start_date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>계약 종료일</label>
              <input type="date" value={contract.end_date} onChange={e => setContract(p => ({ ...p, end_date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>출근시간</label>
              <input type="time" value={contract.work_start} onChange={e => setContract(p => ({ ...p, work_start: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>퇴근시간</label>
              <input type="time" value={contract.work_end} onChange={e => setContract(p => ({ ...p, work_end: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>휴게(분)</label>
              <NumInput value={contract.break_min} onChange={v => setContract(p => ({ ...p, break_min: v }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>근무일</label>
              <input value={contract.work_days} onChange={e => setContract(p => ({ ...p, work_days: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>급여일</label>
              <NumInput value={contract.pay_day} onChange={v => setContract(p => ({ ...p, pay_day: v }))} />
            </div>
          </div>
        </div>

        {/* 급여 */}
        <div style={cardStyle}>
          <div style={sectionHeader("급여")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>💰 급여</span></div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {contract.type !== "weekend" && <div><label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>총 월급 (비과세 포함)</label><NumInput value={contract.total_salary} onChange={v => setContract(p => ({ ...p, total_salary: v }))} /></div>}
            {contract.type === "weekend" && <div><label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>일당</label><NumInput value={contract.weekend_daily} onChange={v => setContract(p => ({ ...p, weekend_daily: v }))} /></div>}
            <div><label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>식대</label><NumInput value={contract.meal_allow} onChange={v => setContract(p => ({ ...p, meal_allow: v }))} /></div>
          </div>
        </div>

        {/* 수습기간 */}
        <div style={cardStyle}>
          <div style={sectionHeader("수습기간")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>📅 수습기간</span></div>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <button onClick={() => setContract(p => ({ ...p, probation: !p.probation }))}
                style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: contract.probation ? C.navy : "#ccc", position: "relative" }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: C.white, position: "absolute", top: 3, left: contract.probation ? 23 : 3, transition: "left 0.2s" }} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: contract.probation ? C.navy : C.gray }}>수습기간 적용</span>
            </div>
            {contract.probation && (
              <div style={{ display: "flex", gap: 8 }}>
                {[3, 4, 6].map(m => (
                  <button key={m} onClick={() => setContract(p => ({ ...p, probation_months: m }))}
                    style={{ padding: "6px 16px", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", border: `2px solid ${contract.probation_months === m ? C.navy : C.border}`, background: contract.probation_months === m ? C.navy : C.white, color: contract.probation_months === m ? C.white : C.gray }}>
                    {m}개월
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 특약사항 */}
        <div style={cardStyle}>
          <div style={sectionHeader("특약")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>📌 특약사항</span></div>
          <div style={{ padding: 16 }}>
            <textarea value={contract.special_terms} onChange={e => setContract(p => ({ ...p, special_terms: e.target.value }))}
              rows={3} placeholder="추가 특약사항을 입력하세요" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </div>

        {can("edit") && <button onClick={handlePrint} style={{ ...btnGold, width: "100%", padding: 14, fontSize: 15 }}>🖨️ 인쇄 / PDF 출력</button>}
      </div>

      {/* 우측: 미리보기 */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>미리보기</h2>
        <div id="contract-preview" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 40, fontSize: 13, lineHeight: 1.8, fontFamily: FONT, minHeight: 800 }}>
          {/* 페이지 1 */}
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: 8, color: C.dark }}>근 로 계 약 서</h1>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>
              ({contract.type === "weekend" ? "주말제 · 일당" : contract.type === "mixed" ? "복합근무" : "평일제 · 월급"})
            </div>
          </div>

          <p style={{ marginBottom: 20 }}>
            <strong>주식회사 미스터팍</strong> (이하 "사용자")와 <strong>{selEmp?.name || "________"}</strong> (이하 "근로자")는 다음과 같이 근로계약을 체결한다.
          </p>

          {/* 조항들 (1~6 or 임금 전) */}
          {Object.entries(articles).filter(([n]) => Number(n) <= 6).map(([num, art]) => (
            <div key={num} style={{ marginBottom: 14 }}>
              <strong>제{num}조 ({art.title})</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{replaceVars(art.text)}</div>
            </div>
          ))}

          {/* 수습기간 */}
          {contract.probation && (
            <div style={{ background: "#FFF8E1", border: `1px solid ${C.gold}`, borderRadius: 8, padding: "10px 14px", margin: "14px 0", fontSize: 12 }}>
              ※ 수습기간: 입사일로부터 {contract.probation_months}개월
              {contract.start_date && ` (${contract.start_date} ~ ${(() => { const d = new Date(contract.start_date); d.setMonth(d.getMonth() + contract.probation_months); return d.toISOString().slice(0, 10); })()})`}
              <br />수습기간 중 근로조건은 본 계약과 동일하게 적용한다.
            </div>
          )}

          {/* 페이지 2 */}
          <div className="page-break" style={{ borderTop: `2px dashed ${C.lightGray}`, marginTop: 30, paddingTop: 20 }}>
            {/* 제7조 임금 */}
            <div style={{ marginBottom: 14 }}>
              <strong>제7조 (임금)</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{replaceVars(articles[7]?.text || "")}</div>
            </div>

            {/* 임금테이블 (평일제) */}
            {wageTable && contract.type !== "weekend" && (
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "14px 0", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.navy }}>
                    <th colSpan={2} style={{ color: C.white, padding: 8, textAlign: "left" }}>월간 계약금액</th>
                    <th colSpan={2} style={{ color: C.gold, padding: 8, textAlign: "right", fontWeight: 900, fontSize: 14 }}>금 {fmt(contract.total_salary)}원</th>
                  </tr>
                  <tr style={{ background: C.lightGray }}>
                    <th style={{ padding: 6, border: `1px solid ${C.border}` }}>1. 항목</th>
                    <th style={{ padding: 6, border: `1px solid ${C.border}` }}>2. 금액</th>
                    <th colSpan={2} style={{ padding: 6, border: `1px solid ${C.border}` }}>3. 산출근거</th>
                  </tr>
                </thead>
                <tbody>
                  {wageTable.items.map(item => (
                    <tr key={item.name}>
                      <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, fontWeight: 700 }}>{item.name}</td>
                      <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, textAlign: "right" }}>₩{fmt(item.amount)}</td>
                      <td style={{ padding: "6px 10px", border: `1px solid ${C.border}` }}>(통상시급 ×</td>
                      <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, textAlign: "right" }}>{item.hours.toFixed(2)} H)</td>
                    </tr>
                  ))}
                  <tr style={{ background: "#FFF8E1" }}>
                    <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, fontWeight: 900 }}>통상시급</td>
                    <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, textAlign: "right", fontWeight: 900 }}>₩{fmt(wageTable.displayRate)}</td>
                    <td style={{ padding: "6px 10px", border: `1px solid ${C.border}` }}>(월지급액 /</td>
                    <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, textAlign: "right", fontWeight: 900 }}>{wageTable.totalH.toFixed(2)} H)</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* 나머지 조항 */}
            {Object.entries(articles).filter(([n]) => Number(n) > 7).map(([num, art]) => (
              <div key={num} style={{ marginBottom: 14 }}>
                <strong>제{num}조 ({art.title})</strong>
                <div style={{ whiteSpace: "pre-wrap" }}>{replaceVars(art.text)}</div>
              </div>
            ))}

            {/* 서명란 */}
            <div style={{ marginTop: 40, textAlign: "center", fontSize: 12, color: C.gray }}>
              <p>위 계약을 증명하기 위하여 본 계약서 2부를 작성하여 각각 서명 날인 후 1부씩 보관한다.</p>
              <p style={{ marginTop: 10, fontWeight: 700, color: C.dark }}>{contract.start_date || "____년 __월 __일"}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 30, fontSize: 12 }}>
              <div style={{ borderTop: `2px solid ${C.dark}`, paddingTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>[사 용 자]</div>
                <div>상호: 주식회사 미스터팍</div>
                <div>주소: 인천광역시 연수구 갯벌로 12</div>
                <div>대표: 이지섭</div>
                <div style={{ marginTop: 12 }}>서명: ____________________</div>
              </div>
              <div style={{ borderTop: `2px solid ${C.dark}`, paddingTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>[근 로 자]</div>
                <div>성명: {selEmp?.name || "________________"}</div>
                <div>연락처: {selEmp?.phone || "________________"}</div>
                <div>주소: ____________________</div>
                <div style={{ marginTop: 12 }}>서명: ____________________</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 13. 관리자 초대 관리 ──────────────────────────────
function AdminInvitePanel() {
  const { profiles, invitations, sendInvite, cancelInvite, resendInvite, removeAdmin, updateRole, user } = useAuth();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [msg, setMsg] = useState("");

  const handleSend = () => {
    if (!newEmail.includes("@")) { setMsg("유효한 이메일을 입력하세요."); return; }
    const { error } = sendInvite(newEmail, newRole);
    if (error) { setMsg(error); return; }
    setMsg(`✅ ${newEmail}에 초대를 발송했습니다.`);
    setNewEmail(""); setShowInviteForm(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const statusStyle = (status) => ({
    padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
    background: status === "pending" ? "#FFF3E0" : status === "accepted" ? "#E8F5E9" : status === "cancelled" ? "#FFEBEE" : "#F5F5F5",
    color: status === "pending" ? C.orange : status === "accepted" ? C.success : status === "cancelled" ? C.error : C.gray,
  });

  const statusLabel = { pending: "대기", accepted: "수락", cancelled: "취소", expired: "만료" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: 0 }}>🔐 관리자 초대 관리</h2>
        <button onClick={() => setShowInviteForm(true)} style={btnPrimary}>+ 새 초대 보내기</button>
      </div>

      {msg && <div style={{ background: msg.startsWith("✅") ? "#E8F5E9" : "#FEE2E2", color: msg.startsWith("✅") ? C.success : C.error, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>{msg}</div>}

      {/* 초대 폼 모달 */}
      {showInviteForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowInviteForm(false)}>
          <div style={{ background: C.white, borderRadius: 16, padding: 28, width: 440 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: C.navy, margin: "0 0 20px" }}>✉️ 관리자 초대</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6, display: "block" }}>이메일 주소</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@example.com" style={{ ...inputStyle, padding: "12px 14px" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6, display: "block" }}>역할 지정</label>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.entries(ROLES).map(([key, label]) => (
                  <button key={key} onClick={() => setNewRole(key)}
                    style={{
                      flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700, border: `2px solid ${newRole === key ? C.navy : C.border}`,
                      background: newRole === key ? C.navy : C.white, color: newRole === key ? C.white : C.gray,
                    }}>
                    {label}
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>
                      {key === "super_admin" ? "전체 권한" : key === "admin" ? "편집 권한" : "읽기 전용"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowInviteForm(false)} style={btnOutline}>취소</button>
              <button onClick={handleSend} style={btnPrimary}>초대 발송</button>
            </div>

            <div style={{ marginTop: 16, padding: 12, background: C.bg, borderRadius: 8, fontSize: 11, color: C.gray }}>
              💡 초대 메일에 가입 링크가 포함됩니다. 유효기간: 7일
            </div>
          </div>
        </div>
      )}

      {/* 현재 관리자 목록 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 14px" }}>👤 현재 관리자</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["이름", "이메일", "역할", "가입일", "액션"].map(h => (
                <th key={h} style={{ padding: "8px 10px", color: C.white, fontWeight: 700, textAlign: "center" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 ? C.bg : C.white }}>
                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{p.name}</td>
                <td style={{ padding: "8px 10px", color: C.gray }}>{p.email}</td>
                <td style={{ padding: "8px 10px", textAlign: "center" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: p.role === "super_admin" ? "#EDE7F6" : p.role === "admin" ? "#E3F2FD" : "#F5F5F5",
                    color: p.role === "super_admin" ? "#7B1FA2" : p.role === "admin" ? C.navy : C.gray,
                  }}>
                    {ROLES[p.role]}
                  </span>
                </td>
                <td style={{ padding: "8px 10px", textAlign: "center", color: C.gray }}>{p.created_at}</td>
                <td style={{ padding: "8px 10px", textAlign: "center" }}>
                  {p.id !== user?.id && (
                    <>
                      <select value={p.role} onChange={e => updateRole(p.id, e.target.value)}
                        style={{ fontSize: 11, padding: "2px 4px", border: `1px solid ${C.border}`, borderRadius: 4, marginRight: 6 }}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button onClick={() => { if (confirm(`${p.name}님을 제거하시겠습니까?`)) removeAdmin(p.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>🗑</button>
                    </>
                  )}
                  {p.id === user?.id && <span style={{ fontSize: 11, color: C.gray }}>나</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 초대 현황 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 14px" }}>✉️ 초대 현황</h3>
        {invitations.length === 0 ? (
          <p style={{ color: C.gray, fontSize: 13, textAlign: "center", padding: 20 }}>발송된 초대가 없습니다.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.navy }}>
                {["이메일", "역할", "상태", "발송일", "만료일", "액션"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", color: C.white, fontWeight: 700, textAlign: "center" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv, i) => (
                <tr key={inv.id} style={{ background: i % 2 ? C.bg : C.white }}>
                  <td style={{ padding: "8px 10px" }}>{inv.email}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>{ROLES[inv.role]}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}><span style={statusStyle(inv.status)}>{statusLabel[inv.status]}</span></td>
                  <td style={{ padding: "8px 10px", textAlign: "center", color: C.gray }}>{inv.created_at}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", color: C.gray }}>{inv.expires_at}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                    {inv.status === "pending" && (
                      <>
                        <button onClick={() => resendInvite(inv.id)} title="재발송" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, marginRight: 4 }}>🔄</button>
                        <button onClick={() => cancelInvite(inv.id)} title="취소" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>❌</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 11, color: C.gray, marginTop: 10, display: "flex", gap: 12 }}>
          <span>● 초대 코드: 가입 시 사용 (유효기간 7일)</span>
          <span>● 재발송: 만료일 갱신</span>
        </div>
      </div>
    </div>
  );
}

// ── 14. 재직증명서 ────────────────────────────────────
function Certificate({ employees }) {
  const [selId, setSelId] = useState("");
  const [purpose, setPurpose] = useState("은행 제출용");
  const [issueDate, setIssueDate] = useState(today());
  const active = employees.filter(e => e.status === "재직");
  const emp = employees.find(e => e.id === selId);

  const handlePrint = () => {
    const el = document.getElementById("cert-preview");
    if (!el) return;
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요."); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>재직증명서 - ${emp?.name || ""}</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Noto Sans KR',sans-serif;}@page{size:A4;margin:25mm 20mm;}body{print-color-adjust:exact;-webkit-print-color-adjust:exact;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #222;padding:10px 12px;}</style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write("</body></html>");
    w.document.close();
    w.onload = () => { setTimeout(() => w.print(), 300); };
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>📄 재직증명서</h2>
        <div style={cardStyle}>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.gray, display: "block", marginBottom: 6 }}>직원 선택</label>
          <select value={selId} onChange={e => setSelId(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
            <option value="">선택</option>
            {active.map(e => <option key={e.id} value={e.id}>{e.emp_no} — {e.name}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.gray, display: "block", marginBottom: 6 }}>용도</label>
          <select value={purpose} onChange={e => setPurpose(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
            {["은행 제출용", "관공서 제출용", "기타"].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.gray, display: "block", marginBottom: 6 }}>발급일</label>
          <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
          <button onClick={handlePrint} style={{ ...btnGold, width: "100%" }}>🖨️ 인쇄</button>
        </div>
      </div>
      <div id="cert-preview" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 50, fontFamily: FONT, lineHeight: 2.2 }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: 12 }}>재 직 증 명 서</h1>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 30 }}>
          <tbody>
            {[
              ["성 명", emp?.name || ""],
              ["사 번", emp?.emp_no || ""],
              ["소 속", emp ? getSiteName(emp.site_code_1) : ""],
              ["직 위", emp?.position || ""],
              ["입사일", emp ? dateFmt(emp.hire_date) : ""],
              ["재직기간", emp?.hire_date ? `${dateFmt(emp.hire_date)} ~ 현재` : ""],
              ["용 도", purpose],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ width: 120, background: C.lightGray, fontWeight: 700, textAlign: "center", border: `1px solid ${C.border}`, padding: "10px 12px" }}>{k}</td>
                <td style={{ border: `1px solid ${C.border}`, padding: "10px 16px" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ textAlign: "center", fontSize: 14, marginBottom: 30 }}>
          위 사실을 증명합니다.
        </p>
        <p style={{ textAlign: "center", fontSize: 14, fontWeight: 700, marginBottom: 40 }}>
          {dateFmt(issueDate)}
        </p>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 900 }}>주식회사 미스터팍</p>
          <p style={{ fontSize: 13, color: C.gray }}>인천광역시 연수구 갯벌로 12, 인천테크노파크 갯벌타워 1501A,B호</p>
          <p style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>대표이사 이 지 섭 (인)</p>
        </div>
      </div>
    </div>
  );
}

// ── 15. 사직서 ────────────────────────────────────────
const RESIGN_REASONS = [
  "개인 사유 (일신상의 사유)",
  "건강 문제 (건강상의 이유)",
  "학업 (진학 및 학업)",
  "이직 (타 직장 이직)",
  "가정 사정 (가족 돌봄 등)",
  "근무 환경 불만족",
  "계약 만료",
  "기타 사유",
];

function Resignation({ employees }) {
  const [selId, setSelId] = useState("");
  const [reason, setReason] = useState(RESIGN_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [resignDate, setResignDate] = useState(today());
  const [lastWorkDate, setLastWorkDate] = useState("");

  const active = employees.filter(e => e.status === "재직");
  const emp = employees.find(e => e.id === selId);

  // 30일 미만 경고
  const daysFromHire = emp?.hire_date ? Math.ceil((new Date() - new Date(emp.hire_date)) / 86400000) : null;
  const isShortTenure = daysFromHire !== null && daysFromHire < 30;

  const finalReason = reason === "기타 사유" ? (customReason || "기타 사유") : reason;

  const handlePrint = () => {
    const el = document.getElementById("resign-preview");
    if (!el) return;
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요."); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>사직서 - ${emp?.name || ""}</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box;font-family:'Noto Sans KR',sans-serif;}
        @page{size:A4;margin:25mm 20mm;}
        body{print-color-adjust:exact;-webkit-print-color-adjust:exact;padding:0;}
        table{border-collapse:collapse;width:100%;}
        td,th{border:1px solid #222;padding:10px 14px;font-size:14px;}
        @media print{body{padding:0;}}
      </style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write("</body></html>");
    w.document.close();
    w.onload = () => { setTimeout(() => w.print(), 300); };
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>
      {/* 좌측: 입력 */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>📋 사직서</h2>

        <div style={cardStyle}>
          <div style={sectionHeader("직원 선택")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>👤 직원 선택</span></div>
          <div style={{ padding: 16 }}>
            <select value={selId} onChange={e => setSelId(e.target.value)} style={{ ...inputStyle, fontSize: 14, fontWeight: 700 }}>
              <option value="">-- 직원을 선택하세요 --</option>
              {active.map(e => <option key={e.id} value={e.id}>{e.emp_no} — {e.name} ({getSiteName(e.site_code_1)})</option>)}
            </select>
            {emp && (
              <div style={{ marginTop: 10, padding: 10, background: "#EFF6FF", borderRadius: 8, fontSize: 12 }}>
                <strong>{emp.name}</strong> · {emp.emp_no} · {getSiteName(emp.site_code_1)} · 입사일: {dateFmt(emp.hire_date)}
                {daysFromHire !== null && <span style={{ marginLeft: 8, color: C.gray }}>(근속 {daysFromHire}일)</span>}
              </div>
            )}
            {isShortTenure && (
              <div style={{ marginTop: 8, padding: "10px 14px", background: "#FFF3E0", border: `1.5px solid ${C.orange}`, borderRadius: 8, fontSize: 12, fontWeight: 700, color: C.orange }}>
                ⚠️ 입사일로부터 30일 미만입니다 ({daysFromHire}일). 수습기간 중 사직 처리에 유의하세요.
              </div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionHeader("사직 사유")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>📝 사직 사유</span></div>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {RESIGN_REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  style={{
                    padding: "10px 14px", borderRadius: 8, textAlign: "left", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `2px solid ${reason === r ? C.navy : C.border}`,
                    background: reason === r ? "#EFF6FF" : C.white,
                    color: reason === r ? C.navy : C.dark, fontFamily: FONT,
                  }}>
                  {reason === r && "✓ "}{r}
                </button>
              ))}
            </div>
            {reason === "기타 사유" && (
              <textarea value={customReason} onChange={e => setCustomReason(e.target.value)}
                placeholder="구체적인 사유를 입력하세요" rows={3}
                style={{ ...inputStyle, resize: "vertical", marginTop: 4 }} />
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionHeader("일자")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>📅 사직 일자</span></div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 6 }}>사직서 제출일</label>
              <input type="date" value={resignDate} onChange={e => setResignDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 6 }}>최종 근무일</label>
              <input type="date" value={lastWorkDate} onChange={e => setLastWorkDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        <button onClick={handlePrint} style={{ ...btnGold, width: "100%", padding: 14, fontSize: 15 }}>🖨️ 인쇄 / PDF 출력</button>
      </div>

      {/* 우측: 미리보기 */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>미리보기</h2>
        <div id="resign-preview" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "60px 50px", fontFamily: FONT, lineHeight: 2.2, minHeight: 700 }}>
          {/* 제목 */}
          <div style={{ textAlign: "center", marginBottom: 50 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: 16, color: C.dark }}>사 직 서</h1>
          </div>

          {/* 인적사항 */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 40 }}>
            <tbody>
              {[
                ["성 명", emp?.name || ""],
                ["사 번", emp?.emp_no || ""],
                ["소 속", emp ? getSiteName(emp.site_code_1) : ""],
                ["직 위", emp?.position || ""],
                ["입 사 일", emp?.hire_date ? dateFmt(emp.hire_date) : ""],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ width: 120, background: C.lightGray, fontWeight: 700, textAlign: "center", border: `1px solid ${C.border}`, padding: "10px 14px" }}>{k}</td>
                  <td style={{ border: `1px solid ${C.border}`, padding: "10px 16px" }}>{v || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 사직 사유 */}
          <div style={{ marginBottom: 30 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.dark, marginBottom: 10 }}>사직 사유</div>
            <div style={{ padding: "14px 18px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, minHeight: 60, lineHeight: 1.8 }}>
              {finalReason || "(사유를 선택해주세요)"}
            </div>
          </div>

          {/* 사직 일자 */}
          <div style={{ marginBottom: 40 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                <tr>
                  <td style={{ width: 120, background: C.lightGray, fontWeight: 700, textAlign: "center", border: `1px solid ${C.border}`, padding: "10px 14px" }}>제 출 일</td>
                  <td style={{ border: `1px solid ${C.border}`, padding: "10px 16px" }}>{resignDate ? dateFmt(resignDate) : ""}</td>
                </tr>
                <tr>
                  <td style={{ width: 120, background: C.lightGray, fontWeight: 700, textAlign: "center", border: `1px solid ${C.border}`, padding: "10px 14px" }}>최종근무일</td>
                  <td style={{ border: `1px solid ${C.border}`, padding: "10px 16px" }}>{lastWorkDate ? dateFmt(lastWorkDate) : ""}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 본문 */}
          <div style={{ fontSize: 14, lineHeight: 2.2, marginBottom: 50, textAlign: "center" }}>
            <p>위와 같은 사유로 사직하고자 하오니 허락하여 주시기 바랍니다.</p>
          </div>

          {/* 일자 */}
          <div style={{ textAlign: "center", marginBottom: 50 }}>
            <p style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>{resignDate ? dateFmt(resignDate) : "____년 __월 __일"}</p>
          </div>

          {/* 서명란 — 테이블 기반 정렬 */}
          <table style={{ width: 320, marginLeft: "auto", borderCollapse: "collapse", fontSize: 14, marginBottom: 60 }}>
            <tbody>
              <tr>
                <td style={{ width: 80, padding: "12px 0", fontWeight: 700, border: "none", verticalAlign: "bottom", letterSpacing: 4 }}>성 명</td>
                <td style={{ padding: "12px 0", border: "none", borderBottom: `1px solid ${C.dark}`, textAlign: "center", verticalAlign: "bottom", minWidth: 160 }}>
                  {emp?.name || ""}
                </td>
                <td style={{ width: 40, padding: "12px 0 12px 8px", border: "none", color: C.gray, verticalAlign: "bottom" }}>(인)</td>
              </tr>
              <tr>
                <td style={{ padding: "12px 0", fontWeight: 700, border: "none", verticalAlign: "bottom", letterSpacing: 4 }}>연락처</td>
                <td style={{ padding: "12px 0", border: "none", borderBottom: `1px solid ${C.dark}`, textAlign: "center", verticalAlign: "bottom" }}>
                  {emp?.phone || ""}
                </td>
                <td style={{ border: "none" }}></td>
              </tr>
              <tr>
                <td style={{ padding: "12px 0", fontWeight: 700, border: "none", verticalAlign: "bottom", letterSpacing: 4 }}>서 명</td>
                <td style={{ padding: "12px 0", border: "none", borderBottom: `1px solid ${C.dark}`, textAlign: "center", verticalAlign: "bottom" }}>
                </td>
                <td style={{ border: "none" }}></td>
              </tr>
            </tbody>
          </table>

          {/* 수신 */}
          <div style={{ borderTop: `2px solid ${C.dark}`, paddingTop: 20, textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>주식회사 미스터팍 대표이사 귀하</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 16. 설정 ──────────────────────────────────────────
function Settings() {
  const [tab, setTab] = useState("weekday");
  const [arts, setArts] = useState({ weekday: { ...DEFAULT_ARTICLES_WEEKDAY }, weekend: { ...DEFAULT_ARTICLES_WEEKEND } });

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>⚙️ 설정</h2>

      {/* 조항 편집 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 12px" }}>📋 계약서 조항 편집</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["weekday", "평일제 (11조)"], ["weekend", "주말제 (10조)"]].map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: "8px 20px", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", border: `2px solid ${tab === k ? C.navy : C.border}`, background: tab === k ? C.navy : C.white, color: tab === k ? C.white : C.gray }}>
              {v}
            </button>
          ))}
        </div>
        {Object.entries(arts[tab]).map(([num, art]) => (
          <div key={num} style={{ marginBottom: 14, padding: 14, background: C.bg, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginBottom: 6 }}>제{num}조 — {art.title}</div>
            <textarea value={art.text}
              onChange={e => setArts(prev => ({ ...prev, [tab]: { ...prev[tab], [num]: { ...art, text: e.target.value } } }))}
              rows={3} style={{ ...inputStyle, fontSize: 12, resize: "vertical" }} />
          </div>
        ))}
        <button onClick={() => setArts(prev => ({ ...prev, [tab]: tab === "weekday" ? { ...DEFAULT_ARTICLES_WEEKDAY } : { ...DEFAULT_ARTICLES_WEEKEND } }))}
          style={{ ...btnSmall, background: C.lightGray, color: C.dark }}>기본값 초기화</button>
      </div>

      {/* 거래처 코드 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 12px" }}>🏢 거래처(사업장) 코드</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
          {SITES.map(s => (
            <div key={s.code} style={{ padding: "6px 10px", background: C.bg, borderRadius: 6 }}>
              <span style={{ fontWeight: 700, color: C.navy }}>{s.code}</span> {s.name}
            </div>
          ))}
        </div>
      </div>

      {/* 근무형태 코드 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 12px" }}>📊 근무형태 코드</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {WORK_CODES.map(w => (
            <span key={w.code} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: w.cat === "weekday" ? "#EFF6FF" : w.cat === "weekend" ? "#FFF3E0" : w.cat === "mixed" ? "#E0F7FA" : "#F5F5F5",
              color: w.cat === "weekday" ? C.navy : w.cat === "weekend" ? C.orange : w.cat === "mixed" ? C.skyBlue : C.gray,
            }}>
              {w.code} {w.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 16. 메인 앱 쉘 ────────────────────────────────────
function MainApp() {
  const { profile, signOut, can } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [employees, setEmployees] = useState([...SAMPLE_EMPLOYEES]);
  const [contractEmp, setContractEmp] = useState(null);

  const goContract = (emp) => { setContractEmp(emp); setPage("contract"); };
  const goResign = (emp) => { setPage("resignation"); };

  const navItems = [
    { key: "dashboard", icon: "📊", label: "대시보드" },
    { key: "employees", icon: "👥", label: "직원대장" },
    { key: "contract", icon: "📝", label: "계약서" },
    { key: "resignation", icon: "📋", label: "사직서" },
    { key: "certificate", icon: "📄", label: "재직증명서" },
    ...(can("settings") ? [{ key: "settings", icon: "⚙️", label: "설정" }] : []),
    ...(can("invite") ? [{ key: "invite", icon: "🔐", label: "관리자 초대" }] : []),
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: FONT, background: C.bg }}>
      {/* 사이드바 */}
      <aside style={{ width: 200, background: C.navy, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: C.navy }}>MP</div>
            <div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 900 }}>ME.PARK</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>근로계약서 관리</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {navItems.map(item => (
            <button key={item.key} onClick={() => { setPage(item.key); if (item.key !== "contract") setContractEmp(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 4, fontSize: 13, fontWeight: 700,
                background: page === item.key ? "rgba(255,255,255,0.15)" : "transparent",
                color: page === item.key ? C.white : "rgba(255,255,255,0.55)",
                fontFamily: FONT,
              }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>

        {/* 유저 정보 */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>{profile?.name}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            {ROLES[profile?.role]} · {profile?.email}
          </div>
          <button onClick={signOut}
            style={{ width: "100%", padding: "6px 0", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {page === "dashboard" && <Dashboard employees={employees} />}
        {page === "employees" && <EmployeeRoster employees={employees} setEmployees={setEmployees} onContract={goContract} onResign={goResign} />}
        {page === "contract" && <ContractWriter employees={employees} initialEmp={contractEmp} />}
        {page === "resignation" && <Resignation employees={employees} />}
        {page === "certificate" && <Certificate employees={employees} />}
        {page === "settings" && <Settings />}
        {page === "invite" && <AdminInvitePanel />}
      </main>
    </div>
  );
}

// ── 17. 최상위 앱 ─────────────────────────────────────
export default function App() {
  const [fontLoaded, setFontLoaded] = useState(false);
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    link.onload = () => setFontLoaded(true);
    setTimeout(() => setFontLoaded(true), 2000);
  }, []);

  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, background: C.bg }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: C.gold, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: C.navy, marginBottom: 12 }}>MP</div>
      <div style={{ color: C.gray, fontSize: 13 }}>로딩 중...</div>
    </div>
  </div>;
  return user ? <MainApp /> : <LoginPage />;
}
