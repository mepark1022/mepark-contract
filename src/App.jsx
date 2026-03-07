import { useState, useMemo, useEffect, useCallback, useRef, createContext, useContext, Fragment } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, ShadingType, Header, Footer, PageNumber, WidthType, TableLayoutType } from "docx";

/* ═══════════════════════════════════════════════════════
   (주)미스터팍 근로계약서 관리 시스템 v6.0
   Phase 2: 엑셀 Import + Word 출력 + 계약 이력 + 복합/알바 계약서
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

// ── 사번 자동생성 ──
function generateEmpNo(employees, { siteCode, workCode, hireDate }) {
  const isAlba = workCode === "W";
  const isHQ = siteCode === "V000";
  const year2 = hireDate ? String(new Date(hireDate).getFullYear()).slice(2) : String(new Date().getFullYear()).slice(2);

  if (isAlba) {
    // MPA + 순번(1~100)
    const existing = employees
      .map(e => e.emp_no)
      .filter(no => /^MPA\d+$/.test(no))
      .map(no => parseInt(no.replace("MPA", ""), 10))
      .filter(n => !isNaN(n));
    const maxNum = existing.length > 0 ? Math.max(...existing) : 0;
    return `MPA${maxNum + 1}`;
  }

  // MP + 연도2자리 + 순번
  const prefix = `MP${year2}`;
  const allNums = employees
    .map(e => e.emp_no)
    .filter(no => no.startsWith(prefix) && /^MP\d{2}\d{3,}$/.test(no))
    .map(no => parseInt(no.slice(4), 10))
    .filter(n => !isNaN(n));

  if (isHQ) {
    // 001~100 범위
    const hqNums = allNums.filter(n => n >= 1 && n <= 100);
    const maxNum = hqNums.length > 0 ? Math.max(...hqNums) : 0;
    const next = maxNum + 1;
    if (next > 100) return `${prefix}${String(next).padStart(3, "0")}`;
    return `${prefix}${String(next).padStart(3, "0")}`;
  } else {
    // 101~999 범위
    const fieldNums = allNums.filter(n => n >= 101 && n <= 999);
    const maxNum = fieldNums.length > 0 ? Math.max(...fieldNums) : 100;
    const next = maxNum + 1;
    return `${prefix}${String(next).padStart(3, "0")}`;
  }
}

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

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [invitations, setInvitations] = useState([]);

  // 세션 복원 + 리스너
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadData();
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadData();
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadData = async () => {
    const [profRes, invRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("invitations").select("*").order("created_at", { ascending: false }),
    ]);
    if (profRes.data) setProfiles(profRes.data);
    if (invRes.data) setInvitations(invRes.data);
  };

  const signIn = async (email, pw) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) return { error: error.message };
    await loadData();
    return { error: null };
  };

  const signUp = async (email, pw, name, inviteToken) => {
    // 초대 토큰 검증
    const { data: inv } = await supabase.from("invitations")
      .select("*").eq("token", inviteToken).eq("status", "pending").single();
    if (!inv) return { error: "유효하지 않은 초대입니다." };
    if (new Date(inv.expires_at) < new Date()) return { error: "만료된 초대입니다." };
    if (inv.email !== email) return { error: `초대된 이메일(${inv.email})과 일치하지 않습니다.` };

    const { error } = await supabase.auth.signUp({
      email, password: pw,
      options: { data: { name } }
    });
    if (error) return { error: error.message };
    await loadData();
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setProfiles([]); setInvitations([]);
  };

  const sendInvite = async (email, role) => {
    const { data, error } = await supabase.from("invitations")
      .insert({ email, role, invited_by: user?.id })
      .select().single();
    if (error) return { error: error.message };
    await loadData();
    return { error: null, invitation: data };
  };

  const cancelInvite = async (id) => {
    await supabase.from("invitations").update({ status: "cancelled" }).eq("id", id);
    await loadData();
  };

  const resendInvite = async (id) => {
    await supabase.from("invitations").update({
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
    }).eq("id", id);
    await loadData();
  };

  const removeAdmin = async (id) => {
    await supabase.from("profiles").delete().eq("id", id);
    await loadData();
  };

  const updateRole = async (id, role) => {
    await supabase.from("profiles").update({ role }).eq("id", id);
    await loadData();
  };

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
      profiles, invitations, can, loadData,
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
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setError("");
    const { error: e } = await signIn(email, pw);
    if (e) setError(e);
    setLoading(false);
  };

  if (showInvite) return <InviteAcceptPage onBack={() => setShowInvite(false)} />;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${C.navy} 0%, #0a1a5c 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ width: 400, maxWidth: "90vw" }}>
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

          <button onClick={handleLogin} disabled={loading}
            style={{ ...btnPrimary, width: "100%", padding: "14px", fontSize: 15, opacity: loading ? 0.6 : 1 }}>
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => setShowInvite(true)} style={{ background: "none", border: "none", color: C.navy, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
              초대 코드로 가입하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 7. 초대 수락 / 회원가입 페이지 ────────────────────
function InviteAcceptPage({ onBack }) {
  const { signUp } = useAuth();
  const [invCode, setInvCode] = useState("");
  const [step, setStep] = useState("code");
  const [inv, setInv] = useState(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const verifyCode = async () => {
    setError("");
    const { data, error: e } = await supabase.from("invitations")
      .select("*").eq("token", invCode).eq("status", "pending").single();
    if (e || !data) { setError("유효하지 않은 초대 코드입니다."); return; }
    if (new Date(data.expires_at) < new Date()) { setError("만료된 초대입니다."); return; }
    setInv(data); setEmail(data.email); setStep("signup");
  };

  const handleSignup = async () => {
    if (!name.trim()) { setError("이름을 입력하세요."); return; }
    if (pw.length < 6) { setError("비밀번호 6자 이상 입력하세요."); return; }
    if (pw !== pw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    setLoading(true); setError("");
    const { error: e } = await signUp(inv.email, pw, name, inv.token);
    if (e) setError(e);
    setLoading(false);
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
              <p style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>관리자로부터 받은 초대 코드를 입력하세요.</p>
              <input value={invCode} onChange={e => setInvCode(e.target.value)} placeholder="초대 코드 입력" style={{ ...inputStyle, padding: "12px 14px", marginBottom: 16 }} />
              <button onClick={verifyCode} style={{ ...btnPrimary, width: "100%", padding: 14 }}>초대 확인</button>
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
              <button onClick={handleSignup} disabled={loading}
                style={{ ...btnPrimary, width: "100%", padding: 14, opacity: loading ? 0.6 : 1 }}>
                {loading ? "가입 중..." : "가입 완료"}
              </button>
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

// ── 8. 직원 데이터는 Supabase DB에서 로드 ──────────────

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
const DEFAULT_ARTICLES_MIXED = {
  1: { title: "계약기간", text: "계약기간은 {start_date}부터 {end_date}까지로 한다." },
  2: { title: "근무장소", text: "근무장소는 {work_site}으로 한다." },
  3: { title: "업무내용", text: "업무내용은 발렛파킹 서비스 및 주차관리 업무로 한다." },
  4: { title: "근무시간", text: "① 평일 근무시간은 {work_start}부터 {work_end}까지로 하며, 휴게시간은 {break_min}분으로 한다.\n② 주말 근무시간은 {we_work_start}부터 {we_work_end}까지로 하며, 휴게시간은 {we_break_min}분으로 한다." },
  5: { title: "근무일", text: "근무일은 {work_days}로 한다." },
  6: { title: "휴일", text: "휴일은 근로기준법이 정하는 바에 따른다." },
  7: { title: "임금", text: "① 평일 근무에 대하여 포괄임금제에 의하여 월 급여 금 {total_salary}원 (비과세 포함)을 지급한다.\n② 주말 근무에 대하여 일당 금 {weekend_daily}원을 지급한다.\n③ 급여 지급일은 매월 {pay_day}일로 한다.\n④ 식대 비과세 {meal_allow}원을 포함한다." },
  8: { title: "퇴직금", text: "1년 이상 근무 시 퇴직금을 지급한다." },
  9: { title: "근로조건 변경", text: "근로조건의 변경은 쌍방 합의에 의한다." },
  10: { title: "기타", text: "본 계약서에 명시되지 않은 사항은 근로기준법에 따른다. {special_terms}" },
  11: { title: "계약서 교부", text: "본 계약서는 2부를 작성하여 당사자 각각 1부씩 보관한다." },
};
const DEFAULT_ARTICLES_PARTTIME = {
  1: { title: "계약기간", text: "계약기간은 {start_date}부터 {end_date}까지로 한다." },
  2: { title: "근무장소", text: "근무장소는 {work_site}으로 한다." },
  3: { title: "업무내용", text: "업무내용은 발렛파킹 서비스 및 주차관리 업무로 한다." },
  4: { title: "근무시간", text: "근무시간은 {work_start}부터 {work_end}까지로 하며, 휴게시간은 {break_min}분으로 한다." },
  5: { title: "근무일", text: "근무일은 {work_days}로 한다." },
  6: { title: "임금", text: "① 일당 금 {weekend_daily}원을 지급한다. (3.3% 세전)\n② 급여 지급일은 매월 {pay_day}일로 한다." },
  7: { title: "기타", text: "본 계약서에 명시되지 않은 사항은 근로기준법에 따른다. {special_terms}" },
  8: { title: "계약서 교부", text: "본 계약서는 2부를 작성하여 당사자 각각 1부씩 보관한다." },
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
function EmployeeRoster({ employees, saveEmployee, deleteEmployee, onContract, onResign, onReload }) {
  const { can } = useAuth();
  const [filter, setFilter] = useState({ site: "", cat: "", status: "재직", tax: "", search: "" });
  const [editEmp, setEditEmp] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);

  const blankEmp = {
    emp_no: "", name: "", position: "일반", site_code_1: "", work_code: "C",
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

  const saveEmp = async (emp) => {
    // 사번 비어있으면 자동생성
    if (!emp.emp_no || emp.emp_no.trim() === "") {
      emp.emp_no = generateEmpNo(employees, { siteCode: emp.site_code_1, workCode: emp.work_code, hireDate: emp.hire_date });
    }
    // 사번 중복 체크 (신규 등록 시)
    if (!emp.id) {
      const dup = employees.find(e => e.emp_no === emp.emp_no);
      if (dup) {
        alert(`사번 "${emp.emp_no}"이 이미 존재합니다. (${dup.name})\n자동 버튼을 눌러 새 사번을 생성하세요.`);
        return;
      }
    }
    if (!emp.name || emp.name.trim() === "") {
      alert("이름을 입력해주세요.");
      return;
    }
    setSaving(true);
    await saveEmployee(emp);
    setSaving(false);
    setEditEmp(null); setShowForm(false);
  };

  const deleteEmp = async (id) => {
    if (confirm("정말 삭제하시겠습니까?")) await deleteEmployee(id);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: 0 }}>👥 직원대장</h2>
        {can("edit") && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowImport(true)} style={{ ...btnOutline, display: "flex", alignItems: "center", gap: 4 }}>📤 엑셀 Import</button>
            <button onClick={() => {
              const newEmp = { ...blankEmp };
              newEmp.emp_no = generateEmpNo(employees, { siteCode: newEmp.site_code_1, workCode: newEmp.work_code, hireDate: newEmp.hire_date });
              setEditEmp(newEmp);
              setShowForm(true);
            }} style={btnPrimary}>+ 직원등록</button>
          </div>
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
              {/* 사번 (자동생성 포함) */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>사번</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <input value={editEmp.emp_no || ""} onChange={e => setEditEmp(p => ({ ...p, emp_no: e.target.value }))}
                    placeholder="자동생성 또는 직접입력" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => {
                    const auto = generateEmpNo(employees, {
                      siteCode: editEmp.site_code_1,
                      workCode: editEmp.work_code,
                      hireDate: editEmp.hire_date,
                    });
                    setEditEmp(p => ({ ...p, emp_no: auto }));
                  }} title="사번 자동생성" style={{
                    padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.navy}`,
                    background: C.navy, color: C.gold, fontSize: 11, fontWeight: 800,
                    cursor: "pointer", whiteSpace: "nowrap", fontFamily: FONT,
                  }}>⚡ 자동</button>
                </div>
                {editEmp.emp_no && (
                  <div style={{ fontSize: 10, marginTop: 3, color: C.gray }}>
                    {/^MPA\d+$/.test(editEmp.emp_no) ? "알바 사번" :
                     /^MP\d{5,}$/.test(editEmp.emp_no) ?
                       (parseInt(editEmp.emp_no.slice(4)) <= 100 ? "운영팀(본사) 사번" : "현장 근무자 사번") : "사번"}
                  </div>
                )}
              </div>
              {[
                ["이름", "name", "text"], ["연락처", "phone", "text"],
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
              <button onClick={() => saveEmp(editEmp)} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "저장 중..." : "저장"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 Import 모달 */}
      {showImport && (
        <ExcelImportModal
          onClose={() => setShowImport(false)}
          onImport={() => { if (onReload) onReload(); }}
          existingEmpNos={new Set(employees.map(e => String(e.emp_no)))}
        />
      )}
    </div>
  );
}
const EXCEL_COL_MAP = {
  "사번": "emp_no", "성명": "name", "이름": "name", "휴대폰번호": "phone", "연락처": "phone",
  "직위": "position", "근무처코드(1)": "site_code_1", "근무처코드1": "site_code_1",
  "근무처코드(2)": "site_code_2", "근무처코드2": "site_code_2",
  "근무형태1": "work_type_1", "근무형태": "work_type_1", "근무형태2": "work_type_2",
  "복합코드": "work_code", "근무코드": "work_code",
  "입사일": "hire_date", "수습종료일": "probation_end",
  "근무조건": "employment_type", "퇴사일": "resign_date",
  "수당구분": "salary_type", "평일수당": "base_salary", "기본급": "base_salary",
  "주말수당": "weekend_daily", "팀장수당": "leader_allow", "식대": "meal_allow",
  "보육수당": "childcare_allow", "자가운전보조금": "car_allow",
  "신고여부": "tax_type", "신고자": "reporter_name",
  "예금주": "account_holder", "은행명": "bank_name", "계좌번호": "account_number",
  "메모": "memo",
};

// 근무형태 라벨 → 코드 역매핑
const WORK_LABEL_TO_CODE = {};
WORK_CODES.forEach(w => { WORK_LABEL_TO_CODE[w.label] = w.code; WORK_LABEL_TO_CODE[w.code] = w.code; });

function mapWorkCode(raw1, raw2) {
  if (!raw1) return "C";
  const c1 = WORK_LABEL_TO_CODE[raw1] || raw1;
  const c2 = raw2 ? (WORK_LABEL_TO_CODE[raw2] || raw2) : "";
  // 복합코드 시도
  if (c1 && c2) {
    const combo = c1 + c2;
    if (WORK_CODES.find(w => w.code === combo)) return combo;
  }
  if (WORK_CODES.find(w => w.code === c1)) return c1;
  return "C";
}

function parseExcelDate(v) {
  if (!v) return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  return null;
}

function ExcelImportModal({ onClose, onImport, existingEmpNos }) {
  const [step, setStep] = useState("upload"); // upload → preview → importing → done
  const [rows, setRows] = useState([]);
  const [colMap, setColMap] = useState({});
  const [sheetNames, setSheetNames] = useState([]);
  const [selSheet, setSelSheet] = useState("");
  const [workbook, setWorkbook] = useState(null);
  const [stats, setStats] = useState({ total: 0, new: 0, update: 0, skip: 0 });
  const [importMode, setImportMode] = useState("skip"); // skip or update
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      // 자동 선택: "인원현황" 시트 우선
      const defaultSheet = wb.SheetNames.find(s => s.includes("인원현황")) || wb.SheetNames[0];
      setSelSheet(defaultSheet);
      parseSheet(wb, defaultSheet);
    };
    reader.readAsArrayBuffer(file);
  };

  const parseSheet = (wb, sheetName) => {
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rawData.length === 0) return;
    // 자동 컬럼 매핑
    const headers = Object.keys(rawData[0]);
    const mapping = {};
    headers.forEach(h => {
      const clean = h.replace(/\s/g, "");
      Object.keys(EXCEL_COL_MAP).forEach(k => {
        if (clean.includes(k) || clean === k) mapping[h] = EXCEL_COL_MAP[k];
      });
    });
    setColMap(mapping);

    // 행 변환
    const parsed = rawData.map(row => {
      const emp = {};
      Object.entries(mapping).forEach(([excelCol, empField]) => {
        let val = row[excelCol];
        if (["hire_date", "resign_date", "probation_end"].includes(empField)) {
          val = parseExcelDate(val);
        } else if (["base_salary", "weekend_daily", "leader_allow", "meal_allow", "childcare_allow", "car_allow"].includes(empField)) {
          val = parseInt(val) || 0;
        }
        emp[empField] = val;
      });
      // 근무코드 자동 판정
      if (!emp.work_code && emp.work_type_1) {
        emp.work_code = mapWorkCode(emp.work_type_1, emp.work_type_2);
      }
      if (!emp.work_code) emp.work_code = "C";
      // 상태 자동 판정
      emp.status = emp.resign_date ? "퇴사" : "재직";
      // 사번 없으면 스킵
      emp._valid = !!emp.emp_no && !!emp.name;
      emp._isDuplicate = existingEmpNos.has(String(emp.emp_no));
      return emp;
    }).filter(e => e._valid);

    setRows(parsed);
    setStats({
      total: parsed.length,
      new: parsed.filter(e => !e._isDuplicate).length,
      update: parsed.filter(e => e._isDuplicate).length,
      skip: 0,
    });
    setStep("preview");
  };

  const handleSheetChange = (sheetName) => {
    setSelSheet(sheetName);
    if (workbook) parseSheet(workbook, sheetName);
  };

  const doImport = async () => {
    setStep("importing");
    let imported = 0, updated = 0, skipped = 0;
    for (const emp of rows) {
      const { _valid, _isDuplicate, work_type_1, work_type_2, salary_type, probation_end, ...data } = emp;
      // 수습기간 계산 (입사일~수습종료일 차이)
      if (data.hire_date && probation_end) {
        const hd = new Date(data.hire_date), pe = new Date(probation_end);
        const months = Math.round((pe - hd) / (30.44 * 86400000));
        data.probation_months = months > 0 ? months : 0;
      }
      // 기본값 보정
      if (!data.position) data.position = "일반";
      if (!data.employment_type) data.employment_type = "정규직";
      if (!data.tax_type) data.tax_type = "3.3%";
      delete data.status; // resign_date로 자동 판단

      if (_isDuplicate) {
        if (importMode === "update") {
          const { error } = await supabase.from("employees")
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq("emp_no", data.emp_no);
          if (!error) updated++; else skipped++;
        } else {
          skipped++;
        }
      } else {
        // status는 직접 설정
        data.status = emp.resign_date ? "퇴사" : "재직";
        const { error } = await supabase.from("employees").insert(data);
        if (!error) imported++; else skipped++;
      }
    }
    setImportResult({ imported, updated, skipped });
    setStep("done");
  };

  const modalBg = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const modalBox = { background: C.white, borderRadius: 16, padding: 28, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" };

  return (
    <div style={modalBg} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: C.navy, margin: 0 }}>📤 엑셀 Import</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.gray }}>✕</button>
        </div>

        {step === "upload" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <p style={{ color: C.gray, fontSize: 14, marginBottom: 20 }}>인원현황 엑셀 파일(.xlsx)을 선택하세요</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} style={{ ...btnPrimary, padding: "14px 40px", fontSize: 15 }}>📁 파일 선택</button>
            <div style={{ marginTop: 16, padding: 16, background: "#FFF8E1", borderRadius: 10, fontSize: 12, color: C.gray, textAlign: "left" }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>💡 지원 형식</p>
              <p>• 인원현황 엑셀 파일 (.xlsx)</p>
              <p>• 자동 매핑: 사번, 성명, 직위, 근무처코드, 근무형태, 급여 항목 등</p>
              <p>• 시트가 여러 개인 경우 "인원현황" 시트를 자동 선택합니다</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div>
            {/* 시트 선택 */}
            {sheetNames.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.gray }}>시트 선택:</label>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {sheetNames.map(s => (
                    <button key={s} onClick={() => handleSheetChange(s)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `2px solid ${selSheet === s ? C.navy : C.border}`, background: selSheet === s ? C.navy : C.white, color: selSheet === s ? C.white : C.gray, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 통계 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              <div style={{ ...cardStyle, textAlign: "center", padding: 14 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.navy }}>{stats.total}</div>
                <div style={{ fontSize: 11, color: C.gray }}>전체 인원</div>
              </div>
              <div style={{ ...cardStyle, textAlign: "center", padding: 14 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.success }}>{stats.new}</div>
                <div style={{ fontSize: 11, color: C.gray }}>신규 등록</div>
              </div>
              <div style={{ ...cardStyle, textAlign: "center", padding: 14 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.orange }}>{stats.update}</div>
                <div style={{ fontSize: 11, color: C.gray }}>중복 사번</div>
              </div>
            </div>

            {/* 중복 처리 방식 */}
            {stats.update > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: "#FFF3E0", borderRadius: 10, display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>⚠️ 중복 사번 {stats.update}건 처리:</span>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="radio" checked={importMode === "skip"} onChange={() => setImportMode("skip")} /> 건너뛰기
                </label>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="radio" checked={importMode === "update"} onChange={() => setImportMode("update")} /> 덮어쓰기
                </label>
              </div>
            )}

            {/* 매핑된 컬럼 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>🔗 자동 매핑된 컬럼 ({Object.keys(colMap).length}개)</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {Object.entries(colMap).map(([excel, field]) => (
                  <span key={excel} style={{ padding: "3px 8px", background: "#EFF6FF", borderRadius: 6, fontSize: 10, color: C.navy, fontWeight: 600 }}>
                    {excel} → {field}
                  </span>
                ))}
              </div>
            </div>

            {/* 미리보기 테이블 */}
            <div style={{ overflowX: "auto", maxHeight: 300, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.navy, position: "sticky", top: 0 }}>
                    {["", "사번", "이름", "직위", "사업장", "근무형태", "기본급", "일당", "상태"].map(h => (
                      <th key={h} style={{ padding: "8px 6px", color: C.white, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((e, i) => (
                    <tr key={i} style={{ background: e._isDuplicate ? "#FFF3E0" : i % 2 ? C.bg : C.white }}>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        {e._isDuplicate ? <span title="중복" style={{ color: C.orange }}>⚠️</span> : <span style={{ color: C.success }}>✅</span>}
                      </td>
                      <td style={{ padding: "6px", fontWeight: 700, textAlign: "center" }}>{e.emp_no}</td>
                      <td style={{ padding: "6px", fontWeight: 700 }}>{e.name}</td>
                      <td style={{ padding: "6px", textAlign: "center", color: C.gray }}>{e.position}</td>
                      <td style={{ padding: "6px", fontSize: 10 }}>{getSiteName(e.site_code_1) || e.site_code_1}</td>
                      <td style={{ padding: "6px", textAlign: "center" }}>{getWorkLabel(e.work_code)}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{e.base_salary ? fmt(e.base_salary) : "−"}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{e.weekend_daily ? fmt(e.weekend_daily) : "−"}</td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        <span style={{ padding: "2px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: e.status === "재직" ? "#E8F5E9" : "#FFEBEE", color: e.status === "재직" ? C.success : C.error }}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <div style={{ padding: 8, textAlign: "center", fontSize: 11, color: C.gray }}>외 {rows.length - 50}명 더...</div>}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setStep("upload"); setRows([]); }} style={btnOutline}>← 다시 선택</button>
              <button onClick={doImport} style={{ ...btnPrimary, background: C.success, padding: "12px 30px" }}>
                ✅ {importMode === "update" ? `${stats.new}명 등록 + ${stats.update}명 업데이트` : `${stats.new}명 등록`}
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <p style={{ color: C.navy, fontWeight: 700, fontSize: 16 }}>Import 진행 중...</p>
            <p style={{ color: C.gray, fontSize: 13 }}>Supabase에 데이터를 저장하고 있습니다</p>
          </div>
        )}

        {step === "done" && importResult && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <p style={{ color: C.navy, fontWeight: 900, fontSize: 18, marginBottom: 16 }}>Import 완료!</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
              <div style={{ ...cardStyle, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.success }}>{importResult.imported}</div>
                <div style={{ fontSize: 12, color: C.gray }}>신규 등록</div>
              </div>
              <div style={{ ...cardStyle, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.orange }}>{importResult.updated}</div>
                <div style={{ fontSize: 12, color: C.gray }}>업데이트</div>
              </div>
              <div style={{ ...cardStyle, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.gray }}>{importResult.skipped}</div>
                <div style={{ fontSize: 12, color: C.gray }}>건너뜀</div>
              </div>
            </div>
            <button onClick={() => { onImport(); onClose(); }} style={{ ...btnPrimary, padding: "14px 40px", fontSize: 15 }}>✅ 확인</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 12. 계약서 작성기 ─────────────────────────────────
const getDefaultArticles = (type) => {
  switch (type) {
    case "weekend": return { ...DEFAULT_ARTICLES_WEEKEND };
    case "mixed": return { ...DEFAULT_ARTICLES_MIXED };
    case "parttime": return { ...DEFAULT_ARTICLES_PARTTIME };
    default: return { ...DEFAULT_ARTICLES_WEEKDAY };
  }
};

function ContractWriter({ employees, initialEmp, initialContract, onSave }) {
  const { can, user } = useAuth();
  const [selEmpId, setSelEmpId] = useState(initialEmp?.id || "");
  const [contractId, setContractId] = useState(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [contract, setContract] = useState({
    type: "weekday", start_date: today(), end_date: "", work_site: "", work_start: "09:00",
    work_end: "18:00", break_min: 60, work_days: "월~금", total_salary: 0, base_salary: 0,
    weekend_daily: 0, meal_allow: 200000, leader_allow: 0, pay_day: 10,
    special_terms: "", probation: false, probation_months: 4,
    basic_hours: 173.8, annual_hours: 8.75, overtime_hours: 0, holiday_hours: 21,
    // 복합근무 주말 시간
    we_work_start: "09:00", we_work_end: "18:00", we_break_min: 60,
  });
  const [articles, setArticles] = useState({ ...DEFAULT_ARTICLES_WEEKDAY });

  const activeEmps = employees.filter(e => e.status === "재직");

  // 기존 계약서 불러오기
  useEffect(() => {
    if (initialContract) {
      setContractId(initialContract.id);
      setSelEmpId(initialContract.employee_id || "");
      const cType = initialContract.contract_type || "weekday";
      setContract({
        type: cType,
        start_date: initialContract.start_date || today(),
        end_date: initialContract.end_date || "",
        work_site: initialContract.work_site || "",
        work_start: initialContract.work_start || "09:00",
        work_end: initialContract.work_end || "18:00",
        break_min: initialContract.break_min || 60,
        work_days: initialContract.work_days || "월~금",
        total_salary: initialContract.total_salary || 0,
        base_salary: initialContract.base_salary || 0,
        weekend_daily: initialContract.weekend_daily || 0,
        meal_allow: initialContract.meal_allow || 0,
        leader_allow: initialContract.leader_allow || 0,
        pay_day: initialContract.pay_day || 10,
        special_terms: initialContract.special_terms || "",
        probation: initialContract.probation || false,
        probation_months: initialContract.probation_months || 4,
        basic_hours: Number(initialContract.basic_hours) || 173.8,
        annual_hours: Number(initialContract.annual_hours) || 8.75,
        overtime_hours: Number(initialContract.overtime_hours) || 0,
        holiday_hours: Number(initialContract.holiday_hours) || 21,
        we_work_start: initialContract.we_work_start || "09:00",
        we_work_end: initialContract.we_work_end || "18:00",
        we_break_min: initialContract.we_break_min || 60,
      });
      if (initialContract.articles) {
        setArticles(initialContract.articles);
      } else {
        setArticles(getDefaultArticles(cType));
      }
    }
  }, [initialContract]);

  useEffect(() => {
    if (initialEmp && !initialContract) selectEmployee(initialEmp.id);
  }, [initialEmp]);

  const selectEmployee = (empId) => {
    setSelEmpId(empId);
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const cat = getWorkCat(emp.work_code);
    const preset = SITE_PRESETS[emp.site_code_1];

    // 평일 시간 (weekday, mixed 둘 다 사용)
    const wStart = preset ? preset.wdStart : "09:00";
    const wEnd = preset ? preset.wdEnd : "18:00";
    const bMin = preset ? preset.breakMin : 60;

    // 주말 시간 (mixed 시 사용)
    const weStart = preset?.weStart || "09:00";
    const weEnd = preset?.weEnd || "18:00";
    const weBMin = preset ? Math.min(preset.breakMin, 60) : 60;

    // 평일 시간 계산
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

    // 근무일 텍스트 결정
    let workDaysText = "월~금";
    if (cat === "weekend") workDaysText = emp.work_code.includes("2") || emp.work_code === "E" || emp.work_code === "EP" ? "토, 일" : emp.work_code.includes("토") || emp.work_code === "F" || emp.work_code === "FP" ? "토요일" : "일요일";
    else if (cat === "mixed") {
      const wc = emp.work_code;
      if (wc === "AE") workDaysText = "월~수, 토, 일";
      else if (wc === "CF" || wc === "CPF") workDaysText = "월~금, 토";
      else if (wc === "CG") workDaysText = "월~금, 일";
      else if (wc === "FPG") workDaysText = "토, 일";
      else workDaysText = `주 ${workDaysN}일 + 주말`;
    }
    else if (cat === "parttime") workDaysText = "별도 협의";
    else workDaysText = workDaysN === 5 ? "월~금" : `주 ${workDaysN}일`;

    setContract(p => ({
      ...p,
      type: cat,
      work_site: getSiteName(emp.site_code_1),
      work_start: (cat === "weekend" || cat === "parttime") ? (preset?.weStart || wStart) : wStart,
      work_end: (cat === "weekend" || cat === "parttime") ? (preset?.weEnd || wEnd) : wEnd,
      break_min: bMin,
      work_days: workDaysText,
      total_salary: (cat === "weekday" || cat === "mixed") ? totalSal : 0,
      base_salary: toNum(emp.base_salary),
      weekend_daily: toNum(emp.weekend_daily),
      meal_allow: toNum(emp.meal_allow),
      leader_allow: toNum(emp.leader_allow),
      pay_day: 10,
      probation: emp.probation_months > 0,
      probation_months: emp.probation_months || 4,
      basic_hours: (cat === "weekday" || cat === "mixed") ? basicH : 0,
      annual_hours: (cat === "weekday" || cat === "mixed") ? annualH : 0,
      overtime_hours: (cat === "weekday" || cat === "mixed") ? overtimeH : 0,
      holiday_hours: (cat === "weekday" || cat === "mixed") ? holidayH : 0,
      we_work_start: weStart, we_work_end: weEnd, we_break_min: weBMin,
    }));
    setArticles(getDefaultArticles(cat));
  };

  // 임금테이블 산출 (평일제 + 복합근무 평일 부분)
  const wageTable = useMemo(() => {
    if (contract.type === "weekend" || contract.type === "parttime") return null;
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
      .replace(/{we_work_start}/g, contract.we_work_start || "09:00")
      .replace(/{we_work_end}/g, contract.we_work_end || "18:00")
      .replace(/{we_break_min}/g, String(contract.we_break_min || 60))
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

  // ── Word(.docx) 출력 ──
  const handleWordExport = async () => {
    if (!selEmp) { alert("직원을 먼저 선택하세요."); return; }
    const empName = selEmp.name;
    const contractType = contract.type === "weekend" ? "주말제·일당" : contract.type === "mixed" ? "복합근무" : contract.type === "parttime" ? "단시간·알바" : "평일제·월급";

    // 조항 데이터 수집
    const allArticles = getDefaultArticles(contract.type);
    const mergedArticles = { ...allArticles };
    // contract.articles overrides if any
    if (contract.articles) {
      Object.entries(contract.articles).forEach(([k, v]) => {
        const num = parseInt(k.replace("art", ""));
        if (mergedArticles[num]) mergedArticles[num] = { ...mergedArticles[num], text: v };
      });
    }

    const createParagraph = (text, options = {}) => new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: replaceVars(text), font: "맑은 고딕", size: options.size || 22, bold: options.bold || false, color: options.color || "222222" })],
      alignment: options.align || AlignmentType.LEFT,
    });

    const titlePara = (num, title) => new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: `제${num}조 (${title})`, font: "맑은 고딕", size: 24, bold: true, color: "1428A0" })],
    });

    // 임금 테이블 생성
    const wageRows = [];
    if (contract.type !== "weekend" && contract.type !== "parttime") {
      const basic_hours = contract.basic_hours || 182.49;
      const annual_hours = contract.annual_hours || 8.75;
      const overtime_hours = contract.overtime_hours || 0;
      const holiday_hours = contract.holiday_hours || 21;
      const totalH = basic_hours + annual_hours + overtime_hours + holiday_hours;
      const total = toNum(contract.total_salary);
      const exactRate = totalH > 0 ? total / totalH : 0;
      const basicPay = Math.round(exactRate * basic_hours);
      const annualPay = Math.round(exactRate * annual_hours);
      const overtimePay = Math.round(exactRate * overtime_hours);
      const holidayPay = Math.round(exactRate * holiday_hours);
      const adjBasic = total - annualPay - overtimePay - holidayPay;
      const displayRate = Math.floor(exactRate);

      const wageData = [
        ["기본급", fmt(adjBasic) + "원", `통상시급 × ${basic_hours} H`],
        ["연차수당", fmt(annualPay) + "원", `통상시급 × ${annual_hours} H`],
        ["연장수당", fmt(overtimePay) + "원", `통상시급 × ${overtime_hours} H`],
        ["공휴수당", fmt(holidayPay) + "원", `통상시급 × ${holiday_hours} H`],
        ["통상시급", fmt(displayRate) + "원", `월지급액 ÷ ${totalH.toFixed(2)} H`],
      ];

      wageData.forEach(([item, amount, basis]) => {
        wageRows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item, font: "맑은 고딕", size: 20, bold: true })], alignment: AlignmentType.CENTER })], width: { size: 20, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: amount, font: "맑은 고딕", size: 20 })], alignment: AlignmentType.RIGHT })], width: { size: 30, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: basis, font: "맑은 고딕", size: 20 })], alignment: AlignmentType.LEFT })], width: { size: 50, type: WidthType.PERCENTAGE } }),
          ],
        }));
      });
    }

    const wageTable = wageRows.length > 0 ? new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ["항목", "금액", "산출근거"].map(h => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, font: "맑은 고딕", size: 20, bold: true, color: "FFFFFF" })], alignment: AlignmentType.CENTER })],
            shading: { fill: "1428A0", type: ShadingType.CLEAR },
          })),
        }),
        ...wageRows,
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "월간 계약금액", font: "맑은 고딕", size: 20, bold: true })], alignment: AlignmentType.CENTER })], columnSpan: 1 }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `금 ${fmt(contract.total_salary)}원`, font: "맑은 고딕", size: 22, bold: true, color: "1428A0" })], alignment: AlignmentType.RIGHT })], columnSpan: 2 }),
          ],
          tableHeader: false,
        }),
      ],
    }) : null;

    // 문서 조항 파라그래프 생성
    const articleParagraphs = [];
    const maxArt = contract.type === "weekend" ? 10 : contract.type === "parttime" ? 8 : 11;

    for (let i = 1; i <= maxArt; i++) {
      const art = mergedArticles[i];
      if (!art) continue;
      articleParagraphs.push(titlePara(i, art.title));
      // 임금 조항에 테이블 삽입
      const wageArtNum = contract.type === "parttime" ? 6 : 7;
      if (i === wageArtNum && wageTable) {
        if (wageTable) articleParagraphs.push(wageTable);
      }
      const text = replaceVars(art.text);
      text.split("\n").forEach(line => {
        if (line.trim()) articleParagraphs.push(createParagraph(line.trim()));
      });
    }

    // 서명란
    const signDate = contract.start_date || today();
    const signParagraphs = [
      new Paragraph({ spacing: { before: 400 } }),
      createParagraph(`${signDate.replace(/-/g, "년 ").replace(/년 (\d{2})$/, "월 $1일")}`, { align: AlignmentType.CENTER, bold: true }),
      new Paragraph({ spacing: { before: 200 } }),
      createParagraph("[ 사 용 자 ]", { bold: true }),
      createParagraph("상 호: 주식회사 미스터팍"),
      createParagraph("주 소: 인천광역시 연수구 갯벌로 12, 인천테크노파크 갯벌타워 1501A,B호"),
      createParagraph("대 표: 이지섭                          (인)"),
      new Paragraph({ spacing: { before: 200 } }),
      createParagraph("[ 근 로 자 ]", { bold: true }),
      createParagraph(`성 명: ${empName}`),
      createParagraph("연락처:"),
      createParagraph("주 소:"),
      createParagraph("                                      (서명 또는 인)"),
    ];

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "맑은 고딕", size: 22, color: "222222" } } },
      },
      sections: [{
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: "주식회사 미스터팍", size: 20, color: "1428A0", bold: true, font: "맑은 고딕" })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "- ", size: 18, color: "666666" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "666666" }), new TextRun({ text: " -", size: 18, color: "666666" })] })],
          }),
        },
        children: [
          new Paragraph({
            spacing: { after: 200 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "근  로  계  약  서", font: "맑은 고딕", size: 48, bold: true, color: "222222" })],
          }),
          createParagraph(`(${contractType})`, { align: AlignmentType.CENTER, size: 20, color: "666666" }),
          new Paragraph({ spacing: { after: 100 } }),
          createParagraph(`주식회사 미스터팍(이하 "갑"이라 한다)과 ${empName}(이하 "을"이라 한다)은 다음과 같이 근로계약을 체결한다.`),
          new Paragraph({ spacing: { after: 200 } }),
          ...articleParagraphs,
          ...signParagraphs,
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `근로계약서_${empName}_${today()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 계약서 저장 (Supabase) ──
  const handleSave = async (newStatus) => {
    if (!selEmpId) { alert("직원을 선택해주세요."); return; }
    const selEmp = employees.find(e => e.id === selEmpId);
    if (!selEmp) return;
    const payload = {
      employee_id: selEmpId,
      emp_no: selEmp.emp_no,
      emp_name: selEmp.name,
      contract_type: contract.type,
      status: newStatus || "작성중",
      start_date: contract.start_date,
      end_date: contract.end_date || null,
      work_site: contract.work_site,
      work_start: contract.work_start,
      work_end: contract.work_end,
      break_min: contract.break_min,
      work_days: contract.work_days,
      total_salary: contract.total_salary,
      base_salary: contract.base_salary,
      weekend_daily: contract.weekend_daily,
      meal_allow: contract.meal_allow,
      leader_allow: contract.leader_allow,
      pay_day: contract.pay_day,
      basic_hours: contract.basic_hours,
      annual_hours: contract.annual_hours,
      overtime_hours: contract.overtime_hours,
      holiday_hours: contract.holiday_hours,
      probation: contract.probation,
      probation_months: contract.probation_months,
      special_terms: contract.special_terms,
      we_work_start: contract.we_work_start,
      we_work_end: contract.we_work_end,
      we_break_min: contract.we_break_min,
      articles: articles,
      updated_at: new Date().toISOString(),
    };

    try {
      if (contractId) {
        // 업데이트
        const { error } = await supabase.from("contracts").update(payload).eq("id", contractId);
        if (error) throw error;
        setSaveMsg(`✅ 계약서 ${newStatus === "확정" ? "확정" : "저장"} 완료`);
      } else {
        // 새로 생성
        payload.created_by = user?.id || null;
        const { data, error } = await supabase.from("contracts").insert(payload).select().single();
        if (error) throw error;
        setContractId(data.id);
        setSaveMsg(`✅ 계약서 ${newStatus === "확정" ? "확정" : "저장"} 완료 (신규)`);
      }
      if (onSave) onSave();
    } catch (err) {
      setSaveMsg(`❌ 저장 실패: ${err.message}`);
    }
    setTimeout(() => setSaveMsg(""), 3000);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
      {/* 좌측: 입력 */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>
          📝 {contractId ? "계약서 수정" : "계약서 작성"}
          {contractId && <span style={{ fontSize: 12, fontWeight: 600, color: C.gray, marginLeft: 8 }}>#{contractId.slice(0, 8)}</span>}
        </h2>

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
          <div style={{ padding: 16 }}>
            {/* 계약 유형 전환 */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 6 }}>계약 유형</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  ["weekday", "평일제", C.navy],
                  ["weekend", "주말제", C.orange],
                  ["mixed", "복합근무", C.skyBlue],
                  ["parttime", "알바", C.gray],
                ].map(([k, v, color]) => (
                  <button key={k} onClick={() => { setContract(p => ({ ...p, type: k })); setArticles(getDefaultArticles(k)); }}
                    style={{
                      flex: 1, padding: "8px 4px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer",
                      border: `2px solid ${contract.type === k ? color : C.border}`,
                      background: contract.type === k ? color : C.white,
                      color: contract.type === k ? C.white : C.gray, fontFamily: FONT, transition: "all 0.2s",
                    }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>계약 시작일</label>
                <input type="date" value={contract.start_date} onChange={e => setContract(p => ({ ...p, start_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>계약 종료일</label>
                <input type="date" value={contract.end_date} onChange={e => setContract(p => ({ ...p, end_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>{contract.type === "mixed" ? "평일 출근" : "출근시간"}</label>
                <input type="time" value={contract.work_start} onChange={e => setContract(p => ({ ...p, work_start: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>{contract.type === "mixed" ? "평일 퇴근" : "퇴근시간"}</label>
                <input type="time" value={contract.work_end} onChange={e => setContract(p => ({ ...p, work_end: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>{contract.type === "mixed" ? "평일 휴게(분)" : "휴게(분)"}</label>
                <NumInput value={contract.break_min} onChange={v => setContract(p => ({ ...p, break_min: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>근무일</label>
                <input value={contract.work_days} onChange={e => setContract(p => ({ ...p, work_days: e.target.value }))} style={inputStyle} />
              </div>
              {/* 복합근무: 주말 시간 추가 */}
              {contract.type === "mixed" && (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.orange }}>주말 출근</label>
                    <input type="time" value={contract.we_work_start} onChange={e => setContract(p => ({ ...p, we_work_start: e.target.value }))} style={{ ...inputStyle, borderColor: C.orange }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.orange }}>주말 퇴근</label>
                    <input type="time" value={contract.we_work_end} onChange={e => setContract(p => ({ ...p, we_work_end: e.target.value }))} style={{ ...inputStyle, borderColor: C.orange }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.orange }}>주말 휴게(분)</label>
                    <NumInput value={contract.we_break_min} onChange={v => setContract(p => ({ ...p, we_break_min: v }))} style={{ borderColor: C.orange }} />
                  </div>
                </>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>급여일</label>
                <NumInput value={contract.pay_day} onChange={v => setContract(p => ({ ...p, pay_day: v }))} />
              </div>
            </div>
          </div>
        </div>

        {/* 급여 */}
        <div style={cardStyle}>
          <div style={sectionHeader("급여")}><span style={{ color: C.white, fontWeight: 800, fontSize: 13 }}>💰 급여</span></div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* 평일제, 복합: 월급 표시 */}
            {(contract.type === "weekday" || contract.type === "mixed") && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>총 월급 (비과세 포함)</label>
                <NumInput value={contract.total_salary} onChange={v => setContract(p => ({ ...p, total_salary: v }))} />
              </div>
            )}
            {/* 주말제, 복합, 알바: 일당 표시 */}
            {(contract.type === "weekend" || contract.type === "mixed" || contract.type === "parttime") && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: contract.type === "mixed" ? C.orange : C.gray }}>
                  {contract.type === "mixed" ? "주말 일당" : "일당"}
                </label>
                <NumInput value={contract.weekend_daily} onChange={v => setContract(p => ({ ...p, weekend_daily: v }))} style={contract.type === "mixed" ? { borderColor: C.orange } : {}} />
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>식대</label>
              <NumInput value={contract.meal_allow} onChange={v => setContract(p => ({ ...p, meal_allow: v }))} />
            </div>
          </div>
          {/* 복합근무 안내 */}
          {contract.type === "mixed" && (
            <div style={{ margin: "0 16px 16px", padding: "10px 14px", background: "#E0F7FA", borderRadius: 8, fontSize: 11, color: C.skyBlue, fontWeight: 600 }}>
              💡 복합근무: 평일 월급({fmt(contract.total_salary)}원) + 주말 일당({fmt(contract.weekend_daily)}원)이 병행됩니다.
            </div>
          )}
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

        {can("edit") && (
          <>
            {saveMsg && (
              <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 8, fontSize: 13, fontWeight: 700, background: saveMsg.startsWith("✅") ? "#E8F5E9" : "#FFEBEE", color: saveMsg.startsWith("✅") ? C.success : C.error }}>
                {saveMsg}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <button onClick={() => handleSave("작성중")} style={{ ...btnOutline, padding: 14, fontSize: 14, width: "100%" }}>💾 임시 저장</button>
              <button onClick={() => handleSave("확정")} style={{ ...btnPrimary, padding: 14, fontSize: 14, background: C.success, width: "100%" }}>✅ 확정 저장</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handlePrint} style={{ ...btnGold, flex: 1, padding: 14, fontSize: 14 }}>🖨️ 인쇄 / PDF</button>
              <button onClick={handleWordExport} style={{ ...btnPrimary, flex: 1, padding: 14, fontSize: 14 }}>📄 Word 출력</button>
            </div>
            {contractId && (
              <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: C.gray }}>
                📋 계약서 ID: {contractId.slice(0, 8)}... · 수정 시 자동 업데이트
              </div>
            )}
          </>
        )}
      </div>

      {/* 우측: 미리보기 */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>미리보기</h2>
        <div id="contract-preview" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 40, fontSize: 13, lineHeight: 1.8, fontFamily: FONT, minHeight: 800 }}>
          {/* 페이지 1 */}
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: 8, color: C.dark }}>근 로 계 약 서</h1>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>
              ({contract.type === "weekend" ? "주말제 · 일당" : contract.type === "mixed" ? "복합근무" : contract.type === "parttime" ? "단시간 · 알바" : "평일제 · 월급"})
            </div>
          </div>

          <p style={{ marginBottom: 20 }}>
            <strong>주식회사 미스터팍</strong> (이하 "사용자")와 <strong>{selEmp?.name || "________"}</strong> (이하 "근로자")는 다음과 같이 근로계약을 체결한다.
          </p>

          {/* 조항들 (페이지 1: 임금 조항 전까지) */}
          {(() => {
            const wageArtNum = contract.type === "parttime" ? 6 : 7;
            return Object.entries(articles).filter(([n]) => Number(n) < wageArtNum).map(([num, art]) => (
              <div key={num} style={{ marginBottom: 14 }}>
                <strong>제{num}조 ({art.title})</strong>
                <div style={{ whiteSpace: "pre-wrap" }}>{replaceVars(art.text)}</div>
              </div>
            ));
          })()}

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
            {/* 임금 조항 */}
            {(() => {
              const wageArtNum = contract.type === "parttime" ? 6 : 7;
              const wageArt = articles[wageArtNum];
              return wageArt && (
                <div style={{ marginBottom: 14 }}>
                  <strong>제{wageArtNum}조 ({wageArt.title})</strong>
                  <div style={{ whiteSpace: "pre-wrap" }}>{replaceVars(wageArt.text)}</div>
                </div>
              );
            })()}

            {/* 임금테이블 (평일제 + 복합근무 평일 부분) */}
            {wageTable && (contract.type === "weekday" || contract.type === "mixed") && (
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "14px 0", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.navy }}>
                    <th colSpan={2} style={{ color: C.white, padding: 8, textAlign: "left" }}>
                      {contract.type === "mixed" ? "평일 월간 계약금액" : "월간 계약금액"}
                    </th>
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

            {/* 복합근무: 주말 일당 요약 */}
            {contract.type === "mixed" && contract.weekend_daily > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "14px 0", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.orange }}>
                    <th style={{ color: C.white, padding: 8, textAlign: "left" }}>주말 일당</th>
                    <th style={{ color: C.white, padding: 8, textAlign: "right", fontWeight: 900, fontSize: 14 }}>금 {fmt(contract.weekend_daily)}원 / 일</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, fontSize: 11, color: C.gray }} colSpan={2}>
                      주말 근무 시 일당 {fmt(contract.weekend_daily)}원을 별도 지급하며, 근무일수에 따라 정산한다.
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* 나머지 조항 */}
            {(() => {
              const wageArtNum = contract.type === "parttime" ? 6 : 7;
              return Object.entries(articles).filter(([n]) => Number(n) > wageArtNum).map(([num, art]) => (
                <div key={num} style={{ marginBottom: 14 }}>
                  <strong>제{num}조 ({art.title})</strong>
                  <div style={{ whiteSpace: "pre-wrap" }}>{replaceVars(art.text)}</div>
                </div>
              ));
            })()}

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

// ── 12-1. 계약서 이력 관리 ────────────────────────────
function ContractHistory({ employees, onEditContract, onNewContract }) {
  const { can } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ empName: "", status: "", type: "", site: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [sortKey, setSortKey] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");

  const loadContracts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("contracts").select("*").order("updated_at", { ascending: false });
    if (data) setContracts(data);
    setLoading(false);
  };

  useEffect(() => { loadContracts(); }, []);

  const updateStatus = async (id, newStatus) => {
    if (!can("edit")) return;
    const { error } = await supabase.from("contracts").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) loadContracts();
  };

  const deleteContract = async (id) => {
    if (!can("edit")) return;
    if (!confirm("이 계약서 이력을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (!error) loadContracts();
  };

  // 필터링
  const filtered = contracts.filter(c => {
    if (filter.empName && !c.emp_name?.includes(filter.empName) && !c.emp_no?.includes(filter.empName)) return false;
    if (filter.status && c.status !== filter.status) return false;
    if (filter.type && c.contract_type !== filter.type) return false;
    if (filter.site && c.work_site && !c.work_site.includes(filter.site)) return false;
    return true;
  });

  // 정렬
  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === "total_salary" || sortKey === "weekend_daily") { va = Number(va) || 0; vb = Number(vb) || 0; }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const statusColor = (s) => {
    switch (s) {
      case "확정": return { bg: "#E8F5E9", text: C.success };
      case "작성중": return { bg: "#FFF8E1", text: C.orange };
      case "만료": return { bg: "#FFEBEE", text: C.error };
      case "갱신": return { bg: "#E3F2FD", text: C.blue };
      default: return { bg: C.lightGray, text: C.gray };
    }
  };

  const typeLabel = (t) => {
    switch (t) {
      case "weekday": return "평일제(월급)";
      case "weekend": return "주말제(일당)";
      case "mixed": return "복합근무";
      case "parttime": return "알바";
      default: return t;
    }
  };

  // 통계
  const stats = {
    total: contracts.length,
    confirmed: contracts.filter(c => c.status === "확정").length,
    draft: contracts.filter(c => c.status === "작성중").length,
    expired: contracts.filter(c => c.status === "만료").length,
    renewed: contracts.filter(c => c.status === "갱신").length,
  };

  const thStyle = (key) => ({
    padding: "10px 12px", fontSize: 12, fontWeight: 800, color: C.gray, textAlign: "left",
    cursor: "pointer", whiteSpace: "nowrap", borderBottom: `2px solid ${C.border}`,
    background: sortKey === key ? "#F0F4FF" : "transparent",
    userSelect: "none",
  });

  const tdStyle = { padding: "10px 12px", fontSize: 12, borderBottom: `1px solid ${C.lightGray}`, verticalAlign: "middle" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: 0 }}>📋 계약서 이력 관리</h2>
        {can("edit") && (
          <button onClick={onNewContract} style={btnPrimary}>+ 새 계약서 작성</button>
        )}
      </div>

      {/* 통계 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "전체", value: stats.total, icon: "📋", color: C.navy },
          { label: "확정", value: stats.confirmed, icon: "✅", color: C.success },
          { label: "작성중", value: stats.draft, icon: "✏️", color: C.orange },
          { label: "만료", value: stats.expired, icon: "⏰", color: C.error },
          { label: "갱신", value: stats.renewed, icon: "🔄", color: C.blue },
        ].map(s => (
          <div key={s.label} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: FONT }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={filter.empName} onChange={e => setFilter(p => ({ ...p, empName: e.target.value }))}
          placeholder="🔍 직원명/사번 검색" style={{ ...inputStyle, width: 180 }} />
        <select value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle, width: 130 }}>
          <option value="">전체 상태</option>
          {["작성중", "확정", "만료", "갱신"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.type} onChange={e => setFilter(p => ({ ...p, type: e.target.value }))} style={{ ...inputStyle, width: 150 }}>
          <option value="">전체 유형</option>
          <option value="weekday">평일제(월급)</option>
          <option value="weekend">주말제(일당)</option>
          <option value="mixed">복합근무</option>
          <option value="parttime">알바</option>
        </select>
        <select value={filter.site} onChange={e => setFilter(p => ({ ...p, site: e.target.value }))} style={{ ...inputStyle, width: 170 }}>
          <option value="">전체 사업장</option>
          {SITES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
        </select>
        <button onClick={() => setFilter({ empName: "", status: "", type: "", site: "" })}
          style={{ ...btnSmall, background: C.lightGray, color: C.gray }}>초기화</button>
        <button onClick={loadContracts} style={{ ...btnSmall, background: C.white, color: C.navy, border: `1px solid ${C.navy}` }}>🔄 새로고침</button>
        <div style={{ marginLeft: "auto", fontSize: 12, color: C.gray, fontWeight: 600 }}>
          {filtered.length}건 표시 / 전체 {contracts.length}건
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.gray, fontSize: 14 }}>로딩 중...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.gray }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>저장된 계약서가 없습니다</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>계약서 작성 화면에서 '저장'하면 여기에 이력이 쌓입니다</div>
        </div>
      ) : (
        <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle("emp_no")} onClick={() => toggleSort("emp_no")}>사번 {sortKey === "emp_no" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                <th style={thStyle("emp_name")} onClick={() => toggleSort("emp_name")}>이름 {sortKey === "emp_name" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                <th style={thStyle("contract_type")} onClick={() => toggleSort("contract_type")}>유형</th>
                <th style={thStyle("status")} onClick={() => toggleSort("status")}>상태</th>
                <th style={thStyle("start_date")} onClick={() => toggleSort("start_date")}>계약기간</th>
                <th style={thStyle("total_salary")} onClick={() => toggleSort("total_salary")}>급여</th>
                <th style={thStyle("work_site")}>사업장</th>
                <th style={thStyle("updated_at")} onClick={() => toggleSort("updated_at")}>최종수정 {sortKey === "updated_at" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                <th style={{ ...thStyle(""), cursor: "default" }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const sc = statusColor(c.status);
                const isExpanded = expandedId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr style={{ cursor: "pointer", background: isExpanded ? "#F8F9FF" : "transparent" }}
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                      <td style={tdStyle}><span style={{ fontFamily: "monospace", fontWeight: 700, color: C.navy }}>{c.emp_no}</span></td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{c.emp_name}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: c.contract_type === "weekend" ? "#FFF3E0" : c.contract_type === "mixed" ? "#E3F2FD" : "#F3E5F5", fontWeight: 700 }}>
                          {typeLabel(c.contract_type)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.text, fontWeight: 800 }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11 }}>
                        {dateFmt(c.start_date)}{c.end_date ? ` ~ ${dateFmt(c.end_date)}` : " ~"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                        {c.contract_type === "weekend" ? `${fmt(c.weekend_daily)}원/일` : `${fmt(c.total_salary)}원/월`}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11 }}>{c.work_site || "-"}</td>
                      <td style={{ ...tdStyle, fontSize: 10, color: C.gray }}>
                        {c.updated_at ? new Date(c.updated_at).toLocaleDateString("ko-KR") : "-"}
                      </td>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {can("edit") && (
                            <button onClick={() => onEditContract(c)} title="편집" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>✏️</button>
                          )}
                          {can("edit") && c.status === "작성중" && (
                            <button onClick={() => updateStatus(c.id, "확정")} title="확정" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>✅</button>
                          )}
                          {can("edit") && c.status === "확정" && (
                            <button onClick={() => updateStatus(c.id, "만료")} title="만료처리" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>⏰</button>
                          )}
                          {can("edit") && (
                            <button onClick={() => deleteContract(c.id)} title="삭제" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 2 }}>🗑</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* 확장 상세 */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0, background: "#F8F9FF" }}>
                          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 8 }}>📋 계약 정보</div>
                              <div style={detailRow}>유형: <strong>{typeLabel(c.contract_type)}</strong></div>
                              <div style={detailRow}>기간: <strong>{dateFmt(c.start_date)} ~ {c.end_date ? dateFmt(c.end_date) : "미정"}</strong></div>
                              <div style={detailRow}>근무요일: <strong>{c.work_days || "-"}</strong></div>
                              <div style={detailRow}>근무시간: <strong>{c.work_start || "-"} ~ {c.work_end || "-"}</strong></div>
                              <div style={detailRow}>휴게: <strong>{c.break_min || 0}분</strong></div>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 8 }}>💰 급여</div>
                              {c.contract_type !== "weekend" && <div style={detailRow}>총 월급: <strong style={{ color: C.navy }}>{fmt(c.total_salary)}원</strong></div>}
                              {c.contract_type === "weekend" && <div style={detailRow}>일당: <strong style={{ color: C.orange }}>{fmt(c.weekend_daily)}원</strong></div>}
                              <div style={detailRow}>식대: <strong>{fmt(c.meal_allow)}원</strong></div>
                              {c.leader_allow > 0 && <div style={detailRow}>팀장수당: <strong>{fmt(c.leader_allow)}원</strong></div>}
                              <div style={detailRow}>급여일: <strong>매월 {c.pay_day}일</strong></div>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 8 }}>⚙️ 기타</div>
                              <div style={detailRow}>사업장: <strong>{c.work_site || "-"}</strong></div>
                              <div style={detailRow}>수습: <strong>{c.probation ? `${c.probation_months}개월` : "없음"}</strong></div>
                              {c.special_terms && <div style={detailRow}>특약: <strong>{c.special_terms.slice(0, 50)}{c.special_terms.length > 50 ? "..." : ""}</strong></div>}
                              <div style={detailRow}>생성일: <strong>{c.created_at ? new Date(c.created_at).toLocaleDateString("ko-KR") : "-"}</strong></div>
                            </div>
                          </div>
                          {can("edit") && (
                            <div style={{ padding: "0 20px 16px", display: "flex", gap: 8 }}>
                              <button onClick={() => onEditContract(c)} style={{ ...btnSmall, background: C.navy, color: C.white }}>✏️ 편집</button>
                              {c.status === "작성중" && <button onClick={() => updateStatus(c.id, "확정")} style={{ ...btnSmall, background: C.success, color: C.white }}>✅ 확정</button>}
                              {c.status === "확정" && <button onClick={() => updateStatus(c.id, "만료")} style={{ ...btnSmall, background: C.error, color: C.white }}>⏰ 만료 처리</button>}
                              {c.status === "만료" && <button onClick={() => updateStatus(c.id, "갱신")} style={{ ...btnSmall, background: C.blue, color: C.white }}>🔄 갱신</button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const detailRow = { fontSize: 12, marginBottom: 4, color: C.dark };

// ── 13. 관리자 초대 관리 ──────────────────────────────
function AdminInvitePanel() {
  const { profiles, invitations, sendInvite, cancelInvite, resendInvite, removeAdmin, updateRole, user } = useAuth();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [msg, setMsg] = useState("");

  const APP_URL = window.location.origin;

  const handleSend = async () => {
    if (!newEmail.includes("@")) { setMsg("유효한 이메일을 입력하세요."); return; }
    const { error, invitation } = await sendInvite(newEmail, newRole);
    if (error) { setMsg(error); return; }

    const token = invitation?.token || "";
    const roleName = ROLES[newRole] || newRole;

    // 이메일 자동 작성 (Gmail 새 창)
    const subject = encodeURIComponent(`[ME.PARK] 근로계약서 관리 시스템 관리자 초대`);
    const body = encodeURIComponent(
`안녕하세요,

(주)미스터팍 ME.PARK 근로계약서 관리 시스템에 ${roleName}(으)로 초대합니다.

━━━━━━━━━━━━━━━━━━━━━━
📌 초대 코드: ${token}
🔗 가입 링크: ${APP_URL}
━━━━━━━━━━━━━━━━━━━━━━

[가입 방법]
1. 위 가입 링크 접속
2. "초대 코드로 가입하기" 클릭
3. 초대 코드 입력 → 이름/비밀번호 설정 → 완료

※ 초대 유효기간: 7일
※ 문의: 1899-1871

주식회사 미스터팍`
    );

    window.open(`https://mail.google.com/mail/?view=cm&to=${newEmail}&su=${subject}&body=${body}`, "_blank");

    setMsg(`✅ 초대 생성 완료! 이메일 작성 창이 열렸습니다. (초대코드: ${token})`);
    setNewEmail(""); setShowInviteForm(false);
  };

  const copyToken = (token) => {
    navigator.clipboard.writeText(token).then(() => {
      setMsg("✅ 초대 코드가 클립보드에 복사되었습니다.");
      setTimeout(() => setMsg(""), 2000);
    });
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
                {["이메일", "역할", "상태", "초대코드", "발송일", "만료일", "액션"].map(h => (
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
                  <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "monospace", fontSize: 10, color: C.navy, fontWeight: 700 }}>
                    {inv.token?.slice(0, 8)}...
                    <button onClick={() => copyToken(inv.token)} title="코드 복사" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, marginLeft: 4 }}>📋</button>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", color: C.gray }}>{inv.created_at}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", color: C.gray }}>{inv.expires_at}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                    {inv.status === "pending" && (
                      <>
                        <button onClick={async () => {
                          await resendInvite(inv.id);
                          const subject = encodeURIComponent(`[ME.PARK] 관리자 초대 (재발송)`);
                          const body = encodeURIComponent(`안녕하세요,\n\nME.PARK 관리 시스템 초대를 재발송합니다.\n\n📌 초대 코드: ${inv.token}\n🔗 가입 링크: ${APP_URL}\n\n※ 유효기간이 7일 연장되었습니다.\n\n주식회사 미스터팍`);
                          window.open(`https://mail.google.com/mail/?view=cm&to=${inv.email}&su=${subject}&body=${body}`, "_blank");
                        }} title="재발송" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, marginRight: 4 }}>🔄</button>
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
  const [arts, setArts] = useState({
    weekday: { ...DEFAULT_ARTICLES_WEEKDAY },
    weekend: { ...DEFAULT_ARTICLES_WEEKEND },
    mixed: { ...DEFAULT_ARTICLES_MIXED },
    parttime: { ...DEFAULT_ARTICLES_PARTTIME },
  });

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>⚙️ 설정</h2>

      {/* 조항 편집 */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: "0 0 12px" }}>📋 계약서 조항 편집</h3>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            ["weekday", "평일제 (11조)", C.navy],
            ["weekend", "주말제 (10조)", C.orange],
            ["mixed", "복합근무 (11조)", C.skyBlue],
            ["parttime", "알바 (8조)", C.gray],
          ].map(([k, v, color]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", border: `2px solid ${tab === k ? color : C.border}`, background: tab === k ? color : C.white, color: tab === k ? C.white : C.gray }}>
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
        <button onClick={() => setArts(prev => ({ ...prev, [tab]: getDefaultArticles(tab) }))}
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
  const [employees, setEmployees] = useState([]);
  const [contractEmp, setContractEmp] = useState(null);
  const [contractEdit, setContractEdit] = useState(null);
  const [empLoading, setEmpLoading] = useState(true);

  // Supabase에서 직원 데이터 로드
  const loadEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("*").order("emp_no");
    if (data) setEmployees(data);
    setEmpLoading(false);
  };

  useEffect(() => { loadEmployees(); }, []);

  // 직원 추가/수정
  const saveEmployee = async (emp) => {
    const { id, created_at, updated_at, ...rest } = emp;
    if (id) {
      await supabase.from("employees").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
    } else {
      await supabase.from("employees").insert(rest);
    }
    await loadEmployees();
  };

  // 직원 삭제
  const deleteEmployee = async (id) => {
    await supabase.from("employees").delete().eq("id", id);
    await loadEmployees();
  };

  const goContract = (emp) => { setContractEmp(emp); setContractEdit(null); setPage("contract"); };
  const goResign = (emp) => { setPage("resignation"); };
  const goEditContract = (c) => { setContractEdit(c); setContractEmp(null); setPage("contract"); };
  const goNewContract = () => { setContractEdit(null); setContractEmp(null); setPage("contract"); };

  const navItems = [
    { key: "dashboard", icon: "📊", label: "대시보드" },
    { key: "employees", icon: "👥", label: "직원대장" },
    { key: "contract", icon: "📝", label: "계약서" },
    { key: "history", icon: "📋", label: "계약 이력" },
    { key: "resignation", icon: "📄", label: "사직서" },
    { key: "certificate", icon: "📑", label: "재직증명서" },
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
            <button key={item.key} onClick={() => { setPage(item.key); if (item.key !== "contract") { setContractEmp(null); setContractEdit(null); } }}
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
        {page === "employees" && <EmployeeRoster employees={employees} saveEmployee={saveEmployee} deleteEmployee={deleteEmployee} onContract={goContract} onResign={goResign} onReload={loadEmployees} />}
        {page === "contract" && <ContractWriter employees={employees} initialEmp={contractEmp} initialContract={contractEdit} onSave={() => {}} />}
        {page === "history" && <ContractHistory employees={employees} onEditContract={goEditContract} onNewContract={goNewContract} />}
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
