import { useState, useMemo, useEffect, useCallback, useRef, createContext, useContext, Fragment } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, ShadingType, Header, Footer, PageNumber, WidthType, TableLayoutType } from "docx";

/* ═══════════════════════════════════════════════════════
   (주)미스터팍 근로계약서 관리 시스템 v8.0
   Phase A: clobe.ai 재무 데이터 Import + 기존 HR/수익분석 통합
   Phase B: 재무KPI 5개 + 기간선택 실연산 + P&L확장 + 세금계산서카드
   Phase C: Recharts 현금흐름 차트 + 비용입력 DB저장 + 대시보드 연동
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

// ── 10. 메인 대시보드 (통합 홈) ── Phase C 업그레이드 ──────
function MainDashboard({ employees, onNavigate, profitState }) {
  const { profitMonth: currentMonth, revenueData, overheadData, monthlySummary = [], chartTransactions = [] } = profitState;
  const [period, setPeriod] = useState("month");
  const [plSortBy, setPlSortBy] = useState("profit");
  const [chartPeriod, setChartPeriod] = useState("mtd"); // ★ Phase C: 기본 이번달

  // ★ Phase B: 기간선택 → 대상 월 목록 계산
  const periodMonths = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    if (period === "month" || period === "week" || period === "monthly") return [currentMonth];
    if (period === "quarter") {
      const months = [];
      for (let i = 2; i >= 0; i--) {
        const nm = m - i;
        const ny = nm <= 0 ? y - 1 : y;
        const fm = nm <= 0 ? nm + 12 : nm;
        months.push(`${ny}-${String(fm).padStart(2, "0")}`);
      }
      return months;
    }
    if (period === "year") {
      const months = [];
      for (let i = 1; i <= m; i++) months.push(`${y}-${String(i).padStart(2, "0")}`);
      return months;
    }
    return [currentMonth];
  }, [currentMonth, period]);

  // ★ Phase B: 전월 계산 (전월대비용)
  const prevMonth = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }, [currentMonth]);

  const active = employees.filter(e => e.status === "재직");
  const weekday = active.filter(e => getWorkCat(e.work_code) === "weekday");
  const weekend = active.filter(e => getWorkCat(e.work_code) === "weekend");
  const mixed = active.filter(e => getWorkCat(e.work_code) === "mixed");
  const parttime = active.filter(e => getWorkCat(e.work_code) === "parttime");
  const activeSites = [...new Set(active.filter(e => e.site_code_1 !== "V000").map(e => e.site_code_1))].filter(Boolean);
  const totalSalary = active.reduce((s, e) => s + toNum(e.base_salary) + toNum(e.meal_allow) + toNum(e.leader_allow) + toNum(e.childcare_allow) + toNum(e.car_allow) + (toNum(e.weekend_daily) > 0 ? toNum(e.weekend_daily) * 8 : 0), 0);

  // 수익성 계산 (ProfitabilityPage와 동일 로직)
  const monthRevenue = revenueData[currentMonth] || {};
  const monthOverhead = overheadData[currentMonth] || DEFAULT_OVERHEAD.map(o => ({ ...o }));
  const prevRevenue = revenueData[prevMonth] || {};

  const laborBySite = useMemo(() => {
    const map = {};
    FIELD_SITES.forEach(s => { map[s.code] = { total: 0, count: 0 }; });
    employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000").forEach(e => {
      const sc = e.site_code_1;
      if (!map[sc]) map[sc] = { total: 0, count: 0 };
      const monthly = toNum(e.base_salary) + toNum(e.leader_allow) + toNum(e.meal_allow) + toNum(e.childcare_allow) + toNum(e.car_allow) + (toNum(e.weekend_daily) > 0 ? toNum(e.weekend_daily) * 8 : 0);
      map[sc].total += monthly;
      map[sc].count++;
    });
    return map;
  }, [employees]);

  const allocated = useMemo(() => {
    const totalRev = FIELD_SITES.reduce((s, site) => s + toNum(monthRevenue[site.code]), 0);
    const totalHead = FIELD_SITES.reduce((s, site) => s + (laborBySite[site.code]?.count || 0), 0);
    const activeSiteCount = FIELD_SITES.filter(s => (laborBySite[s.code]?.count || 0) > 0).length || 1;
    const result = {};
    FIELD_SITES.forEach(s => { result[s.code] = 0; });
    monthOverhead.forEach(oh => {
      if (oh.method === "hq_only") return;
      FIELD_SITES.forEach(site => {
        const rev = toNum(monthRevenue[site.code]);
        const head = laborBySite[site.code]?.count || 0;
        let share = 0;
        if (oh.method === "revenue" && totalRev > 0) share = (rev / totalRev) * toNum(oh.amount);
        else if (oh.method === "headcount" && totalHead > 0) share = (head / totalHead) * toNum(oh.amount);
        else if (oh.method === "site_count" && head > 0) share = toNum(oh.amount) / activeSiteCount;
        result[site.code] += Math.round(share);
      });
    });
    return result;
  }, [monthRevenue, monthOverhead, laborBySite]);

  const sitePLs = useMemo(() => {
    return FIELD_SITES.map(site => {
      const rev = toNum(monthRevenue[site.code]);
      const labor = laborBySite[site.code]?.total || 0;
      const overhead = allocated[site.code] || 0;
      const profit = rev - labor - overhead;
      const margin = rev > 0 ? (profit / rev) * 100 : 0;
      const count = laborBySite[site.code]?.count || 0;
      const laborRatio = rev > 0 ? (labor / rev) * 100 : 0;
      // ★ Phase B: 전월대비
      const prevRev = toNum(prevRevenue[site.code]);
      const momChange = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : null;
      return { ...site, rev, labor, overhead, profit, margin, count, laborRatio, momChange };
    }).filter(s => s.rev > 0 || s.count > 0);
  }, [monthRevenue, prevRevenue, laborBySite, allocated]);

  const sortedPLs = useMemo(() => {
    const arr = [...sitePLs];
    if (plSortBy === "profit") arr.sort((a, b) => b.profit - a.profit);
    else if (plSortBy === "margin") arr.sort((a, b) => b.margin - a.margin);
    else if (plSortBy === "revenue") arr.sort((a, b) => b.rev - a.rev);
    else if (plSortBy === "labor") arr.sort((a, b) => b.labor - a.labor);
    return arr;
  }, [sitePLs, plSortBy]);

  const ptotals = useMemo(() => {
    const t = { rev: 0, labor: 0, overhead: 0, profit: 0, count: 0, black: 0, red: 0 };
    sitePLs.forEach(s => {
      t.rev += s.rev; t.labor += s.labor; t.overhead += s.overhead; t.profit += s.profit; t.count += s.count;
      if (s.profit >= 0) t.black++; else t.red++;
    });
    t.laborRatio = t.rev > 0 ? (t.labor / t.rev) * 100 : 0;
    t.avgProfit = sitePLs.length > 0 ? t.profit / sitePLs.length : 0;
    return t;
  }, [sitePLs]);

  // ★ Phase B: 재무 KPI — monthly_summary에서 기간별 집계
  const finKPI = useMemo(() => {
    const targetSummaries = monthlySummary.filter(s => periodMonths.includes(s.month));
    const bankIn = targetSummaries.reduce((s, d) => s + toNum(d.bank_in), 0);
    const bankOut = targetSummaries.reduce((s, d) => s + toNum(d.bank_out), 0);
    // 가용자금: 가장 최근 월의 bank_balance
    const latestSummary = targetSummaries.sort((a, b) => b.month.localeCompare(a.month))[0];
    const bankBalance = toNum(latestSummary?.bank_balance);
    const cardTotal = targetSummaries.reduce((s, d) => s + toNum(d.card_total), 0);
    const cardCount = targetSummaries.reduce((s, d) => s + toNum(d.card_count), 0);
    // 인건비율
    const laborRatio = ptotals.rev > 0 ? ((ptotals.labor / ptotals.rev) * 100).toFixed(1) : "—";

    // 전월대비 (입금/출금)
    const prevSummaries = monthlySummary.filter(s => s.month === prevMonth);
    const prevBankIn = prevSummaries.reduce((s, d) => s + toNum(d.bank_in), 0);
    const prevBankOut = prevSummaries.reduce((s, d) => s + toNum(d.bank_out), 0);
    const inChange = prevBankIn > 0 ? ((bankIn - prevBankIn) / prevBankIn * 100).toFixed(1) : null;
    const outChange = prevBankOut > 0 ? ((bankOut - prevBankOut) / prevBankOut * 100).toFixed(1) : null;

    // 세금계산서 / 현금영수증 요약
    const taxSaleTotal = targetSummaries.reduce((s, d) => s + toNum(d.tax_sale_total), 0);
    const taxSaleSupply = targetSummaries.reduce((s, d) => s + toNum(d.tax_sale_supply), 0);
    const taxSaleTax = targetSummaries.reduce((s, d) => s + toNum(d.tax_sale_tax), 0);
    const taxSaleCount = targetSummaries.reduce((s, d) => s + toNum(d.tax_sale_count), 0);
    const taxBuyTotal = targetSummaries.reduce((s, d) => s + toNum(d.tax_buy_total), 0);
    const taxBuySupply = targetSummaries.reduce((s, d) => s + toNum(d.tax_buy_supply), 0);
    const taxBuyTax = targetSummaries.reduce((s, d) => s + toNum(d.tax_buy_tax), 0);
    const taxBuyCount = targetSummaries.reduce((s, d) => s + toNum(d.tax_buy_count), 0);
    const cashSaleTotal = targetSummaries.reduce((s, d) => s + toNum(d.cash_sale_total), 0);
    const cashSaleCount = targetSummaries.reduce((s, d) => s + toNum(d.cash_sale_count), 0);
    const cashBuyTotal = targetSummaries.reduce((s, d) => s + toNum(d.cash_buy_total), 0);
    const cashBuyCount = targetSummaries.reduce((s, d) => s + toNum(d.cash_buy_count), 0);

    return {
      bankBalance, bankIn, bankOut, cardTotal, cardCount, laborRatio,
      inChange, outChange,
      taxSaleTotal, taxSaleSupply, taxSaleTax, taxSaleCount,
      taxBuyTotal, taxBuySupply, taxBuyTax, taxBuyCount,
      cashSaleTotal, cashSaleCount, cashBuyTotal, cashBuyCount,
      hasData: targetSummaries.length > 0,
    };
  }, [monthlySummary, periodMonths, prevMonth, ptotals]);

  const kpiCard = (icon, value, label, sub, color, onClick) => (
    <div onClick={onClick} style={{
      background: C.white, borderRadius: 14, padding: "20px 18px", border: `1px solid ${C.border}`,
      flex: "1 1 170px", minWidth: 170, cursor: onClick ? "pointer" : "default",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)", transition: "transform 0.15s, box-shadow 0.15s",
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; } }}
    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: color || C.navy, fontFamily: FONT, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.gray, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  // ★ Phase B: 기간 표시 텍스트
  const periodLabel = useMemo(() => {
    if (period === "month") return `${currentMonth} 기준`;
    if (period === "week") return `최근 7일 (${currentMonth} 기준)`;
    if (period === "monthly") return `최근 30일 (${currentMonth} 기준)`;
    if (period === "quarter") return `${periodMonths[0]} ~ ${periodMonths[periodMonths.length - 1]}`;
    if (period === "year") return `${currentMonth.slice(0, 4)}년 연간`;
    return currentMonth;
  }, [period, currentMonth, periodMonths]);

  // ★ Phase C: 현금흐름 차트 데이터 가공
  const chartData = useMemo(() => {
    if (!chartTransactions.length) return [];
    const now = new Date();
    let startDate;
    if (chartPeriod === "3m") startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    else if (chartPeriod === "6m") startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    else if (chartPeriod === "12m") startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    else if (chartPeriod === "mtd") startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (chartPeriod === "ytd") startDate = new Date(now.getFullYear(), 0, 1);
    else startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const filtered = chartTransactions.filter(tx => new Date(tx.tx_date) >= startDate);

    const isDaily = chartPeriod === "mtd";
    const isMonthly = ["6m", "12m", "ytd"].includes(chartPeriod);
    const grouped = {};

    // 주별 키: 해당 주의 월요일 날짜 기준
    const getMonday = (d) => {
      const dt = new Date(d);
      const day = dt.getDay();
      const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(dt.setDate(diff));
    };
    const fmtMD = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

    filtered.forEach(tx => {
      const d = new Date(tx.tx_date);
      let key, label;
      if (isDaily) {
        key = tx.tx_date?.slice(0, 10);
        label = `${d.getMonth() + 1}/${d.getDate()}`;
      } else if (isMonthly) {
        key = tx.tx_date?.slice(0, 7);
        label = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else {
        // 주별: 월요일~일요일 범위 표시
        const mon = getMonday(d);
        const sun = new Date(mon);
        sun.setDate(sun.getDate() + 6);
        key = mon.toISOString().slice(0, 10); // 정렬용 (2026-03-02)
        label = `${fmtMD(mon)}~${fmtMD(sun)}`;
      }
      if (!grouped[key]) grouped[key] = { key, label, inAmt: 0, outAmt: 0, balance: 0 };
      grouped[key].inAmt += toNum(tx.amount_in);
      grouped[key].outAmt += toNum(tx.amount_out);
      if (toNum(tx.balance_after) > 0) grouped[key].balance = toNum(tx.balance_after);
    });

    const arr = Object.values(grouped).sort((a, b) => a.key.localeCompare(b.key));
    let lastBal = 0;
    arr.forEach(d => { if (d.balance > 0) lastBal = d.balance; else d.balance = lastBal; });
    return arr;
  }, [chartTransactions, chartPeriod]);

  const chartFmt = (v) => {
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(1) + "억";
    if (Math.abs(v) >= 1e4) return Math.round(v / 1e4).toLocaleString() + "만";
    return v.toLocaleString();
  };

  return (
    <div>
      {/* ── 헤더 ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.dark, margin: 0 }}>ME.PARK 종합 대시보드</h2>
          <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{periodLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 4, background: C.lightGray, padding: 3, borderRadius: 10 }}>
          {[["month", "해당월"], ["week", "주간"], ["monthly", "월간"], ["quarter", "분기"], ["year", "연간"]].map(([k, v]) => (
            <button key={k} onClick={() => setPeriod(k)} style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: "none", background: period === k ? C.navy : "transparent",
              color: period === k ? "#fff" : C.gray, transition: "all 0.15s",
            }}>{v}</button>
          ))}
        </div>
      </div>

      {/* ── A. 핵심 지표 스트립 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        {[
          { label: "재직인원", value: `${active.length}명`, sub: `평${weekday.length} 주${weekend.length} 복${mixed.length} 알${parttime.length}`, color: C.navy, click: () => onNavigate("employees") },
          { label: "총 매출", value: pFmt(ptotals.rev), sub: `${activeSites.length}개 사업장`, color: C.navy, click: () => onNavigate("profit_cost_input") },
          { label: "영업이익", value: pFmt(ptotals.profit), sub: ptotals.rev > 0 ? `이익률 ${((ptotals.profit / ptotals.rev) * 100).toFixed(1)}%` : "—", color: ptotals.profit >= 0 ? C.success : C.error },
          { label: "가용자금", value: finKPI.hasData ? pFmt(finKPI.bankBalance) : "—", sub: finKPI.hasData ? "은행잔액 합산" : "Import 필요", color: C.navy },
          { label: "인건비율", value: finKPI.laborRatio !== "—" ? finKPI.laborRatio + "%" : "—", sub: `인건비 ${pFmt(ptotals.labor)}`, color: Number(finKPI.laborRatio) > 50 ? C.error : C.orange },
        ].map((item, i) => (
          <div key={i} onClick={item.click} style={{
            background: "#fff", borderRadius: 12, padding: "16px 14px", border: `1px solid ${C.border}`,
            cursor: item.click ? "pointer" : "default", transition: "all 0.15s",
          }}
          onMouseEnter={e => { if (item.click) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
          >
            <div style={{ fontSize: 11, color: C.gray, fontWeight: 700, marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: item.color, lineHeight: 1.1 }}>{item.value}</div>
            {item.sub && <div style={{ fontSize: 10, color: C.gray, marginTop: 5 }}>{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── B. 2컬럼: 좌(수익·재무 요약) / 우(차트) ── */}
      <div style={{ display: "grid", gridTemplateColumns: chartData.length > 0 ? "340px 1fr" : "1fr", gap: 16, marginBottom: 18, minHeight: chartData.length > 0 ? 480 : "auto" }}>

        {/* 좌: 수익·재무 요약 패널 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "space-between" }}>

          {/* 수익 구조 */}
          <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ background: C.navy, color: "#fff", padding: "9px 14px", fontSize: 12, fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
              <span>수익 구조</span>
              <span style={{ color: C.gold }}>{currentMonth}</span>
            </div>
            <div style={{ padding: 14 }}>
              {[
                { label: "매출", value: pFmt(ptotals.rev), color: C.navy },
                { label: "인건비", value: pFmt(ptotals.labor), pct: ptotals.rev > 0 ? ((ptotals.labor / ptotals.rev) * 100).toFixed(0) + "%" : "—", color: C.orange },
                { label: "간접비", value: pFmt(ptotals.overhead), pct: ptotals.rev > 0 ? ((ptotals.overhead / ptotals.rev) * 100).toFixed(0) + "%" : "—", color: C.gray },
                { label: "영업이익", value: pFmt(ptotals.profit), pct: ptotals.rev > 0 ? ((ptotals.profit / ptotals.rev) * 100).toFixed(1) + "%" : "—", color: ptotals.profit >= 0 ? C.success : C.error, bold: true },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none", borderTopWidth: r.bold ? 2 : 1, borderTopColor: r.bold ? C.navy : C.border }}>
                  <span style={{ fontSize: 12, color: r.bold ? C.dark : C.gray, fontWeight: r.bold ? 800 : 600 }}>{r.label}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: r.color }}>{r.value}</span>
                    {r.pct && <span style={{ fontSize: 10, color: C.gray, marginLeft: 6 }}>{r.pct}</span>}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.success }}>흑자 {ptotals.black}곳</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.error }}>적자 {ptotals.red}곳</span>
              </div>
            </div>
          </div>

          {/* 사업장 현황 */}
          <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ background: C.navy, color: "#fff", padding: "9px 14px", fontSize: 12, fontWeight: 800, display: "flex", justifyContent: "space-between", cursor: "pointer" }}
              onClick={() => onNavigate("employees")}>
              <span>사업장 현황</span>
              <span style={{ color: C.gold, fontSize: 11 }}>{activeSites.length}개 운영 →</span>
            </div>
            <div style={{ padding: "8px 14px", maxHeight: 200, overflowY: "auto" }}>
              {sortedPLs.length > 0 ? sortedPLs.map((s, i) => (
                <div key={s.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderTop: i > 0 ? `1px solid #f0f0f0` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.navy, flexShrink: 0 }}>{s.code}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ fontSize: 9, color: C.gray, flexShrink: 0 }}>{s.count}명</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {s.rev > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: C.dark }}>{pFmt(s.rev)}</span>}
                    <span style={{ fontSize: 10, fontWeight: 800, color: s.profit >= 0 ? C.success : C.error, minWidth: 36, textAlign: "right" }}>
                      {s.rev > 0 ? (s.margin >= 0 ? "+" : "") + s.margin.toFixed(0) + "%" : "—"}
                    </span>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: 11, color: C.gray, textAlign: "center", padding: 8 }}>매출 데이터를 입력해주세요</div>
              )}
            </div>
          </div>

          {/* 재무 요약 */}
          {finKPI.hasData && (
            <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ background: C.navy, color: "#fff", padding: "9px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                onClick={() => onNavigate("profit_import")}>
                <span>재무 현황</span>
                <span style={{ color: C.gold, fontSize: 11 }}>Import →</span>
              </div>
              <div style={{ padding: 14 }}>
                {[
                  { label: "입금", value: pFmt(finKPI.bankIn), change: finKPI.inChange, color: C.navy },
                  { label: "출금", value: pFmt(finKPI.bankOut), change: finKPI.outChange, color: C.orange },
                  { label: "카드이용", value: pFmt(finKPI.cardTotal), sub: finKPI.cardCount > 0 ? `${finKPI.cardCount}건` : null, color: C.blue },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                    <span style={{ fontSize: 12, color: C.gray, fontWeight: 600 }}>{r.label}</span>
                    <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: r.color }}>{r.value}</span>
                      {r.change && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: Number(r.change) >= 0 ? C.success : C.error }}>
                          {Number(r.change) >= 0 ? "▲" : "▼"}{Math.abs(Number(r.change))}%
                        </span>
                      )}
                      {r.sub && <span style={{ fontSize: 10, color: C.gray }}>{r.sub}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 세금계산서·현금영수증 요약 */}
          {finKPI.hasData && (finKPI.taxSaleCount > 0 || finKPI.taxBuyCount > 0) && (
            <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ background: C.navy, color: "#fff", padding: "9px 14px", fontSize: 12, fontWeight: 800 }}>세금계산서 · 현금영수증</div>
              <div style={{ padding: "10px 14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: finKPI.cashSaleCount > 0 || finKPI.cashBuyCount > 0 ? 8 : 0 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.success, fontWeight: 700 }}>매출 {finKPI.taxSaleCount}건</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.dark }}>{pFmt(finKPI.taxSaleTotal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.error, fontWeight: 700 }}>매입 {finKPI.taxBuyCount}건</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.dark }}>{pFmt(finKPI.taxBuyTotal)}</div>
                  </div>
                </div>
                {(finKPI.cashSaleCount > 0 || finKPI.cashBuyCount > 0) && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>현금영수증 매출 {finKPI.cashSaleCount}건</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{pFmt(finKPI.cashSaleTotal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>현금영수증 매입 {finKPI.cashBuyCount}건</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{pFmt(finKPI.cashBuyTotal)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* 우: 현금흐름 차트 */}
        {chartData.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* 차트 헤더 */}
            <div style={{ background: C.navy, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>현금흐름</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: 8 }}>
                  {chartPeriod === "mtd" ? "일별" : chartPeriod === "3m" ? "주별" : "월별"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.12)", padding: 2, borderRadius: 8 }}>
                {[
                  ["mtd", "이번달", "이번 달 1일~오늘 · 일별"],
                  ["3m", "3개월", "최근 3개월 · 주별"],
                  ["6m", "6개월", "최근 6개월 · 월별"],
                  ["12m", "12개월", "최근 12개월 · 월별"],
                  ["ytd", "YTD", `${new Date().getFullYear()}년 1월~현재 · 월별`],
                ].map(([k, v, tip]) => (
                  <button key={k} onClick={() => setChartPeriod(k)} title={tip} style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    border: "none", background: chartPeriod === k ? C.gold : "transparent",
                    color: chartPeriod === k ? C.navy : "rgba(255,255,255,0.65)", transition: "all 0.15s",
                  }}>{v}</button>
                ))}
              </div>
            </div>
            {/* 범례 */}
            <div style={{ display: "flex", gap: 16, padding: "10px 16px 0", justifyContent: "center" }}>
              {[
                [C.navy, "입금", chartData.reduce((s, d) => s + (d.inAmt || 0), 0)],
                [C.orange, "출금", chartData.reduce((s, d) => s + (d.outAmt || 0), 0)],
                [C.gold, "잔액", chartData[chartData.length - 1]?.balance || 0],
              ].map(([color, label, val]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: label === "잔액" ? 16 : 8, height: label === "잔액" ? 2.5 : 8, background: color, borderRadius: 2 }} />
                  <span style={{ fontSize: 10, color: C.gray }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.dark }}>{pFmt(val)}</span>
                </div>
              ))}
            </div>
            {/* 차트 영역 */}
            <div style={{ flex: 1, padding: "4px 8px 12px", minHeight: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.navy} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={C.navy} stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.orange} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={C.orange} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.gray }} tickLine={false} axisLine={{ stroke: "#eee" }} />
                  <YAxis yAxisId="amount" tick={{ fontSize: 9, fill: C.gray }} tickLine={false} axisLine={false} tickFormatter={chartFmt} width={55} />
                  <YAxis yAxisId="balance" orientation="right" tick={{ fontSize: 9, fill: C.gold, fontWeight: 600 }} tickLine={false} axisLine={false} tickFormatter={chartFmt} width={55} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", fontSize: 11, padding: "10px 14px" }}
                    formatter={(v, name) => {
                      const color = name === "입금" ? C.navy : name === "출금" ? C.orange : C.gold;
                      return [<span style={{ fontWeight: 800, color }}>{pFmtFull(v)}원</span>, name];
                    }}
                    labelStyle={{ fontWeight: 800, color: C.dark, marginBottom: 4, fontSize: 11 }}
                    cursor={{ fill: "rgba(20,40,160,0.04)" }}
                  />
                  <Bar yAxisId="amount" dataKey="inAmt" fill="url(#gradIn)" name="입금" radius={[3, 3, 0, 0]}
                    barSize={chartData.length > 30 ? 5 : chartData.length > 15 ? 8 : 14} />
                  <Bar yAxisId="amount" dataKey="outAmt" fill="url(#gradOut)" name="출금" radius={[3, 3, 0, 0]}
                    barSize={chartData.length > 30 ? 5 : chartData.length > 15 ? 8 : 14} />
                  <Line yAxisId="balance" dataKey="balance" stroke={C.gold} strokeWidth={2}
                    dot={{ fill: C.gold, r: 2.5, strokeWidth: 0 }}
                    activeDot={{ fill: C.gold, r: 4, strokeWidth: 2, stroke: "#fff" }}
                    name="잔액" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ── C. P&L 테이블 ── */}
      <div style={{ ...cardStyle, overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: 0 }}>사업장별 손익</h3>
          <div style={{ display: "flex", gap: 3 }}>
            {[["profit", "이익순"], ["margin", "이익률"], ["revenue", "매출순"], ["labor", "인건비"]].map(([k, v]) => (
              <button key={k} onClick={() => setPlSortBy(k)} style={{
                padding: "5px 11px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${plSortBy === k ? C.navy : C.border}`,
                background: plSortBy === k ? C.navy : "#fff",
                color: plSortBy === k ? "#fff" : C.gray,
              }}>{v}</button>
            ))}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["#", "사업장", "인원", "매출", "전월비", "인건비", "인건비율", "간접비", "이익", "이익률"].map(h => (
                <th key={h} style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: h === "사업장" ? "left" : "center", whiteSpace: "nowrap", fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPLs.map((s, i) => (
              <tr key={s.code} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 700, color: C.gray, fontSize: 10 }}>{i + 1}</td>
                <td style={{ padding: "7px 6px", fontWeight: 600, fontSize: 11 }}>
                  <span style={{ color: C.navy, fontWeight: 700, marginRight: 4, fontSize: 10 }}>{s.code}</span>{s.name}
                </td>
                <td style={{ padding: "7px 6px", textAlign: "center", fontSize: 10 }}>{s.count}</td>
                <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700 }}>{pFmtFull(s.rev)}</td>
                <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 700, fontSize: 10,
                  color: s.momChange === null ? C.gray : s.momChange >= 0 ? C.success : C.error }}>
                  {s.momChange === null ? "—" : `${s.momChange >= 0 ? "▲" : "▼"}${Math.abs(s.momChange).toFixed(1)}%`}
                </td>
                <td style={{ padding: "7px 6px", textAlign: "right", color: C.orange, fontWeight: 700 }}>{pFmtFull(s.labor)}</td>
                <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 700, fontSize: 10,
                  color: s.laborRatio > 60 ? C.error : s.laborRatio > 45 ? C.orange : C.success }}>
                  {s.rev > 0 ? s.laborRatio.toFixed(1) + "%" : "—"}
                </td>
                <td style={{ padding: "7px 6px", textAlign: "right", color: C.gray }}>{pFmtFull(s.overhead)}</td>
                <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 800, color: s.profit >= 0 ? C.success : C.error }}>{pFmtFull(s.profit)}</td>
                <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 700, color: s.margin >= 0 ? C.success : C.error }}>{s.rev > 0 ? s.margin.toFixed(1) + "%" : "—"}</td>
              </tr>
            ))}
            {sortedPLs.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: C.gray }}>수익성 분석 → 비용입력에서 매출을 입력하세요</td></tr>
            )}
            {sortedPLs.length > 0 && (
              <>
                <tr style={{ background: C.navy }}>
                  <td colSpan={2} style={{ padding: "8px 6px", color: C.gold, fontWeight: 900, textAlign: "center", fontSize: 11 }}>합계</td>
                  <td style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10 }}>{ptotals.count}</td>
                  <td style={{ padding: "8px 6px", color: "#fff", fontWeight: 800, textAlign: "right" }}>{pFmtFull(ptotals.rev)}</td>
                  <td style={{ padding: "8px 6px", color: "#fff", textAlign: "center" }}>—</td>
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 800, textAlign: "right" }}>{pFmtFull(ptotals.labor)}</td>
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 800, textAlign: "center", fontSize: 10 }}>{ptotals.rev > 0 ? ptotals.laborRatio.toFixed(1) + "%" : "—"}</td>
                  <td style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: "right" }}>{pFmtFull(ptotals.overhead)}</td>
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 900, textAlign: "right" }}>{pFmtFull(ptotals.profit)}</td>
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 800, textAlign: "center", fontSize: 10 }}>{ptotals.rev > 0 ? ((ptotals.profit / ptotals.rev) * 100).toFixed(1) + "%" : "—"}</td>
                </tr>
                <tr style={{ background: "#F0F4FF" }}>
                  <td colSpan={2} style={{ padding: "7px 6px", color: C.navy, fontWeight: 800, textAlign: "center", fontSize: 10 }}>사업장 평균</td>
                  <td style={{ padding: "7px 6px", color: C.navy, fontWeight: 700, textAlign: "center", fontSize: 10 }}>{(ptotals.count / (sitePLs.length || 1)).toFixed(1)}</td>
                  <td style={{ padding: "7px 6px", color: C.navy, fontWeight: 700, textAlign: "right", fontSize: 10 }}>{pFmtFull(ptotals.rev / (sitePLs.length || 1))}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center" }}>—</td>
                  <td style={{ padding: "7px 6px", color: C.orange, fontWeight: 700, textAlign: "right", fontSize: 10 }}>{pFmtFull(ptotals.labor / (sitePLs.length || 1))}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center" }}>—</td>
                  <td style={{ padding: "7px 6px", color: C.gray, fontWeight: 700, textAlign: "right", fontSize: 10 }}>{pFmtFull(ptotals.overhead / (sitePLs.length || 1))}</td>
                  <td style={{ padding: "7px 6px", color: ptotals.avgProfit >= 0 ? C.success : C.error, fontWeight: 800, textAlign: "right", fontSize: 10 }}>{pFmtFull(ptotals.avgProfit)}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center" }}>—</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 10-1. HR 대시보드 ──────────────────────────────────
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
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: 0 }}>👥 직원현황</h2>
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

      {/* 근무유형 분포 + 사업장별 인원 요약 */}
      {(() => {
        const active = employees.filter(e => e.status === "재직");
        const wdC = active.filter(e => getWorkCat(e.work_code) === "weekday").length;
        const weC = active.filter(e => getWorkCat(e.work_code) === "weekend").length;
        const mxC = active.filter(e => getWorkCat(e.work_code) === "mixed").length;
        const ptC = active.filter(e => getWorkCat(e.work_code) === "parttime").length;
        const aSites = [...new Set(active.map(e => e.site_code_1))].filter(Boolean).sort();
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            {/* 근무유형 분포 */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: C.dark, margin: "0 0 10px" }}>근무유형 분포</h3>
              {[
                { label: "평일계열", count: wdC, color: C.navy },
                { label: "주말계열", count: weC, color: C.orange },
                { label: "복합", count: mxC, color: C.skyBlue },
                { label: "알바", count: ptC, color: C.gray },
              ].map(b => (
                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, width: 55, color: C.dark }}>{b.label}</span>
                  <div style={{ flex: 1, height: 20, background: C.lightGray, borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${active.length ? (b.count / active.length) * 100 : 0}%`, height: "100%", background: b.color, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4, transition: "width 0.5s" }}>
                      {b.count > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff" }}>{b.count}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: b.color, width: 36, textAlign: "right" }}>{active.length ? ((b.count / active.length) * 100).toFixed(0) : 0}%</span>
                </div>
              ))}
            </div>
            {/* 사업장별 인원 */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: C.dark, margin: "0 0 10px" }}>🏢 사업장별 인원</h3>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ background: C.navy }}>
                    {["코드", "사업장", "평일", "주말", "복합", "알바", "합계"].map(h => (
                      <th key={h} style={{ padding: "5px 4px", color: C.white, fontWeight: 700, textAlign: "center", position: "sticky", top: 0, background: C.navy }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {aSites.map((sc, i) => {
                      const se = active.filter(e => e.site_code_1 === sc);
                      return (
                        <tr key={sc} style={{ background: i % 2 ? C.bg : C.white }}>
                          <td style={{ padding: "4px", textAlign: "center", fontWeight: 700, color: C.navy, fontSize: 10 }}>{sc}</td>
                          <td style={{ padding: "4px", fontSize: 10 }}>{getSiteName(sc)}</td>
                          <td style={{ padding: "4px", textAlign: "center" }}>{se.filter(e => getWorkCat(e.work_code) === "weekday").length || "−"}</td>
                          <td style={{ padding: "4px", textAlign: "center" }}>{se.filter(e => getWorkCat(e.work_code) === "weekend").length || "−"}</td>
                          <td style={{ padding: "4px", textAlign: "center" }}>{se.filter(e => getWorkCat(e.work_code) === "mixed").length || "−"}</td>
                          <td style={{ padding: "4px", textAlign: "center" }}>{se.filter(e => getWorkCat(e.work_code) === "parttime").length || "−"}</td>
                          <td style={{ padding: "4px", textAlign: "center", fontWeight: 800 }}>{se.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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

// ── 16-0. clobe.ai Import 시스템 (v8.0) ────────────────

const LABEL_CATEGORY_MAP = {
  "매출": "revenue", "매출 취소/환불": "revenue_refund",
  "급여": "cost_labor", "잡급": "cost_labor",
  "보험료": "cost_overhead", "매출원가": "cost_direct",
  "기타 영업비용": "cost_overhead", "차량유지비": "cost_overhead",
  "지급수수료": "cost_overhead", "임차료": "cost_overhead",
  "통신비": "cost_overhead", "복리후생비": "cost_overhead",
  "광고선전비": "cost_overhead", "소모품비": "cost_overhead",
  "여비교통비": "cost_overhead", "세금과공과": "cost_overhead",
  "주주/임원/직원 차입금 상환": "financing", "금융자산 취득": "investing",
  "금융자산 처분": "investing", "계정 없는 출금": "unclassified",
  "계정 없는 입금": "unclassified",
};

const FILE_PATTERNS = [
  { type: "bank_label",    pattern: /은행[\s_]*거래내역[\s_]*라벨/, label: "은행 거래내역 라벨", icon: "🏦", priority: 1 },
  { type: "bank",          pattern: /은행[\s_]*거래내역(?![\s_]*라벨)/, label: "은행 거래내역", icon: "🏧", priority: 2 },
  { type: "tax_invoice",   pattern: /세금계산서/, label: "세금계산서", icon: "🧾", priority: 1 },
  { type: "card_approval", pattern: /카드[\s_]*승인내역/, label: "카드 승인내역", icon: "💳", priority: 1 },
  { type: "card_billing",  pattern: /카드[\s_]*청구내역/, label: "카드 청구내역 라벨", icon: "📋", priority: 2 },
  { type: "cash_receipt",  pattern: /현금영수증/, label: "현금영수증", icon: "🧾", priority: 1 },
];

function parseMeta(wb) {
  const ms = wb.SheetNames.find(n => n === "메타정보");
  if (!ms) return {};
  const ws = wb.Sheets[ms];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const meta = {};
  rows.forEach(r => {
    if (r[0] === "워크스페이스") meta.workspace = r[1];
    if (r[0] === "다운로드 일시") meta.downloadedAt = r[1];
    if (r[0] === "조회 기간") meta.period = r[1];
  });
  return meta;
}

function parseBankLabel(wb) {
  const sn = wb.SheetNames.find(n => n.includes("통합"));
  if (!sn) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" });
  return rows.map(r => ({
    tx_date: r["거래일시"] || "",
    tx_type: "bank",
    amount_in: Number(r["입금"]) || 0,
    amount_out: Number(r["출금"]) || 0,
    account_label: r["계정 라벨"] || "",
    category: LABEL_CATEGORY_MAP[r["계정 라벨"]] || "unclassified",
    vendor_label: r["거래처 라벨"] || "",
    group_label: r["그룹 라벨"] || "",
    description: r["적요"] || "",
    counterpart: r["거래자명"] || "",
    bank_name: r["은행"] || "",
    account_no: r["계좌번호"] || "",
    account_alias: r["계좌명"] || "",
  }));
}

function parseBankPlain(wb) {
  const sn = wb.SheetNames.find(n => n.includes("통합"));
  if (!sn) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" });
  return rows.map(r => ({
    tx_date: r["거래일시"] || "",
    account_no: r["계좌번호"] || "",
    amount_in: Number(r["입금액"]) || 0,
    amount_out: Number(r["출금액"]) || 0,
    balance_after: Number(r["거래후잔액"]) || 0,
  }));
}

function mergeBankBalance(labelRows, plainRows) {
  const balMap = {};
  plainRows.forEach(r => {
    const key = `${r.tx_date}|${r.account_no}|${r.amount_in}|${r.amount_out}`;
    balMap[key] = r.balance_after;
  });
  return labelRows.map(r => {
    const key = `${r.tx_date}|${r.account_no}|${r.amount_in}|${r.amount_out}`;
    return { ...r, balance_after: balMap[key] || null };
  });
}

function parseTaxInvoice(wb) {
  const sn = wb.SheetNames.find(n => n === "통합");
  if (!sn) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" });
  return rows.map(r => {
    const isSale = (r["매출 매입 유형"] || "").includes("매출");
    return {
      tx_date: r["발급일자"] || "",
      tx_type: "tax_invoice",
      amount_in: isSale ? (Number(r["합계금액"]) || 0) : 0,
      amount_out: !isSale ? (Number(r["합계금액"]) || 0) : 0,
      sale_or_buy: isSale ? "매출" : "매입",
      supply_amount: Number(r["공급가액"]) || 0,
      tax_amount: Number(r["세액"]) || 0,
      counterpart: (r["거래처 상호"] || "").trim(),
      description: r["대표 품목"] || "",
      biz_reg_no: r["거래처 사업자등록번호"] || "",
      category: isSale ? "revenue" : "cost_direct",
    };
  });
}

function parseCardApproval(wb) {
  const sn = wb.SheetNames.find(n => n === "카드 승인내역");
  if (!sn) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" });
  return rows.map(r => ({
    tx_date: r["승인일시"] || "",
    tx_type: "card",
    amount_out: Number(r["승인금액(원)"]) || 0,
    amount_in: 0,
    card_company: r["카드사"] || "",
    card_no: r["카드번호"] || "",
    merchant_name: r["가맹점명"] || "",
    merchant_biz: r["가맹점 업종"] || "",
    tax_amount: Number(r["부가세"]) || 0,
    description: r["가맹점명"] || "",
    category: "cost_overhead",
  }));
}

function parseCashReceipt(wb) {
  const sn = wb.SheetNames.find(n => n === "통합");
  if (!sn) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" });
  return rows.map(r => {
    const isSale = (r["구분"] || "").includes("매출");
    return {
      tx_date: r["사용일시"] || "",
      tx_type: "cash_receipt",
      amount_in: isSale ? (Number(r["총금액"]) || 0) : 0,
      amount_out: !isSale ? (Number(r["총금액"]) || 0) : 0,
      sale_or_buy: isSale ? "매출" : "매입",
      supply_amount: Number(r["공급가액"]) || 0,
      tax_amount: Number(r["부가세"]) || 0,
      counterpart: r["거래처명"] || "",
      category: isSale ? "revenue" : "cost_overhead",
    };
  });
}

function FinancialImportPage({ onImportComplete }) {
  const [files, setFiles] = useState([]);
  const [parsedFiles, setParsedFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dupMode, setDupMode] = useState("skip");
  const [importHistory, setImportHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // Import 이력 로드
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("financial_transactions")
        .select("import_batch, source_file, created_at")
        .not("import_batch", "is", null)
        .order("created_at", { ascending: false });
      if (data) {
        const batches = {};
        data.forEach(d => {
          if (!batches[d.import_batch]) batches[d.import_batch] = { batch: d.import_batch, file: d.source_file, date: d.created_at, count: 0 };
          batches[d.import_batch].count++;
        });
        setImportHistory(Object.values(batches).slice(0, 20));
      }
    })();
  }, [importResult]);

  const detectFileType = (fileName) => {
    for (const fp of FILE_PATTERNS) {
      if (fp.pattern.test(fileName)) return fp;
    }
    return null;
  };

  const handleFiles = async (fileList) => {
    const newFiles = Array.from(fileList).filter(f => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
    if (!newFiles.length) return;

    setImportResult(null);
    const results = [];

    // 1차: 모든 파일 파싱
    const parsed = {};
    for (const f of newFiles) {
      const det = detectFileType(f.name);
      if (!det) continue;

      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const meta = parseMeta(wb);

      let rows = [];
      if (det.type === "bank_label") rows = parseBankLabel(wb);
      else if (det.type === "bank") rows = parseBankPlain(wb);
      else if (det.type === "tax_invoice") rows = parseTaxInvoice(wb);
      else if (det.type === "card_approval") rows = parseCardApproval(wb);
      else if (det.type === "cash_receipt") rows = parseCashReceipt(wb);

      parsed[det.type] = { rows, meta, file: f, det };
      results.push({ ...det, count: rows.length, meta, file: f, status: rows.length > 0 ? "ready" : "empty" });
    }

    // 2차: 은행 라벨 + 비라벨 잔액 머지
    if (parsed.bank_label && parsed.bank) {
      parsed.bank_label.rows = mergeBankBalance(parsed.bank_label.rows, parsed.bank.rows);
      const bankIdx = results.findIndex(r => r.type === "bank");
      if (bankIdx >= 0) results[bankIdx].status = "merged";
    }

    setFiles(newFiles);
    setParsedFiles(results);
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };

  const doImport = async () => {
    setImporting(true);
    setImportResult(null);

    try {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let totalInserted = 0;

      // 파싱된 모든 파일 재구성
      const allFiles = Array.from(files);
      const allTransactions = [];

      for (const f of allFiles) {
        const det = detectFileType(f.name);
        if (!det) continue;
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });

        let rows = [];
        if (det.type === "bank_label") {
          rows = parseBankLabel(wb);
          // 비라벨 파일에서 잔액 머지
          const plainFile = allFiles.find(ff => detectFileType(ff.name)?.type === "bank");
          if (plainFile) {
            const buf2 = await plainFile.arrayBuffer();
            const wb2 = XLSX.read(buf2, { type: "array" });
            const plainRows = parseBankPlain(wb2);
            rows = mergeBankBalance(rows, plainRows);
          }
        } else if (det.type === "bank") {
          continue; // 라벨 버전에서 처리됨
        } else if (det.type === "tax_invoice") rows = parseTaxInvoice(wb);
        else if (det.type === "card_approval") rows = parseCardApproval(wb);
        else if (det.type === "card_billing") continue; // 데이터 없으면 스킵
        else if (det.type === "cash_receipt") rows = parseCashReceipt(wb);

        rows.forEach(r => {
          allTransactions.push({
            ...r,
            source_file: f.name,
            import_batch: batchId,
          });
        });
      }

      // 중복 체크 + 기존 데이터 처리
      const skipFiles = new Set();
      const uniqueFiles = [...new Set(allTransactions.map(t => t.source_file))];

      if (dupMode === "skip") {
        for (const sf of uniqueFiles) {
          const { count } = await supabase
            .from("financial_transactions")
            .select("id", { count: "exact", head: true })
            .eq("source_file", sf);
          if (count > 0) skipFiles.add(sf);
        }
      } else if (dupMode === "overwrite") {
        for (const sf of uniqueFiles) {
          await supabase.from("financial_transactions").delete().eq("source_file", sf);
        }
      }

      const finalRows = allTransactions.filter(t => !skipFiles.has(t.source_file));
      const totalSkippedCount = allTransactions.length - finalRows.length;

      for (let i = 0; i < finalRows.length; i += 50) {
        const chunk = finalRows.slice(i, i + 50);
        const { error } = await supabase.from("financial_transactions").insert(chunk);
        if (error) {
          console.error("Insert error:", error);
          throw error;
        }
        totalInserted += chunk.length;
      }

      // monthly_summary 갱신 (RPC 호출)
      const months = [...new Set(finalRows.map(r => {
        const d = r.tx_date?.slice(0, 7);
        return d;
      }).filter(Boolean))];
      for (const m of months) {
        await supabase.rpc("refresh_monthly_summary", { target_month: m });
      }

      setImportResult({
        success: true,
        inserted: totalInserted,
        skipped: totalSkippedCount,
        batchId,
        months,
      });
      onImportComplete?.(); // ★ Phase B: 대시보드 재무 KPI 갱신
    } catch (err) {
      setImportResult({ success: false, error: err.message || "Import 실패" });
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm("이 Import 배치의 모든 데이터를 삭제하시겠습니까?")) return;
    await supabase.from("financial_transactions").delete().eq("import_batch", batchId);
    setImportHistory(h => h.filter(x => x.batch !== batchId));
  };

  const statusIcon = (s) => s === "ready" ? "✅" : s === "empty" ? "⬜" : s === "merged" ? "🔗" : "❓";
  const statusText = (s) => s === "ready" ? "감지됨" : s === "empty" ? "데이터 없음" : s === "merged" ? "라벨 버전으로 대체" : "";

  const totalRows = parsedFiles.filter(f => f.status === "ready").reduce((s, f) => s + f.count, 0);
  const periods = parsedFiles.filter(f => f.meta?.period).map(f => f.meta.period);
  const periodText = periods.length > 0 ? periods[0] : "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: C.navy, margin: 0 }}>📥 clobe.ai 데이터 Import</h2>
          <p style={{ fontSize: 13, color: C.gray, margin: "4px 0 0" }}>clobe.ai에서 다운로드한 엑셀 파일을 업로드하여 재무 데이터를 가져옵니다</p>
        </div>
      </div>

      {/* 파일 업로드 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2.5px dashed ${dragOver ? C.gold : C.border}`,
          borderRadius: 16,
          padding: "40px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "#FFF8E1" : C.cardBg,
          transition: "all 0.2s",
          marginBottom: 20,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={e => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginBottom: 6 }}>파일을 드래그하거나 클릭하여 업로드</div>
        <div style={{ fontSize: 12, color: C.gray }}>clobe.ai에서 다운로드한 엑셀 파일 6종 (은행거래내역, 세금계산서, 카드승인내역, 현금영수증 등)</div>
      </div>

      {/* 파싱 결과 */}
      {parsedFiles.length > 0 && (
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.navy, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            📊 파일 감지 결과
            {periodText && <span style={{ fontSize: 12, fontWeight: 600, color: C.gray, background: C.lightGray, padding: "3px 10px", borderRadius: 20 }}>{periodText}</span>}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {FILE_PATTERNS.map(fp => {
              const found = parsedFiles.find(p => p.type === fp.type);
              return (
                <div key={fp.type} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 10, background: found ? (found.status === "ready" ? "#E8F5E9" : found.status === "merged" ? "#E3F2FD" : "#FAFAFA") : "#FAFAFA",
                  border: `1px solid ${found?.status === "ready" ? "#A5D6A7" : found?.status === "merged" ? "#90CAF9" : "#EEE"}`,
                }}>
                  <span style={{ fontSize: 20 }}>{fp.icon}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{fp.label}</span>
                    {found && found.count > 0 && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: C.navy }}>{found.count}건</span>}
                  </div>
                  <span style={{ fontSize: 13 }}>
                    {found ? `${statusIcon(found.status)} ${statusText(found.status)}` : "⬜ 미업로드"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 중복 처리 + Import 버튼 */}
          <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>중복 처리:</span>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="radio" checked={dupMode === "skip"} onChange={() => setDupMode("skip")} /> 건너뛰기
              </label>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="radio" checked={dupMode === "overwrite"} onChange={() => setDupMode("overwrite")} /> 덮어쓰기
              </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setFiles([]); setParsedFiles([]); setImportResult(null); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 13, fontWeight: 700, cursor: "pointer", color: C.gray }}>
                초기화
              </button>
              <button onClick={doImport} disabled={importing || totalRows === 0}
                style={{
                  padding: "10px 28px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 900, cursor: totalRows > 0 && !importing ? "pointer" : "not-allowed",
                  background: totalRows > 0 ? C.navy : C.lightGray, color: totalRows > 0 ? C.white : C.gray,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                {importing ? "⏳ Import 중..." : `📥 Import 실행 (${totalRows}건)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import 결과 */}
      {importResult && (
        <div style={{
          background: importResult.success ? "#E8F5E9" : "#FFEBEE",
          borderRadius: 14, padding: 20, marginBottom: 20,
          border: `1px solid ${importResult.success ? "#A5D6A7" : "#EF9A9A"}`,
        }}>
          {importResult.success ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.success, marginBottom: 8 }}>✅ Import 완료!</div>
              <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.8 }}>
                총 <strong>{importResult.inserted}건</strong> 저장 완료
                {importResult.skipped > 0 && <> · <span style={{ color: C.orange }}>{importResult.skipped}건 건너뜀 (중복)</span></>}
                <br />
                대상 월: <strong>{importResult.months?.join(", ")}</strong> · monthly_summary 갱신 완료
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.error, marginBottom: 8 }}>❌ Import 실패</div>
              <div style={{ fontSize: 13, color: C.dark }}>{importResult.error}</div>
            </>
          )}
        </div>
      )}

      {/* Import 이력 */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.navy, marginBottom: 16 }}>📜 Import 이력</div>
        {importHistory.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.gray, fontSize: 13 }}>Import 이력이 없습니다</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {importHistory.map(h => (
              <div key={h.batch} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                borderRadius: 10, background: C.cardBg, border: `1px solid ${C.lightGray}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
                    {new Date(h.date).toLocaleString("ko-KR")}
                    <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 800, color: C.navy, background: "#E3F2FD", padding: "2px 8px", borderRadius: 10 }}>{h.count}건</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{h.batch}</div>
                </div>
                <button onClick={() => handleDeleteBatch(h.batch)}
                  style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.error}`, background: "transparent", color: C.error, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  🗑 삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 16-1. 수익성 분석 시스템 (v7.0 통합) ────────────────
const FIELD_SITES = SITES.filter(s => s.code !== "V000");
const ALLOC_METHODS = [
  { key: "revenue", label: "매출비중", desc: "사업장 매출 비율로 배분" },
  { key: "headcount", label: "인원비중", desc: "사업장 인원 비율로 배분" },
  { key: "site_count", label: "사업장수", desc: "인원 있는 사업장에 균등 배분" },
  { key: "hq_only", label: "본사귀속", desc: "사업장에 배분하지 않음" },
];
const DEFAULT_OVERHEAD = [
  { key: "hq_salary", label: "본사급여(V000)", method: "revenue", amount: 12000000 },
  { key: "severance", label: "퇴직급여", method: "headcount", amount: 2394386 },
  { key: "misc_wage", label: "잡급", method: "headcount", amount: 1663240 },
  { key: "welfare", label: "복리후생비", method: "headcount", amount: 7134120 },
  { key: "insurance", label: "보험료", method: "headcount", amount: 545000 },
  { key: "commission", label: "지급수수료", method: "revenue", amount: 551300 },
  { key: "ad", label: "광고선전비", method: "revenue", amount: 0 },
  { key: "vehicle", label: "차량유지비", method: "site_count", amount: 2464550 },
  { key: "tax_local", label: "세금(지방세등)", method: "headcount", amount: 41228 },
  { key: "rent", label: "임차료", method: "hq_only", amount: 5179690 },
  { key: "telecom", label: "통신비", method: "headcount", amount: 220000 },
  { key: "tax_duty", label: "세금과공과", method: "revenue", amount: 14228750 },
  { key: "supplies", label: "소모품비", method: "site_count", amount: 376680 },
  { key: "travel", label: "여비교통비", method: "site_count", amount: 151600 },
];

const pFmt = (n) => {
  if (n == null || n === "" || isNaN(n)) return "0";
  const num = Math.round(Number(n));
  if (Math.abs(num) >= 100000000) return (num / 100000000).toFixed(1) + "억";
  if (Math.abs(num) >= 10000) return Math.round(num / 10000).toLocaleString("ko-KR") + "만";
  return num.toLocaleString("ko-KR");
};
const pFmtFull = (n) => (n == null || n === "" || isNaN(n)) ? "0" : Math.round(Number(n)).toLocaleString("ko-KR");
const pPct = (a, b) => b === 0 ? "—" : ((a / b) * 100).toFixed(1) + "%";

function ProfitabilityPage({ employees, subPage, profitState }) {
  const { profitMonth: currentMonth, setProfitMonth: setCurrentMonth, revenueData, setRevenueData, overheadData, setOverheadData, saveRevenueToDB, saveOverheadToDB } = profitState;
  const [selectedSite, setSelectedSite] = useState(FIELD_SITES[0]?.code || "V001");
  const [sortBy, setSortBy] = useState("profit");
  const [editLabel, setEditLabel] = useState(null);
  const [costTab, setCostTab] = useState("revenue");
  const [savingStatus, setSavingStatus] = useState(null); // ★ Phase C: 저장 상태 표시
  const saveTimerRef = useRef(null);

  const monthRevenue = revenueData[currentMonth] || {};
  const monthOverhead = overheadData[currentMonth] || DEFAULT_OVERHEAD.map(o => ({ ...o }));

  // ★ Phase C: 매출 변경 → state + DB 저장
  const setRev = (code, val) => {
    setRevenueData(p => ({ ...p, [currentMonth]: { ...p[currentMonth], [code]: val } }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSavingStatus("saving");
      saveRevenueToDB?.(currentMonth, code, val).then(() => {
        setSavingStatus("saved");
        setTimeout(() => setSavingStatus(null), 1500);
      });
    }, 800);
  };

  // ★ Phase C: 간접비 변경 → state + DB 저장
  const setOH = (idx, field, val) => {
    setOverheadData(p => {
      const arr = [...(p[currentMonth] || DEFAULT_OVERHEAD.map(o => ({ ...o })))];
      arr[idx] = { ...arr[idx], [field]: val };
      // DB 저장 (debounced)
      const item = arr[idx];
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSavingStatus("saving");
        saveOverheadToDB?.(currentMonth, item.key, item.label, item.amount, item.method).then(() => {
          setSavingStatus("saved");
          setTimeout(() => setSavingStatus(null), 1500);
        });
      }, 800);
      return { ...p, [currentMonth]: arr };
    });
  };

  // 인건비 자동 집계 (employees 기반)
  const laborBySite = useMemo(() => {
    const map = {};
    FIELD_SITES.forEach(s => { map[s.code] = { total: 0, count: 0, emps: [] }; });
    employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000").forEach(e => {
      const sc = e.site_code_1;
      if (!map[sc]) map[sc] = { total: 0, count: 0, emps: [] };
      const monthly = toNum(e.base_salary) + toNum(e.leader_allow) + toNum(e.meal_allow) + toNum(e.childcare_allow) + toNum(e.car_allow)
        + (toNum(e.weekend_daily) > 0 ? toNum(e.weekend_daily) * 8 : 0);
      map[sc].total += monthly;
      map[sc].count++;
      map[sc].emps.push({ ...e, monthly });
    });
    return map;
  }, [employees]);

  // 간접비 배부 계산
  const allocated = useMemo(() => {
    const totalRev = FIELD_SITES.reduce((s, site) => s + toNum(monthRevenue[site.code]), 0);
    const totalHead = FIELD_SITES.reduce((s, site) => s + (laborBySite[site.code]?.count || 0), 0);
    const activeSites = FIELD_SITES.filter(s => (laborBySite[s.code]?.count || 0) > 0).length || 1;
    const result = {};
    FIELD_SITES.forEach(s => { result[s.code] = { items: [], total: 0 }; });

    monthOverhead.forEach(oh => {
      if (oh.method === "hq_only") return;
      FIELD_SITES.forEach(site => {
        let share = 0;
        const rev = toNum(monthRevenue[site.code]);
        const head = laborBySite[site.code]?.count || 0;
        if (oh.method === "revenue" && totalRev > 0) share = (rev / totalRev) * toNum(oh.amount);
        else if (oh.method === "headcount" && totalHead > 0) share = (head / totalHead) * toNum(oh.amount);
        else if (oh.method === "site_count" && head > 0) share = toNum(oh.amount) / activeSites;
        result[site.code].items.push({ label: oh.label, method: oh.method, amount: Math.round(share) });
        result[site.code].total += Math.round(share);
      });
    });
    return result;
  }, [monthRevenue, monthOverhead, laborBySite]);

  // 사업장별 PL
  const sitePLs = useMemo(() => {
    return FIELD_SITES.map(site => {
      const rev = toNum(monthRevenue[site.code]);
      const labor = laborBySite[site.code]?.total || 0;
      const overhead = allocated[site.code]?.total || 0;
      const totalCost = labor + overhead;
      const profit = rev - totalCost;
      const margin = rev > 0 ? (profit / rev) * 100 : 0;
      const count = laborBySite[site.code]?.count || 0;
      return { ...site, rev, labor, overhead, totalCost, profit, margin, count };
    });
  }, [monthRevenue, laborBySite, allocated]);

  const sortedPLs = useMemo(() => {
    const arr = [...sitePLs].filter(s => s.rev > 0 || s.count > 0);
    if (sortBy === "profit") arr.sort((a, b) => b.profit - a.profit);
    else if (sortBy === "margin") arr.sort((a, b) => b.margin - a.margin);
    else if (sortBy === "revenue") arr.sort((a, b) => b.rev - a.rev);
    else if (sortBy === "labor") arr.sort((a, b) => b.labor - a.labor);
    return arr;
  }, [sitePLs, sortBy]);

  const totals = useMemo(() => {
    const t = { rev: 0, labor: 0, overhead: 0, profit: 0, count: 0, black: 0, red: 0 };
    sitePLs.forEach(s => {
      t.rev += s.rev; t.labor += s.labor; t.overhead += s.overhead; t.profit += s.profit; t.count += s.count;
      if (s.rev > 0 || s.count > 0) { if (s.profit >= 0) t.black++; else t.red++; }
    });
    t.hqOverhead = monthOverhead.filter(o => o.method === "hq_only").reduce((s, o) => s + toNum(o.amount), 0);
    t.netProfit = t.profit - t.hqOverhead;
    return t;
  }, [sitePLs, monthOverhead]);

  const pcardStyle = { background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };
  const pSectionTitle = (text) => <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, marginBottom: 16, paddingBottom: 8, borderBottom: `2px solid ${C.gold}` }}>{text}</div>;

  const copyPrevMonth = async () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    if (revenueData[pm]) {
      setRevenueData(p => ({ ...p, [currentMonth]: { ...p[pm] } }));
      // ★ Phase C: DB 배치 저장
      setSavingStatus("saving");
      const revEntries = Object.entries(revenueData[pm]);
      for (const [code, val] of revEntries) {
        await saveRevenueToDB?.(currentMonth, code, val);
      }
    }
    if (overheadData[pm]) {
      const copiedOH = overheadData[pm].map(o => ({ ...o }));
      setOverheadData(p => ({ ...p, [currentMonth]: copiedOH }));
      for (const oh of copiedOH) {
        await saveOverheadToDB?.(currentMonth, oh.key, oh.label, oh.amount, oh.method);
      }
    }
    setSavingStatus("saved");
    setTimeout(() => setSavingStatus(null), 1500);
  };

  const addOverheadItem = () => {
    const newItem = { key: `custom_${Date.now()}`, label: "새 항목", method: "revenue", amount: 0 };
    setOverheadData(p => {
      const arr = [...(p[currentMonth] || []), newItem];
      return { ...p, [currentMonth]: arr };
    });
    saveOverheadToDB?.(currentMonth, newItem.key, newItem.label, newItem.amount, newItem.method);
  };
  const removeOverheadItem = (idx) => {
    const arr = [...(overheadData[currentMonth] || [])];
    const removed = arr[idx];
    arr.splice(idx, 1);
    setOverheadData(p => ({ ...p, [currentMonth]: arr }));
    // ★ Phase C: DB에서도 삭제
    if (removed?.key) {
      supabase.from("site_overhead").delete().eq("month", currentMonth).eq("item_key", removed.key);
    }
  };

  // ── 전체 요약 ──
  const SummaryView = () => (
    <div>
      {pSectionTitle("📊 전체 요약 — " + currentMonth)}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} style={{ ...inputStyle, width: 160 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          ["총 매출", pFmt(totals.rev), C.navy],
          ["총 인건비", pFmt(totals.labor), C.orange],
          ["간접비 배부", pFmt(totals.overhead), C.gray],
          ["영업이익", pFmt(totals.profit), totals.profit >= 0 ? C.success : C.error],
          ["흑자/적자", `${totals.black}곳 / ${totals.red}곳`, C.navy],
        ].map(([l, v, color]) => (
          <div key={l} style={{ ...pcardStyle, textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color, fontFamily: "'Noto Sans KR', sans-serif" }}>{v}</div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* 수익 구조 바 */}
      {totals.rev > 0 && (() => {
        const lPct = (totals.labor / totals.rev) * 100;
        const oPct = (totals.overhead / totals.rev) * 100;
        const pPctVal = Math.max(0, 100 - lPct - oPct);
        return (
          <div style={{ ...pcardStyle, marginBottom: 20, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 8 }}>수익 구조</div>
            <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", fontSize: 10, fontWeight: 700 }}>
              <div style={{ width: `${lPct}%`, background: C.orange, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", minWidth: lPct > 5 ? "auto" : 0 }}>
                {lPct > 8 ? `인건비 ${lPct.toFixed(0)}%` : ""}
              </div>
              <div style={{ width: `${oPct}%`, background: C.lightGray, color: C.dark, display: "flex", alignItems: "center", justifyContent: "center", minWidth: oPct > 5 ? "auto" : 0 }}>
                {oPct > 8 ? `간접비 ${oPct.toFixed(0)}%` : ""}
              </div>
              <div style={{ flex: 1, background: pPctVal >= 0 ? C.success : C.error, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {pPctVal > 8 ? `이익 ${pPctVal.toFixed(0)}%` : ""}
              </div>
            </div>
            {totals.hqOverhead > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.gray }}>
                본사귀속 간접비 차감 후 순이익: <strong style={{ color: totals.netProfit >= 0 ? C.success : C.error }}>{pFmt(totals.netProfit)}</strong>
              </div>
            )}
          </div>
        );
      })()}

      {/* PL 테이블 */}
      <div style={{ ...pcardStyle, overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>사업장별 손익 (P&L)</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["profit", "이익순"], ["margin", "이익률순"], ["revenue", "매출순"], ["labor", "인건비순"]].map(([k, v]) => (
              <button key={k} onClick={() => setSortBy(k)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: `1px solid ${sortBy === k ? C.navy : C.border}`, background: sortBy === k ? C.navy : "#fff", color: sortBy === k ? "#fff" : C.gray }}>{v}</button>
            ))}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["#", "코드", "사업장", "인원", "매출", "인건비", "간접비", "이익", "이익률"].map(h => (
                <th key={h} style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: h === "사업장" ? "left" : "center", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPLs.map((s, i) => (
              <tr key={s.code} style={{ background: i % 2 === 0 ? "#fff" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 700, color: C.gray }}>{i + 1}</td>
                <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 600, color: C.navy }}>{s.code}</td>
                <td style={{ padding: "7px 6px", fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: "7px 6px", textAlign: "center" }}>{s.count}명</td>
                <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700 }}>{pFmtFull(s.rev)}</td>
                <td style={{ padding: "7px 6px", textAlign: "right", color: C.orange }}>{pFmtFull(s.labor)}</td>
                <td style={{ padding: "7px 6px", textAlign: "right", color: C.gray }}>{pFmtFull(s.overhead)}</td>
                <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 800, color: s.profit >= 0 ? C.success : C.error }}>{pFmtFull(s.profit)}</td>
                <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 700, color: s.margin >= 0 ? C.success : C.error }}>{s.margin.toFixed(1)}%</td>
              </tr>
            ))}
            <tr style={{ background: C.navy }}>
              {[
                { v: "", align: "center" }, { v: "", align: "center" }, { v: "합계", align: "left", color: C.gold },
                { v: `${totals.count}명`, align: "center", color: "#fff" },
                { v: pFmtFull(totals.rev), align: "right", color: "#fff" },
                { v: pFmtFull(totals.labor), align: "right", color: C.gold },
                { v: pFmtFull(totals.overhead), align: "right", color: "#fff" },
                { v: pFmtFull(totals.profit), align: "right", color: C.gold },
                { v: totals.rev > 0 ? ((totals.profit / totals.rev) * 100).toFixed(1) + "%" : "—", align: "center", color: C.gold },
              ].map((cell, ci) => (
                <td key={ci} style={{ padding: "8px 6px", textAlign: cell.align, fontWeight: 900, color: cell.color || C.gold, fontSize: 12 }}>{cell.v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── 사업장 PL ──
  const SitePLView = () => {
    const site = FIELD_SITES.find(s => s.code === selectedSite) || FIELD_SITES[0];
    const pl = sitePLs.find(s => s.code === selectedSite) || {};
    const siteLabor = laborBySite[selectedSite] || { total: 0, count: 0, emps: [] };
    const siteAlloc = allocated[selectedSite] || { items: [], total: 0 };

    return (
      <div>
        {pSectionTitle("🏢 사업장 P&L")}
        <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} style={{ ...inputStyle, width: 240, marginBottom: 16, fontWeight: 700 }}>
          {FIELD_SITES.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            ["매출", pFmt(pl.rev || 0), C.navy, pl.rev ? "100%" : "—"],
            ["인건비", pFmt(pl.labor || 0), C.orange, pPct(pl.labor || 0, pl.rev || 0)],
            ["간접비", pFmt(pl.overhead || 0), C.gray, pPct(pl.overhead || 0, pl.rev || 0)],
            ["영업이익", pFmt(pl.profit || 0), (pl.profit || 0) >= 0 ? C.success : C.error, pPct(pl.profit || 0, pl.rev || 0)],
          ].map(([l, v, color, sub]) => (
            <div key={l} style={{ ...pcardStyle, textAlign: "center", padding: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color }}>{v}</div>
              <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>{l} ({sub})</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* 배치 인원 */}
          <div style={pcardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>👥 배치 인원 ({siteLabor.count}명)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: C.navy }}>
                {["사번", "이름", "근무형태", "월급여"].map(h => <th key={h} style={{ padding: "6px", color: "#fff", fontWeight: 700 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {siteLabor.emps.map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "5px 6px", fontWeight: 600, color: C.navy }}>{e.emp_no}</td>
                    <td style={{ padding: "5px 6px" }}>{e.name}</td>
                    <td style={{ padding: "5px 6px", textAlign: "center" }}>{e.work_code || e.work_type_1}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>{pFmtFull(e.monthly)}</td>
                  </tr>
                ))}
                {siteLabor.emps.length === 0 && <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: C.gray }}>배치 인원 없음</td></tr>}
              </tbody>
            </table>
          </div>

          {/* 간접비 상세 */}
          <div style={pcardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>📋 간접비 배부 상세</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: C.navy }}>
                {["항목", "배부방식", "배부금액"].map(h => <th key={h} style={{ padding: "6px", color: "#fff", fontWeight: 700 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {siteAlloc.items.filter(i => i.amount > 0).map((item, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "5px 6px" }}>{item.label}</td>
                    <td style={{ padding: "5px 6px", textAlign: "center" }}>
                      <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: item.method === "revenue" ? "#EFF6FF" : item.method === "headcount" ? "#FFF3E0" : "#F5F5F5", color: item.method === "revenue" ? C.navy : item.method === "headcount" ? C.orange : C.gray }}>{ALLOC_METHODS.find(m => m.key === item.method)?.label}</span>
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>{pFmtFull(item.amount)}</td>
                  </tr>
                ))}
                <tr style={{ background: C.navy }}>
                  <td colSpan={2} style={{ padding: "7px 6px", color: C.gold, fontWeight: 900, textAlign: "center" }}>합계</td>
                  <td style={{ padding: "7px 6px", color: "#fff", fontWeight: 800, textAlign: "right" }}>{pFmtFull(siteAlloc.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── 비용 입력 ──
  const CostInputView = () => {
    return (
      <div>
        {pSectionTitle("✏️ 비용 입력 — " + currentMonth)}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          <button onClick={copyPrevMonth} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.navy }}>📋 이전달 복사</button>
          {[["revenue", "💰 사업장 매출"], ["overhead", "🏢 간접비"]].map(([k, v]) => (
            <button key={k} onClick={() => setCostTab(k)} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${costTab === k ? C.navy : C.border}`, background: costTab === k ? C.navy : "#fff", color: costTab === k ? "#fff" : C.gray }}>{v}</button>
          ))}
          {/* ★ Phase C: DB 저장 상태 표시 */}
          {savingStatus && (
            <span style={{ fontSize: 11, fontWeight: 700, color: savingStatus === "saving" ? C.orange : C.success, marginLeft: "auto" }}>
              {savingStatus === "saving" ? "💾 저장 중..." : "✅ DB 저장 완료"}
            </span>
          )}
        </div>

        {costTab === "revenue" ? (
          <div style={{ ...pcardStyle, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: C.navy }}>
                {["코드", "사업장", "매출 (월)", "인원", "인건비", "이익률"].map(h => <th key={h} style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: "center" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {FIELD_SITES.map((site, i) => {
                  const pl = sitePLs.find(s => s.code === site.code) || {};
                  return (
                    <tr key={site.code} style={{ background: i % 2 === 0 ? "#fff" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px", textAlign: "center", fontWeight: 600, color: C.navy }}>{site.code}</td>
                      <td style={{ padding: "6px", fontWeight: 600 }}>{site.name}</td>
                      <td style={{ padding: "4px 6px", width: 160 }}>
                        <NumInput value={toNum(monthRevenue[site.code])} onChange={v => setRev(site.code, v)}
                          style={{ ...inputStyle, textAlign: "right", padding: "6px 8px", fontSize: 12 }} />
                      </td>
                      <td style={{ padding: "6px", textAlign: "center", color: C.gray }}>{pl.count || 0}명</td>
                      <td style={{ padding: "6px", textAlign: "right", color: C.orange, fontWeight: 700 }}>{pFmt(pl.labor || 0)}</td>
                      <td style={{ padding: "6px", textAlign: "center", fontWeight: 700, color: (pl.margin || 0) >= 0 ? C.success : C.error }}>{pl.rev > 0 ? (pl.margin || 0).toFixed(1) + "%" : "—"}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: C.navy }}>
                  <td colSpan={2} style={{ padding: "8px 6px", color: C.gold, fontWeight: 900, textAlign: "center" }}>합계</td>
                  <td style={{ padding: "8px 6px", color: "#fff", fontWeight: 800, textAlign: "right" }}>{pFmtFull(totals.rev)}</td>
                  <td style={{ padding: "8px 6px", color: "#fff", textAlign: "center" }}>{totals.count}명</td>
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 800, textAlign: "right" }}>{pFmt(totals.labor)}</td>
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 800, textAlign: "center" }}>{totals.rev > 0 ? ((totals.profit / totals.rev) * 100).toFixed(1) + "%" : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ ...pcardStyle, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: C.navy }}>
                {["항목", "금액 (월)", "배부방식", ""].map(h => <th key={h} style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: "center" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {monthOverhead.map((oh, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px", fontWeight: 600 }}>
                      {editLabel === i ? (
                        <input value={oh.label} onChange={e => setOH(i, "label", e.target.value)} onBlur={() => setEditLabel(null)} autoFocus
                          style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, width: 140 }} />
                      ) : (
                        <span onClick={() => setEditLabel(i)} style={{ cursor: "pointer" }}>{oh.label}</span>
                      )}
                    </td>
                    <td style={{ padding: "4px 6px", width: 160 }}>
                      <NumInput value={oh.amount} onChange={v => setOH(i, "amount", v)}
                        style={{ ...inputStyle, textAlign: "right", padding: "6px 8px", fontSize: 12 }} />
                    </td>
                    <td style={{ padding: "6px", textAlign: "center" }}>
                      <select value={oh.method} onChange={e => setOH(i, "method", e.target.value)}
                        style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>
                        {ALLOC_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "6px", textAlign: "center" }}>
                      <button onClick={() => removeOverheadItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.error, fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: C.navy }}>
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 900, textAlign: "center" }}>합계</td>
                  <td style={{ padding: "8px 6px", color: "#fff", fontWeight: 800, textAlign: "right" }}>{pFmtFull(monthOverhead.reduce((s, o) => s + toNum(o.amount), 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
            <button onClick={addOverheadItem} style={{ marginTop: 10, padding: "8px 16px", borderRadius: 8, border: `1px dashed ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.navy }}>+ 항목 추가</button>
          </div>
        )}
      </div>
    );
  };

  // ── 비교 분석 ──
  const ComparisonView = () => {
    const maxRev = Math.max(...sortedPLs.map(s => s.rev), 1);
    return (
      <div>
        {pSectionTitle("📈 비교 분석")}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {[["profit", "이익순"], ["margin", "이익률순"], ["revenue", "매출순"], ["labor", "인건비순"]].map(([k, v]) => (
            <button key={k} onClick={() => setSortBy(k)} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${sortBy === k ? C.navy : C.border}`, background: sortBy === k ? C.navy : "#fff", color: sortBy === k ? "#fff" : C.gray }}>{v}</button>
          ))}
        </div>

        {/* 매출 vs 이익 바차트 */}
        <div style={{ ...pcardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 12 }}>매출 vs 이익</div>
          {sortedPLs.map(s => (
            <div key={s.code} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 4 }}>{s.code} {s.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <div style={{ width: 40, fontSize: 10, color: C.gray, textAlign: "right" }}>매출</div>
                <div style={{ flex: 1, background: C.bg, borderRadius: 4, height: 16, overflow: "hidden" }}>
                  <div style={{ width: `${(s.rev / maxRev) * 100}%`, background: C.navy, height: "100%", borderRadius: 4, minWidth: s.rev > 0 ? 4 : 0 }} />
                </div>
                <div style={{ width: 70, fontSize: 10, fontWeight: 700, textAlign: "right" }}>{pFmt(s.rev)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 40, fontSize: 10, color: C.gray, textAlign: "right" }}>이익</div>
                <div style={{ flex: 1, background: C.bg, borderRadius: 4, height: 16, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(0, (s.profit / maxRev) * 100)}%`, background: s.profit >= 0 ? C.success : C.error, height: "100%", borderRadius: 4, minWidth: Math.abs(s.profit) > 0 ? 4 : 0 }} />
                </div>
                <div style={{ width: 70, fontSize: 10, fontWeight: 700, textAlign: "right", color: s.profit >= 0 ? C.success : C.error }}>{pFmt(s.profit)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 인건비 비중 도넛 */}
        <div style={{ ...pcardStyle }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 12 }}>인건비 비중 & 이익률</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
            {sortedPLs.map(s => {
              const lRatio = s.rev > 0 ? (s.labor / s.rev) * 100 : 0;
              const oRatio = s.rev > 0 ? (s.overhead / s.rev) * 100 : 0;
              const pRatio = Math.max(0, 100 - lRatio - oRatio);
              return (
                <div key={s.code} style={{ textAlign: "center", padding: 10, background: C.bg, borderRadius: 10 }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", margin: "0 auto 8px", background: `conic-gradient(${C.orange} 0% ${lRatio}%, ${C.lightGray} ${lRatio}% ${lRatio + oRatio}%, ${s.profit >= 0 ? C.success : C.error} ${lRatio + oRatio}% 100%)` }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", position: "relative", top: 12, left: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: s.profit >= 0 ? C.success : C.error }}>{s.margin.toFixed(0)}%</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.dark }}>{s.code}</div>
                  <div style={{ fontSize: 9, color: C.gray }}>{s.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── 배부 설정 ──
  const AllocSettingsView = () => (
    <div>
      {pSectionTitle("⚙️ 간접비 배부 설정")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {ALLOC_METHODS.map(m => (
          <div key={m.key} style={{ ...pcardStyle, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.navy }}>{m.label}</div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>{m.desc}</div>
          </div>
        ))}
      </div>
      <div style={pcardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 12 }}>현재 배부방식 설정</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead><tr style={{ background: C.navy }}>
            {["항목", "현재 배부방식", "변경"].map(h => <th key={h} style={{ padding: "8px 6px", color: "#fff", fontWeight: 700 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {monthOverhead.map((oh, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "6px", fontWeight: 600 }}>{oh.label}</td>
                <td style={{ padding: "6px", textAlign: "center" }}>
                  <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: oh.method === "revenue" ? "#EFF6FF" : oh.method === "headcount" ? "#FFF3E0" : oh.method === "hq_only" ? "#FFEEF0" : "#F5F5F5", color: oh.method === "revenue" ? C.navy : oh.method === "headcount" ? C.orange : oh.method === "hq_only" ? C.error : C.gray }}>{ALLOC_METHODS.find(m => m.key === oh.method)?.label}</span>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <select value={oh.method} onChange={e => setOH(i, "method", e.target.value)}
                    style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 11 }}>
                    {ALLOC_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 사업장 마스터 */}
      <div style={{ ...pcardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 12 }}>🏢 사업장 마스터 ({SITES.length}개)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
          {SITES.map(s => (
            <div key={s.code} style={{ padding: "6px 10px", background: s.code === "V000" ? "#FFF8E1" : C.bg, borderRadius: 6 }}>
              <span style={{ fontWeight: 700, color: C.navy }}>{s.code}</span> {s.name} {s.code === "V000" && <span style={{ fontSize: 9, color: C.orange, fontWeight: 700 }}>본사</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── 서브페이지 라우팅 ──
  if (subPage === "site_pl") return <SitePLView />;
  if (subPage === "cost_input") return <CostInputView />;
  if (subPage === "comparison") return <ComparisonView />;
  if (subPage === "alloc_settings") return <AllocSettingsView />;
  return <SummaryView />;
}

// ── 16-2. 사업장 현황 관리 ─────────────────────────────
function SiteManagementPage({ employees }) {
  const [selectedSite, setSelectedSite] = useState(null);
  const [siteDetails, setSiteDetails] = useState({});
  const [siteParking, setSiteParking] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSiteCode, setNewSiteCode] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [customSites, setCustomSites] = useState([]); // DB에서 추가된 사업장

  // DB 로드
  useEffect(() => {
    (async () => {
      const { data: details } = await supabase.from("site_details").select("*");
      if (details) {
        const map = {};
        const extras = [];
        details.forEach(d => {
          map[d.site_code] = d;
          // SITES 상수에 없는 사업장 = 추가된 사업장
          if (!SITES.find(s => s.code === d.site_code) && d.site_name) {
            extras.push({ code: d.site_code, name: d.site_name });
          }
        });
        setSiteDetails(map);
        setCustomSites(extras);
      }
      const { data: parking } = await supabase.from("site_parking").select("*").order("created_at");
      if (parking) {
        const map = {};
        parking.forEach(p => {
          if (!map[p.site_code]) map[p.site_code] = [];
          map[p.site_code].push(p);
        });
        setSiteParking(map);
      }
    })();
  }, []);

  // 기존 SITES(V000 제외) + DB 추가 사업장 병합
  const allSites = useMemo(() => {
    const base = SITES.filter(s => s.code !== "V000");
    return [...base, ...customSites.filter(cs => !base.find(b => b.code === cs.code))];
  }, [customSites]);

  const activeSiteEmps = useMemo(() => {
    const map = {};
    allSites.forEach(s => { map[s.code] = 0; });
    employees.filter(e => e.status === "재직" && e.site_code_1).forEach(e => { map[e.site_code_1] = (map[e.site_code_1] || 0) + 1; });
    return map;
  }, [employees, allSites]);

  // 사업장 추가
  const handleAddSite = async () => {
    const code = newSiteCode.trim().toUpperCase();
    const name = newSiteName.trim();
    if (!code || !name) return alert("코드와 이름을 입력하세요");
    if (allSites.find(s => s.code === code)) return alert("이미 존재하는 코드입니다");
    setSaving(true);
    await supabase.from("site_details").upsert({ site_code: code, site_name: name, updated_at: new Date().toISOString() }, { onConflict: "site_code" });
    setCustomSites(p => [...p, { code, name }]);
    setSiteDetails(p => ({ ...p, [code]: { site_code: code, site_name: name } }));
    setNewSiteCode(""); setNewSiteName(""); setShowAddForm(false); setSaving(false);
    setSelectedSite({ code, name });
  };

  // 사업장 삭제 (커스텀만)
  const handleDeleteSite = async (code) => {
    if (!window.confirm(`"${code}" 사업장을 삭제하시겠습니까?\n관련 외부주차장 데이터도 함께 삭제됩니다.`)) return;
    await supabase.from("site_details").delete().eq("site_code", code);
    await supabase.from("site_parking").delete().eq("site_code", code);
    setCustomSites(p => p.filter(s => s.code !== code));
    setSiteDetails(p => { const n = { ...p }; delete n[code]; return n; });
    setSiteParking(p => { const n = { ...p }; delete n[code]; return n; });
    if (selectedSite?.code === code) setSelectedSite(null);
  };

  const updateDetail = async (code, field, value) => {
    setSiteDetails(p => ({ ...p, [code]: { ...p[code], site_code: code, [field]: value } }));
    setSaving(true);
    await supabase.from("site_details").upsert({ site_code: code, [field]: value, updated_at: new Date().toISOString() }, { onConflict: "site_code" });
    setSaving(false);
  };

  const addParking = async (code) => {
    const newP = { site_code: code, parking_name: "", address: "", amount: 0, manager_name: "", phone: "" };
    const { data } = await supabase.from("site_parking").insert(newP).select().single();
    if (data) setSiteParking(p => ({ ...p, [code]: [...(p[code] || []), data] }));
  };

  const updateParking = async (id, field, value) => {
    setSiteParking(p => {
      const updated = {};
      Object.entries(p).forEach(([code, list]) => {
        updated[code] = list.map(pk => pk.id === id ? { ...pk, [field]: value } : pk);
      });
      return updated;
    });
    await supabase.from("site_parking").update({ [field]: value }).eq("id", id);
  };

  const deleteParking = async (id, code) => {
    await supabase.from("site_parking").delete().eq("id", id);
    setSiteParking(p => ({ ...p, [code]: (p[code] || []).filter(pk => pk.id !== id) }));
  };

  const sel = selectedSite;
  const detail = sel ? (siteDetails[sel.code] || {}) : {};
  const parkings = sel ? (siteParking[sel.code] || []) : [];
  const isCustomSite = (code) => customSites.some(s => s.code === code);

  const fieldStyle = { ...inputStyle, fontSize: 12, padding: "7px 10px" };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 4, display: "block" };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: "0 0 16px" }}>🏢 사업장 현황 관리</h2>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" }}>

        {/* 좌: 사업장 목록 */}
        <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ background: C.navy, color: "#fff", padding: "10px 14px", fontSize: 12, fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>사업장 목록 ({allSites.length}개)</span>
            <button onClick={() => setShowAddForm(!showAddForm)} style={{ background: C.gold, border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 800, color: C.navy, cursor: "pointer" }}>+ 추가</button>
          </div>
          {/* 사업장 추가 폼 */}
          {showAddForm && (
            <div style={{ padding: 12, background: "#FFFDE7", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={newSiteCode} onChange={e => setNewSiteCode(e.target.value)} placeholder="코드 (V017)" style={{ ...inputStyle, flex: "0 0 70px", fontSize: 11, padding: "5px 8px" }} />
                <input value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="사업장명" style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "5px 8px" }} />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={handleAddSite} style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "none", background: C.navy, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>등록</button>
                <button onClick={() => { setShowAddForm(false); setNewSiteCode(""); setNewSiteName(""); }} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", color: C.gray }}>취소</button>
              </div>
            </div>
          )}
          <div style={{ maxHeight: 600, overflowY: "auto" }}>
            {allSites.map(site => {
              const d = siteDetails[site.code] || {};
              const isSel = sel?.code === site.code;
              const dDay = d.contract_end_date ? Math.ceil((new Date(d.contract_end_date) - new Date()) / 86400000) : null;
              return (
                <div key={site.code} onClick={() => setSelectedSite(site)}
                  style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid #f0f0f0`, background: isSel ? "#EFF3FF" : "#fff", transition: "all 0.1s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.navy }}>{site.code}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginLeft: 6 }}>{site.name}</span>
                    </div>
                    <span style={{ fontSize: 10, color: C.gray }}>{activeSiteEmps[site.code] || 0}명</span>
                  </div>
                  {d.monthly_contract > 0 && (
                    <div style={{ fontSize: 10, color: C.gray, marginTop: 3 }}>
                      월 {pFmt(d.monthly_contract)} {dDay !== null && <span style={{ color: dDay <= 30 ? C.error : C.success, fontWeight: 700, marginLeft: 6 }}>만기 D{dDay > 0 ? "-" + dDay : "+" + Math.abs(dDay)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 우: 사업장 상세 */}
        {sel ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 기본정보 */}
            <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ background: C.navy, color: "#fff", padding: "10px 14px", fontSize: 12, fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{sel.code} {sel.name} {isCustomSite(sel.code) && <span style={{ fontSize: 9, background: C.gold, color: C.navy, padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>추가</span>}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {saving && <span style={{ fontSize: 10, color: C.gold }}>저장 중...</span>}
                  {isCustomSite(sel.code) && (
                    <button onClick={() => handleDeleteSite(sel.code)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#ff9999", cursor: "pointer" }}>삭제</button>
                  )}
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>서비스 시작일</label>
                    <input type="date" value={detail.start_date || ""} onChange={e => updateDetail(sel.code, "start_date", e.target.value)} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>계약 만기일</label>
                    <input type="date" value={detail.contract_end_date || ""} onChange={e => updateDetail(sel.code, "contract_end_date", e.target.value)} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>월 계약금액</label>
                    <NumInput value={toNum(detail.monthly_contract)} onChange={v => updateDetail(sel.code, "monthly_contract", v)} style={{ ...fieldStyle, textAlign: "right" }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>메모</label>
                  <textarea value={detail.memo || ""} onChange={e => updateDetail(sel.code, "memo", e.target.value)}
                    style={{ ...fieldStyle, height: 60, resize: "vertical" }} />
                </div>
              </div>
            </div>

            {/* 계약서 파일 */}
            <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ background: C.navy, color: "#fff", padding: "10px 14px", fontSize: 12, fontWeight: 800 }}>📎 계약서 관리</div>
              <div style={{ padding: 16 }}>
                {detail.contract_file_name ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>📄 {detail.contract_file_name}</span>
                    <button onClick={() => { if (detail.contract_file_url) window.open(detail.contract_file_url, "_blank"); }}
                      style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.navy}`, background: "#fff", fontSize: 10, fontWeight: 700, color: C.navy, cursor: "pointer" }}>보기</button>
                    <button onClick={() => { updateDetail(sel.code, "contract_file_name", null); updateDetail(sel.code, "contract_file_url", null); }}
                      style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.error}`, background: "#fff", fontSize: 10, fontWeight: 700, color: C.error, cursor: "pointer" }}>삭제</button>
                  </div>
                ) : (
                  <div>
                    <input type="file" accept=".pdf,.doc,.docx,.hwp" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setSaving(true);
                      const path = `contracts/${sel.code}_${Date.now()}_${file.name}`;
                      const { error } = await supabase.storage.from("site-contracts").upload(path, file);
                      if (!error) {
                        const { data: urlData } = supabase.storage.from("site-contracts").getPublicUrl(path);
                        await updateDetail(sel.code, "contract_file_name", file.name);
                        await updateDetail(sel.code, "contract_file_url", urlData.publicUrl);
                      }
                      setSaving(false);
                    }} style={{ fontSize: 12 }} />
                    <div style={{ fontSize: 10, color: C.gray, marginTop: 4 }}>PDF, DOC, HWP 파일 업로드</div>
                  </div>
                )}
              </div>
            </div>

            {/* 외부주차장 현황 */}
            <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ background: C.navy, color: "#fff", padding: "10px 14px", fontSize: 12, fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
                <span>🅿️ 외부주차장 사용 현황</span>
                <button onClick={() => addParking(sel.code)} style={{ background: C.gold, border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 800, color: C.navy, cursor: "pointer" }}>+ 추가</button>
              </div>
              <div style={{ padding: parkings.length > 0 ? 12 : 16 }}>
                {parkings.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.gray, textAlign: "center" }}>등록된 외부주차장이 없습니다</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {parkings.map((pk) => (
                      <div key={pk.id} style={{ background: C.bg, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={labelStyle}>주차장명</label>
                            <input value={pk.parking_name || ""} onChange={e => updateParking(pk.id, "parking_name", e.target.value)} style={fieldStyle} placeholder="명칭" />
                          </div>
                          <div>
                            <label style={labelStyle}>월 금액</label>
                            <NumInput value={toNum(pk.amount)} onChange={v => updateParking(pk.id, "amount", v)} style={{ ...fieldStyle, textAlign: "right" }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <label style={labelStyle}>주소</label>
                          <input value={pk.address || ""} onChange={e => updateParking(pk.id, "address", e.target.value)} style={fieldStyle} placeholder="주소" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                          <div>
                            <label style={labelStyle}>관리자</label>
                            <input value={pk.manager_name || ""} onChange={e => updateParking(pk.id, "manager_name", e.target.value)} style={fieldStyle} placeholder="이름" />
                          </div>
                          <div>
                            <label style={labelStyle}>연락처</label>
                            <input value={pk.phone || ""} onChange={e => updateParking(pk.id, "phone", e.target.value)} style={fieldStyle} placeholder="010-0000-0000" />
                          </div>
                          <button onClick={() => deleteParking(pk.id, sel.code)}
                            style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${C.error}`, background: "#fff", fontSize: 10, fontWeight: 700, color: C.error, cursor: "pointer" }}>삭제</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.gray }}>좌측에서 사업장을 선택하세요</div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>계약정보, 외부주차장 등 상세 관리</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 16-3. 견적 계산기 (2026 인건비) — 원본 완전 이식 ─────
function SalaryCalculatorPage() {
  const SC_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const SC_MW = 10320;
  const SC_WEEKS = 4.345;
  const tt = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const sf = (n) => Math.round(n).toLocaleString("ko-KR");

  function getIT(taxable, dep) {
    let tax = 0;
    if (taxable <= 1060000) tax = 0;
    else if (taxable <= 1500000) tax = (taxable - 1060000) * 0.06;
    else if (taxable <= 3000000) tax = 26400 + (taxable - 1500000) * 0.15;
    else if (taxable <= 4500000) tax = 251400 + (taxable - 3000000) * 0.24;
    else if (taxable <= 8000000) tax = 611400 + (taxable - 4500000) * 0.35;
    else tax = 1836400 + (taxable - 8000000) * 0.38;
    const dd = [0, 0, 14000, 21000, 28000, 35000, 42000, 49000];
    return Math.max(0, Math.round(tax - dd[Math.min(dep, 7)]));
  }

  function calcForRate(hrRate, mbH, mwH, moH, mnH, meal, dep) {
    const basicPay = hrRate * mbH, wlPay = hrRate * mwH, otPay = hrRate * 0.5 * moH, ntPay = hrRate * 0.5 * mnH;
    const mealNT = Math.min(meal, 200000), gross = basicPay + wlPay + otPay + ntPay + mealNT;
    const taxBase = basicPay + wlPay + otPay + ntPay;
    const npBase = Math.min(taxBase, 6370000), npE = Math.round(npBase * 0.0475);
    const hiE = Math.round(taxBase * 0.03595), ltE = Math.round(hiE * 0.1314), eiE = Math.round(taxBase * 0.009);
    const insE = npE + hiE + ltE + eiE, itax = getIT(taxBase - insE, dep), ltax = Math.round(itax * 0.1);
    const totDed = insE + itax + ltax, net = gross - totDed;
    const npR = Math.round(npBase * 0.0475), hiR = Math.round(taxBase * 0.03595), ltR = Math.round(hiR * 0.1314);
    const eiR = Math.round(taxBase * 0.0105), wiR = Math.round(taxBase * 0.0147);
    const insR = npR + hiR + ltR + eiR + wiR, totCost = gross + insR;
    const totalPaidH = mbH + mwH, hrCost = totalPaidH > 0 ? totCost / totalPaidH : 0;
    return { hrRate, basicPay, wlPay, otPay, ntPay, mealNT, gross, npE, hiE, ltE, eiE, insE, itax, ltax, totDed, net, npR, hiR, ltR, eiR, wiR, insR, totCost, hrCost };
  }

  const defaultDay = (work) => ({ work, start: "09:00", end: "18:00", breakMin: 60 });

  const [scheduleMode, setScheduleMode] = useState("simple");
  const [simple, setSimple] = useState({ start: "09:00", end: "18:00", breakMin: 60, daysPerWeek: 5 });
  const [weekly, setWeekly] = useState(SC_DAYS.map((_, i) => defaultDay(i < 5)));
  const [hrMode, setHrMode] = useState("both");
  const [customHr, setCustomHr] = useState(13000);
  const [dep, setDep] = useState(1);
  const [meal, setMeal] = useState(200000);
  const [activeTab, setActiveTab] = useState("input");

  const calc = useMemo(() => {
    let dailyWorkH = 0, weeklyWorkH = 0, nightHperWeek = 0, workingDays = 0;
    if (scheduleMode === "simple") {
      const sm = tt(simple.start), em = tt(simple.end);
      const actualM = Math.max(0, em - sm - simple.breakMin);
      dailyWorkH = actualM / 60; workingDays = simple.daysPerWeek; weeklyWorkH = dailyWorkH * workingDays;
      const e2 = em < sm ? em + 1440 : em, ns = Math.max(sm, 22 * 60), ne = Math.min(e2, 30 * 60);
      nightHperWeek = (ns < ne ? (ne - ns) / 60 : 0) * workingDays;
    } else {
      weekly.forEach(d => {
        if (!d.work) return;
        const sm = tt(d.start), em = tt(d.end);
        weeklyWorkH += Math.max(0, em - sm - d.breakMin) / 60; workingDays++;
        const e2 = em < sm ? em + 1440 : em, ns = Math.max(sm, 22 * 60), ne = Math.min(e2, 30 * 60);
        nightHperWeek += ns < ne ? (ne - ns) / 60 : 0;
      });
      dailyWorkH = workingDays > 0 ? weeklyWorkH / workingDays : 0;
    }
    const hasWL = weeklyWorkH >= 15, wlHperWeek = hasWL ? (workingDays > 0 ? weeklyWorkH / workingDays : 0) : 0;
    const monthlyBasicH = weeklyWorkH * SC_WEEKS, monthlyWLH = wlHperWeek * SC_WEEKS, monthlyNightH = nightHperWeek * SC_WEEKS;
    const dailyOT = Math.max(0, dailyWorkH - 8), weeklyOT = Math.max(0, weeklyWorkH - 40);
    const monthlyOTH = Math.max(dailyOT * workingDays, weeklyOT) * SC_WEEKS;
    const minResult = calcForRate(SC_MW, monthlyBasicH, monthlyWLH, monthlyOTH, monthlyNightH, meal, dep);
    const customResult = calcForRate(customHr, monthlyBasicH, monthlyWLH, monthlyOTH, monthlyNightH, meal, dep);
    return { dailyWorkH, weeklyWorkH, monthlyBasicH, monthlyWLH, monthlyOTH, monthlyNightH, hasWL, workingDays, minResult, customResult };
  }, [scheduleMode, simple, weekly, customHr, dep, meal]);

  // 스타일 상수
  const S = {
    card: { background: "#fff", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0", padding: 16, marginBottom: 14 },
    sectionTitle: { fontSize: 13, fontWeight: 900, color: "#1e3a8a", paddingBottom: 8, marginBottom: 12, borderBottom: "2px solid #3b82f6" },
    pillGroup: { display: "flex", gap: 6, background: "#f3f4f6", padding: 4, borderRadius: 12, marginBottom: 14 },
    pill: (active) => ({ flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", textAlign: "center", background: active ? "#fff" : "transparent", color: active ? "#1e40af" : "#9ca3af", boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }),
    label: { display: "block", fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 4, letterSpacing: "0.05em", textTransform: "uppercase" },
    input: { width: "100%", padding: "9px 12px", border: "2px solid #e5e7eb", borderRadius: 12, fontSize: 13, background: "#f9fafb", outline: "none", fontFamily: FONT },
    inputFocus: { borderColor: "#3b82f6", background: "#fff" },
  };

  const TimeInput = ({ label, value, onChange }) => (
    <div>
      <label style={S.label}>{label}</label>
      <input type="time" value={value} onChange={e => onChange(e.target.value)} style={S.input} />
    </div>
  );

  const ResultBlock = ({ r, label, accent }) => {
    const isMW = accent === "green";
    const bc = isMW ? "#6ee7b7" : "#93c5fd";
    const bg = isMW ? "#ecfdf5" : "#eff6ff";
    const tc = isMW ? "#065f46" : "#1e3a8a";
    const vc = isMW ? "#047857" : "#1d4ed8";
    return (
      <div style={{ borderRadius: 16, border: `2px solid ${bc}`, background: bg, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: tc }}>{label}</span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: vc, fontFamily: "monospace" }}>{sf(r.hrRate)}<span style={{ fontSize: 13, fontWeight: 700 }}>원/h</span></div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>시급</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            ["총 지급액(세전)", r.gross, vc],
            ["💚 실수령액", r.net, "#15803d"],
            ["공제액 합계", r.totDed, "#dc2626"],
            ["사업주 총비용", r.totCost, "#ea580c"],
          ].map(([l, v, color]) => (
            <div key={l} style={{ background: "#fff", borderRadius: 12, padding: 12, textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color, fontFamily: "monospace" }}>{sf(v)}<span style={{ fontSize: 11 }}>원</span></div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>근로자 공제 상세</div>
          {[
            ["국민연금(4.75%)", r.npE], ["건강보험(3.595%)", r.hiE], ["장기요양(×13.14%)", r.ltE],
            ["고용보험(0.9%)", r.eiE], ["소득세+지방세", r.itax + r.ltax],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
              <span style={{ color: "#9ca3af" }}>{l}</span>
              <span style={{ fontWeight: 700, color: "#ef4444", fontFamily: "monospace" }}>-{sf(v)}원</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 6, marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: "#4b5563" }}>사업주 부담 보험</span>
            <span style={{ color: "#f97316", fontFamily: "monospace" }}>+{sf(r.insR)}원</span>
          </div>
        </div>
        <div style={{ textAlign: "center", padding: "10px 0", borderRadius: 12, fontSize: 13, fontWeight: 900, background: isMW ? "#d1fae5" : "#dbeafe", color: tc }}>
          💼 시간당 실질 인건비 <span style={{ fontFamily: "monospace" }}>{sf(r.hrCost)}원/h</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: 20 }}>
      {/* 헤더 */}
      <div style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #312e81 100%)", color: "#fff", padding: "20px 24px", borderRadius: 16, marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>💼 2026 인건비 견적 계산기</h1>
        <p style={{ fontSize: 12, color: "#93c5fd", marginTop: 4 }}>근무시간 입력 → 시급·월급 자동 계산 · 최저임금 {sf(SC_MW)}원 기준</p>
      </div>

      {/* 모바일 탭 */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", background: "#fff", borderRadius: "12px 12px 0 0", marginBottom: 16, overflow: "hidden" }}>
        {[["input", "⏰ 근무 입력"], ["result", "💰 견적 결과"]].map(([k, v]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            flex: 1, padding: "14px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
            borderBottom: activeTab === k ? "3px solid #1d4ed8" : "3px solid transparent",
            background: activeTab === k ? "#eff6ff" : "#fff", color: activeTab === k ? "#1d4ed8" : "#9ca3af",
          }}>{v}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* ── 입력 패널 ── */}
        <div style={{ display: activeTab === "input" ? "block" : "none" }}>

          {/* 근무 시간 */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>⏰ 실제 근무 시간 입력</h3>
            <div style={S.pillGroup}>
              {[["simple", "📅 일괄(전 요일 동일)"], ["weekly", "🗓 요일별 개별 설정"]].map(([k, v]) => (
                <button key={k} onClick={() => setScheduleMode(k)} style={S.pill(scheduleMode === k)}>{v}</button>
              ))}
            </div>

            {scheduleMode === "simple" ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <TimeInput label="출근" value={simple.start} onChange={v => setSimple(p => ({ ...p, start: v }))} />
                  <TimeInput label="퇴근" value={simple.end} onChange={v => setSimple(p => ({ ...p, end: v }))} />
                  <div>
                    <label style={S.label}>휴게(분)</label>
                    <input type="number" value={simple.breakMin} min={0} max={480} step={30}
                      onChange={e => setSimple(p => ({ ...p, breakMin: parseInt(e.target.value) || 0 }))} style={S.input} />
                  </div>
                </div>
                <div>
                  <label style={{ ...S.label, marginBottom: 8 }}>주 근무일수</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    {[5, 6, 7].map(n => (
                      <button key={n} onClick={() => setSimple(p => ({ ...p, daysPerWeek: n }))} style={{
                        padding: "9px 0", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer",
                        border: `2px solid ${simple.daysPerWeek === n ? "#2563eb" : "#e5e7eb"}`,
                        background: simple.daysPerWeek === n ? "#2563eb" : "#fff",
                        color: simple.daysPerWeek === n ? "#fff" : "#6b7280", boxShadow: simple.daysPerWeek === n ? "0 2px 6px rgba(37,99,235,0.3)" : "none",
                      }}>주 {n}일</button>
                    ))}
                    <input type="number" value={simple.daysPerWeek} min={1} max={7}
                      onChange={e => setSimple(p => ({ ...p, daysPerWeek: parseInt(e.target.value) || 5 }))}
                      style={{ ...S.input, textAlign: "center" }} />
                  </div>
                </div>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: 12, marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>⚡ 일 실근무시간</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#1e3a8a", fontFamily: "monospace" }}>
                    {Math.max(0, (tt(simple.end) - tt(simple.start) - simple.breakMin) / 60).toFixed(1)}시간
                  </span>
                </div>
              </div>
            ) : (
              <div>
                {SC_DAYS.map((day, i) => (
                  <div key={day} style={{ borderRadius: 12, border: `2px solid ${weekly[i].work ? "#bfdbfe" : "#f3f4f6"}`, background: weekly[i].work ? "#eff6ff" : "#f9fafb", padding: 10, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => setWeekly(w => w.map((d, j) => j === i ? { ...d, work: !d.work } : d))}
                        style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: weekly[i].work ? "#2563eb" : "#d1d5db", position: "relative", flexShrink: 0 }}>
                        <div style={{ width: 16, height: 16, background: "#fff", borderRadius: "50%", position: "absolute", top: 4, left: weekly[i].work ? 23 : 3, transition: "all 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                      </button>
                      <span style={{ width: 16, fontSize: 13, fontWeight: 900, color: i >= 5 ? "#ef4444" : "#374151", flexShrink: 0 }}>{day}</span>
                      {weekly[i].work ? (
                        <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>
                          <input type="time" value={weekly[i].start}
                            onChange={e => setWeekly(w => w.map((d, j) => j === i ? { ...d, start: e.target.value } : d))}
                            style={{ flex: 1, padding: "5px 8px", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, background: "#fff" }} />
                          <span style={{ fontSize: 12, color: "#d1d5db" }}>~</span>
                          <input type="time" value={weekly[i].end}
                            onChange={e => setWeekly(w => w.map((d, j) => j === i ? { ...d, end: e.target.value } : d))}
                            style={{ flex: 1, padding: "5px 8px", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, background: "#fff" }} />
                          <input type="number" value={weekly[i].breakMin} min={0} step={30}
                            onChange={e => setWeekly(w => w.map((d, j) => j === i ? { ...d, breakMin: parseInt(e.target.value) || 0 } : d))}
                            style={{ width: 52, padding: "5px 6px", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, textAlign: "center", background: "#fff" }} />
                          <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>분</span>
                        </div>
                      ) : <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 4 }}>휴무</span>}
                    </div>
                    {weekly[i].work && (
                      <div style={{ marginTop: 4, marginLeft: 66, fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>
                        실근무 {Math.max(0, (tt(weekly[i].end) - tt(weekly[i].start) - weekly[i].breakMin) / 60).toFixed(1)}시간
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 시급 기준 */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>💰 시급 기준 설정</h3>
            <div style={S.pillGroup}>
              {[["min", "최저임금만"], ["custom", "직접 입력"], ["both", "둘 다 비교"]].map(([k, v]) => (
                <button key={k} onClick={() => setHrMode(k)} style={S.pill(hrMode === k)}>{v}</button>
              ))}
            </div>
            {(hrMode === "custom" || hrMode === "both") && (
              <div>
                <label style={S.label}>설정 시급 (원)</label>
                <input type="number" value={customHr} min={SC_MW} step={100}
                  onChange={e => setCustomHr(parseInt(e.target.value) || SC_MW)}
                  style={{ ...S.input, fontSize: 17, fontWeight: 800, fontFamily: "monospace" }} />
                {customHr < SC_MW && <p style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginTop: 4 }}>❌ 2026 최저임금({sf(SC_MW)}원) 위반!</p>}
              </div>
            )}
          </div>

          {/* 기타 */}
          <div style={S.card}>
            <h3 style={S.sectionTitle}>⚙️ 기타</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={S.label}>식대 비과세</label>
                <input type="number" value={meal} step={10000} max={200000}
                  onChange={e => setMeal(parseInt(e.target.value) || 0)} style={S.input} />
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>최대 200,000원</p>
              </div>
              <div>
                <label style={S.label}>부양가족</label>
                <select value={dep} onChange={e => setDep(parseInt(e.target.value))} style={S.input}>
                  {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}명{n === 1 ? " (본인만)" : ""}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 근무시간 분석 */}
          <div style={{ background: "linear-gradient(135deg, #334155 0%, #0f172a 100%)", color: "#fff", borderRadius: 16, padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 900, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>📊 근무시간 분석 <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>(자동 계산)</span></h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                ["일 실근무", `${calc.dailyWorkH.toFixed(1)}h`], ["주 실근무", `${calc.weeklyWorkH.toFixed(1)}h`],
                ["월 기본시간", `${calc.monthlyBasicH.toFixed(1)}h`], ["월 주휴시간", calc.hasWL ? `${calc.monthlyWLH.toFixed(1)}h` : "미해당"],
                ["월 연장시간", `${calc.monthlyOTH.toFixed(1)}h`], ["월 야간시간", `${calc.monthlyNightH.toFixed(1)}h`],
              ].map(([l, v]) => (
                <div key={l} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>{v}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              {!calc.hasWL && <p style={{ color: "#fde047" }}>⚠️ 주 15시간 미만 — 주휴수당 미발생</p>}
              {calc.monthlyOTH > 0 && <p style={{ color: "#fdba74" }}>⚡ 연장근무 가산수당(×1.5) 자동 적용</p>}
              {calc.monthlyNightH > 0 && <p style={{ color: "#c4b5fd" }}>🌙 야간가산수당(×0.5) 자동 적용</p>}
            </div>
          </div>
        </div>

        {/* ── 결과 패널 ── */}
        <div style={{ display: activeTab === "result" ? "block" : "none" }}>
          {(hrMode === "min" || hrMode === "both") && <ResultBlock r={calc.minResult} label="✅ 최저임금 기준" accent="green" />}
          {(hrMode === "custom" || hrMode === "both") && <ResultBlock r={calc.customResult} label="⭐ 설정 시급 기준" accent="blue" />}

          {/* 비교표 */}
          {hrMode === "both" && (
            <div style={S.card}>
              <h3 style={S.sectionTitle}>📊 최저임금 vs 설정시급 비교</h3>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <td style={{ padding: 10, fontWeight: 700, color: "#9ca3af", borderRadius: "12px 0 0 0" }}>항목</td>
                    <td style={{ padding: 10, fontWeight: 700, color: "#047857", textAlign: "right" }}>최저임금</td>
                    <td style={{ padding: 10, fontWeight: 700, color: "#1d4ed8", textAlign: "right", borderRadius: "0 12px 0 0" }}>설정시급</td>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["시급", sf(calc.minResult.hrRate) + "원", sf(calc.customResult.hrRate) + "원"],
                    ["총 지급액", sf(calc.minResult.gross) + "원", sf(calc.customResult.gross) + "원"],
                    ["실수령액", sf(calc.minResult.net) + "원", sf(calc.customResult.net) + "원"],
                    ["총 공제액", sf(calc.minResult.totDed) + "원", sf(calc.customResult.totDed) + "원"],
                    ["사업주 보험", sf(calc.minResult.insR) + "원", sf(calc.customResult.insR) + "원"],
                    ["사업주 총비용", sf(calc.minResult.totCost) + "원", sf(calc.customResult.totCost) + "원"],
                    ["시간당 인건비", sf(calc.minResult.hrCost) + "원", sf(calc.customResult.hrCost) + "원"],
                  ].map(([l, a, b]) => (
                    <tr key={l} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 10, color: "#9ca3af" }}>{l}</td>
                      <td style={{ padding: 10, fontWeight: 700, color: "#047857", textAlign: "right", fontFamily: "monospace" }}>{a}</td>
                      <td style={{ padding: 10, fontWeight: 700, color: "#1d4ed8", textAlign: "right", fontFamily: "monospace" }}>{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 500, color: "#92400e" }}>
                💡 월 차액 (사업주 기준):&nbsp;
                <span style={{ fontWeight: 900, color: "#78350f" }}>
                  {sf(Math.abs(calc.customResult.totCost - calc.minResult.totCost))}원
                  {calc.customResult.totCost > calc.minResult.totCost ? " 추가 부담" : " 절감"}
                </span>
              </div>
            </div>
          )}

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, fontSize: 12, color: "#9ca3af", lineHeight: 2 }}>
            <p style={{ fontWeight: 700, color: "#4b5563", marginBottom: 4 }}>📌 2026년 법적 기준</p>
            <p>• 최저임금 <strong style={{ color: "#374151" }}>{sf(SC_MW)}원</strong> / 최저월급 2,156,880원 (209h)</p>
            <p>• 국민연금 9.5% (각 4.75%) · 건강보험 7.19% · 장기요양 13.14%</p>
            <p>• 연장(1일 8h·주 40h 초과) ×1.5 / 야간(22~06시) ×0.5 가산</p>
            <p>• 소득세는 간이세액표 기준 추정치 · 정확한 처리는 노무사 확인 권장</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 17. 메인 앱 쉘 ────────────────────────────────────
function MainApp() {
  const { profile, signOut, can } = useAuth();
  const [page, setPage] = useState("main_dashboard");
  const [employees, setEmployees] = useState([]);
  const [contractEmp, setContractEmp] = useState(null);
  const [contractEdit, setContractEdit] = useState(null);
  const [empLoading, setEmpLoading] = useState(true);

  // 수익성 분석 공유 state (MainDashboard + ProfitabilityPage)
  const [profitMonth, setProfitMonth] = useState("2026-02");
  const [revenueData, setRevenueData] = useState({});
  const [overheadData, setOverheadData] = useState({});

  // ★ Phase B: monthly_summary 로딩 (재무 KPI + 기간연산)
  const [monthlySummary, setMonthlySummary] = useState([]);
  const loadMonthlySummary = async () => {
    const { data } = await supabase.from("monthly_summary").select("*").order("month", { ascending: false });
    if (data) setMonthlySummary(data);
  };

  // ★ Phase C: 차트용 은행거래 데이터
  const [chartTransactions, setChartTransactions] = useState([]);
  const loadChartTransactions = async () => {
    const { data } = await supabase
      .from("financial_transactions")
      .select("tx_date, amount_in, amount_out, balance_after, tx_type")
      .eq("tx_type", "bank")
      .order("tx_date", { ascending: true })
      .limit(3000);
    if (data) setChartTransactions(data);
  };

  // ★ Phase C: 비용입력 DB 저장 (site_revenue)
  const saveRevenueToDB = useCallback(async (month, siteCode, amount) => {
    const { error } = await supabase.from("site_revenue")
      .upsert({ site_code: siteCode, month, revenue: Math.round(amount) }, { onConflict: "site_code,month" });
    if (error) console.error("site_revenue save error:", error);
  }, []);

  // ★ Phase C: 비용입력 DB 저장 (site_overhead)
  const saveOverheadToDB = useCallback(async (month, itemKey, label, amount, method) => {
    const { error } = await supabase.from("site_overhead")
      .upsert({ month, item_key: itemKey, item_label: label, amount: Math.round(amount), alloc_method: method }, { onConflict: "month,item_key" });
    if (error) console.error("site_overhead save error:", error);
  }, []);

  // ★ Phase C: DB에서 비용 데이터 초기 로딩
  const loadCostData = async () => {
    const { data: revRows } = await supabase.from("site_revenue").select("*");
    if (revRows && revRows.length > 0) {
      const revMap = {};
      revRows.forEach(r => {
        if (!revMap[r.month]) revMap[r.month] = {};
        revMap[r.month][r.site_code] = r.revenue;
      });
      setRevenueData(revMap);
    }
    const { data: ohRows } = await supabase.from("site_overhead").select("*");
    if (ohRows && ohRows.length > 0) {
      const ohMap = {};
      ohRows.forEach(r => {
        if (!ohMap[r.month]) ohMap[r.month] = [];
        ohMap[r.month].push({ key: r.item_key, label: r.item_label, method: r.alloc_method, amount: r.amount });
      });
      setOverheadData(ohMap);
    }
  };

  const profitState = {
    profitMonth, setProfitMonth,
    revenueData, setRevenueData, overheadData, setOverheadData,
    monthlySummary, chartTransactions,
    saveRevenueToDB, saveOverheadToDB,
  };

  // Supabase에서 직원 데이터 로드
  const loadEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("*").order("emp_no");
    if (data) setEmployees(data);
    setEmpLoading(false);
  };

  useEffect(() => { loadEmployees(); loadMonthlySummary(); loadChartTransactions(); loadCostData(); }, []);

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

  const hrNavItems = [
    { key: "dashboard", icon: "📊", label: "HR 대시보드" },
    { key: "employees", icon: "👥", label: "직원현황" },
    { key: "contract", icon: "📝", label: "계약서" },
    { key: "history", icon: "📋", label: "계약 이력" },
    { key: "resignation", icon: "📄", label: "사직서" },
    { key: "certificate", icon: "📑", label: "재직증명서" },
    ...(can("settings") ? [{ key: "settings", icon: "⚙️", label: "계약서 조항변경" }] : []),
    ...(can("invite") ? [{ key: "invite", icon: "🔐", label: "관리자 초대" }] : []),
  ];

  const profitNavItems = [
    { key: "profit_summary", icon: "📊", label: "전체 요약" },
    { key: "profit_site_pl", icon: "🏢", label: "사업장 PL" },
    { key: "profit_cost_input", icon: "✏️", label: "비용 입력" },
    { key: "profit_comparison", icon: "📈", label: "비교 분석" },
    { key: "profit_alloc", icon: "⚙️", label: "배부 설정" },
    { key: "profit_import", icon: "📥", label: "데이터 Import" },
  ];

  const siteNavItems = [
    { key: "site_management", icon: "🏢", label: "사업장 관리" },
  ];

  const calcNavItems = [
    { key: "salary_calc", icon: "💼", label: "인건비 견적" },
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
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>ERP시스템</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {/* 메인 대시보드 — 최상위 */}
          <button onClick={() => setPage("main_dashboard")}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 12px",
              borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 6, fontSize: 13, fontWeight: 800,
              background: page === "main_dashboard" ? C.gold : "transparent",
              color: page === "main_dashboard" ? C.navy : "rgba(255,255,255,0.85)",
              fontFamily: FONT,
            }}>
            <span style={{ fontSize: 16 }}>🏠</span> 메인 대시보드
          </button>

          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "6px 8px 10px" }} />

          {/* HR & 계약관리 영역 */}
          <div style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1 }}>HR & 계약관리</span>
          </div>
          {hrNavItems.map(item => (
            <button key={item.key} onClick={() => { setPage(item.key); if (item.key !== "contract") { setContractEmp(null); setContractEdit(null); } }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 4, fontSize: 13, fontWeight: 700,
                background: page === item.key ? "rgba(255,255,255,0.15)" : "transparent",
                color: page === item.key ? C.white : "rgba(255,255,255,0.75)",
                fontFamily: FONT,
              }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
            </button>
          ))}

          {/* 구분선 */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 8px" }} />

          {/* 수익성 분석 영역 */}
          <div style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1 }}>수익성 분석</span>
          </div>
          {profitNavItems.map(item => (
            <button key={item.key} onClick={() => setPage(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 4, fontSize: 13, fontWeight: 700,
                background: page === item.key ? "rgba(255,255,255,0.15)" : "transparent",
                color: page === item.key ? C.white : "rgba(255,255,255,0.75)",
                fontFamily: FONT,
              }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
            </button>
          ))}

          {/* 구분선 */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 8px" }} />

          {/* 사업장 현황 영역 */}
          <div style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1 }}>사업장 현황</span>
          </div>
          {siteNavItems.map(item => (
            <button key={item.key} onClick={() => setPage(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 4, fontSize: 13, fontWeight: 700,
                background: page === item.key ? "rgba(255,255,255,0.15)" : "transparent",
                color: page === item.key ? C.white : "rgba(255,255,255,0.75)",
                fontFamily: FONT,
              }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
            </button>
          ))}

          {/* 구분선 */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 8px" }} />

          {/* 견적 계산기 영역 */}
          <div style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1 }}>견적 계산기</span>
          </div>
          {calcNavItems.map(item => (
            <button key={item.key} onClick={() => setPage(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 4, fontSize: 13, fontWeight: 700,
                background: page === item.key ? "rgba(255,255,255,0.15)" : "transparent",
                color: page === item.key ? C.white : "rgba(255,255,255,0.75)",
                fontFamily: FONT,
              }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>

        {/* 유저 정보 */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>{profile?.name}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
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
        {page === "main_dashboard" && <MainDashboard employees={employees} onNavigate={setPage} profitState={profitState} />}
        {page === "dashboard" && <Dashboard employees={employees} />}
        {page === "employees" && <EmployeeRoster employees={employees} saveEmployee={saveEmployee} deleteEmployee={deleteEmployee} onContract={goContract} onResign={goResign} onReload={loadEmployees} />}
        {page === "contract" && <ContractWriter employees={employees} initialEmp={contractEmp} initialContract={contractEdit} onSave={() => {}} />}
        {page === "history" && <ContractHistory employees={employees} onEditContract={goEditContract} onNewContract={goNewContract} />}
        {page === "resignation" && <Resignation employees={employees} />}
        {page === "certificate" && <Certificate employees={employees} />}
        {page === "settings" && <Settings />}
        {page === "invite" && <AdminInvitePanel />}
        {page === "profit_summary" && <ProfitabilityPage employees={employees} subPage="summary" profitState={profitState} />}
        {page === "profit_site_pl" && <ProfitabilityPage employees={employees} subPage="site_pl" profitState={profitState} />}
        {page === "profit_cost_input" && <ProfitabilityPage employees={employees} subPage="cost_input" profitState={profitState} />}
        {page === "profit_comparison" && <ProfitabilityPage employees={employees} subPage="comparison" profitState={profitState} />}
        {page === "profit_alloc" && <ProfitabilityPage employees={employees} subPage="alloc_settings" profitState={profitState} />}
        {page === "profit_import" && <FinancialImportPage onImportComplete={() => { loadMonthlySummary(); loadChartTransactions(); }} />}
        {page === "site_management" && <SiteManagementPage employees={employees} />}
        {page === "salary_calc" && <SalaryCalculatorPage />}
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
