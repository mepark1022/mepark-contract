import { useState, useMemo, useEffect, useCallback, useRef, createContext, useContext, Fragment, Component } from "react";
import { supabase, supabaseUrl, supabaseAnonKey, callAdminApi } from "./supabaseClient";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, LineChart, Cell, Legend } from "recharts";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, ShadingType, Header, Footer, PageNumber, WidthType, TableLayoutType } from "docx";

/* ═══════════════════════════════════════════════════════
   (주)미스터팍 근로계약서 관리 시스템 v8.0
   Phase A: clobe.ai 재무 데이터 Import + 기존 HR/수익분석 통합
   Phase B: 재무KPI 5개 + 기간선택 실연산 + P&L확장 + 세금계산서카드
   Phase C: Recharts 현금흐름 차트 + 비용입력 DB저장 + 대시보드 연동
   ═══════════════════════════════════════════════════════ */

// ── ErrorBoundary ──
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, info: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { this.setState({ info }); console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR', sans-serif", background: "#F4F5F7", padding: 32 }}>
          <div style={{ maxWidth: 600, background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 4px 24px rgba(0,0,0,0.1)" }}>
            <h2 style={{ color: "#E53935", fontSize: 20, fontWeight: 900, marginBottom: 12 }}>⚠️ 오류가 발생했습니다</h2>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>페이지를 새로고침하거나 관리자에게 문의하세요.</p>
            <div style={{ background: "#FFF3F3", border: "1px solid #FFCDD2", borderRadius: 8, padding: 16, fontSize: 12, color: "#B71C1C", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 300, overflow: "auto" }}>
              {this.state.error?.toString()}
              {this.state.info?.componentStack ? "\n\nComponent Stack:" + this.state.info.componentStack.slice(0, 500) : ""}
            </div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: "10px 24px", background: "#1428A0", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>🔄 새로고침</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── 1. 상수 ──────────────────────────────────────────
const C = {
  navy: "#1428A0", gold: "#F5B731", dark: "#222222", gray: "#666666",
  lightGray: "#E8E8E8", white: "#FFFFFF", error: "#E53935", success: "#43A047",
  orange: "#E97132", blue: "#156082", skyBlue: "#0F9ED5",
  bg: "#F4F5F7", border: "#D8DCE3", cardBg: "#FAFBFC",
};

const FONT = "'Noto Sans KR', sans-serif";

// 카카오 지도 API (JavaScript 앱키)
const KAKAO_MAP_KEY = "c7b46fd78613ab48353a0e0666838807";

const DEFAULT_SITES = [
  { code: "V000", name: "기획운영팀(본사)" }, { code: "V001", name: "강원빌딩" },
  { code: "V002", name: "사계절한정식" }, { code: "V003", name: "신한은행(서초)" },
  { code: "V004", name: "장안면옥" }, { code: "V005", name: "한티옥(방이)" },
  { code: "V006", name: "청담우리동물병원" }, { code: "V007", name: "미니쉬치과병원" },
  { code: "V008", name: "쥬비스(삼성)" }, { code: "V009", name: "모모빌딩" },
  { code: "V010", name: "곽생로여성의원" }, { code: "V011", name: "금돈옥(청담)" },
  { code: "V012", name: "금돈옥(잠실)" }, { code: "V013", name: "써브라임" },
  { code: "V014", name: "더캐리" }, { code: "V015", name: "강서푸른빛성모어린이병원" },
  { code: "V016", name: "SC제일은행PPC(압구정)" }, { code: "V017", name: "금돈옥(방배)" },
];
// ★ 동적 사업장 목록 — DB site_details에서 추가된 사업장 포함
let SITES = [...DEFAULT_SITES];
let FIELD_SITES = SITES.filter(s => s.code !== "V000");
function _refreshGlobalSites(detailsMap) {
  const base = [...DEFAULT_SITES];
  Object.entries(detailsMap || {}).forEach(([code, d]) => {
    if (!base.find(s => s.code === code) && d.site_name) {
      base.push({ code, name: d.site_name });
    }
  });
  base.sort((a, b) => a.code.localeCompare(b.code));
  SITES = base;
  FIELD_SITES = SITES.filter(s => s.code !== "V000");
}

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
const BANKS = ["국민은행","신한은행","우리은행","하나은행","농협은행","기업은행","SC제일은행","카카오뱅크","토스뱅크","케이뱅크","수협은행","대구은행","부산은행","경남은행","광주은행","전북은행","제주은행","새마을금고","우체국","신협","산업은행"];
const ROLES = { super_admin: "슈퍼어드민", admin: "어드민", crew: "크루", field_member: "현장팀원" };

// 날짜 포맷 헬퍼 (어드민 패널용)
const fmtDate = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
  } catch { return "-"; }
};
const fmtDateTime = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  } catch { return "-"; }
};

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
const dDay = (dateStr) => { if (!dateStr) return null; const t = new Date(dateStr + "T00:00:00"); const n = new Date(); const td = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.round((t - td) / 86400000); };
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

// ── 3.5 커스텀 확인 모달 (ME.PARK 디자인) ─────────────
const ConfirmCtx = createContext(null);
function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { msg, sub, resolve, okLabel, okColor }
  const showConfirm = useCallback((msg, sub, opts) => {
    return new Promise(resolve => { setState({ msg, sub, resolve, ...(opts || {}) }); });
  }, []);
  const handleOk = () => { state?.resolve(true); setState(null); };
  const handleCancel = () => { state?.resolve(false); setState(null); };
  return (
    <ConfirmCtx.Provider value={showConfirm}>
      {children}
      {state && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, fontFamily: FONT }}
          onClick={handleCancel}>
          <div style={{ background: "#fff", borderRadius: 16, width: 380, maxWidth: "90vw", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ background: C.navy, padding: "16px 24px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: C.navy }}>!</div>
              <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>확인</span>
            </div>
            {/* 본문 */}
            <div style={{ padding: "24px 24px 16px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, lineHeight: 1.6 }}>{state.msg}</div>
              {state.sub && <div style={{ fontSize: 12, color: C.gray, marginTop: 8, whiteSpace: "pre-line" }}>{state.sub}</div>}
            </div>
            {/* 버튼 */}
            <div style={{ display: "flex", gap: 10, padding: "8px 24px 20px", justifyContent: "flex-end" }}>
              <button onClick={handleCancel} style={{ padding: "10px 24px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", color: C.gray }}>취소</button>
              <button onClick={handleOk} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: state.okColor || C.navy, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{state.okLabel || "확인"}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
const useConfirm = () => useContext(ConfirmCtx);

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
    try {
      const [profRes, invRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("invitations").select("*").order("created_at", { ascending: false }),
      ]);
      if (profRes.data) setProfiles(profRes.data);
      if (invRes.data) setInvitations(invRes.data);
    } catch (e) {
      console.error("데이터 로드 실패:", e);
    }
  };

  const signIn = async (email, pw) => {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) return { error: error.message };
    // 프로필 존재 확인 (없으면 로그인 거부 — 관리자가 직접 생성한 계정만 허용)
    if (authData?.user) {
      const { data: existingProfile } = await supabase.from("profiles")
        .select("id, role").eq("id", authData.user.id).single();
      if (!existingProfile) {
        await supabase.auth.signOut();
        return { error: "등록된 관리자 계정이 아닙니다. 슈퍼관리자에게 문의하세요." };
      }
      // 현장 계정(field_member)은 ERP 접근 차단
      if (existingProfile.role === "field_member") {
        await supabase.auth.signOut();
        return { error: "현장 계정은 현장일보 앱을 이용해주세요." };
      }
    }
    await loadData();
    return { error: null };
  };

  const signUp = async (email, pw, name, inviteToken) => {
    try {
      // 초대 토큰 검증
      const { data: inv } = await supabase.from("invitations")
        .select("*").eq("token", inviteToken).eq("status", "pending").single();
      if (!inv) return { error: "유효하지 않은 초대입니다." };
      if (new Date(inv.expires_at) < new Date()) return { error: "만료된 초대입니다." };
      if (inv.email !== email) return { error: `초대된 이메일(${inv.email})과 일치하지 않습니다.` };

      const { data: authData, error } = await supabase.auth.signUp({
        email, password: pw,
        options: { data: { name } }
      });
      if (error) return { error: error.message };

      // 초대 상태를 "accepted"로 업데이트
      await supabase.from("invitations").update({ status: "accepted" }).eq("id", inv.id);

      // 프로필 생성 (DB 트리거 미설정 대비)
      if (authData?.user) {
        const { error: profErr } = await supabase.from("profiles").upsert({
          id: authData.user.id,
          email: email,
          name: name,
          role: inv.role,
          created_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (profErr) console.error("프로필 생성 오류:", profErr.message);
      }

      await loadData();
      return { error: null };
    } catch (e) {
      return { error: e.message || "가입 중 오류가 발생했습니다." };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setProfiles([]); setInvitations([]);
  };

  // ── 계정 직접 생성 (슈퍼관리자 전용 — Edge Function) ──
  const createAccount = async (name, email, password, role, options = {}) => {
    try {
      // profiles 기준 중복 체크 (emp_no 또는 email)
      const empNo = options.emp_no || null;
      const existingByEmail = profiles.find(p => p.email === email);
      const existingByEmpNo = empNo ? profiles.find(p => p.emp_no === empNo) : null;
      if (existingByEmail || existingByEmpNo) {
        return { error: `이미 등록된 계정입니다 (${empNo || email})` };
      }

      // Edge Function으로 계정 생성
      const { data, error: apiError } = await callAdminApi("create_user", {
        email, password, name, role,
        site_code: options.site_code || null,
        employee_id: options.employee_id || null,
        emp_no: empNo,
        work_code: options.work_code || null,
      });

      // auth 중복 오류는 친절하게 변환
      if (apiError) {
        if (apiError.includes("already") || apiError.includes("duplicate") || apiError.includes("exists")) {
          return { error: `중복 계정 — auth에 이미 존재합니다 (${empNo || email}). Supabase에서 삭제 후 재시도하세요.` };
        }
        return { error: apiError };
      }

      await loadData();

      // ── v9.0: employees ↔ auth 동기화 ──
      // 계정 생성 후 매칭되는 employee 레코드에 auth 정보 기록
      if (empNo) {
        try {
          // 새로 생성된 profile 찾기
          const { data: newProf } = await supabase.from("profiles")
            .select("id, email, role").eq("email", email).single();
          if (newProf) {
            await supabase.from("employees").update({
              auth_id: newProf.id,
              system_role: newProf.role,
              account_email: newProf.email,
              account_status: "active",
            }).eq("emp_no", empNo);
          }
        } catch (syncErr) {
          console.warn("employees ↔ auth 동기화 실패 (무시):", syncErr);
        }
      }

      return { error: null };
    } catch (e) {
      return { error: e.message || "계정 생성 중 오류가 발생했습니다." };
    }
  };

  // ── 비밀번호 변경 ──
  const changePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e) {
      return { error: e.message || "비밀번호 변경 중 오류가 발생했습니다." };
    }
  };

  const sendInvite = async (email, role) => {
    try {
      // 중복 초대 체크 (동일 이메일 pending 상태)
      const { data: existing } = await supabase.from("invitations")
        .select("id").eq("email", email).eq("status", "pending");
      if (existing && existing.length > 0) return { error: "이미 대기 중인 초대가 있습니다." };
      // 이미 가입된 사용자 체크
      const existingProfile = profiles.find(p => p.email === email);
      if (existingProfile) return { error: "이미 등록된 관리자입니다." };
      // 토큰 + 만료일 생성 (DB 기본값 미설정 대비)
      const token = crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36));
      const expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("invitations")
        .insert({ email, role, invited_by: user?.id, token, expires_at, status: "pending" })
        .select().single();
      if (error) return { error: error.message };
      await loadData();
      return { error: null, invitation: data };
    } catch (e) {
      return { error: e.message || "초대 생성 중 오류가 발생했습니다." };
    }
  };

  const cancelInvite = async (id) => {
    try {
      const { error } = await supabase.from("invitations").update({ status: "cancelled" }).eq("id", id);
      if (error) { alert("초대 취소 실패: " + error.message); return; }
      await loadData();
    } catch (e) { alert("오류: " + e.message); }
  };

  const resendInvite = async (id) => {
    try {
      const { error } = await supabase.from("invitations").update({
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
      }).eq("id", id);
      if (error) { alert("재발송 실패: " + error.message); return; }
      await loadData();
    } catch (e) { alert("오류: " + e.message); }
  };

  const removeAdmin = async (id) => {
    try {
      // Edge Function으로 Auth ban + profiles 삭제 동시 처리
      const { error: apiError } = await callAdminApi("ban_user", { userId: id });
      if (apiError) { alert("관리자 제거 실패: " + apiError); return; }
      // v9.0: employees 계정 상태 비활성화
      await supabase.from("employees").update({
        account_status: "deactivated", system_role: "none", auth_id: null, account_email: null
      }).eq("auth_id", id);
      await loadData();
    } catch (e) { alert("오류: " + e.message); }
  };

  const updateRole = async (id, role) => {
    try {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) { alert("역할 변경 실패: " + error.message); return; }
      // v9.0: employees.system_role 동기화
      await supabase.from("employees").update({ system_role: role }).eq("auth_id", id);
      await loadData();
    } catch (e) { alert("오류: " + e.message); }
  };

  const profile = user ? profiles.find(p => p.id === user.id) : null;
  const isFieldRole = profile && profile.role === "field_member";
  const isCrewRole  = profile && profile.role === "crew";

  // 권한 체계
  // super_admin : 전체 권한 (어드민+크루 생성, 역할 변경, 삭제)
  // admin       : 크루 생성 + 전 사업장 일보 작성/수정 (역할 변경/슈퍼어드민 계정 관리 불가)
  // crew        : 본인 소속 사업장 일보 작성/수정만
  const can = (action) => {
    if (!profile) return false;
    if (isFieldRole) return false; // 마감앱 전용 — ERP 접근 불가
    if (profile.role === "super_admin") return true;
    if (profile.role === "admin") {
      // 어드민 불가: 역할 변경, 슈퍼어드민 계정 관리, 시스템 설정
      return !["manage_admins", "settings", "change_role", "delete_admin"].includes(action);
    }
    // crew: 소속 사업장 일보만
    if (isCrewRole) return ["view", "daily_report"].includes(action);
    return action === "view";
  };

  return (
    <AuthCtx.Provider value={{
      user, profile, loading, signIn, signUp, signOut, createAccount, changePassword, sendInvite,
      cancelInvite, resendInvite, removeAdmin, updateRole,
      profiles, invitations, can, loadData, callAdminApi, isCrewRole,
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

// ── 5-1.5 BlurSaveNum — 포커스 해제 시에만 저장하는 숫자 입력 ──
function BlurSaveNum({ value, onSave, style: st, placeholder, ...rest }) {
  const inputRef = useRef(null);
  const focusedRef = useRef(false);
  const localRef = useRef(String(value ?? "0"));
  const [display, setDisplay] = useState(fmt(value || 0));
  const lastValueRef = useRef(value);

  // 외부 value가 변경되면 (다른 사업장, 월 전환 등) — 포커스 중이 아닐 때만 반영
  if (value !== lastValueRef.current && !focusedRef.current) {
    lastValueRef.current = value;
    localRef.current = String(value ?? "0");
    // display는 아래 render에서 결정
  }

  const formatted = (value === "" || value == null || value === 0) ? "0" : fmt(value);

  return (
    <input ref={inputRef} inputMode="decimal" placeholder={placeholder}
      style={{ ...inputStyle, ...st }}
      value={focusedRef.current ? display : formatted}
      onFocus={() => {
        focusedRef.current = true;
        localRef.current = String(value ?? "0");
        setDisplay(localRef.current);
      }}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9.-]/g, "");
        localRef.current = raw;
        setDisplay(raw);
      }}
      onBlur={() => {
        focusedRef.current = false;
        const n = Number(localRef.current.replace(/,/g, ""));
        const finalVal = isNaN(n) ? 0 : n;
        lastValueRef.current = finalVal;
        setDisplay(fmt(finalVal));
        onSave(finalVal);
      }}
      {...rest}
    />
  );
}

// ── 5-1b. 카카오 주소검색 + 지도 컴포넌트 ─────────────────
const loadScript = (src, id) => {
  return new Promise((resolve) => {
    if (document.getElementById(id)) { resolve(); return; }
    const s = document.createElement("script");
    s.id = id; s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // 실패해도 앱은 계속
    document.head.appendChild(s);
  });
};

function KakaoAddressMap({ address, latitude, longitude, onAddressChange }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);

  // 스크립트 로드
  useEffect(() => {
    (async () => {
      await loadScript("//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js", "daum-postcode");
      if (KAKAO_MAP_KEY && KAKAO_MAP_KEY !== "YOUR_KAKAO_JAVASCRIPT_KEY") {
        await loadScript(`//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&libraries=services&autoload=false`, "kakao-maps");
        if (window.kakao && window.kakao.maps) {
          window.kakao.maps.load(() => setScriptsLoaded(true));
        }
      }
    })();
  }, []);

  // 지도 초기화 + 업데이트
  useEffect(() => {
    if (!scriptsLoaded || !mapRef.current || !window.kakao?.maps) return;
    const lat = latitude || 37.5665;
    const lng = longitude || 126.978;
    const pos = new window.kakao.maps.LatLng(lat, lng);

    if (!mapInstanceRef.current) {
      const map = new window.kakao.maps.Map(mapRef.current, { center: pos, level: 3 });
      mapInstanceRef.current = map;
      const marker = new window.kakao.maps.Marker({ position: pos, map });
      markerRef.current = marker;
      setMapReady(true);
    } else {
      mapInstanceRef.current.setCenter(pos);
      markerRef.current.setPosition(pos);
    }
  }, [scriptsLoaded, latitude, longitude]);

  // 주소 검색
  const handleSearch = () => {
    if (!window.daum?.Postcode) { alert("주소검색 스크립트를 로드할 수 없습니다."); return; }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const addr = data.roadAddress || data.jibunAddress;
        // 좌표 변환
        if (window.kakao?.maps?.services) {
          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(addr, (result, status) => {
            if (status === window.kakao.maps.services.Status.OK) {
              onAddressChange(addr, parseFloat(result[0].y), parseFloat(result[0].x));
            } else {
              onAddressChange(addr, null, null);
            }
          });
        } else {
          onAddressChange(addr, null, null);
        }
      }
    }).open();
  };

  const hasKey = KAKAO_MAP_KEY && KAKAO_MAP_KEY !== "YOUR_KAKAO_JAVASCRIPT_KEY";

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 4, display: "block" }}>사업장 주소</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input value={address || ""} readOnly placeholder="주소 검색 버튼을 클릭하세요"
          style={{ ...inputStyle, fontSize: 12, padding: "7px 10px", flex: 1, background: "#f9f9f9", cursor: "default" }} />
        <button onClick={handleSearch} style={{
          background: C.navy, border: "none", borderRadius: 8, padding: "7px 14px",
          fontSize: 11, fontWeight: 800, color: "#fff", cursor: "pointer", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 4
        }}>📍 주소 검색</button>
      </div>
      {hasKey && (
        <div ref={mapRef} style={{
          width: "100%", height: latitude ? 200 : 0, borderRadius: 10,
          border: latitude ? `1.5px solid ${C.border}` : "none",
          overflow: "hidden", transition: "height 0.3s ease"
        }} />
      )}
      {!hasKey && address && (
        <a href={`https://map.kakao.com/link/search/${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.navy, fontWeight: 700, textDecoration: "none", padding: "6px 12px", background: "#EFF3FF", borderRadius: 6, marginTop: 2 }}>
          🗺️ 카카오맵에서 보기 ↗
        </a>
      )}
    </div>
  );
}

// ── 5-2. ME.PARK 커스텀 달력 컴포넌트 ─────────────────
function MeParkDatePicker({ value, onChange, style: st, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const today = new Date();
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() || today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.getMonth() : today.getMonth());

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      if (!isNaN(d)) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
  }, [value]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  const handleSelect = (day) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const displayVal = value ? value.replace(/-/g, ".") : "";

  const handleOpen = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const calH = 340;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      setPos({
        top: spaceBelow >= calH ? rect.bottom + 4 : rect.top - calH - 4,
        left: Math.min(rect.left, window.innerWidth - 288),
      });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={handleOpen} style={{
        ...inputStyle, ...st, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: open ? "#f8f9ff" : "#fff", borderColor: open ? C.navy : "#D8DCE3"
      }}>
        <span style={{ color: displayVal ? C.dark : "#aaa", fontSize: 12 }}>{displayVal || "날짜 선택"}</span>
        <span style={{ fontSize: 14, color: C.navy }}>📅</span>
      </div>
      {open && (
        <div style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9990,
          background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(20,40,160,0.18)", border: `1.5px solid ${C.navy}`,
          width: 280, overflow: "hidden", fontFamily: FONT
        }}>
          {/* 헤더: 네이비 */}
          <div style={{ background: C.navy, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", padding: "2px 8px", borderRadius: 4 }}>◀</button>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>{viewYear}년 {viewMonth + 1}월</span>
            <button onClick={nextMonth} style={{ background: "none", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", padding: "2px 8px", borderRadius: 4 }}>▶</button>
          </div>
          {/* 요일 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "6px 8px 2px", borderBottom: `1px solid ${C.border}` }}>
            {dayLabels.map((d, i) => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, padding: "4px 0",
                color: i === 0 ? C.error : i === 6 ? "#1976D2" : C.gray }}>{d}</div>
            ))}
          </div>
          {/* 날짜 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "4px 8px 8px", gap: 2 }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayOfWeek = (firstDay + i) % 7;
              const isSelected = parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === day;
              const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
              return (
                <div key={day} onClick={() => handleSelect(day)} style={{
                  textAlign: "center", padding: "6px 0", fontSize: 12, fontWeight: isSelected ? 800 : 500,
                  cursor: "pointer", borderRadius: 8, transition: "all 0.15s",
                  background: isSelected ? C.gold : "transparent",
                  color: isSelected ? C.navy : dayOfWeek === 0 ? C.error : dayOfWeek === 6 ? "#1976D2" : C.dark,
                  border: isToday && !isSelected ? `1.5px solid ${C.navy}` : "1.5px solid transparent",
                }}
                  onMouseEnter={e => { if (!isSelected) e.target.style.background = "#f0f3ff"; }}
                  onMouseLeave={e => { if (!isSelected) e.target.style.background = "transparent"; }}
                >
                  {day}
                </div>
              );
            })}
          </div>
          {/* 하단: 오늘 버튼 + 초기화 */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 8px", display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => { onChange(""); setOpen(false); }} style={{
              background: "none", border: "none", fontSize: 11, color: C.gray, cursor: "pointer", fontWeight: 600, fontFamily: FONT
            }}>✕ 초기화</button>
            <button onClick={() => {
              const m = String(today.getMonth() + 1).padStart(2, "0");
              const d = String(today.getDate()).padStart(2, "0");
              onChange(`${today.getFullYear()}-${m}-${d}`);
              setOpen(false);
            }} style={{
              background: C.navy, border: "none", borderRadius: 6, padding: "4px 12px",
              fontSize: 11, color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: FONT
            }}>오늘</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 6. 로그인 페이지 ──────────────────────────────────
function LoginPage() {
  const { signIn } = useAuth();
  // 사번 또는 이메일 입력 → @mepark.internal 자동 추가 (기존 이메일 계정 호환)
  const [empNo, setEmpNo] = useState(() => {
    try { return localStorage.getItem("mepark_saved_empno") || ""; } catch { return ""; }
  });
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberEmpNo, setRememberEmpNo] = useState(() => {
    try { return !!localStorage.getItem("mepark_saved_empno"); } catch { return false; }
  });

  // 사번 → 이메일 변환 (이미 @가 있으면 그대로)
  const toEmail = (val) => val.includes("@") ? val : `${val.trim().toLowerCase()}@mepark.internal`;

  const handleLogin = async () => {
    if (!empNo.trim()) { setError("사번을 입력하세요."); return; }
    setLoading(true); setError("");
    try {
      if (rememberEmpNo) localStorage.setItem("mepark_saved_empno", empNo);
      else localStorage.removeItem("mepark_saved_empno");
    } catch {}
    const { error: e } = await signIn(toEmail(empNo), pw);
    if (e) setError("사번 또는 비밀번호가 올바르지 않습니다.");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${C.navy} 0%, #0a1a5c 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ width: 400, maxWidth: "90vw" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: C.gold, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: C.navy, marginBottom: 12 }}>MP</div>
          <h1 style={{ color: C.white, fontSize: 22, fontWeight: 900, margin: 0 }}>ME.PARK</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "4px 0 0" }}>ERP 시스템</p>
        </div>

        <div style={{ background: C.white, borderRadius: 16, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.dark, margin: "0 0 24px", textAlign: "center" }}>관리자 로그인</h2>

          {error && <div style={{ background: "#FEE2E2", color: C.error, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>사번 (아이디)</label>
            <input value={empNo} onChange={e => setEmpNo(e.target.value)} placeholder="MP24101"
              style={{ ...inputStyle, padding: "12px 14px", fontSize: 14, fontFamily: "monospace" }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} autoComplete="username" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>비밀번호 <span style={{ fontWeight: 400, fontSize: 11 }}>(초기: mp + 전화번호 뒷 4자리)</span></label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••"
              style={{ ...inputStyle, padding: "12px 14px", fontSize: 14 }}
              onKeyDown={e => e.key === "Enter" && handleLogin()} autoComplete="current-password" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
              onClick={() => setRememberEmpNo(v => !v)}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, border: `2px solid ${rememberEmpNo ? C.navy : "#D0D5DD"}`,
                background: rememberEmpNo ? C.navy : C.white, display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s", flexShrink: 0,
              }}>
                {rememberEmpNo && <span style={{ color: C.white, fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ fontSize: 12, color: C.gray, fontWeight: 500 }}>아이디 저장</span>
            </label>
          </div>

          <button onClick={handleLogin} disabled={loading}
            style={{ ...btnPrimary, width: "100%", padding: "14px", fontSize: 15, opacity: loading ? 0.6 : 1 }}>
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <p style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.gray }}>
            계정이 없으시면 슈퍼어드민에게 문의하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 7. 초대 수락 / 회원가입 페이지 ────────────────────
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
  const { profitMonth: currentMonth, revenueData, overheadData, monthlySummary = [], chartTransactions = [], monthlyParkingData = [], laborData = {}, siteDetailsMap = {}, dailyReportSummary = {}, valetFeeData = {} } = profitState;
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
  const monthLabor = laborData[currentMonth] || {};

  // ★ 월주차 사업장별 매출 집계 (자동)
  const parkingBySite = useMemo(() => {
    const map = {};
    (monthlyParkingData || []).forEach(p => {
      if (!map[p.site_code]) map[p.site_code] = 0;
      map[p.site_code] += toNum(p.monthly_fee);
    });
    return map;
  }, [monthlyParkingData]);

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
      const valetRev = toNum(monthRevenue[site.code]);
      const parkingRev = parkingBySite[site.code] || 0;
      const rev = valetRev + parkingRev;
      const laborFixed = toNum(monthLabor[site.code]?.fixed);
      const laborSub = toNum(monthLabor[site.code]?.sub);
      const labor = laborFixed + laborSub;
      const overhead = allocated[site.code] || 0;
      const profit = rev - labor - overhead;
      const margin = rev > 0 ? (profit / rev) * 100 : 0;
      const count = laborBySite[site.code]?.count || 0;
      const laborRatio = rev > 0 ? (labor / rev) * 100 : 0;
      // ★ Phase B: 전월대비
      const prevRev = toNum(prevRevenue[site.code]);
      const momChange = prevRev > 0 ? ((valetRev - prevRev) / prevRev) * 100 : null;
      return { ...site, valetRev, parkingRev, rev, labor, overhead, profit, margin, count, laborRatio, momChange };
    }).filter(s => s.rev > 0 || s.count > 0);
  }, [monthRevenue, prevRevenue, monthLabor, parkingBySite, laborBySite, allocated]);

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
    const latestSummary = targetSummaries.sort((a, b) => (b.month || "").localeCompare(a.month || ""))[0];
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

    const arr = Object.values(grouped).sort((a, b) => (a.key || "").localeCompare(b.key || ""));
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

      {/* ── D-0. 현장일보 현황 ── */}
      {(() => {
        const { todayReports = [], monthReports = [], staffMap: drStaffMap = {} } = dailyReportSummary;
        const todayStr = today();
        const monthStr = todayStr.slice(0, 7);
        const activeSiteCodes = FIELD_SITES.filter(s => {
          const empCount = employees.filter(e => e.site_code_1 === s.code && e.status === "재직").length;
          return empCount > 0;
        }).map(s => s.code);
        const reportedSites = new Set(todayReports.map(r => r.site_code));
        const missingToday = activeSiteCodes.filter(c => !reportedSites.has(c));
        const confirmedCount = monthReports.filter(r => r.status === "confirmed").length;
        const totalCount = monthReports.length;
        const confirmedRate = totalCount > 0 ? Math.round(confirmedCount / totalCount * 100) : 0;
        const monthValet = monthReports.filter(r => r.status === "confirmed").reduce((s, r) => s + toNum(r.valet_amount), 0);
        const monthTotalValet = monthReports.reduce((s, r) => s + toNum(r.valet_amount), 0);

        if (totalCount === 0 && todayReports.length === 0) return null;
        return (
          <div style={{ ...cardStyle, marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: 0 }}>📋 현장일보 현황</h3>
              <button onClick={() => onNavigate("daily_report")} style={{ fontSize: 11, fontWeight: 700, color: C.navy, background: "none", border: `1px solid ${C.navy}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: FONT }}>상세 →</button>
            </div>
            {/* 오늘 KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 12 }}>
              <div style={{ background: "#F0F4FF", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.navy }}>{todayReports.length}<span style={{ fontSize: 11, fontWeight: 600 }}>건</span></div>
                <div style={{ fontSize: 10, color: C.gray }}>금일 작성</div>
              </div>
              <div style={{ background: missingToday.length > 0 ? "#FFF3E0" : "#E8F5E9", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: missingToday.length > 0 ? C.orange : C.success }}>{missingToday.length}<span style={{ fontSize: 11, fontWeight: 600 }}>곳</span></div>
                <div style={{ fontSize: 10, color: C.gray }}>금일 미작성</div>
              </div>
              <div style={{ background: "#E8F5E9", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.success }}>{confirmedRate}<span style={{ fontSize: 11, fontWeight: 600 }}>%</span></div>
                <div style={{ fontSize: 10, color: C.gray }}>월 확정률 ({confirmedCount}/{totalCount})</div>
              </div>
              <div style={{ background: "#FFF8E1", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#F57F17" }}>{pFmt(monthValet)}</div>
                <div style={{ fontSize: 10, color: C.gray }}>확정 발렛비</div>
              </div>
            </div>
            {/* 미작성 사업장 */}
            {missingToday.length > 0 && (
              <div style={{ background: "#FFF8E1", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
                <span style={{ fontWeight: 800, color: C.orange }}>⚠️ 금일 미작성:</span>{" "}
                <span style={{ color: C.gray }}>{missingToday.map(c => getSiteName(c)).join(", ")}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── D. 월주차 만기 알림 + 업장별 매출 카드 ── */}
      {monthlyParkingData.length > 0 && (() => {
        const expiringSoon = monthlyParkingData.filter(p => {
          if (!p.contract_end) return false;
          const dd = dDay(p.contract_end);
          return dd !== null && dd <= 7;
        });
        const parkingBySite = {};
        monthlyParkingData.forEach(p => {
          if (!parkingBySite[p.site_code]) parkingBySite[p.site_code] = { count: 0, revenue: 0 };
          parkingBySite[p.site_code].count++;
          parkingBySite[p.site_code].revenue += toNum(p.monthly_fee);
        });
        const totalParkingRevenue = Object.values(parkingBySite).reduce((s, v) => s + v.revenue, 0);

        return (
          <div style={{ marginTop: 18 }}>
            {/* D-7 만기 알림 */}
            {expiringSoon.length > 0 && (
              <div style={{ background: "#FFF3E0", border: `1.5px solid ${C.orange}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.orange, marginBottom: 8 }}>⚠️ 월주차 만기 임박 ({expiringSoon.length}건)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {expiringSoon.map(p => {
                    const dd = dDay(p.contract_end) || 0;
                    return (
                      <div key={p.id} style={{ background: "#fff", borderRadius: 8, padding: "8px 12px", border: `1px solid ${dd <= 0 ? C.error : C.orange}`, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: dd <= 0 ? C.error : C.orange }}>{dd <= 0 ? `D+${Math.abs(dd)}` : `D-${dd}`}</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.dark }}>{p.car_number} · {p.customer_name || "미입력"}</div>
                          <div style={{ fontSize: 10, color: C.gray }}>{getSiteName(p.site_code)} · 만기 {p.contract_end}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 업장별 매출 카드 (발렛비 + 월주차) */}
            <div style={{ ...cardStyle }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: C.dark, margin: 0 }}>업장별 매출 현황</h3>
                <span style={{ fontSize: 11, color: C.gray }}>월주차 {pFmt(totalParkingRevenue)} · 계약 {monthlyParkingData.length}대</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                {FIELD_SITES.filter(s => {
                  const rev = toNum((revenueData[currentMonth] || {})[s.code]);
                  const pk = parkingBySite[s.code];
                  const vf = toNum((valetFeeData[currentMonth] || {})[s.code]);
                  return rev > 0 || pk || vf > 0;
                }).map(site => {
                  const valetRev = toNum((revenueData[currentMonth] || {})[site.code]);
                  const pk = parkingBySite[site.code] || { count: 0, revenue: 0 };
                  const vf = toNum((valetFeeData[currentMonth] || {})[site.code]);
                  const totalRev = valetRev + pk.revenue + vf;
                  return (
                    <div key={site.code} style={{ background: "#fff", borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.navy }}>{site.code} {site.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: C.dark }}>{pFmt(totalRev)}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {valetRev > 0 && (
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#EFF3FF", color: C.navy, fontWeight: 700 }}>계약금 {pFmt(valetRev)}</span>
                        )}
                        {vf > 0 && (
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#E8F5E9", color: C.success, fontWeight: 700 }}>일보발렛 {pFmt(vf)}</span>
                        )}
                        {pk.revenue > 0 && (
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#FFF8E1", color: C.orange, fontWeight: 700 }}>월주차 {pFmt(pk.revenue)} ({pk.count}대)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
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
function EmployeeRoster({ employees, saveEmployee, deleteEmployee, onContract, onResign, onCertificate, onReload, onNavigate }) {
  const { can, callAdminApi, createAccount, removeAdmin, updateRole, user, changePassword, profile: myProfile, profiles, loadData: reloadAuth } = useAuth();
  const confirm = useConfirm();
  const [filter, setFilter] = useState({ site: "", cat: "", status: "재직", tax: "", search: "", account: "", role: "" });
  const [editEmp, setEditEmp] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── v9.0 Phase 2: 5탭 상세 패널 ──
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [detailTab, setDetailTab] = useState("basic");
  const [empContracts, setEmpContracts] = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountForm, setAccountForm] = useState({ email: "", password: "", role: "field_member" });
  const [accountMsg, setAccountMsg] = useState("");

  // ── v9.1: 계정 통합 — bulk/pw 상태 ──
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkDone, setBulkDone] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditRows, setBulkEditRows] = useState([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkEditResults, setBulkEditResults] = useState([]);
  const [bulkEditDone, setBulkEditDone] = useState(false);
  const [bulkEditMsg, setBulkEditMsg] = useState("");
  const [showPwChange, setShowPwChange] = useState(false);
  const [changePw, setChangePw] = useState("");
  const [changePw2, setChangePw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  // ── v9.1: 헬퍼 ──
  const empNoToEmail = (no) => `${no.trim().toLowerCase()}@mepark.internal`;
  const phoneToPass = (ph, empNo) => {
    const digits = (ph || "").replace(/\D/g, "").slice(-4);
    if (digits.length >= 4) return "mp" + digits;  // "mp" + 4자리 → 6자
    // 전화번호 미등록 시 → "mp" + 사번 뒤 4자리 (0 패딩)
    const suffix = ((empNo || "").replace(/\D/g, "") + "0000").slice(-4);
    return "mp" + suffix;
  };
  const isSuperAdmin = myProfile?.role === "super_admin";
  const isAdmin = myProfile?.role === "admin";

  const blankEmp = {
    emp_no: "", name: "", position: "일반", site_code_1: "", site_code_2: "", work_code: "C",
    hire_date: today(), status: "재직", base_salary: 0, weekend_daily: 0,
    meal_allow: 200000, leader_allow: 0, childcare_allow: 0, car_allow: 0,
    tax_type: "3.3%", employment_type: "정규직", phone: "", probation_months: 4,
  };

  // ── v9.0 Phase 2: 상세 패널 함수 ──
  const openDetail = async (emp) => {
    setSelectedEmp(emp);
    setDetailTab("basic");
    setAccountMsg("");
    // v9.1: 자동채움 — 사번→이메일, 전화번호→비밀번호
    setAccountForm({
      email: emp.account_email || empNoToEmail(emp.emp_no || ""),
      password: emp.auth_id ? "" : phoneToPass(emp.phone || "", emp.emp_no),
      role: emp.system_role || "crew",
    });
    // 계약이력 로드
    setContractsLoading(true);
    try {
      const { data } = await supabase.from("contracts").select("*").eq("emp_no", emp.emp_no).order("updated_at", { ascending: false });
      setEmpContracts(data || []);
    } catch (e) { setEmpContracts([]); }
    setContractsLoading(false);
  };

  // 계정 생성
  const handleCreateAccount = async () => {
    if (!accountForm.email || !accountForm.password) { setAccountMsg("❌ 이메일과 비밀번호를 입력하세요."); return; }
    if (accountForm.password.length < 6) { setAccountMsg("❌ 비밀번호 6자 이상 입력하세요."); return; }
    setAccountLoading(true); setAccountMsg("");
    const { error } = await createAccount(selectedEmp.name, accountForm.email, accountForm.password, accountForm.role, {
      emp_no: selectedEmp.emp_no, site_code: selectedEmp.site_code_1, employee_id: selectedEmp.id, work_code: selectedEmp.work_code,
    });
    if (error) { setAccountMsg("❌ " + error); }
    else {
      setAccountMsg("✅ 계정 생성 완료!");
      if (onReload) await onReload();
      // selectedEmp 갱신
      const { data: updated } = await supabase.from("employees").select("*").eq("id", selectedEmp.id).single();
      if (updated) setSelectedEmp(updated);
    }
    setAccountLoading(false);
  };

  // 비밀번호 초기화
  const handleResetPw = async () => {
    if (!selectedEmp.auth_id) return;
    const ok = await confirm("비밀번호를 초기화하시겠습니까?", "초기화 후 본인에게 임시 비밀번호를 전달해주세요.");
    if (!ok) return;
    setAccountLoading(true); setAccountMsg("");
    const tempPw = "mepark" + Math.random().toString(36).slice(2, 8);
    const { error } = await callAdminApi("reset_password", { userId: selectedEmp.auth_id, newPassword: tempPw });
    if (error) setAccountMsg("❌ " + error);
    else setAccountMsg(`✅ 임시 비밀번호: ${tempPw} (본인에게 전달하세요)`);
    setAccountLoading(false);
  };

  // 계정 정지/해제
  const handleToggleBan = async () => {
    if (!selectedEmp.auth_id) return;
    const isBanned = selectedEmp.account_status === "banned";
    const action = isBanned ? "unban_user" : "ban_user";
    const msg = isBanned ? "계정을 활성화하시겠습니까?" : "계정을 정지하시겠습니까?";
    const ok = await confirm(msg, isBanned ? "로그인이 다시 가능해집니다." : "해당 직원은 로그인할 수 없게 됩니다.");
    if (!ok) return;
    setAccountLoading(true); setAccountMsg("");
    const { error } = await callAdminApi(action, { userId: selectedEmp.auth_id });
    if (error) { setAccountMsg("❌ " + error); }
    else {
      const newStatus = isBanned ? "active" : "banned";
      await supabase.from("employees").update({ account_status: newStatus }).eq("id", selectedEmp.id);
      setAccountMsg(isBanned ? "✅ 계정 활성화 완료" : "✅ 계정 정지 완료");
      if (onReload) await onReload();
      const { data: updated } = await supabase.from("employees").select("*").eq("id", selectedEmp.id).single();
      if (updated) setSelectedEmp(updated);
    }
    setAccountLoading(false);
  };

  // 역할 변경
  const handleChangeRole = async (newRole) => {
    if (!selectedEmp.auth_id || selectedEmp.system_role === newRole) return;
    setAccountLoading(true); setAccountMsg("");
    await updateRole(selectedEmp.auth_id, newRole);
    await supabase.from("employees").update({ system_role: newRole }).eq("id", selectedEmp.id);
    setAccountMsg("✅ 역할 변경 완료: " + newRole);
    if (onReload) await onReload();
    const { data: updated } = await supabase.from("employees").select("*").eq("id", selectedEmp.id).single();
    if (updated) setSelectedEmp(updated);
    setAccountLoading(false);
  };

  // ── v9.1: 계정 삭제 ──
  const handleDeleteAccount = async () => {
    if (!selectedEmp.auth_id) return;
    const ok = await confirm(`${selectedEmp.name}님 계정을 삭제하시겠습니까?`, "삭제 후 복구 불가능합니다. 직원 데이터는 유지됩니다.", { okLabel: "삭제", okColor: C.error });
    if (!ok) return;
    setAccountLoading(true); setAccountMsg("");
    await removeAdmin(selectedEmp.auth_id);
    await supabase.from("employees").update({ auth_id: null, system_role: null, account_email: null, account_status: null }).eq("id", selectedEmp.id);
    setAccountMsg("✅ 계정 삭제 완료");
    if (onReload) await onReload();
    const { data: updated } = await supabase.from("employees").select("*").eq("id", selectedEmp.id).single();
    if (updated) setSelectedEmp(updated);
    setAccountLoading(false);
  };

  // ── v9.1: 엑셀 양식 다운로드 ──
  const downloadBulkTemplate = () => {
    const wb = XLSX.utils.book_new();
    const guide = [
      ["ME.PARK ERP 계정 일괄생성 양식"], [""],
      ["◆ 작성 규칙"],
      ["· 아이디(이메일) = 사번@mepark.internal  (자동 생성)"],
      ["· 비밀번호 = mp + 전화번호 뒷 4자리  (자동 생성, 6자 이상)"],
      ["· 역할: admin (어드민) 또는 crew (크루)"],
      ["· 소속사업장코드: crew인 경우만 필수 (V001~V016)"],
      ["· 근무형태코드: crew인 경우 선택 (미입력 시 C 기본)"],
      [""], ["◆ 사업장 코드 목록"],
      ...SITES.filter(s => s.code !== "V000").map(s => [s.code, s.name]),
      [""], ["◆ 근무형태 코드 목록"],
      ...WORK_CODES.map(w => [w.code, w.label, w.cat === "weekday" ? "평일" : w.cat === "weekend" ? "주말" : w.cat === "mixed" ? "복합" : "알바"]),
    ];
    const wsG = XLSX.utils.aoa_to_sheet(guide); wsG["!cols"] = [{ wch: 30 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsG, "작성안내");
    const header = ["이름", "사번", "전화번호", "역할(admin/crew)", "소속사업장코드(crew만)", "근무형태코드"];
    const sample = [["홍길동", "MP24101", "010-1234-5678", "crew", "V001", "C"], ["이효정", "MP24102", "010-9876-5432", "admin", "", ""], ["김철수", "MP24103", "010-1111-2222", "crew", "V003", "E"]];
    const wsD = XLSX.utils.aoa_to_sheet([header, ...sample]); wsD["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsD, "계정입력");
    XLSX.writeFile(wb, "ME.PARK_계정일괄생성양식.xlsx");
  };

  // ── v9.1: 일괄생성 파일 파싱 ──
  const handleBulkFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const ws = wb.Sheets["계정입력"] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed = rows.filter(r => r["이름"] && r["사번"]).map(r => ({
        name: String(r["이름"]).trim(), empNo: String(r["사번"]).trim(), phone: String(r["전화번호"]).trim(),
        role: String(r["역할(admin/crew)"]).trim().toLowerCase() || "crew",
        siteCode: String(r["소속사업장코드(crew만)"]).trim().toUpperCase() || "",
        workCode: String(r["근무형태코드"] || "").trim().toUpperCase() || "",
      }));
      setBulkRows(parsed); setBulkResults([]); setBulkDone(false);
      setBulkMsg(parsed.length ? `${parsed.length}건 감지됨` : "⚠️ 데이터 행이 없습니다.");
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  // ── v9.1: 일괄생성 실행 ──
  const handleBulkCreate = async () => {
    if (!bulkRows.length) return;
    setBulkCreating(true);
    const results = [];
    for (const row of bulkRows) {
      const email = empNoToEmail(row.empNo);
      const pw = phoneToPass(row.phone, row.empNo);
      if (pw.length < 6) { results.push({ ...row, ok: false, error: "비밀번호 생성 불가" }); continue; }
      const validRoles = ["admin", "crew"];
      const role = validRoles.includes(row.role) ? row.role : "crew";
      const opts = { emp_no: row.empNo, ...(role === "crew" && row.siteCode ? { site_code: row.siteCode } : {}), ...(role === "crew" && row.workCode ? { work_code: row.workCode } : {}) };
      const { error } = await createAccount(row.name, email, pw, role, opts);
      results.push({ ...row, ok: !error, error: error || "" });
    }
    setBulkResults(results); setBulkDone(true); setBulkCreating(false);
    if (onReload) await onReload();
  };
  const closeBulk = () => { setShowBulk(false); setBulkRows([]); setBulkResults([]); setBulkDone(false); setBulkMsg(""); };

  // ── v9.1: 계정현황 엑셀 다운로드 ──
  const downloadAccountExcel = () => {
    const wb = XLSX.utils.book_new();
    const withAccount = employees.filter(e => e.auth_id);
    const header = ["사번", "이름", "사업장", "근무형태", "시스템역할", "계정이메일", "계정상태"];
    const rows = withAccount.map(e => [
      e.emp_no || "", e.name || "", getSiteName(e.site_code_1), getWorkLabel(e.work_code),
      e.system_role || "", e.account_email || "", e.account_status || "",
    ]);
    const wsD = XLSX.utils.aoa_to_sheet([header, ...rows]);
    wsD["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsD, "계정현황");
    // 미등록 직원 시트
    const noAccount = employees.filter(e => !e.auth_id && e.status === "재직");
    if (noAccount.length) {
      const h2 = ["사번", "이름", "사업장", "전화번호", "역할(admin/crew)", "소속사업장코드(crew만)", "근무형태코드"];
      const r2 = noAccount.map(e => [e.emp_no, e.name, getSiteName(e.site_code_1), e.phone || "", "crew", e.site_code_1, e.work_code]);
      const ws2 = XLSX.utils.aoa_to_sheet([h2, ...r2]);
      ws2["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws2, "미등록직원(생성양식)");
    }
    XLSX.writeFile(wb, `ME.PARK_계정현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── v9.1: 일괄수정 파일 파싱 ──
  const handleBulkEditFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const ws = wb.Sheets["계정현황"] || wb.Sheets[wb.SheetNames.find(n => n !== "작성안내")] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed = rows.filter(r => r["사번"]).map(r => {
        const empNo = String(r["사번"]).trim().toUpperCase();
        const existing = employees.find(emp => emp.emp_no === empNo);
        const newRole = String(r["시스템역할"] || "").trim();
        const newStatus = String(r["계정상태"] || "").trim();
        const changed = existing?.auth_id && (
          (newRole && newRole !== (existing.system_role || "")) ||
          (newStatus && newStatus !== (existing.account_status || ""))
        );
        return { name: String(r["이름"] || "").trim(), empNo, empId: existing?.id, authId: existing?.auth_id, oldRole: existing?.system_role, newRole, oldStatus: existing?.account_status, newStatus, changed, found: !!existing };
      });
      const changedCount = parsed.filter(r => r.changed).length;
      setBulkEditRows(parsed); setBulkEditResults([]); setBulkEditDone(false);
      setBulkEditMsg(changedCount > 0 ? `${changedCount}건 변경 감지됨 (전체 ${parsed.length}건 중)` : parsed.length > 0 ? "⚠️ 변경사항이 없습니다." : "⚠️ 데이터 행이 없습니다.");
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  // ── v9.1: 일괄수정 실행 ──
  const handleBulkEdit = async () => {
    const toUpdate = bulkEditRows.filter(r => r.changed && r.authId);
    if (!toUpdate.length) return;
    setBulkEditing(true);
    const results = [];
    for (const row of toUpdate) {
      try {
        // 역할 변경
        if (row.newRole && row.newRole !== row.oldRole) {
          await updateRole(row.authId, row.newRole);
          await supabase.from("employees").update({ system_role: row.newRole }).eq("id", row.empId);
        }
        // 계정상태 변경 (ban/unban)
        if (row.newStatus && row.newStatus !== row.oldStatus) {
          if (row.newStatus === "banned" && row.oldStatus !== "banned") {
            const { error: banErr } = await callAdminApi("ban_user", { userId: row.authId });
            if (banErr) throw new Error(banErr);
            await supabase.from("employees").update({ account_status: "banned" }).eq("id", row.empId);
          } else if (row.newStatus === "active" && row.oldStatus === "banned") {
            const { error: unbanErr } = await callAdminApi("unban_user", { userId: row.authId });
            if (unbanErr) throw new Error(unbanErr);
            await supabase.from("employees").update({ account_status: "active" }).eq("id", row.empId);
          }
        }
        results.push({ ...row, ok: true, error: "" });
      } catch (e) {
        results.push({ ...row, ok: false, error: e.message || "처리 실패" });
      }
    }
    setBulkEditResults(results); setBulkEditDone(true); setBulkEditing(false);
    if (onReload) await onReload(); await reloadAuth();
  };
  const closeBulkEdit = () => { setShowBulkEdit(false); setBulkEditRows([]); setBulkEditResults([]); setBulkEditDone(false); setBulkEditMsg(""); };

  // ── v9.1: 내 비밀번호 변경 ──
  const handlePwChange = async () => {
    if (changePw.length < 6) { setPwMsg("비밀번호는 6자 이상이어야 합니다."); return; }
    if (changePw !== changePw2) { setPwMsg("비밀번호가 일치하지 않습니다."); return; }
    const { error } = await changePassword(changePw);
    if (error) { setPwMsg(error); return; }
    setPwMsg("✅ 비밀번호가 변경되었습니다."); setChangePw(""); setChangePw2("");
    setTimeout(() => { setPwMsg(""); setShowPwChange(false); }, 1500);
  };

  const filtered = employees.filter(e => {
    if (filter.site && e.site_code_1 !== filter.site) return false;
    if (filter.cat && getWorkCat(e.work_code) !== filter.cat) return false;
    if (filter.status && e.status !== filter.status) return false;
    if (filter.tax && e.tax_type !== filter.tax) return false;
    // v9.1: 계정/역할 필터
    if (filter.account === "has" && !e.auth_id) return false;
    if (filter.account === "none" && e.auth_id) return false;
    if (filter.account === "banned" && e.account_status !== "banned") return false;
    if (filter.role) {
      if (!e.auth_id) return false;
      if (e.system_role !== filter.role) return false;
    }
    if (filter.search) {
      const s = filter.search.toLowerCase();
      if (!e.name.toLowerCase().includes(s) && !e.emp_no.toLowerCase().includes(s) && !getSiteName(e.site_code_1).toLowerCase().includes(s)) return false;
    }
    return true;
  });
  const activeFilterCount = [filter.site, filter.cat, filter.status !== "재직" ? filter.status : "", filter.account, filter.role, filter.search].filter(Boolean).length;

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
    if (await confirm("정말 삭제하시겠습니까?", "직원 데이터가 삭제됩니다.", { okLabel: "삭제", okColor: C.error })) await deleteEmployee(id);
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

      {/* v9.1: 계정 관리 툴바 */}
      {can("manage_admins") && (
        <div style={{ ...cardStyle, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12, background: "#FAFBFF", borderLeft: `3px solid ${C.navy}` }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginRight: 4 }}>🔐 계정</span>
          <button onClick={downloadAccountExcel} style={{ ...btnOutline, fontSize: 11, padding: "5px 10px", color: C.navy, borderColor: C.navy }}>📥 계정현황</button>
          <button onClick={downloadBulkTemplate} style={{ ...btnOutline, fontSize: 11, padding: "5px 10px", color: C.success, borderColor: C.success }}>📋 생성양식</button>
          <button onClick={() => setShowBulk(true)} style={{ ...btnOutline, fontSize: 11, padding: "5px 10px", color: "#E97132", borderColor: "#E97132" }}>📊 일괄생성</button>
          <button onClick={() => setShowBulkEdit(true)} style={{ ...btnOutline, fontSize: 11, padding: "5px 10px", color: C.skyBlue, borderColor: C.skyBlue }}>📤 일괄수정</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowPwChange(true)} style={{ ...btnOutline, fontSize: 11, padding: "5px 10px" }}>🔑 내 비밀번호</button>
        </div>
      )}

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
        <select value={filter.account} onChange={e => { const v = e.target.value; setFilter(p => ({ ...p, account: v, ...(v === "none" ? { role: "" } : {}) })); }} style={{ ...inputStyle, width: 110 }}>
          <option value="">전체 계정</option>
          <option value="has">✅ 계정있음</option>
          <option value="none">⬜ 계정없음</option>
          <option value="banned">🚫 정지됨</option>
        </select>
        <select value={filter.role} onChange={e => setFilter(p => ({ ...p, role: e.target.value }))} disabled={filter.account === "none"} style={{ ...inputStyle, width: 110, ...(filter.account === "none" ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}>
          <option value="">전체 역할</option>
          <option value="super_admin">슈퍼관리자</option>
          <option value="admin">관리자</option>
          <option value="crew">크루</option>
          <option value="field_member">현장</option>
        </select>
        <button onClick={() => setFilter({ site: "", cat: "", status: "재직", tax: "", search: "", account: "", role: "" })} style={{ ...btnSmall, background: activeFilterCount > 0 ? C.navy : C.lightGray, color: activeFilterCount > 0 ? C.white : C.dark }}>{activeFilterCount > 0 ? `초기화 (${activeFilterCount})` : "초기화"}</button>
      </div>

      {/* 테이블 */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.white, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["사번", "이름", "직위", "사업장", "사업장2", "근무형태", "기본급", "일당", "연락처", "계정", "상태", "액션"].map(h => (
                <th key={h} style={{ padding: "10px 8px", color: C.white, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={e.id} onClick={() => openDetail(e)} style={{ background: selectedEmp?.id === e.id ? "#EFF6FF" : (i % 2 ? C.bg : C.white), borderBottom: `1px solid ${C.lightGray}`, cursor: "pointer", transition: "background 0.15s" }}>
                <td style={{ padding: "8px", fontWeight: 700, textAlign: "center" }}>{e.emp_no}</td>
                <td style={{ padding: "8px", fontWeight: 700 }}>
                  {e.name}
                  {e.account_status === "active" && <span title={`계정: ${e.account_email || e.system_role}`} style={{ marginLeft: 4, fontSize: 9, padding: "1px 4px", borderRadius: 4, background: "#EDE7F6", color: "#7B1FA2", fontWeight: 800 }}>🔗</span>}
                </td>
                <td style={{ padding: "8px", textAlign: "center", color: C.gray }}>{e.position}</td>
                <td style={{ padding: "8px", fontSize: 11 }}>{getSiteName(e.site_code_1)}</td>
                <td style={{ padding: "8px", fontSize: 11, color: e.site_code_2 ? C.dark : "#ccc" }}>{e.site_code_2 ? getSiteName(e.site_code_2) : "−"}</td>
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
                <td style={{ padding: "8px", textAlign: "center", fontFamily: FONT, fontSize: 11, color: e.phone ? "#333" : "#bbb", letterSpacing: "0.5px" }}>
                  {e.phone ? e.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3") : "—"}
                </td>
                <td style={{ padding: "8px", textAlign: "center" }}>
                  {e.auth_id ? (
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: e.account_status === "banned" ? "#FFEBEE" : e.system_role === "super_admin" ? "#EDE7F6" : e.system_role === "admin" ? "#E3F2FD" : "#E8F5E9",
                      color: e.account_status === "banned" ? C.error : e.system_role === "super_admin" ? "#7B1FA2" : e.system_role === "admin" ? C.navy : C.success,
                    }}>{e.account_status === "banned" ? "🚫정지" : e.system_role === "super_admin" ? "슈퍼" : e.system_role === "admin" ? "관리자" : e.system_role === "crew" ? "크루" : "현장"}</span>
                  ) : (
                    <span style={{ fontSize: 10, color: C.gray }}>—</span>
                  )}
                </td>
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
              <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: C.gray }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                <div>조건에 맞는 직원이 없습니다.</div>
                {activeFilterCount > 0 && <div style={{ marginTop: 8, fontSize: 11 }}>필터 {activeFilterCount}개 적용 중 — <span onClick={() => setFilter({ site: "", cat: "", status: "재직", tax: "", search: "", account: "", role: "" })} style={{ color: C.navy, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>초기화</span></div>}
              </td></tr>
            )}
          </tbody>
        </table>
        <div style={{ textAlign: "right", padding: "8px 0", fontSize: 12, color: C.gray }}>총 {filtered.length}명 {selectedEmp && <span style={{ marginLeft: 8, color: C.navy, fontWeight: 700, cursor: "pointer" }} onClick={() => setSelectedEmp(null)}>✕ 상세 닫기</span>}</div>
      </div>

      {/* ── v9.0 Phase 2: 5탭 상세 패널 (슬라이드 오버) ── */}
      {selectedEmp && (() => {
        const se = employees.find(x => x.id === selectedEmp.id) || selectedEmp;
        const DETAIL_TABS = [
          { key: "basic", icon: "👤", label: "기본정보" },
          { key: "salary", icon: "💰", label: "급여조건" },
          { key: "account", icon: "🔐", label: "계정관리" },
          { key: "contracts", icon: "📋", label: "계약이력" },
          { key: "docs", icon: "📄", label: "문서" },
        ];
        const labelSt = { fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" };
        const valSt = { fontSize: 13, fontWeight: 700, color: C.dark, padding: "6px 0" };
        const sectionBox = { background: C.white, borderRadius: 12, padding: "16px 18px", marginBottom: 12, border: `1.5px solid ${C.lightGray}` };
        const sectionTitle = (icon, title) => <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>{icon} {title}</div>;
        const infoRow = (label, val) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.bg}` }}><span style={{ fontSize: 11, color: C.gray }}>{label}</span><span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{val || "—"}</span></div>;

        return (
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 480, maxWidth: "95vw", background: "#F5F6FA", boxShadow: "-4px 0 30px rgba(0,0,0,0.15)", zIndex: 900, display: "flex", flexDirection: "column", fontFamily: FONT }}>
            {/* 헤더 */}
            <div style={{ background: C.navy, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <div style={{ color: C.white, fontSize: 16, fontWeight: 900 }}>{se.name} <span style={{ fontSize: 12, fontWeight: 500, color: C.gold }}>{se.emp_no}</span></div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 }}>{getSiteName(se.site_code_1)}{se.site_code_2 ? ` + ${getSiteName(se.site_code_2)}` : ""} · {getWorkLabel(se.work_code)} · <span style={{ color: se.status === "재직" ? "#81C784" : "#EF9A9A" }}>{se.status}</span></div>
              </div>
              <button onClick={() => setSelectedEmp(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 16, fontWeight: 700, width: 32, height: 32, borderRadius: 8, cursor: "pointer" }}>✕</button>
            </div>

            {/* 탭 바 */}
            <div style={{ display: "flex", background: C.white, borderBottom: `1.5px solid ${C.lightGray}`, flexShrink: 0, overflowX: "auto" }}>
              {DETAIL_TABS.map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} style={{
                  flex: 1, padding: "10px 4px", fontSize: 11, fontWeight: detailTab === t.key ? 800 : 600,
                  color: detailTab === t.key ? C.navy : C.gray, background: "none", border: "none",
                  borderBottom: detailTab === t.key ? `2.5px solid ${C.navy}` : "2.5px solid transparent",
                  cursor: "pointer", whiteSpace: "nowrap", fontFamily: FONT,
                }}>{t.icon} {t.label}</button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>

              {/* ① 기본정보 */}
              {detailTab === "basic" && (
                <div>
                  <div style={sectionBox}>
                    {sectionTitle("👤", "인적사항")}
                    {infoRow("사번", se.emp_no)}
                    {infoRow("이름", se.name)}
                    {infoRow("직위", se.position)}
                    {infoRow("연락처", se.phone)}
                    {infoRow("사업장", `${se.site_code_1} ${getSiteName(se.site_code_1)}`)}
                    {se.site_code_2 && infoRow("사업장2", `${se.site_code_2} ${getSiteName(se.site_code_2)}`)}
                    {infoRow("근무형태", `${se.work_code} — ${getWorkLabel(se.work_code)}`)}
                    {infoRow("입사일", se.hire_date || "—")}
                    {infoRow("근무조건", se.employment_type)}
                    {infoRow("수습기간", se.probation_months ? `${se.probation_months}개월` : "없음")}
                    {se.probation_end && infoRow("수습종료일", se.probation_end)}
                    {infoRow("상태", se.status)}
                    {se.resign_date && infoRow("퇴사일", se.resign_date)}
                  </div>
                  <div style={sectionBox}>
                    {sectionTitle("📋", "세금/보험")}
                    {infoRow("신고유형", se.tax_type)}
                    {se.reporter_name && infoRow("신고자명", se.reporter_name)}
                    {se.reporter_rrn && infoRow("신고자 주민번호", se.reporter_rrn)}
                    {infoRow("보험 취득일", se.insurance_enroll_date || "미등록")}
                    {infoRow("보험 상실일", se.insurance_loss_date || "—")}
                  </div>
                  {se.memo && <div style={sectionBox}>{sectionTitle("📝", "메모")}<div style={{ fontSize: 12, color: C.dark, whiteSpace: "pre-wrap" }}>{se.memo}</div></div>}
                  <div style={{ textAlign: "center", paddingTop: 8 }}>
                    <button onClick={() => { setEditEmp({ ...se }); setShowForm(true); }} style={{ ...btnPrimary, padding: "10px 32px", fontSize: 13 }}>✏️ 정보 수정</button>
                  </div>
                </div>
              )}

              {/* ② 급여조건 */}
              {detailTab === "salary" && (
                <div>
                  <div style={sectionBox}>
                    {sectionTitle("💵", "기본 급여")}
                    {infoRow("기본급(월급)", se.base_salary ? fmt(se.base_salary) + "원" : "—")}
                    {infoRow("주말일당", se.weekend_daily ? fmt(se.weekend_daily) + "원" : "—")}
                    {infoRow("식대", se.meal_allow ? fmt(se.meal_allow) + "원" : "—")}
                    {infoRow("팀장수당", se.leader_allow ? fmt(se.leader_allow) + "원" : "—")}
                    {infoRow("보육수당", se.childcare_allow ? fmt(se.childcare_allow) + "원" : "—")}
                    {infoRow("자가운전보조금", se.car_allow ? fmt(se.car_allow) + "원" : "—")}
                  </div>
                  <div style={sectionBox}>
                    {sectionTitle("💰", "급여대장 연동 조건")}
                    {infoRow("평일수당(월급)", se.weekday_pay ? fmt(se.weekday_pay) + "원" : "—")}
                    {infoRow("주말수당(일당)", se.weekend_pay ? fmt(se.weekend_pay) + "원" : "—")}
                    {infoRow("명절상여", se.holiday_bonus ? fmt(se.holiday_bonus) + "원" : "—")}
                    {infoRow("인센티브", se.incentive ? fmt(se.incentive) + "원" : "—")}
                    {infoRow("급여식대", se.meal ? fmt(se.meal) + "원" : "—")}
                    {infoRow("보육수당", se.childcare ? fmt(se.childcare) + "원" : "—")}
                    {infoRow("자가운전보조", se.car_allowance ? fmt(se.car_allowance) + "원" : "—")}
                    {infoRow("기타수당", se.extra1 ? fmt(se.extra1) + "원" : "—")}
                    {infoRow("팀장수당(급여)", se.team_allowance ? fmt(se.team_allowance) + "원" : "—")}
                  </div>
                  <div style={sectionBox}>
                    {sectionTitle("🏦", "계좌정보")}
                    {infoRow("예금주", se.account_holder || "미등록")}
                    {infoRow("은행명", se.bank_name || "미등록")}
                    {infoRow("계좌번호", se.account_number || "미등록")}
                    {infoRow("타인 입금", se.is_third_party_payment ? "✅ 예" : "아니오")}
                    {(!se.account_holder || !se.bank_name || !se.account_number) && (
                      <div style={{ marginTop: 8, padding: "8px 12px", background: "#FFF3E0", borderRadius: 8, fontSize: 11, color: C.orange, fontWeight: 700 }}>⚠️ 계좌정보가 미등록입니다. 급여이체 시 누락됩니다.</div>
                    )}
                  </div>
                  <div style={{ textAlign: "center", paddingTop: 8 }}>
                    <button onClick={() => { setEditEmp({ ...se }); setShowForm(true); }} style={{ ...btnPrimary, padding: "10px 32px", fontSize: 13 }}>✏️ 급여조건 수정</button>
                  </div>
                </div>
              )}

              {/* ③ 계정관리 */}
              {detailTab === "account" && (
                <div>
                  {se.auth_id ? (
                    <>
                      {/* 계정 있음 */}
                      <div style={sectionBox}>
                        {sectionTitle("🔗", "연결된 계정")}
                        {infoRow("이메일", se.account_email)}
                        {infoRow("시스템 역할", se.system_role)}
                        {infoRow("계정 상태", se.account_status === "active" ? "✅ 활성" : se.account_status === "banned" ? "🚫 정지" : se.account_status)}
                        {infoRow("Auth ID", se.auth_id?.slice(0, 8) + "...")}
                      </div>
                      {can("manage_admins") && (
                        <div style={sectionBox}>
                          {sectionTitle("⚙️", "계정 관리")}
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {/* 역할 변경 */}
                            <div>
                              <label style={labelSt}>역할 변경</label>
                              <div style={{ display: "flex", gap: 6 }}>
                                {["super_admin", "admin", "crew", "field_member"].map(r => (
                                  <button key={r} onClick={() => handleChangeRole(r)} disabled={accountLoading || se.system_role === r}
                                    style={{ flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: se.system_role === r ? "default" : "pointer", fontFamily: FONT,
                                      background: se.system_role === r ? C.navy : C.bg, color: se.system_role === r ? C.white : C.dark,
                                      border: se.system_role === r ? "none" : `1px solid ${C.lightGray}`, opacity: accountLoading ? 0.5 : 1,
                                    }}>{r === "super_admin" ? "슈퍼" : r === "admin" ? "관리자" : r === "crew" ? "크루" : "현장"}</button>
                                ))}
                              </div>
                            </div>
                            {/* 비번 초기화 / 정지·해제 */}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={handleResetPw} disabled={accountLoading} style={{ ...btnOutline, flex: 1, fontSize: 12, opacity: accountLoading ? 0.5 : 1 }}>🔑 비밀번호 초기화</button>
                              <button onClick={handleToggleBan} disabled={accountLoading} style={{
                                flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                                background: se.account_status === "banned" ? C.success : C.error, color: C.white, border: "none", opacity: accountLoading ? 0.5 : 1,
                              }}>{se.account_status === "banned" ? "🔓 활성화" : "🚫 정지"}</button>
                            </div>
                            {/* v9.1: 계정 삭제 */}
                            <button onClick={handleDeleteAccount} disabled={accountLoading} style={{
                              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                              background: "none", color: C.error, border: `1px solid ${C.error}`, marginTop: 4, opacity: accountLoading ? 0.5 : 1,
                            }}>🗑 계정 삭제 (직원 데이터 유지)</button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* 계정 없음 — 생성 폼 */}
                      <div style={sectionBox}>
                        {sectionTitle("➕", "ERP 계정 생성")}
                        <div style={{ padding: "10px 14px", background: "#FFF8E1", borderRadius: 8, fontSize: 11, color: "#F57F17", fontWeight: 600, marginBottom: 14 }}>이 직원은 아직 ERP 계정이 없습니다. 사번·전화번호 기반으로 자동 채움됩니다.</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div>
                            <label style={labelSt}>이메일 <span style={{ fontWeight: 400, color: C.gray }}>(사번 기반 자동생성)</span></label>
                            <input value={accountForm.email} onChange={e => setAccountForm(p => ({ ...p, email: e.target.value }))} placeholder="사번@mepark.internal" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelSt}>비밀번호 <span style={{ fontWeight: 400, color: C.gray }}>(mp + 전화뒷4자리)</span></label>
                            <input type="password" value={accountForm.password} onChange={e => setAccountForm(p => ({ ...p, password: e.target.value }))} placeholder="6자 이상 (mp+뒷4자리 자동)" style={inputStyle} />
                            {accountForm.password && accountForm.password.length < 6 && <div style={{ fontSize: 10, color: C.error, marginTop: 2 }}>⚠️ 6자 미만 — 전화번호가 등록되지 않았거나 짧습니다. 직접 입력하세요.</div>}
                          </div>
                          <div>
                            <label style={labelSt}>역할</label>
                            <select value={accountForm.role} onChange={e => setAccountForm(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
                              <option value="crew">크루 (본인 사업장 일보)</option>
                              <option value="admin">관리자 (전 사업장 일보)</option>
                              <option value="super_admin">슈퍼관리자 (전체 권한)</option>
                              <option value="field_member">현장 (현장앱만)</option>
                            </select>
                          </div>
                          {can("manage_admins") && (
                            <button onClick={handleCreateAccount} disabled={accountLoading} style={{ ...btnPrimary, fontSize: 13, opacity: accountLoading ? 0.5 : 1 }}>
                              {accountLoading ? "⏳ 생성 중..." : "🔐 계정 생성"}
                            </button>
                          )}
                          {!can("manage_admins") && <div style={{ fontSize: 11, color: C.gray, textAlign: "center" }}>슈퍼관리자만 계정을 생성할 수 있습니다.</div>}
                        </div>
                      </div>
                    </>
                  )}
                  {accountMsg && <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: accountMsg.startsWith("✅") ? "#E8F5E9" : "#FFEBEE", color: accountMsg.startsWith("✅") ? C.success : C.error }}>{accountMsg}</div>}
                </div>
              )}

              {/* ④ 계약이력 */}
              {detailTab === "contracts" && (
                <div>
                  <div style={sectionBox}>
                    {sectionTitle("📋", `계약이력 (${empContracts.length}건)`)}
                    {contractsLoading ? <div style={{ textAlign: "center", padding: 20, color: C.gray }}>⏳ 로딩 중...</div> : empContracts.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 30, color: C.gray }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
                        <div style={{ fontSize: 12 }}>계약이력이 없습니다.</div>
                        {can("edit") && <button onClick={() => onContract(se)} style={{ ...btnPrimary, marginTop: 12, fontSize: 12 }}>+ 계약서 작성</button>}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {empContracts.map(ct => {
                          const stColor = ct.status === "확정" ? C.success : ct.status === "작성중" ? C.orange : C.gray;
                          return (
                            <div key={ct.id} style={{ padding: "12px 14px", background: C.bg, borderRadius: 10, border: `1px solid ${C.lightGray}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: C.dark }}>{ct.contract_type === "weekday" ? "평일제" : ct.contract_type === "weekend" ? "주말제" : ct.contract_type === "mixed" ? "복합" : ct.contract_type === "parttime" ? "알바" : ct.contract_type}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: stColor + "20", color: stColor }}>{ct.status}</span>
                              </div>
                              <div style={{ fontSize: 11, color: C.gray }}>
                                {ct.start_date && <span>📅 {ct.start_date} ~ {ct.end_date || "무기한"}</span>}
                              </div>
                              <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                                {ct.base_salary ? `기본급 ${fmt(ct.base_salary)}원` : ""}{ct.weekend_daily ? ` / 일당 ${fmt(ct.weekend_daily)}원` : ""}
                              </div>
                              <div style={{ fontSize: 10, color: C.gray, marginTop: 4 }}>최종수정: {ct.updated_at ? new Date(ct.updated_at).toLocaleDateString("ko-KR") : "—"}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {can("edit") && <div style={{ textAlign: "center", paddingTop: 4 }}><button onClick={() => onContract(se)} style={{ ...btnPrimary, fontSize: 12, padding: "10px 28px" }}>📝 새 계약서 작성</button></div>}
                </div>
              )}

              {/* ⑤ 문서 */}
              {detailTab === "docs" && (
                <div>
                  <div style={sectionBox}>
                    {sectionTitle("📄", "문서 바로가기")}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <button onClick={() => { if (onCertificate) onCertificate(se); }} style={{ ...btnOutline, padding: "14px 16px", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                        📑 <span><span style={{ fontWeight: 800 }}>재직증명서</span><br /><span style={{ fontSize: 10, color: C.gray }}>{se?.name || ""}님 재직증명서 발급</span></span>
                      </button>
                      <button onClick={() => onResign(se)} style={{ ...btnOutline, padding: "14px 16px", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                        📋 <span><span style={{ fontWeight: 800 }}>사직서</span><br /><span style={{ fontSize: 10, color: C.gray }}>{se?.name || ""}님 사직서 작성</span></span>
                      </button>
                      <button onClick={() => onContract(se)} style={{ ...btnOutline, padding: "14px 16px", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                        📝 <span><span style={{ fontWeight: 800 }}>근로계약서</span><br /><span style={{ fontSize: 10, color: C.gray }}>근로계약서 작성/수정 화면으로 이동</span></span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* 직원 등록/수정 모달 — 와이드 레이아웃 */}
      {showForm && editEmp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: "#F5F6FA", borderRadius: 20, width: 960, maxWidth: "95vw", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ background: C.navy, padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: C.white, margin: 0 }}>{editEmp.id ? "✏️ 직원 수정" : "➕ 직원 등록"}</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setShowForm(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: FONT }}>✕ 닫기</button>
              </div>
            </div>

            {/* 스크롤 영역 */}
            <div style={{ overflowY: "auto", padding: "20px 28px 24px", flex: 1 }}>
              {/* ── 1. 기본 인적사항 ── */}
              <div style={{ background: C.white, borderRadius: 14, padding: "18px 20px", marginBottom: 14, border: `1.5px solid ${C.lightGray}` }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ background: C.navy, color: C.gold, fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 4 }}>01</span>
                  👤 기본 인적사항
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 16px" }}>
                  {/* 사번 */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>사번</label>
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
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>이름</label>
                    <input value={editEmp.name || ""} onChange={e => setEditEmp(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>연락처</label>
                    <input value={editEmp.phone || ""} onChange={e => setEditEmp(p => ({ ...p, phone: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>직위</label>
                    <select value={editEmp.position} onChange={e => setEditEmp(p => ({ ...p, position: e.target.value }))} style={inputStyle}>
                      {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>사업장</label>
                    <select value={editEmp.site_code_1} onChange={e => setEditEmp(p => ({ ...p, site_code_1: e.target.value }))} style={inputStyle}>
                      <option value="">선택</option>
                      {SITES.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>사업장2 <span style={{ fontSize: 10, color: "#aaa", fontWeight: 400 }}>(복합근무)</span></label>
                    <select value={editEmp.site_code_2 || ""} onChange={e => setEditEmp(p => ({ ...p, site_code_2: e.target.value || null }))} style={inputStyle}>
                      <option value="">없음</option>
                      {SITES.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
                    </select>
                    {["AE","CF","CG","CPF","FPG"].includes(editEmp.work_code) && !editEmp.site_code_2 && (
                      <div style={{ fontSize: 10, color: C.orange, marginTop: 4, fontWeight: 700 }}>⚠️ 복합근무자는 사업장2 지정을 권장합니다.</div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>근무형태</label>
                    <select value={editEmp.work_code} onChange={e => setEditEmp(p => ({ ...p, work_code: e.target.value }))} style={inputStyle}>
                      {WORK_CODES.map(w => <option key={w.code} value={w.code}>{w.code} — {w.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── 2. 근무조건 ── */}
              <div style={{ background: C.white, borderRadius: 14, padding: "18px 20px", marginBottom: 14, border: `1.5px solid ${C.lightGray}` }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ background: C.navy, color: C.gold, fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 4 }}>02</span>
                  📋 근무조건 및 급여기본
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px 16px" }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>입사일</label>
                    <input type="date" value={editEmp.hire_date || ""} onChange={e => setEditEmp(p => ({ ...p, hire_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>근무조건</label>
                    <select value={editEmp.employment_type} onChange={e => setEditEmp(p => ({ ...p, employment_type: e.target.value }))} style={inputStyle}>
                      {["정규직", "계약직", "알바"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>신고유형</label>
                    <select value={editEmp.tax_type} onChange={e => setEditEmp(p => ({ ...p, tax_type: e.target.value }))} style={inputStyle}>
                      {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>수습기간</label>
                    <select value={editEmp.probation_months || 0} onChange={e => setEditEmp(p => ({ ...p, probation_months: parseInt(e.target.value) }))} style={inputStyle}>
                      <option value={0}>없음</option>
                      <option value={3}>3개월</option>
                      <option value={4}>4개월</option>
                      <option value={6}>6개월</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>기본급(월급)</label>
                    <NumInput value={editEmp.base_salary} onChange={v => setEditEmp(p => ({ ...p, base_salary: v }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>주말일당</label>
                    <NumInput value={editEmp.weekend_daily} onChange={v => setEditEmp(p => ({ ...p, weekend_daily: v }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>식대</label>
                    <NumInput value={editEmp.meal_allow} onChange={v => setEditEmp(p => ({ ...p, meal_allow: v }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>팀장수당</label>
                    <NumInput value={editEmp.leader_allow} onChange={v => setEditEmp(p => ({ ...p, leader_allow: v }))} />
                  </div>
                </div>
              </div>

              {/* ── 3+4: 급여조건 & 계좌정보 (2컬럼 배치) ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                {/* 급여조건 */}
                <div style={{ background: C.white, borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${C.lightGray}` }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: C.navy, color: C.gold, fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 4 }}>03</span>
                    💰 급여조건 <span style={{ fontSize: 10, color: C.gray, fontWeight: 500 }}>(급여대장 연동)</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>평일수당(월급)</label>
                      <NumInput value={editEmp.weekday_pay} onChange={v => setEditEmp(p => ({ ...p, weekday_pay: v }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>주말수당(일당)</label>
                      <NumInput value={editEmp.weekend_pay} onChange={v => setEditEmp(p => ({ ...p, weekend_pay: v }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>명절상여</label>
                      <NumInput value={editEmp.holiday_bonus} onChange={v => setEditEmp(p => ({ ...p, holiday_bonus: v }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>보육수당</label>
                      <NumInput value={editEmp.childcare} onChange={v => setEditEmp(p => ({ ...p, childcare: v }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>자가운전보조</label>
                      <NumInput value={editEmp.car_allowance} onChange={v => setEditEmp(p => ({ ...p, car_allowance: v }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>인센티브</label>
                      <NumInput value={editEmp.incentive} onChange={v => setEditEmp(p => ({ ...p, incentive: v }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>급여식대</label>
                      <NumInput value={editEmp.meal} onChange={v => setEditEmp(p => ({ ...p, meal: v }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>기타수당</label>
                      <NumInput value={editEmp.extra1} onChange={v => setEditEmp(p => ({ ...p, extra1: v }))} />
                    </div>
                  </div>
                </div>

                {/* 계좌정보 + 세금/보험 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* 계좌정보 */}
                  <div style={{ background: C.white, borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${C.lightGray}`, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: C.navy, color: C.gold, fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 4 }}>04</span>
                      🏦 계좌정보 <span style={{ fontSize: 10, color: C.gray, fontWeight: 500 }}>(은행이체 연동)</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>예금주</label>
                        <input value={editEmp.account_holder || ""} onChange={e => setEditEmp(p => ({ ...p, account_holder: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>은행명</label>
                        <select value={editEmp.bank_name || ""} onChange={e => setEditEmp(p => ({ ...p, bank_name: e.target.value }))} style={inputStyle}>
                          <option value="">선택</option>
                          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>계좌번호</label>
                        <input value={editEmp.account_number || ""} onChange={e => setEditEmp(p => ({ ...p, account_number: e.target.value }))} placeholder="숫자만 입력" style={inputStyle} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.gray, cursor: "pointer" }}>
                          <input type="checkbox" checked={editEmp.is_third_party_payment || false}
                            onChange={e => setEditEmp(p => ({ ...p, is_third_party_payment: e.target.checked }))} />
                          타인 입금 (예금주 ≠ 본인)
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 세금/보험 */}
                  <div style={{ background: C.white, borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${C.lightGray}`, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: C.navy, color: C.gold, fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 4 }}>05</span>
                      📋 세금/보험 정보
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>보험 취득일</label>
                        <input type="date" value={editEmp.insurance_enroll_date || ""} onChange={e => setEditEmp(p => ({ ...p, insurance_enroll_date: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>보험 상실일</label>
                        <input type="date" value={editEmp.insurance_loss_date || ""} onChange={e => setEditEmp(p => ({ ...p, insurance_loss_date: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>신고자명 (타인신고용)</label>
                        <input value={editEmp.reporter_name || ""} onChange={e => setEditEmp(p => ({ ...p, reporter_name: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 3, display: "block" }}>신고자 주민번호</label>
                        <input value={editEmp.reporter_rrn || ""} onChange={e => setEditEmp(p => ({ ...p, reporter_rrn: e.target.value }))} placeholder="000000-0000000" style={inputStyle} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 버튼 (고정) */}
            <div style={{ padding: "14px 28px", borderTop: `1.5px solid ${C.lightGray}`, background: C.white, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
              <button onClick={() => setShowForm(false)} style={{ ...btnOutline, padding: "10px 28px", fontSize: 13 }}>취소</button>
              <button onClick={() => saveEmp(editEmp)} disabled={saving} style={{ ...btnPrimary, padding: "10px 28px", fontSize: 13, opacity: saving ? 0.6 : 1 }}>{saving ? "💾 저장 중..." : "💾 저장"}</button>
            </div>
          </div>
        </div>
      )}

      {/* v9.1: 일괄 계정생성 모달 */}
      {showBulk && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={bulkCreating ? null : closeBulk}>
          <div style={{ background: C.white, borderRadius: 16, width: 560, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: "#E97132", padding: "16px 24px", borderRadius: "16px 16px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📊</span>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0 }}>엑셀 일괄 계정 생성</h3>
            </div>
            <div style={{ padding: 24 }}>
              {!bulkDone ? (
                <>
                  <div style={{ background: "#FFF8EE", border: "1px solid #FFD8A0", borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 12, color: "#7A4500", lineHeight: 1.8 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>📌 작성 규칙</div>
                    <div>• <b>아이디</b> = 사번@mepark.internal (자동 생성)</div>
                    <div>• <b>비밀번호</b> = mp + 전화번호 뒷 4자리 (자동 생성)</div>
                    <div>• <b>역할</b>: admin 또는 crew</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                    <button onClick={downloadBulkTemplate} style={{ padding: "16px 10px", borderRadius: 12, border: `2px dashed ${C.success}`, background: "#E8F5E9", cursor: "pointer", textAlign: "center", color: C.success, fontWeight: 700, fontSize: 13 }}>
                      📥 샘플 양식 다운로드
                    </button>
                    <label style={{ padding: "16px 10px", borderRadius: 12, border: `2px dashed ${C.navy}`, background: "#EEF2FF", cursor: "pointer", textAlign: "center", color: C.navy, fontWeight: 700, fontSize: 13, display: "block" }}>
                      📂 엑셀 파일 업로드
                      <input type="file" accept=".xlsx,.xls" onChange={handleBulkFile} style={{ display: "none" }} />
                    </label>
                  </div>
                  {bulkMsg && <div style={{ fontSize: 12, color: bulkMsg.startsWith("⚠️") ? C.error : C.navy, fontWeight: 700, marginBottom: 12, textAlign: "center" }}>{bulkMsg}</div>}
                  {bulkRows.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: C.dark, marginBottom: 10 }}>📋 생성 예정 {bulkRows.length}건</div>
                      <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead><tr style={{ background: C.navy }}>{["이름", "사번", "역할", "사업장"].map(h => <th key={h} style={{ padding: "6px", color: C.white, fontWeight: 700 }}>{h}</th>)}</tr></thead>
                          <tbody>{bulkRows.map((r, i) => <tr key={i} style={{ background: i % 2 ? C.bg : C.white }}><td style={{ padding: "5px 6px" }}>{r.name}</td><td style={{ padding: "5px 6px", fontFamily: "monospace" }}>{r.empNo}</td><td style={{ padding: "5px 6px" }}>{r.role}</td><td style={{ padding: "5px 6px" }}>{r.siteCode || "—"}</td></tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={closeBulk} style={btnOutline}>취소</button>
                    <button onClick={handleBulkCreate} disabled={bulkCreating || !bulkRows.length} style={{ ...btnPrimary, opacity: bulkCreating || !bulkRows.length ? 0.5 : 1 }}>
                      {bulkCreating ? "⏳ 생성 중..." : `${bulkRows.length}건 일괄 생성`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>일괄 생성 완료</div>
                    <div style={{ fontSize: 12, color: C.gray }}>성공 {bulkResults.filter(r => r.ok).length}건 / 실패 {bulkResults.filter(r => !r.ok).length}건</div>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: C.navy }}>{["이름", "사번", "결과"].map(h => <th key={h} style={{ padding: "6px", color: C.white, fontWeight: 700 }}>{h}</th>)}</tr></thead>
                      <tbody>{bulkResults.map((r, i) => <tr key={i} style={{ background: r.ok ? "#E8F5E9" : "#FFEBEE" }}><td style={{ padding: "5px 6px" }}>{r.name}</td><td style={{ padding: "5px 6px" }}>{r.empNo}</td><td style={{ padding: "5px 6px", fontWeight: 700, color: r.ok ? C.success : C.error }}>{r.ok ? "✅ 성공" : `❌ ${r.error}`}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <button onClick={closeBulk} style={{ ...btnPrimary, width: "100%" }}>닫기</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* v9.1: 일괄 수정 모달 */}
      {showBulkEdit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={bulkEditing ? null : closeBulkEdit}>
          <div style={{ background: C.white, borderRadius: 16, width: 520, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: C.skyBlue, padding: "16px 24px", borderRadius: "16px 16px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📤</span>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0 }}>엑셀 일괄 수정</h3>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: "#E0F7FA", border: "1px solid #B2EBF2", borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 12, color: "#00838F", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>📌 수정 방법</div>
                <div>1. "📥 계정현황" 버튼으로 현재 상태 다운로드</div>
                <div>2. 엑셀에서 역할 등 수정</div>
                <div>3. 아래에 수정된 파일 업로드</div>
              </div>
              <label style={{ display: "block", padding: "16px", borderRadius: 12, border: `2px dashed ${C.skyBlue}`, background: "#F0F9FF", cursor: "pointer", textAlign: "center", color: C.skyBlue, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
                📂 수정된 엑셀 파일 업로드
                <input type="file" accept=".xlsx,.xls" onChange={handleBulkEditFile} style={{ display: "none" }} />
              </label>
              {bulkEditMsg && <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, textAlign: "center", color: bulkEditMsg.startsWith("⚠️") ? C.error : C.skyBlue }}>{bulkEditMsg}</div>}
              {bulkEditRows.filter(r => r.changed).length > 0 && !bulkEditDone && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>변경 예정 {bulkEditRows.filter(r => r.changed).length}건</div>
                  {bulkEditRows.filter(r => r.changed).map((r, i) => (
                    <div key={i} style={{ padding: "6px 10px", fontSize: 11, background: i % 2 ? C.bg : C.white, borderRadius: 6, marginBottom: 2 }}>
                      <b>{r.name}</b> ({r.empNo}) — 역할: {r.oldRole} → <span style={{ color: C.navy, fontWeight: 800 }}>{r.newRole}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={closeBulkEdit} style={btnOutline}>취소</button>
                {!bulkEditDone && <button onClick={handleBulkEdit} disabled={bulkEditing || !bulkEditRows.filter(r => r.changed).length} style={{ ...btnPrimary, opacity: bulkEditing || !bulkEditRows.filter(r => r.changed).length ? 0.5 : 1 }}>
                  {bulkEditing ? "⏳ 수정 중..." : "일괄 수정 실행"}
                </button>}
              </div>
              {bulkEditDone && <div style={{ marginTop: 12, textAlign: "center", fontSize: 13, fontWeight: 800, color: C.success }}>✅ 일괄 수정 완료</div>}
            </div>
          </div>
        </div>
      )}

      {/* v9.1: 내 비밀번호 변경 모달 */}
      {showPwChange && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowPwChange(false)}>
          <div style={{ background: C.white, borderRadius: 16, width: 380, padding: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ background: C.navy, padding: "16px 24px", borderRadius: "16px 16px 0 0" }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: C.white, margin: 0 }}>🔑 내 비밀번호 변경</h3>
            </div>
            <div style={{ padding: 24 }}>
              {pwMsg && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: pwMsg.startsWith("✅") ? "#E8F5E9" : "#FFEBEE", color: pwMsg.startsWith("✅") ? C.success : C.error }}>{pwMsg}</div>}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.gray, display: "block", marginBottom: 5 }}>새 비밀번호</label>
                <input type="password" value={changePw} onChange={e => setChangePw(e.target.value)} placeholder="6자 이상" style={{ ...inputStyle, padding: "11px 14px" }} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.gray, display: "block", marginBottom: 5 }}>비밀번호 확인</label>
                <input type="password" value={changePw2} onChange={e => setChangePw2(e.target.value)} placeholder="다시 입력" style={{ ...inputStyle, padding: "11px 14px" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowPwChange(false); setChangePw(""); setChangePw2(""); setPwMsg(""); }} style={{ ...btnOutline, flex: 1 }}>취소</button>
                <button onClick={handlePwChange} style={{ ...btnPrimary, flex: 1 }}>변경</button>
              </div>
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
  "신고여부": "tax_type", "신고자": "reporter_name", "신고자명": "reporter_name",
  "주민번호": "reporter_rrn", "신고자주민번호": "reporter_rrn",
  "예금주": "account_holder", "은행명": "bank_name", "계좌번호": "account_number",
  "평일수당(급여)": "weekday_pay", "주말수당(급여)": "weekend_pay",
  "명절상여": "holiday_bonus", "인센티브": "incentive", "기타수당": "extra1",
  "급여식대": "meal", "보육": "childcare", "자가운전": "car_allowance",
  "팀장": "team_allowance", "타인입금": "is_third_party_payment",
  "보험취득일": "insurance_enroll_date", "보험상실일": "insurance_loss_date",
  "퇴사여부": "_resign_flag",
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
        if (["hire_date", "resign_date", "probation_end", "insurance_enroll_date", "insurance_loss_date"].includes(empField)) {
          val = parseExcelDate(val);
        } else if (["base_salary", "weekend_daily", "leader_allow", "meal_allow", "childcare_allow", "car_allow",
          "weekday_pay", "weekend_pay", "holiday_bonus", "meal", "childcare", "car_allowance",
          "incentive", "extra1", "team_allowance"].includes(empField)) {
          val = parseInt(val) || 0;
        } else if (empField === "is_third_party_payment") {
          val = val === true || val === "Y" || val === "O" || val === "예" || val === "타인";
        }
        emp[empField] = val;
      });
      // 퇴사여부 처리
      if (emp._resign_flag) {
        const flag = String(emp._resign_flag).trim();
        if (flag === "퇴사" || flag === "Y") {
          emp.is_active = false;
        }
        delete emp._resign_flag;
      }
      // 근무코드 자동 판정
      if (!emp.work_code && emp.work_type_1) {
        emp.work_code = mapWorkCode(emp.work_type_1, emp.work_type_2);
      }
      if (!emp.work_code) emp.work_code = "C";
      // 상태 자동 판정
      emp.status = emp.resign_date ? "퇴사" : "재직";
      if (emp.is_active === false) emp.status = "퇴사";
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
        // status는 직접 설정 (DB: active/inactive)
        data.status = emp.resign_date ? "inactive" : "active";
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
  const confirm = useConfirm();
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
    if (!(await confirm("이 계약서 이력을 삭제하시겠습니까?", "삭제 후 복구할 수 없습니다.", { okLabel: "삭제", okColor: C.error }))) return;
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


// ── 14. 재직증명서 ────────────────────────────────────
function Certificate({ employees, initialEmp }) {
  const [selId, setSelId] = useState(initialEmp?.id || "");
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

function Resignation({ employees, initialEmp }) {
  const [selId, setSelId] = useState(initialEmp?.id || "");
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
  const confirm = useConfirm();
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
    if (!(await confirm("이 Import 배치의 모든 데이터를 삭제하시겠습니까?", "삭제 후 복구할 수 없습니다.", { okLabel: "삭제", okColor: C.error }))) return;
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
// FIELD_SITES: 모듈 상단에서 let으로 선언, _refreshGlobalSites로 동적 갱신
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
  const confirm = useConfirm();
  const { profitMonth: currentMonth, setProfitMonth: setCurrentMonth, revenueData, setRevenueData, overheadData, setOverheadData, saveRevenueToDB, saveOverheadToDB, laborData, setLaborData, siteDetailsMap, saveLaborToDB, saveDetailToDB, monthlyParkingData } = profitState;
  const [selectedSite, setSelectedSite] = useState(FIELD_SITES[0]?.code || "V001");
  const [sortBy, setSortBy] = useState("profit");
  const [editLabel, setEditLabel] = useState(null);
  const [costTab, setCostTab] = useState("revenue");
  const [savingStatus, setSavingStatus] = useState(null); // ★ Phase C: 저장 상태 표시
  const saveTimersRef = useRef({}); // ★ 필드별 독립 타이머 (서로 취소 방지)
  const detailTimerRef = useRef(null); // ★ 계약현황탭 저장용 타이머

  const debounceSave = (key, saveFn) => {
    if (saveTimersRef.current[key]) clearTimeout(saveTimersRef.current[key]);
    saveTimersRef.current[key] = setTimeout(() => {
      setSavingStatus("saving");
      saveFn().then(() => {
        setSavingStatus("saved");
        setTimeout(() => setSavingStatus(null), 1500);
      }).catch(() => setSavingStatus(null));
    }, 800);
  };

  const monthRevenue = revenueData[currentMonth] || {};
  const monthOverhead = overheadData[currentMonth] || DEFAULT_OVERHEAD.map(o => ({ ...o }));
  const monthLabor = laborData[currentMonth] || {};

  // ★ 월주차 사업장별 매출 집계 (자동)
  const parkingBySite = useMemo(() => {
    const map = {};
    (monthlyParkingData || []).forEach(p => {
      if (!map[p.site_code]) map[p.site_code] = 0;
      map[p.site_code] += toNum(p.monthly_fee);
    });
    return map;
  }, [monthlyParkingData]);

  // ★ Phase C: 매출 변경 → state + DB 저장
  const setRev = (code, val) => {
    setRevenueData(p => ({ ...p, [currentMonth]: { ...p[currentMonth], [code]: val } }));
    debounceSave(`rev_${code}`, () => saveRevenueToDB?.(currentMonth, code, val));
  };

  // ★ 인건비(고정/대체) 변경 → state + DB 저장
  const setLabor = (code, field, val) => {
    setLaborData(p => ({
      ...p,
      [currentMonth]: {
        ...p[currentMonth],
        [code]: { ...(p[currentMonth]?.[code] || { fixed: 0, sub: 0 }), [field]: val }
      }
    }));
    const dbField = field === "fixed" ? "labor_fixed" : "labor_sub";
    debounceSave(`lab_${code}_${field}`, () => saveLaborToDB?.(currentMonth, code, dbField, val));
  };

  // ★ Phase C: 간접비 변경 → state + DB 저장
  const setOH = (idx, field, val) => {
    setOverheadData(p => {
      const arr = [...(p[currentMonth] || DEFAULT_OVERHEAD.map(o => ({ ...o })))];
      arr[idx] = { ...arr[idx], [field]: val };
      const item = arr[idx];
      debounceSave(`oh_${item.key}`, () => saveOverheadToDB?.(currentMonth, item.key, item.label, item.amount, item.method));
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

  // 사업장별 PL (★ 발렛비+월주차 = 총매출, 인건비 = 수동입력 고정+대체)
  const sitePLs = useMemo(() => {
    return FIELD_SITES.map(site => {
      const valetRev = toNum(monthRevenue[site.code]);
      const parkingRev = parkingBySite[site.code] || 0;
      const rev = valetRev + parkingRev;
      const laborFixed = toNum(monthLabor[site.code]?.fixed);
      const laborSub = toNum(monthLabor[site.code]?.sub);
      const labor = laborFixed + laborSub;
      const overhead = allocated[site.code]?.total || 0;
      const totalCost = labor + overhead;
      const profit = rev - totalCost;
      const margin = rev > 0 ? (profit / rev) * 100 : 0;
      const count = laborBySite[site.code]?.count || 0;
      return { ...site, valetRev, parkingRev, rev, laborFixed, laborSub, labor, overhead, totalCost, profit, margin, count };
    });
  }, [monthRevenue, monthLabor, parkingBySite, laborBySite, allocated]);

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

  // ★ costTotals (비용입력 합계 — 기존 CostInputView에서 이동)
  const costTotals = useMemo(() => {
    const t = { contract: 0, valet: 0, parking: 0, count: 0, lFixed: 0, lSub: 0, rev: 0, profit: 0 };
    FIELD_SITES.forEach(site => {
      const detail = siteDetailsMap[site.code] || {};
      t.contract += toNum(detail.monthly_contract);
      t.valet += toNum(monthRevenue[site.code]);
      t.parking += parkingBySite[site.code] || 0;
      t.count += laborBySite[site.code]?.count || 0;
      t.lFixed += toNum(monthLabor[site.code]?.fixed);
      t.lSub += toNum(monthLabor[site.code]?.sub);
    });
    t.rev = t.valet + t.parking;
    t.labor = t.lFixed + t.lSub;
    t.profit = t.rev - t.labor;
    return t;
  }, [monthRevenue, monthLabor, parkingBySite, laborBySite, siteDetailsMap]);

  // ★ handleDetailChange (비용입력 계약현황탭 — 기존 CostInputView에서 이동)
  const handleDetailChange = (code, field, value) => {
    if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
    detailTimerRef.current = setTimeout(() => {
      setSavingStatus("saving");
      saveDetailToDB?.(code, field, value).then(() => {
        setSavingStatus("saved");
        setTimeout(() => setSavingStatus(null), 1500);
      });
    }, 800);
  };

  const copyPrevMonth = async () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    setSavingStatus("saving");
    if (revenueData[pm]) {
      setRevenueData(p => ({ ...p, [currentMonth]: { ...p[pm] } }));
      const revEntries = Object.entries(revenueData[pm]);
      for (const [code, val] of revEntries) {
        await saveRevenueToDB?.(currentMonth, code, val);
      }
    }
    // ★ 인건비 데이터도 복사
    if (laborData[pm]) {
      setLaborData(p => ({ ...p, [currentMonth]: JSON.parse(JSON.stringify(p[pm])) }));
      const labEntries = Object.entries(laborData[pm]);
      for (const [code, vals] of labEntries) {
        if (vals.fixed) await saveLaborToDB?.(currentMonth, code, "labor_fixed", vals.fixed);
        if (vals.sub) await saveLaborToDB?.(currentMonth, code, "labor_sub", vals.sub);
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
  const removeOverheadItem = async (idx) => {
    const arr = [...(overheadData[currentMonth] || [])];
    const removed = arr[idx];
    if (!(await confirm(`"${removed?.label || "항목"}" 간접비를 삭제하시겠습니까?`, "삭제 후 복구할 수 없습니다.", { okLabel: "삭제", okColor: C.error }))) return;
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

  // ── 비용 입력 (렌더 함수 — 인라인 컴포넌트 아님) ──
  const renderCostInput = () => {
    return (
      <div>
        {pSectionTitle("✏️ 비용 입력 — " + currentMonth)}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          <button onClick={copyPrevMonth} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.navy }}>📋 이전달 복사</button>
          {[["revenue", "💰 사업장 매출"], ["contract", "📄 계약현황"], ["overhead", "🏢 간접비"]].map(([k, v]) => (
            <button key={k} onClick={() => setCostTab(k)} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${costTab === k ? C.navy : C.border}`, background: costTab === k ? C.navy : "#fff", color: costTab === k ? "#fff" : C.gray }}>{v}</button>
          ))}
          {savingStatus && (
            <span style={{ fontSize: 11, fontWeight: 700, color: savingStatus === "saving" ? C.orange : C.success, marginLeft: "auto" }}>
              {savingStatus === "saving" ? "💾 저장 중..." : "✅ DB 저장 완료"}
            </span>
          )}
        </div>

        {/* ═══ 사업장 매출 탭 ═══ */}
        {costTab === "revenue" && (
          <div style={{ ...pcardStyle, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.navy }}>
                  <th style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "center" }}>코드</th>
                  <th style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "left" }}>사업장</th>
                  <th style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "center" }}>월계약금</th>
                  <th style={{ padding: "8px 4px", color: C.gold, fontWeight: 700, textAlign: "center" }}>발렛비</th>
                  <th style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "center" }}>월주차(자동)</th>
                  <th style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "center" }}>인원</th>
                  <th style={{ padding: "8px 4px", color: "#B3D4FC", fontWeight: 700, textAlign: "center", borderLeft: "2px solid rgba(255,255,255,0.3)" }}>인건비(고정)</th>
                  <th style={{ padding: "8px 4px", color: C.gold, fontWeight: 700, textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.15)" }}>인건비(대체)</th>
                  <th style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "center" }}>이익률</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_SITES.map((site, i) => {
                  const detail = siteDetailsMap[site.code] || {};
                  const valetRev = toNum(monthRevenue[site.code]);
                  const parkRev = parkingBySite[site.code] || 0;
                  const totalRev = valetRev + parkRev;
                  const lFixed = toNum(monthLabor[site.code]?.fixed);
                  const lSub = toNum(monthLabor[site.code]?.sub);
                  const totalLabor = lFixed + lSub;
                  const siteOH = allocated[site.code]?.total || 0;
                  const profit = totalRev - totalLabor - siteOH;
                  const margin = totalRev > 0 ? (profit / totalRev) * 100 : null;
                  const headcount = laborBySite[site.code]?.count || 0;
                  return (
                    <tr key={site.code} style={{ background: i % 2 === 0 ? "#fff" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 4px", textAlign: "center", fontWeight: 600, color: C.navy, fontSize: 10 }}>{site.code}</td>
                      <td style={{ padding: "6px 4px", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{site.name}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", color: C.gray, fontSize: 10 }}>{toNum(detail.monthly_contract) > 0 ? pFmt(detail.monthly_contract) : "—"}</td>
                      <td style={{ padding: "4px 4px", width: 115 }}>
                        <BlurSaveNum value={valetRev} onSave={v => setRev(site.code, v)}
                          style={{ ...inputStyle, textAlign: "right", padding: "5px 6px", fontSize: 11 }} />
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right", color: parkRev > 0 ? C.navy : C.gray, fontWeight: parkRev > 0 ? 700 : 400, fontSize: 10 }}>
                        {parkRev > 0 ? pFmt(parkRev) : "—"}
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "center", color: C.gray, fontSize: 11 }}>{headcount}명</td>
                      <td style={{ padding: "4px 2px", width: 110, borderLeft: `2px solid ${C.navy}`, background: i % 2 === 0 ? "#EFF6FF" : "#E8F0FE" }}>
                        <BlurSaveNum value={lFixed} onSave={v => setLabor(site.code, "fixed", v)}
                          style={{ ...inputStyle, textAlign: "right", padding: "5px 6px", fontSize: 11, background: "transparent", border: "1.5px solid #B3D4FC" }} />
                      </td>
                      <td style={{ padding: "4px 2px", width: 110, borderLeft: `1px solid ${C.border}`, background: i % 2 === 0 ? "#FFF8E1" : "#FFF3CD" }}>
                        <BlurSaveNum value={lSub} onSave={v => setLabor(site.code, "sub", v)}
                          style={{ ...inputStyle, textAlign: "right", padding: "5px 6px", fontSize: 11, background: "transparent", border: `1.5px solid ${C.gold}` }} />
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "center", fontWeight: 700, fontSize: 11, color: margin === null ? C.gray : margin >= 0 ? C.success : C.error }}>
                        {margin !== null ? margin.toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: C.navy }}>
                  <td colSpan={2} style={{ padding: "8px 4px", color: C.gold, fontWeight: 900, textAlign: "center" }}>합계</td>
                  <td style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "right", fontSize: 10 }}>{costTotals.contract > 0 ? pFmt(costTotals.contract) : ""}</td>
                  <td style={{ padding: "8px 4px", color: C.gold, fontWeight: 800, textAlign: "right", fontSize: 11 }}>{pFmtFull(costTotals.valet)}</td>
                  <td style={{ padding: "8px 4px", color: "#fff", fontWeight: 700, textAlign: "right", fontSize: 10 }}>{costTotals.parking > 0 ? pFmt(costTotals.parking) : ""}</td>
                  <td style={{ padding: "8px 4px", color: "#fff", textAlign: "center" }}>{costTotals.count}명</td>
                  <td style={{ padding: "8px 4px", color: "#B3D4FC", fontWeight: 800, textAlign: "right", fontSize: 11, borderLeft: "2px solid rgba(255,255,255,0.3)" }}>{pFmtFull(costTotals.lFixed)}</td>
                  <td style={{ padding: "8px 4px", color: C.gold, fontWeight: 800, textAlign: "right", fontSize: 11, borderLeft: "1px solid rgba(255,255,255,0.15)" }}>{pFmtFull(costTotals.lSub)}</td>
                  <td style={{ padding: "8px 4px", color: C.gold, fontWeight: 800, textAlign: "center" }}>{costTotals.rev > 0 ? ((costTotals.profit / costTotals.rev) * 100).toFixed(1) + "%" : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ═══ 계약현황 탭 ═══ */}
        {costTab === "contract" && (
          <div style={{ ...pcardStyle, overflowX: "auto" }}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 12 }}>💡 사업장별 월계약금·계약기간을 입력하면 사업장매출 탭에 자동 반영됩니다.</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: C.navy }}>
                {["코드", "사업장", "계약시작일", "계약만기일", "월계약금", "만기D-day", "메모"].map(h => (
                  <th key={h} style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: "center" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {FIELD_SITES.map((site, i) => {
                  const d = siteDetailsMap[site.code] || {};
                  const ddVal = d.contract_end_date ? dDay(d.contract_end_date) : null;
                  return (
                    <tr key={site.code} style={{ background: i % 2 === 0 ? "#fff" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px", textAlign: "center", fontWeight: 600, color: C.navy, fontSize: 10 }}>{site.code}</td>
                      <td style={{ padding: "6px", fontWeight: 600, fontSize: 11 }}>{site.name}</td>
                      <td style={{ padding: "4px 6px", width: 140 }}>
                        <MeParkDatePicker value={d.start_date || ""} onChange={v => handleDetailChange(site.code, "start_date", v)}
                          style={{ ...inputStyle, padding: "5px 6px", fontSize: 11 }} />
                      </td>
                      <td style={{ padding: "4px 6px", width: 140 }}>
                        <MeParkDatePicker value={d.contract_end_date || ""} onChange={v => handleDetailChange(site.code, "contract_end_date", v)}
                          style={{ ...inputStyle, padding: "5px 6px", fontSize: 11 }} />
                      </td>
                      <td style={{ padding: "4px 6px", width: 130 }}>
                        <BlurSaveNum value={toNum(d.monthly_contract)} onSave={v => handleDetailChange(site.code, "monthly_contract", v)}
                          style={{ ...inputStyle, textAlign: "right", padding: "5px 6px", fontSize: 11 }} />
                      </td>
                      <td style={{ padding: "6px", textAlign: "center", fontWeight: 700, fontSize: 11,
                        color: ddVal === null ? C.gray : ddVal <= 7 ? C.error : ddVal <= 30 ? C.orange : C.success }}>
                        {ddVal !== null ? (ddVal >= 0 ? `D-${ddVal}` : `D+${Math.abs(ddVal)}`) : "—"}
                      </td>
                      <td style={{ padding: "4px 6px", width: 120 }}>
                        <input value={d.memo || ""} onChange={e => handleDetailChange(site.code, "memo", e.target.value)}
                          style={{ ...inputStyle, padding: "5px 6px", fontSize: 10 }} placeholder="비고" />
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: C.navy }}>
                  <td colSpan={2} style={{ padding: "8px 6px", color: C.gold, fontWeight: 900, textAlign: "center" }}>합계</td>
                  <td colSpan={2} />
                  <td style={{ padding: "8px 6px", color: C.gold, fontWeight: 800, textAlign: "right" }}>{pFmtFull(costTotals.contract)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ═══ 간접비 탭 ═══ */}
        {costTab === "overhead" && (
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
                      <BlurSaveNum value={oh.amount} onSave={v => setOH(i, "amount", v)}
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
  if (subPage === "site_pl") return SitePLView();
  if (subPage === "cost_input") return renderCostInput();
  if (subPage === "comparison") return ComparisonView();
  if (subPage === "alloc_settings") return AllocSettingsView();
  return SummaryView();
}

// ── 16-2-0. 추가근무 설정 탭 컴포넌트 ──────────────────
function SiteExtraConfigTab({ siteCode }) {
  const [enabled, setEnabled] = useState(false);
  const [types, setTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null); // 편집 중인 유형 ID
  const [form, setForm] = useState({ type_name: "", pay_kind: "fixed", fixed_min: 30, fixed_amount: 0, hourly_rate: 0, meal_trigger: null, meal_amount: null });
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    const { data: cfg } = await supabase.from("site_extra_config").select("*").eq("site_code", siteCode).maybeSingle();
    setEnabled(cfg?.is_enabled ?? false);
    const { data: tp } = await supabase.from("site_extra_types").select("*").eq("site_code", siteCode).order("sort_order");
    setTypes(tp || []);
  };

  useEffect(() => { load(); }, [siteCode]);

  const toggleEnabled = async (val) => {
    setEnabled(val);
    await supabase.from("site_extra_config").upsert({ site_code: siteCode, is_enabled: val, updated_at: new Date().toISOString() }, { onConflict: "site_code" });
  };

  const resetForm = () => setForm({ type_name: "", pay_kind: "fixed", fixed_min: 30, fixed_amount: 0, hourly_rate: 0, meal_trigger: null, meal_amount: null });

  const handleAddType = async () => {
    if (!form.type_name.trim()) { alert("유형명을 입력하세요"); return; }
    setSaving(true);
    const payload = {
      site_code: siteCode,
      sort_order: types.length,
      type_name: form.type_name.trim(),
      pay_kind: form.pay_kind,
      fixed_min: form.pay_kind === "fixed" ? Number(form.fixed_min) : null,
      fixed_amount: form.pay_kind === "fixed" ? Number(form.fixed_amount) : null,
      hourly_rate: form.pay_kind === "hourly" ? Number(form.hourly_rate) : null,
      meal_trigger: form.meal_trigger ? Number(form.meal_trigger) : null,
      meal_amount: form.meal_trigger ? Number(form.meal_amount) : null,
      updated_at: new Date().toISOString(),
    };
    if (editId) {
      await supabase.from("site_extra_types").update(payload).eq("id", editId);
      setEditId(null);
    } else {
      await supabase.from("site_extra_types").insert(payload);
    }
    resetForm(); setShowAdd(false); await load(); setSaving(false);
  };

  const handleDelete = async (id) => {
    await supabase.from("site_extra_types").delete().eq("id", id);
    setTypes(p => p.filter(t => t.id !== id));
  };

  const handleEdit = (t) => {
    setEditId(t.id);
    setForm({
      type_name: t.type_name, pay_kind: t.pay_kind,
      fixed_min: t.fixed_min ?? 30, fixed_amount: t.fixed_amount ?? 0,
      hourly_rate: t.hourly_rate ?? 0,
      meal_trigger: t.meal_trigger ?? null, meal_amount: t.meal_amount ?? null,
    });
    setShowAdd(true);
  };

  const moveType = async (idx, dir) => {
    const newTypes = [...types];
    const target = idx + dir;
    if (target < 0 || target >= newTypes.length) return;
    [newTypes[idx], newTypes[target]] = [newTypes[target], newTypes[idx]];
    setTypes(newTypes);
    await Promise.all(newTypes.map((t, i) => supabase.from("site_extra_types").update({ sort_order: i }).eq("id", t.id)));
  };

  const PAY_KIND_LABEL = { fixed: "정액", hourly: "시급제" };
  const PAY_KIND_COLOR = { fixed: { bg: "#DBEAFE", text: "#1D4ED8" }, hourly: { bg: "#EDE9FE", text: "#6D28D9" } };

  return (
    <div style={{ padding: "16px 0 8px" }}>
      {/* ON/OFF 토글 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "14px 16px", background: enabled ? "#EEF1FF" : C.lightGray, borderRadius: 14, border: enabled ? `2px solid ${C.navy}` : `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: enabled ? C.navy : C.gray }}>추가근무 기능</div>
          <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{enabled ? "현장앱에 추가근무 입력 항목이 표시됩니다" : "OFF 상태 — 현장앱에 표시 안 됨"}</div>
        </div>
        <button onClick={() => toggleEnabled(!enabled)} style={{
          width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
          background: enabled ? C.navy : "#ccc", position: "relative", transition: "background 0.2s", flexShrink: 0,
        }}>
          <div style={{ width: 22, height: 22, background: "#fff", borderRadius: 11, position: "absolute", top: 3, left: enabled ? 27 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </button>
      </div>

      {enabled && (
        <>
          {/* 유형 목록 */}
          <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginBottom: 10 }}>📋 추가근무 유형 ({types.length}개)</div>
          {types.length === 0 && (
            <div style={{ fontSize: 13, color: C.gray, textAlign: "center", padding: "16px 0", background: C.lightGray, borderRadius: 10, marginBottom: 10 }}>유형을 추가하세요</div>
          )}
          {types.map((t, idx) => (
            <div key={t.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 24, height: 24, background: C.navy, color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.dark }}>{t.type_name}</div>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: 700, background: PAY_KIND_COLOR[t.pay_kind].bg, color: PAY_KIND_COLOR[t.pay_kind].text }}>{PAY_KIND_LABEL[t.pay_kind]}</span>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 6, marginLeft: 32, fontSize: 11, color: C.gray, flexWrap: "wrap" }}>
                {t.pay_kind === "fixed" && <span>⏱ {t.fixed_min}분 고정 &nbsp;💰 {fmt(t.fixed_amount)}원</span>}
                {t.pay_kind === "hourly" && <span>⏱ 30분 단위 &nbsp;💰 {fmt(t.hourly_rate)}원/h</span>}
                {t.meal_trigger && <span style={{ color: "#D97706", fontWeight: 700 }}>🍱 {t.meal_trigger}분 초과 시 +{fmt(t.meal_amount)}원</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={() => moveType(idx, -1)} disabled={idx === 0} style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#ccc" : C.gray, fontFamily: FONT }}>▲</button>
                <button onClick={() => moveType(idx, 1)} disabled={idx === types.length - 1} style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", cursor: idx === types.length - 1 ? "default" : "pointer", color: idx === types.length - 1 ? "#ccc" : C.gray, fontFamily: FONT }}>▼</button>
                <button onClick={() => handleEdit(t)} style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${C.navy}`, borderRadius: 6, background: "#fff", color: C.navy, cursor: "pointer", fontWeight: 700, fontFamily: FONT }}>수정</button>
                <button onClick={() => handleDelete(t.id)} style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${C.error}`, borderRadius: 6, background: "#fff", color: C.error, cursor: "pointer", fontWeight: 700, fontFamily: FONT }}>삭제</button>
              </div>
            </div>
          ))}

          {/* 유형 추가/수정 폼 */}
          {showAdd ? (
            <div style={{ background: "#F0F3FF", border: `1.5px solid ${C.navy}`, borderRadius: 12, padding: 16, marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginBottom: 12 }}>{editId ? "✏️ 유형 수정" : "➕ 유형 추가"}</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 4 }}>유형명</label>
                <input value={form.type_name} onChange={e => setForm(p => ({ ...p, type_name: e.target.value }))} placeholder="예: 키전달, 연장근무 (1시간)" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, outline: "none", fontFamily: FONT }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 4 }}>수당 방식</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["fixed", "정액 (시간/금액 고정)"], ["hourly", "시급제 (시간 직접 입력)"]].map(([v, lbl]) => (
                    <button key={v} onClick={() => setForm(p => ({ ...p, pay_kind: v }))} style={{
                      flex: 1, padding: "9px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                      background: form.pay_kind === v ? C.navy : "#fff", color: form.pay_kind === v ? "#fff" : C.gray,
                      border: `1.5px solid ${form.pay_kind === v ? C.navy : C.border}`,
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>
              {form.pay_kind === "fixed" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 4 }}>고정 시간 (분)</label>
                    <select value={form.fixed_min} onChange={e => setForm(p => ({ ...p, fixed_min: Number(e.target.value) }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: FONT, background: "#fff", outline: "none" }}>
                      {[30, 60, 90, 120, 150, 180].map(m => <option key={m} value={m}>{m}분</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 4 }}>지급 금액 (원)</label>
                    <NumInput value={form.fixed_amount} onChange={v => setForm(p => ({ ...p, fixed_amount: v }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: FONT, textAlign: "right" }} />
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 4 }}>시급 (원/h)</label>
                  <NumInput value={form.hourly_rate} onChange={v => setForm(p => ({ ...p, hourly_rate: v }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: FONT, textAlign: "right" }} />
                </div>
              )}
              {/* 식대 설정 (시급제만) */}
              {form.pay_kind === "hourly" && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 8 }}>🍱 식대 설정 (선택)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 4 }}>초과 기준 (분)</label>
                      <select value={form.meal_trigger ?? ""} onChange={e => setForm(p => ({ ...p, meal_trigger: e.target.value === "" ? null : Number(e.target.value) }))} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: FONT, background: "#fff", outline: "none" }}>
                        <option value="">없음</option>
                        {[30, 60, 90, 120].map(m => <option key={m} value={m}>{m}분 초과 시</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, display: "block", marginBottom: 4 }}>식대 금액 (원)</label>
                      <NumInput value={form.meal_amount ?? 0} onChange={v => setForm(p => ({ ...p, meal_amount: v }))} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: FONT, textAlign: "right" }} />
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleAddType} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: saving ? C.gray : C.navy, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>{saving ? "저장 중..." : editId ? "수정 완료" : "추가"}</button>
                <button onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }} style={{ padding: "11px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "#fff", color: C.gray, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>취소</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)} style={{ width: "100%", marginTop: 4, padding: "11px", borderRadius: 10, border: `2px dashed ${C.navy}`, background: "transparent", color: C.navy, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>+ 유형 추가</button>
          )}
        </>
      )}
    </div>
  );
}

// ── 16-2. 사업장 현황 관리 ─────────────────────────────
function SiteManagementPage({ employees, onSiteChange }) {
  const confirm = useConfirm();
  const [selectedSite, setSelectedSite] = useState(null);
  const [siteDetails, setSiteDetails] = useState({});
  const [siteParking, setSiteParking] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [addError, setAddError] = useState("");
  const [customSites, setCustomSites] = useState([]);
  const [siteTab, setSiteTab] = useState("basic"); // "basic" | "extra"

  useEffect(() => {
    (async () => {
      const { data: details } = await supabase.from("site_details").select("*");
      if (details) {
        const map = {};
        const extras = [];
        details.forEach(d => {
          map[d.site_code] = d;
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

  const allSites = useMemo(() => {
    const base = SITES.filter(s => s.code !== "V000");
    return [...base, ...customSites.filter(cs => !base.find(b => b.code === cs.code))];
  }, [customSites]);

  const nextSiteCode = useMemo(() => {
    const codes = allSites.map(s => s.code).filter(c => /^V\d+$/.test(c));
    const nums = codes.map(c => parseInt(c.slice(1)));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `V${String(max + 1).padStart(3, "0")}`;
  }, [allSites]);

  const activeSiteEmps = useMemo(() => {
    const map = {};
    allSites.forEach(s => { map[s.code] = 0; });
    employees.filter(e => e.status === "재직" && e.site_code_1).forEach(e => { map[e.site_code_1] = (map[e.site_code_1] || 0) + 1; });
    return map;
  }, [employees, allSites]);

  const isCustomSite = (code) => customSites.some(s => s.code === code);

  const handleAddSite = async () => {
    const code = nextSiteCode;
    const name = newSiteName.trim();
    if (!name) { setAddError("사업장명을 입력하세요"); return; }
    setAddError("");
    setSaving(true);
    try {
      const { data, error } = await supabase.from("site_details")
        .insert({ site_code: code, site_name: name, updated_at: new Date().toISOString() })
        .select();
      if (error) { setAddError("등록 실패: " + error.message); setSaving(false); return; }
      if (!data || data.length === 0) { setAddError("등록 실패: RLS 정책을 확인하세요."); setSaving(false); return; }
      setCustomSites(p => [...p, { code, name }]);
      setSiteDetails(p => ({ ...p, [code]: data[0] }));
      setNewSiteName(""); setShowAddForm(false);
      setSelectedSite({ code, name });
      onSiteChange?.(); // ★ 글로벌 SITES 갱신
    } catch (e) { setAddError("등록 중 오류: " + e.message); }
    setSaving(false);
  };

  const handleDeleteSite = async (code) => {
    const siteName = allSites.find(s => s.code === code)?.name || code;
    if (!(await confirm(`"${code} ${siteName}" 사업장을 삭제하시겠습니까?`, "⚠️ 계약정보, 외부주차장 데이터가 모두 삭제됩니다.", { okLabel: "삭제", okColor: C.error }))) return;
    setSaving(true);
    try {
      await supabase.from("site_parking").delete().eq("site_code", code);
      await supabase.from("site_details").delete().eq("site_code", code);
      setCustomSites(p => p.filter(s => s.code !== code));
      setSiteDetails(p => { const n = { ...p }; delete n[code]; return n; });
      setSiteParking(p => { const n = { ...p }; delete n[code]; return n; });
      if (selectedSite?.code === code) setSelectedSite(null);
      onSiteChange?.(); // ★ 글로벌 SITES 갱신
    } catch (e) { alert("삭제 중 오류: " + e.message); }
    setSaving(false);
  };

  const detailSaveTimers = useRef({});
  const updateDetail = (code, field, value) => {
    setSiteDetails(p => ({ ...p, [code]: { ...p[code], site_code: code, [field]: value } }));
    if (field === "site_name" && isCustomSite(code)) {
      setCustomSites(p => p.map(s => s.code === code ? { ...s, name: value } : s));
      setSelectedSite(p => p && p.code === code ? { ...p, name: value } : p);
    }
    const timerKey = `${code}_${field}`;
    if (detailSaveTimers.current[timerKey]) clearTimeout(detailSaveTimers.current[timerKey]);
    detailSaveTimers.current[timerKey] = setTimeout(async () => {
      setSaving(true);
      const siteName = field === "site_name" ? value : (allSites.find(s => s.code === code)?.name || code);
      const { error } = await supabase.from("site_details")
        .upsert({ site_code: code, site_name: siteName, [field]: value, updated_at: new Date().toISOString() }, { onConflict: "site_code" });
      if (error) console.error("site_details save error:", error);
      if (field === "site_name") onSiteChange?.(); // ★ 사업장명 변경 시 글로벌 갱신
      setSaving(false);
    }, 800);
  };

  const handleSaveAll = async (code) => {
    setSaving(true);
    const d = siteDetails[code] || {};
    const siteName = d.site_name || allSites.find(s => s.code === code)?.name || code;
    const payload = { site_code: code, site_name: siteName, updated_at: new Date().toISOString() };
    ["start_date","contract_end_date","monthly_contract","address","latitude","longitude","memo","contract_file_name","contract_file_url","valet_rate","weekday_staff","weekend_staff"].forEach(k => { if (d[k] !== undefined) payload[k] = d[k]; });
    await supabase.from("site_details").upsert(payload, { onConflict: "site_code" });
    setSaving(false);
    onSiteChange?.(); // ★ 글로벌 SITES 갱신
    alert("✅ 저장 완료");
  };

  const addParking = async (code) => {
    const newP = { site_code: code, parking_name: "", address: "", amount: 0, manager_name: "", phone: "" };
    const { data } = await supabase.from("site_parking").insert(newP).select().single();
    if (data) setSiteParking(p => ({ ...p, [code]: [...(p[code] || []), data] }));
  };
  const updateParking = async (id, field, value) => {
    setSiteParking(p => {
      const updated = {};
      Object.entries(p).forEach(([code, list]) => { updated[code] = list.map(pk => pk.id === id ? { ...pk, [field]: value } : pk); });
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
  const handleSelectSite = (site) => { setSelectedSite(site); setSiteTab("basic"); };

  const fld = { width: "100%", padding: "11px 14px", border: `2px solid ${C.border}`, borderRadius: 12, fontSize: 14, fontWeight: 600, color: C.dark, background: "#fff", outline: "none", fontFamily: FONT, transition: "border-color 0.2s" };
  const lbl = { fontSize: 12, fontWeight: 700, color: C.gray, display: "block", marginBottom: 6 };

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 120px)" }}>
      {/* ─── 좌: 카드 그리드 ─── */}
      <div style={{ flex: 1, padding: "0 16px 24px 0", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: C.dark, margin: 0 }}>🏢 사업장 관리</h2>
            <p style={{ fontSize: 13, color: C.gray, margin: "4px 0 0" }}>전체 {allSites.length}개 사업장 · 클릭하여 상세 관리</p>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} style={{
            background: C.navy, color: "#fff", border: "none", borderRadius: 12,
            padding: "11px 22px", fontSize: 14, fontWeight: 800, cursor: "pointer",
            boxShadow: `0 4px 16px ${C.navy}30`, fontFamily: FONT,
          }}>+ 사업장 추가</button>
        </div>

        {/* 사업장 추가 폼 */}
        {showAddForm && (
          <div style={{ background: "#FFFDE7", borderRadius: 16, padding: 20, marginBottom: 16, border: `1.5px solid ${C.gold}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 12 }}>새 사업장 등록</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.navy, background: "#EFF3FF", padding: "8px 14px", borderRadius: 10, flexShrink: 0 }}>{nextSiteCode}</span>
              <input value={newSiteName} onChange={e => { setNewSiteName(e.target.value); setAddError(""); }} placeholder="사업장명 입력"
                style={{ ...fld, flex: 1 }} onKeyDown={e => e.key === "Enter" && handleAddSite()} autoFocus />
              <button onClick={handleAddSite} disabled={saving} style={{
                padding: "11px 24px", borderRadius: 12, border: "none",
                background: saving ? C.gray : C.navy, color: "#fff",
                fontSize: 14, fontWeight: 800, cursor: saving ? "default" : "pointer", flexShrink: 0, fontFamily: FONT,
              }}>{saving ? "등록 중..." : "등록"}</button>
              <button onClick={() => { setShowAddForm(false); setNewSiteName(""); setAddError(""); }} style={{
                padding: "11px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`,
                background: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", color: C.gray, fontFamily: FONT,
              }}>취소</button>
            </div>
            {addError && <div style={{ fontSize: 12, color: C.error, fontWeight: 700, padding: "6px 10px", background: "#FFF0F0", borderRadius: 8 }}>⚠️ {addError}</div>}
          </div>
        )}

        {/* 카드 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {allSites.map(site => {
            const d = siteDetails[site.code] || {};
            const isSel = sel?.code === site.code;
            const empCount = activeSiteEmps[site.code] || 0;
            const hasContract = toNum(d.monthly_contract) > 0;
            const weekdayStaff = toNum(d.weekday_staff);
            const weekendStaff = toNum(d.weekend_staff);
            return (
              <div key={site.code} onClick={() => handleSelectSite(site)}
                style={{
                  background: "#fff", borderRadius: 16, padding: "18px 20px",
                  border: isSel ? `2.5px solid ${C.navy}` : `1.5px solid ${C.border}`,
                  cursor: "pointer", transition: "all 0.15s",
                  boxShadow: isSel ? `0 4px 20px ${C.navy}18` : "0 1px 6px rgba(0,0,0,0.04)",
                }}>
                {/* 헤더 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: C.navy, padding: "3px 8px", borderRadius: 6, flexShrink: 0 }}>{site.code}</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{site.name}</span>
                    {isCustomSite(site.code) && <span style={{ fontSize: 9, background: C.gold, color: C.navy, padding: "2px 6px", borderRadius: 4, fontWeight: 800, flexShrink: 0 }}>추가</span>}
                  </div>
                </div>
                {/* KPI 3칸: 월계약금 + 평일 + 주말 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ background: hasContract ? "#F0F4FF" : C.lightGray, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: C.gray, marginBottom: 3 }}>월 계약금</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: hasContract ? C.navy : "#ccc" }}>
                      {hasContract ? pFmt(d.monthly_contract) : "-"}
                    </div>
                  </div>
                  <div style={{ background: weekdayStaff > 0 ? "#E8F5E9" : C.lightGray, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: C.gray, marginBottom: 3 }}>평일</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: weekdayStaff > 0 ? C.success : "#ccc" }}>
                      {weekdayStaff > 0 ? `${weekdayStaff}명` : "-"}
                    </div>
                  </div>
                  <div style={{ background: weekendStaff > 0 ? "#FFF3E0" : C.lightGray, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: C.gray, marginBottom: 3 }}>주말</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: weekendStaff > 0 ? C.orange : "#ccc" }}>
                      {weekendStaff > 0 ? `${weekendStaff}명` : "-"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 우: 슬라이드 상세 패널 ─── */}
      {sel ? (
        <div style={{
          width: 400, background: "#fff", borderLeft: `1px solid ${C.border}`,
          overflowY: "auto", flexShrink: 0, boxShadow: "-4px 0 24px rgba(0,0,0,0.06)",
          display: "flex", flexDirection: "column",
        }}>
          {/* 패널 헤더 */}
          <div style={{ background: C.navy, padding: "20px 24px", color: "#fff", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>{sel.code}</div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{sel.name}</div>
              </div>
              <button onClick={() => setSelectedSite(null)} style={{
                background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10,
                color: "#fff", padding: "8px 14px", fontSize: 15, cursor: "pointer", fontFamily: FONT,
              }}>✕</button>
            </div>
            {/* KPI strip */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {[
                { label: "월 계약", value: toNum(detail.monthly_contract) > 0 ? pFmt(detail.monthly_contract) : "-" },
                { label: "평일", value: toNum(detail.weekday_staff) > 0 ? `${detail.weekday_staff}명` : "-" },
                { label: "주말", value: toNum(detail.weekend_staff) > 0 ? `${detail.weekend_staff}명` : "-" },
              ].map(k => (
                <div key={k.label} style={{ flex: 1, background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{k.value}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 탭 네비게이션 */}
          <div style={{ display: "flex", borderBottom: `2px solid ${C.lightGray}`, background: "#fff", flexShrink: 0 }}>
            {[["basic", "📋 기본정보"], ["extra", "⏰ 추가근무 설정"]].map(([key, label]) => (
              <button key={key} onClick={() => setSiteTab(key)} style={{
                flex: 1, padding: "13px 8px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                border: "none", background: "none", fontFamily: FONT,
                color: siteTab === key ? C.navy : C.gray,
                borderBottom: siteTab === key ? `3px solid ${C.navy}` : "3px solid transparent",
                marginBottom: -2, transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {/* 폼 필드 */}
          <div style={{ padding: 24, flex: 1, overflowY: "auto" }}>
            {/* ── 기본정보 탭 ── */}
            {siteTab === "basic" && (<>
            {/* 사업장명 수정 (커스텀) */}
            {isCustomSite(sel.code) && (
              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>사업장명</label>
                <input value={detail.site_name || sel.name} onChange={e => updateDetail(sel.code, "site_name", e.target.value)} style={fld} />
              </div>
            )}
            {/* 근무인원 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <label style={lbl}>👤 평일 근무인원</label>
                <BlurSaveNum value={toNum(detail.weekday_staff)} onSave={v => updateDetail(sel.code, "weekday_staff", v)} style={{ ...fld, textAlign: "center", fontSize: 18, fontWeight: 900 }} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>👤 주말 근무인원</label>
                <BlurSaveNum value={toNum(detail.weekend_staff)} onSave={v => updateDetail(sel.code, "weekend_staff", v)} style={{ ...fld, textAlign: "center", fontSize: 18, fontWeight: 900 }} placeholder="0" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <label style={lbl}>서비스 시작일</label>
                <MeParkDatePicker value={detail.start_date || ""} onChange={v => updateDetail(sel.code, "start_date", v)} style={fld} />
              </div>
              <div>
                <label style={lbl}>계약 만기일</label>
                <MeParkDatePicker value={detail.contract_end_date || ""} onChange={v => updateDetail(sel.code, "contract_end_date", v)} style={fld} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <label style={lbl}>월 계약금액</label>
                <BlurSaveNum value={toNum(detail.monthly_contract)} onSave={v => updateDetail(sel.code, "monthly_contract", v)} style={{ ...fld, textAlign: "right" }} />
              </div>
              <div>
                <label style={lbl}>발렛 단가 (건당)</label>
                <BlurSaveNum value={toNum(detail.valet_rate)} onSave={v => updateDetail(sel.code, "valet_rate", v)} style={{ ...fld, textAlign: "right" }} placeholder="0" />
                {toNum(detail.valet_rate) > 0 && (
                  <div style={{ fontSize: 11, color: C.navy, marginTop: 4, fontWeight: 600 }}>
                    → 마감앱 자동계산 적용
                  </div>
                )}
              </div>
            </div>
            {/* 주소 */}
            <div style={{ marginBottom: 18 }}>
              <KakaoAddressMap
                address={detail.address || ""}
                latitude={detail.latitude ? Number(detail.latitude) : null}
                longitude={detail.longitude ? Number(detail.longitude) : null}
                onAddressChange={(addr, lat, lng) => {
                  updateDetail(sel.code, "address", addr);
                  if (lat) updateDetail(sel.code, "latitude", lat);
                  if (lng) updateDetail(sel.code, "longitude", lng);
                }}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>메모</label>
              <textarea value={detail.memo || ""} onChange={e => updateDetail(sel.code, "memo", e.target.value)}
                style={{ ...fld, height: 70, resize: "vertical", lineHeight: 1.5 }} placeholder="메모를 입력하세요" />
            </div>

            {/* 계약서 */}
            <div style={{ background: C.lightGray, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 10 }}>📎 계약서</div>
              {detail.contract_file_name ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.navy, flex: 1 }}>📄 {detail.contract_file_name}</span>
                  <button onClick={() => { if (detail.contract_file_url) window.open(detail.contract_file_url, "_blank"); }}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.navy, cursor: "pointer", fontFamily: FONT }}>보기</button>
                  <button onClick={() => { updateDetail(sel.code, "contract_file_name", null); updateDetail(sel.code, "contract_file_url", null); }}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.error}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.error, cursor: "pointer", fontFamily: FONT }}>삭제</button>
                </div>
              ) : (
                <div>
                  <input type="file" accept=".pdf,.doc,.docx,.hwp" id="site-contract-upload" style={{ display: "none" }} onChange={async (e) => {
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
                  }} />
                  <button onClick={() => document.getElementById("site-contract-upload").click()}
                    style={{ width: "100%", padding: "12px", borderRadius: 10, border: `2px dashed ${C.border}`, background: "#fff", fontSize: 13, fontWeight: 700, color: C.gray, cursor: "pointer", fontFamily: FONT }}>
                    📄 파일 업로드 (PDF, DOC, HWP)
                  </button>
                </div>
              )}
            </div>

            {/* 외부주차장 */}
            <div style={{ background: C.lightGray, borderRadius: 14, padding: 16, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.navy }}>🅿️ 외부주차장 ({parkings.length})</span>
                <button onClick={() => addParking(sel.code)} style={{
                  background: C.gold, border: "none", borderRadius: 8, padding: "6px 14px",
                  fontSize: 12, fontWeight: 800, color: C.navy, cursor: "pointer", fontFamily: FONT,
                }}>+ 추가</button>
              </div>
              {parkings.length === 0 ? (
                <div style={{ fontSize: 13, color: C.gray, textAlign: "center", padding: "14px 0" }}>등록된 외부주차장 없음</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {parkings.map(pk => (
                    <div key={pk.id} style={{ background: "#fff", borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>주차장명</label>
                          <input value={pk.parking_name || ""} onChange={e => updateParking(pk.id, "parking_name", e.target.value)} style={{ ...fld, fontSize: 13, padding: "8px 12px" }} placeholder="명칭" />
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>월 금액</label>
                          <NumInput value={toNum(pk.amount)} onChange={v => updateParking(pk.id, "amount", v)} style={{ ...fld, fontSize: 13, padding: "8px 12px", textAlign: "right" }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ ...lbl, fontSize: 11 }}>주소</label>
                        <input value={pk.address || ""} onChange={e => updateParking(pk.id, "address", e.target.value)} style={{ ...fld, fontSize: 13, padding: "8px 12px" }} placeholder="주소" />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>관리자</label>
                          <input value={pk.manager_name || ""} onChange={e => updateParking(pk.id, "manager_name", e.target.value)} style={{ ...fld, fontSize: 13, padding: "8px 12px" }} placeholder="이름" />
                        </div>
                        <div>
                          <label style={{ ...lbl, fontSize: 11 }}>연락처</label>
                          <input value={pk.phone || ""} onChange={e => updateParking(pk.id, "phone", e.target.value)} style={{ ...fld, fontSize: 13, padding: "8px 12px" }} placeholder="010-0000-0000" />
                        </div>
                        <button onClick={() => deleteParking(pk.id, sel.code)}
                          style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.error}`, background: "#fff", fontSize: 12, fontWeight: 700, color: C.error, cursor: "pointer", fontFamily: FONT }}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 저장 + 삭제 버튼 */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => handleSaveAll(sel.code)} disabled={saving}
                style={{
                  flex: 1, padding: "14px", borderRadius: 14, border: "none",
                  background: saving ? C.gray : C.navy, color: "#fff",
                  fontSize: 15, fontWeight: 900, cursor: saving ? "default" : "pointer",
                  boxShadow: `0 4px 16px ${C.navy}30`, fontFamily: FONT,
                }}>
                {saving ? "💾 저장 중..." : "💾 저장"}
              </button>
              {isCustomSite(sel.code) && (
                <button onClick={() => handleDeleteSite(sel.code)}
                  style={{
                    padding: "14px 20px", borderRadius: 14, border: `2px solid ${C.error}`,
                    background: "#fff", color: C.error, fontSize: 15, fontWeight: 900,
                    cursor: "pointer", fontFamily: FONT,
                  }}>🗑</button>
              )}
            </div>
            </>)}

            {/* ── 추가근무 설정 탭 ── */}
            {siteTab === "extra" && <SiteExtraConfigTab siteCode={sel.code} />}
          </div>
        </div>
      ) : (
        <div style={{
          width: 400, background: "#fff", borderLeft: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
          flexShrink: 0, padding: 40,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.gray }}>사업장을 선택하세요</div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 6 }}>카드를 클릭하면 상세 관리 패널이 열립니다</div>
        </div>
      )}
    </div>
  );
}


// ── 16-2-1. 월주차 관리 시스템 ──────────────────────────
function MonthlyParkingPage({ employees, onDataChange }) {
  const confirm = useConfirm();
  const [parkingList, setParkingList] = useState([]);
  const [selectedSite, setSelectedSite] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ site_code: "", car_number: "", customer_name: "", phone: "", contract_start: "", contract_end: "", monthly_fee: 0, memo: "" });
  const [loading, setLoading] = useState(true);

  const loadParking = async () => {
    try {
      const { data, error } = await supabase.from("monthly_parking").select("*").order("contract_end", { ascending: true });
      if (error) { console.error("월주차 로드 실패:", error.message); alert("월주차 데이터 로드 실패: " + error.message); }
      if (data) setParkingList(data);
    } catch (e) { console.error("월주차 로드 에러:", e); }
    setLoading(false);
  };
  useEffect(() => { loadParking(); }, []);

  const filtered = selectedSite === "ALL" ? parkingList : parkingList.filter(p => p.site_code === selectedSite);
  const activeList = filtered.filter(p => p.status === "계약중");
  const expiredList = filtered.filter(p => p.status === "만료");

  const openNew = () => {
    setEditItem(null);
    setForm({ site_code: FIELD_SITES[0]?.code || "V001", car_number: "", customer_name: "", phone: "", contract_start: today(), contract_end: "", monthly_fee: 0, memo: "" });
    setShowForm(true);
  };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ site_code: item.site_code, car_number: item.car_number, customer_name: item.customer_name || "", phone: item.phone || "", contract_start: item.contract_start || "", contract_end: item.contract_end || "", monthly_fee: item.monthly_fee || 0, memo: item.memo || "" });
    setShowForm(true);
  };
  const handleSave = async () => {
    if (!form.car_number.trim()) return alert("차량번호를 입력하세요");
    if (!form.site_code) return alert("사업장을 선택하세요");
    const payload = {
      site_code: form.site_code,
      car_number: form.car_number.trim(),
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      monthly_fee: toNum(form.monthly_fee),
      memo: form.memo.trim(),
    };
    try {
      if (editItem) {
        const { error } = await supabase.from("monthly_parking").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editItem.id);
        if (error) { alert("수정 실패: " + error.message); console.error("update error:", error); return; }
        setParkingList(p => p.map(item => item.id === editItem.id ? { ...item, ...payload } : item));
      } else {
        const { data, error } = await supabase.from("monthly_parking").insert({ ...payload, status: "계약중" }).select().single();
        if (error) { alert("저장 실패: " + error.message); console.error("insert error:", error); return; }
        if (data) setParkingList(p => [...p, data]);
        else { alert("저장되었으나 데이터를 불러오지 못했습니다. 새로고침해주세요."); return; }
      }
      setShowForm(false);
      onDataChange?.();
    } catch (e) {
      alert("오류 발생: " + (e.message || "알 수 없는 오류"));
      console.error("handleSave error:", e);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirm("삭제하시겠습니까?", "월주차 계약 정보가 삭제됩니다.", { okLabel: "삭제", okColor: C.error }))) return;
    const { error } = await supabase.from("monthly_parking").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setParkingList(p => p.filter(item => item.id !== id));
    onDataChange?.();
  };
  const toggleStatus = async (item) => {
    const newStatus = item.status === "계약중" ? "만료" : "계약중";
    const { error } = await supabase.from("monthly_parking").update({ status: newStatus }).eq("id", item.id);
    if (error) { alert("상태 변경 실패: " + error.message); return; }
    setParkingList(p => p.map(pk => pk.id === item.id ? { ...pk, status: newStatus } : pk));
    onDataChange?.();
  };

  const getDday = (endDate) => {
    if (!endDate) return null;
    const t = new Date(endDate + "T00:00:00");
    const n = new Date();
    const td = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((t - td) / 86400000);
  };

  const fieldSt = { ...inputStyle, fontSize: 12, padding: "7px 10px" };
  const labelSt = { fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 4, display: "block" };

  // 사이트별 월주차 매출 집계
  const siteSummary = useMemo(() => {
    const map = {};
    parkingList.filter(p => p.status === "계약중").forEach(p => {
      if (!map[p.site_code]) map[p.site_code] = { count: 0, revenue: 0 };
      map[p.site_code].count++;
      map[p.site_code].revenue += toNum(p.monthly_fee);
    });
    return map;
  }, [parkingList]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: 0 }}>🅿️ 월주차 관리</h2>
        <button onClick={openNew} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ 신규 등록</button>
      </div>

      {/* 사이트 필터 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setSelectedSite("ALL")} style={{ padding: "5px 14px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${selectedSite === "ALL" ? C.navy : C.border}`, background: selectedSite === "ALL" ? C.navy : "#fff", color: selectedSite === "ALL" ? "#fff" : C.gray }}>전체 ({parkingList.filter(p => p.status === "계약중").length})</button>
        {FIELD_SITES.filter(s => siteSummary[s.code]).map(site => (
          <button key={site.code} onClick={() => setSelectedSite(site.code)} style={{ padding: "5px 14px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${selectedSite === site.code ? C.navy : C.border}`, background: selectedSite === site.code ? C.navy : "#fff", color: selectedSite === site.code ? "#fff" : C.gray }}>
            {site.name} ({siteSummary[site.code]?.count || 0})
          </button>
        ))}
      </div>

      {/* 사이트별 매출 요약 카드 */}
      {Object.keys(siteSummary).length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {FIELD_SITES.filter(s => siteSummary[s.code]).map(site => {
            const s = siteSummary[site.code];
            return (
              <div key={site.code} style={{ background: "#fff", borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 14px", minWidth: 140 }}>
                <div style={{ fontSize: 10, color: C.navy, fontWeight: 700 }}>{site.code} {site.name}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.dark, marginTop: 4 }}>{pFmt(s.revenue)}</div>
                <div style={{ fontSize: 10, color: C.gray }}>{s.count}대 계약중</div>
              </div>
            );
          })}
          <div style={{ background: C.navy, borderRadius: 10, padding: "10px 14px", minWidth: 140 }}>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700 }}>월주차 합계</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 4 }}>{pFmt(Object.values(siteSummary).reduce((s, v) => s + v.revenue, 0))}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>총 {Object.values(siteSummary).reduce((s, v) => s + v.count, 0)}대</div>
          </div>
        </div>
      )}

      {/* 등록/수정 폼 */}
      {showForm && (
        <div style={{ background: "#fff", borderRadius: 12, border: `2px solid ${C.navy}`, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 12 }}>{editItem ? "✏️ 수정" : "➕ 신규 등록"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelSt}>사업장</label>
              <select value={form.site_code} onChange={e => setForm(p => ({ ...p, site_code: e.target.value }))} style={fieldSt}>
                {FIELD_SITES.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>차량번호</label>
              <input value={form.car_number} onChange={e => setForm(p => ({ ...p, car_number: e.target.value }))} style={fieldSt} placeholder="12가 3456" />
            </div>
            <div>
              <label style={labelSt}>고객명</label>
              <input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} style={fieldSt} placeholder="홍길동" />
            </div>
            <div>
              <label style={labelSt}>연락처</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} style={fieldSt} placeholder="010-0000-0000" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>계약 시작일</label>
              <MeParkDatePicker value={form.contract_start} onChange={v => setForm(p => ({ ...p, contract_start: v }))} style={fieldSt} />
            </div>
            <div>
              <label style={labelSt}>계약 종료일</label>
              <MeParkDatePicker value={form.contract_end} onChange={v => setForm(p => ({ ...p, contract_end: v }))} style={fieldSt} />
            </div>
            <div>
              <label style={labelSt}>월 주차비</label>
              <NumInput value={toNum(form.monthly_fee)} onChange={v => setForm(p => ({ ...p, monthly_fee: v }))} style={{ ...fieldSt, textAlign: "right" }} />
            </div>
            <div>
              <label style={labelSt}>메모</label>
              <input value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} style={fieldSt} placeholder="비고" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleSave} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>저장</button>
            <button onClick={() => setShowForm(false)} style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.gray }}>취소</button>
          </div>
        </div>
      )}

      {/* 계약중 목록 */}
      <div style={{ ...cardStyle, overflowX: "auto", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>계약중 ({activeList.length}건)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["사업장", "차량번호", "고객명", "연락처", "계약기간", "만기", "월주차비", ""].map(h => (
                <th key={h} style={{ padding: "8px 6px", color: "#fff", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeList.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.gray }}>등록된 월주차 계약이 없습니다</td></tr>}
            {activeList.map((item, i) => {
              const dd = getDday(item.contract_end);
              return (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "7px 6px", fontSize: 11 }}>
                    <span style={{ fontWeight: 700, color: C.navy, marginRight: 4, fontSize: 10 }}>{item.site_code}</span>
                    {getSiteName(item.site_code)}
                  </td>
                  <td style={{ padding: "7px 6px", fontWeight: 700, textAlign: "center" }}>{item.car_number}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center" }}>{item.customer_name}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center", fontSize: 10 }}>{item.phone}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center", fontSize: 10 }}>{item.contract_start} ~ {item.contract_end}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 700, fontSize: 10, color: dd !== null && dd <= 7 ? C.error : dd !== null && dd <= 30 ? C.orange : C.success }}>
                    {dd === null ? "—" : dd <= 0 ? `D+${Math.abs(dd)}` : `D-${dd}`}
                  </td>
                  <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(item.monthly_fee)}</td>
                  <td style={{ padding: "7px 6px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button onClick={() => openEdit(item)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.navy}`, background: "#fff", fontSize: 9, fontWeight: 700, color: C.navy, cursor: "pointer" }}>수정</button>
                      <button onClick={() => toggleStatus(item)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.orange}`, background: "#fff", fontSize: 9, fontWeight: 700, color: C.orange, cursor: "pointer" }}>만료</button>
                      <button onClick={() => handleDelete(item.id)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.error}`, background: "#fff", fontSize: 9, fontWeight: 700, color: C.error, cursor: "pointer" }}>삭제</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 만료 목록 */}
      {expiredList.length > 0 && (
        <div style={{ ...cardStyle, overflowX: "auto", opacity: 0.7 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.gray, marginBottom: 10 }}>만료 ({expiredList.length}건)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              {expiredList.map((item, i) => (
                <tr key={item.id} style={{ background: "#f9f9f9", borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px", fontSize: 10 }}>{item.site_code} {getSiteName(item.site_code)}</td>
                  <td style={{ padding: "6px", fontWeight: 700, textAlign: "center" }}>{item.car_number}</td>
                  <td style={{ padding: "6px", textAlign: "center" }}>{item.customer_name}</td>
                  <td style={{ padding: "6px", textAlign: "center", fontSize: 10 }}>{item.contract_start} ~ {item.contract_end}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{fmt(item.monthly_fee)}</td>
                  <td style={{ padding: "6px", textAlign: "center" }}>
                    <button onClick={() => toggleStatus(item)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.success}`, background: "#fff", fontSize: 9, fontWeight: 700, color: C.success, cursor: "pointer" }}>재계약</button>
                    <button onClick={() => handleDelete(item.id)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.error}`, background: "#fff", fontSize: 9, fontWeight: 700, color: C.error, cursor: "pointer", marginLeft: 4 }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 16-4. 현장 일보 관리 (v8.3) ─────────────────────────
const PAYMENT_TYPES = [
  { key: "cash", label: "현금" },
  { key: "card", label: "카드" },
  { key: "transfer", label: "계좌이체" },
  { key: "etc", label: "기타" },
];
const EXTRA_TYPES = [
  { key: "overtime", label: "연장근무" },
  { key: "night", label: "야간근무" },
  { key: "holiday", label: "휴일근무" },
  { key: "other", label: "기타수당" },
];

function DailyReportPage({ employees, onDataChange }) {
  const confirm = useConfirm();
  const { profile, isCrewRole } = useAuth();
  const todayStr = today();
  // 크루: 본인 사업장(profile.site_code)으로 고정
  const crewSiteCode = isCrewRole ? (profile?.site_code || "V001") : null;
  const [selMonth, setSelMonth] = useState(todayStr.slice(0, 7));
  const [selSite, setSelSite] = useState(crewSiteCode || "ALL");
  const [selDate, setSelDate] = useState(todayStr);
  const [reports, setReports] = useState([]);
  const [staffMap, setStaffMap] = useState({});
  const [payMap, setPayMap] = useState({});
  const [extraMap, setExtraMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table"
  const [panelSiteCode, setPanelSiteCode] = useState(null); // 우측 슬라이드 패널
  const [statusFilter, setStatusFilter] = useState("all"); // "all"|"confirmed"|"submitted"|"pending"

  // ── 사업장별 발렛비 단가 (site_details.valet_rate) ──
  const [valetRates, setValetRates] = useState({}); // { V001: 5000, V002: 6000, ... }
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("site_details").select("site_code, valet_rate");
      if (data) {
        const map = {};
        data.forEach(d => { if (d.valet_rate) map[d.site_code] = d.valet_rate; });
        setValetRates(map);
      }
    })();
  }, []);
  const saveValetRate = async (siteCode, rate) => {
    setValetRates(prev => ({ ...prev, [siteCode]: rate }));
    await supabase.from("site_details").upsert({ site_code: siteCode, valet_rate: rate }, { onConflict: "site_code" });
  };

  // ── 이미지 첨부 (Supabase Storage) ──
  const [lightboxImg, setLightboxImg] = useState(null);
  const [imgUploading, setImgUploading] = useState(false);
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setImgUploading(true);
    const newImages = [];
    const errors = [];
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `receipts/${form.site_code || "misc"}/${selDate}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("daily-report-images").upload(path, file);
      if (error) {
        console.error("이미지 업로드 실패:", error);
        errors.push(error.message || "업로드 실패");
      } else {
        const { data: urlData } = supabase.storage.from("daily-report-images").getPublicUrl(path);
        newImages.push({ url: urlData.publicUrl, name: file.name, path, uploaded_at: new Date().toISOString() });
      }
    }
    if (errors.length > 0) {
      alert(`이미지 업로드 실패:\n${errors.join("\n")}\n\n💡 Supabase Dashboard → Storage에서\n'daily-report-images' 버킷을 Public으로 생성해주세요.`);
    }
    if (newImages.length > 0) setForm(f => ({ ...f, images: [...(f.images || []), ...newImages] }));
    setImgUploading(false);
    e.target.value = "";
  };
  const removeImage = async (idx) => {
    const img = form.images[idx];
    if (img?.path) await supabase.storage.from("daily-report-images").remove([img.path]);
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };

  const emptyForm = { valet_count: 0, valet_amount: 0, memo: "", staffList: [], payList: PAYMENT_TYPES.map(p => ({ payment_type: p.key, count: 0, amount: 0, memo: "" })), extraList: [], images: [] };
  const [form, setForm] = useState(emptyForm);

  // ── 데이터 로딩 ──
  const loadReports = useCallback(async () => {
    setLoading(true);
    const startDate = `${selMonth}-01`;
    const endDate = selMonth < "9999-12" ? (() => { const [y, m] = selMonth.split("-").map(Number); const nm = m === 12 ? 1 : m + 1; const ny = m === 12 ? y + 1 : y; return `${ny}-${String(nm).padStart(2, "0")}-01`; })() : "9999-12-31";
    const { data: reps } = await supabase.from("daily_reports").select("*").gte("report_date", startDate).lt("report_date", endDate).order("report_date");
    const reportList = reps || [];
    setReports(reportList);
    if (reportList.length > 0) {
      const ids = reportList.map(r => r.id);
      const [staffRes, payRes, extraRes] = await Promise.all([
        supabase.from("daily_report_staff").select("*").in("report_id", ids),
        supabase.from("daily_report_payment").select("*").in("report_id", ids),
        supabase.from("daily_report_extra").select("*").in("report_id", ids),
      ]);
      const sMap = {}, pMap = {}, eMap = {};
      (staffRes.data || []).forEach(s => { if (!sMap[s.report_id]) sMap[s.report_id] = []; sMap[s.report_id].push(s); });
      (payRes.data || []).forEach(p => { if (!pMap[p.report_id]) pMap[p.report_id] = []; pMap[p.report_id].push(p); });
      (extraRes.data || []).forEach(e => { if (!eMap[e.report_id]) eMap[e.report_id] = []; eMap[e.report_id].push(e); });
      setStaffMap(sMap); setPayMap(pMap); setExtraMap(eMap);
    } else { setStaffMap({}); setPayMap({}); setExtraMap({}); }
    setLoading(false);
  }, [selMonth]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // ── 현재 선택된 날짜+사업장 일보 ──
  const currentReport = useMemo(() => {
    if (selSite === "ALL") return reports.filter(r => r.report_date === selDate);
    return reports.filter(r => r.report_date === selDate && r.site_code === selSite);
  }, [reports, selDate, selSite]);

  // ── 날짜별 사업장 상태 맵 (그리드뷰용) ──
  const siteStatusMap = useMemo(() => {
    const map = {};
    FIELD_SITES.forEach(s => { map[s.code] = { status: "pending", report: null }; });
    reports.filter(r => r.report_date === selDate).forEach(r => {
      if (map[r.site_code]) map[r.site_code] = { status: r.status, report: r };
    });
    return map;
  }, [reports, selDate]);

  // ── KPI (그리드뷰용) ──
  const kpiStats = useMemo(() => {
    const dateReports = reports.filter(r => r.report_date === selDate);
    const confirmed = dateReports.filter(r => r.status === "confirmed").length;
    const submitted = dateReports.filter(r => r.status === "submitted").length;
    const pending = Math.max(0, FIELD_SITES.length - dateReports.length);
    const totalValet = dateReports.reduce((s, r) => s + toNum(r.valet_amount), 0);
    const confirmedValet = dateReports.filter(r => r.status === "confirmed").reduce((s, r) => s + toNum(r.valet_amount), 0);
    return { confirmed, submitted, pending, totalValet, confirmedValet };
  }, [reports, selDate]);

  // ── 달력 데이터 ──
  const calendarData = useMemo(() => {
    const [y, m] = selMonth.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const weeks = [];
    let week = new Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selMonth}-${String(d).padStart(2, "0")}`;
      const dayReports = reports.filter(r => r.report_date === dateStr && (selSite === "ALL" || r.site_code === selSite));
      const totalAmt = dayReports.reduce((s, r) => s + toNum(r.valet_amount), 0);
      const hasConfirmed = dayReports.some(r => r.status === "confirmed");
      const hasSubmitted = dayReports.some(r => r.status === "submitted");
      week.push({ day: d, dateStr, count: dayReports.length, totalAmt, hasConfirmed, hasSubmitted });
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
    return { weeks, daysInMonth };
  }, [selMonth, reports, selSite]);

  // ── 월 네비게이션 ──
  const prevMonth = () => { const [y, m] = selMonth.split("-").map(Number); setSelMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`); };
  const nextMonth = () => { const [y, m] = selMonth.split("-").map(Number); setSelMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`); };

  // ── 새 일보 작성 시작 (중복 방지) ──
  const startNew = (siteCode) => {
    // 크루: 항상 본인 사업장으로 고정
    const site = isCrewRole ? crewSiteCode : (siteCode || (selSite !== "ALL" ? selSite : FIELD_SITES[0]?.code));
    // 중복 체크: 같은 날짜 + 같은 사업장에 이미 일보가 있는지
    const existing = reports.find(r => r.report_date === selDate && r.site_code === site);
    if (existing) {
      alert(`${selDate} ${getSiteName(site)} 일보가 이미 존재합니다.\n기존 일보를 수정해주세요.`);
      return;
    }
    const siteEmps = employees.filter(e => e.site_code_1 === site && e.status === "재직");
    setForm({
      site_code: site,
      valet_count: 0, valet_amount: 0, memo: "",
      staffList: siteEmps.map(e => ({ employee_id: e.id, name_raw: e.name, staff_type: "regular", work_hours: 8 })),
      payList: PAYMENT_TYPES.map(p => ({ payment_type: p.key, count: 0, amount: 0, memo: "" })),
      extraList: [], images: [],
    });
    setEditMode(true);
  };

  // ── 전일 복사 ──
  const copyFromPrevDay = () => {
    const site = form.site_code;
    if (!site) return;
    // selDate 기준 이전 날짜의 동일 사업장 일보 찾기
    const prevReports = reports
      .filter(r => r.site_code === site && r.report_date < selDate)
      .sort((a, b) => (b.report_date || "").localeCompare(a.report_date || ""));
    if (prevReports.length === 0) { alert("이전 일보가 없습니다."); return; }
    const prev = prevReports[0];
    const stf = staffMap[prev.id] || [];
    const pay = payMap[prev.id] || [];
    const ext = extraMap[prev.id] || [];
    setForm(f => ({
      ...f,
      valet_count: prev.valet_count || 0,
      valet_amount: prev.valet_amount || 0,
      staffList: stf.length > 0
        ? stf.map(s => ({ employee_id: s.employee_id, name_raw: s.name_raw || "", staff_type: s.staff_type || "regular", work_hours: s.work_hours || 0 }))
        : f.staffList,
      payList: PAYMENT_TYPES.map(pt => {
        const existing = pay.find(p => p.payment_type === pt.key);
        return existing ? { payment_type: pt.key, count: existing.count || 0, amount: existing.amount || 0, memo: "" } : { payment_type: pt.key, count: 0, amount: 0, memo: "" };
      }),
      extraList: ext.map(e => ({ employee_id: e.employee_id, extra_type: e.extra_type, extra_hours: e.extra_hours || 0, extra_amount: e.extra_amount || 0, memo: "" })),
    }));
  };

  // ── 기존 일보 편집 ──
  const startEdit = (report) => {
    const stf = staffMap[report.id] || [];
    const pay = payMap[report.id] || [];
    const ext = extraMap[report.id] || [];
    setForm({
      id: report.id, site_code: report.site_code,
      valet_count: report.valet_count || 0, valet_amount: report.valet_amount || 0, memo: report.memo || "",
      images: report.images || [],
      staffList: stf.length > 0 ? stf.map(s => ({ id: s.id, employee_id: s.employee_id, name_raw: s.name_raw || "", staff_type: s.staff_type || "regular", work_hours: s.work_hours || 0 }))
        : employees.filter(e => e.site_code_1 === report.site_code && e.status === "재직").map(e => ({ employee_id: e.id, name_raw: e.name, staff_type: "regular", work_hours: 8 })),
      payList: PAYMENT_TYPES.map(pt => {
        const existing = pay.find(p => p.payment_type === pt.key);
        return existing ? { id: existing.id, payment_type: pt.key, count: existing.count || 0, amount: existing.amount || 0, memo: existing.memo || "" } : { payment_type: pt.key, count: 0, amount: 0, memo: "" };
      }),
      extraList: ext.map(e => ({ id: e.id, employee_id: e.employee_id, extra_type: e.extra_type, extra_hours: e.extra_hours || 0, extra_amount: e.extra_amount || 0, memo: e.memo || "" })),
    });
    setEditMode(true);
  };

  // ── 저장 ──
  const handleSave = async () => {
    if (!form.site_code) return alert("사업장을 선택하세요");
    // 결제수단 합계 검증
    const payTotal = form.payList.reduce((s, p) => s + toNum(p.amount), 0);
    const valetAmt = toNum(form.valet_amount);
    if (payTotal > 0 && valetAmt > 0 && Math.abs(payTotal - valetAmt) > 100) {
      const ok = window.confirm(`결제수단 합계(${fmt(payTotal)}원)와 발렛비(${fmt(valetAmt)}원)가 일치하지 않습니다.\n그래도 저장하시겠습니까?`);
      if (!ok) return;
    }
    setSaving(true);
    try {
      let reportId = form.id;
      const reportPayload = {
        report_date: selDate,
        site_code: form.site_code,
        valet_count: toNum(form.valet_count),
        valet_amount: toNum(form.valet_amount),
        memo: form.memo?.trim() || null,
        images: form.images || [],
        reporter_id: null,
        status: "submitted",
      };
      if (reportId) {
        const { error } = await supabase.from("daily_reports").update(reportPayload).eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("daily_reports").insert(reportPayload).select().single();
        if (error) throw error;
        reportId = data.id;
      }
      await supabase.from("daily_report_staff").delete().eq("report_id", reportId);
      const staffRows = form.staffList.filter(s => s.employee_id || s.name_raw).map(s => ({
        report_id: reportId, employee_id: s.employee_id || null, name_raw: s.name_raw || null, staff_type: s.staff_type, work_hours: toNum(s.work_hours),
      }));
      if (staffRows.length > 0) await supabase.from("daily_report_staff").insert(staffRows);
      await supabase.from("daily_report_payment").delete().eq("report_id", reportId);
      const payRows = form.payList.filter(p => toNum(p.count) > 0 || toNum(p.amount) > 0).map(p => ({
        report_id: reportId, payment_type: p.payment_type, count: toNum(p.count), amount: toNum(p.amount), memo: p.memo || null,
      }));
      if (payRows.length > 0) await supabase.from("daily_report_payment").insert(payRows);
      await supabase.from("daily_report_extra").delete().eq("report_id", reportId);
      const extRows = form.extraList.filter(e => toNum(e.extra_amount) > 0 || toNum(e.extra_hours) > 0).map(e => ({
        report_id: reportId, employee_id: e.employee_id || null, extra_type: e.extra_type, extra_hours: toNum(e.extra_hours), extra_amount: toNum(e.extra_amount), memo: e.memo || null,
      }));
      if (extRows.length > 0) await supabase.from("daily_report_extra").insert(extRows);
      // 기존 확정 일보 수정 시 → submitted로 변경되므로 valet_fee 재계산
      const prevReport = reports.find(r => r.id === form.id);
      if (prevReport && prevReport.status === "confirmed") {
        const monthStr = selDate.slice(0, 7);
        const remaining = reports.filter(r =>
          r.id !== form.id && r.site_code === form.site_code &&
          r.report_date.startsWith(monthStr) && r.status === "confirmed"
        );
        const totalValet = remaining.reduce((s, r) => s + toNum(r.valet_amount), 0);
        await supabase.from("site_revenue").upsert(
          { site_code: form.site_code, month: monthStr, valet_fee: totalValet },
          { onConflict: "site_code,month" }
        );
      }
      setEditMode(false);
      await loadReports();
      onDataChange?.();
    } catch (e) { alert("저장 실패: " + (e.message || e)); }
    setSaving(false);
  };

  // ── 확정/해제 (BUG FIX: form.valet_amount 대신 report.valet_amount 직접 사용) ──
  const toggleConfirm = async (report) => {
    const newStatus = report.status === "confirmed" ? "submitted" : "confirmed";
    const update = newStatus === "confirmed"
      ? { status: "confirmed", confirmed_by: profile?.id || null, confirmed_at: new Date().toISOString() }
      : { status: "submitted", confirmed_by: null, confirmed_at: null };
    const { error } = await supabase.from("daily_reports").update(update).eq("id", report.id);
    if (error) { alert("상태 변경 실패: " + error.message); return; }
    // 확정/해제 시 site_revenue.valet_fee 재계산
    const monthStr = report.report_date.slice(0, 7);
    // 현재 report의 새 상태 반영하여 해당 월+사업장의 확정 일보 합산
    const confirmedReports = reports.filter(r =>
      r.site_code === report.site_code &&
      r.report_date.startsWith(monthStr) &&
      (r.id === report.id ? newStatus === "confirmed" : r.status === "confirmed")
    );
    const totalValet = confirmedReports.reduce((s, r) => s + toNum(r.valet_amount), 0);
    await supabase.from("site_revenue").upsert(
      { site_code: report.site_code, month: monthStr, valet_fee: totalValet },
      { onConflict: "site_code,month" }
    );
    await loadReports();
    onDataChange?.();
  };

  // ── 삭제 (확정 일보 삭제 시 valet_fee 재계산) ──
  const handleDelete = async (reportId) => {
    if (!(await confirm("일보를 삭제하시겠습니까?", "일보 데이터가 모두 삭제됩니다.", { okLabel: "삭제", okColor: C.error }))) return;
    const target = reports.find(r => r.id === reportId);
    await supabase.from("daily_reports").delete().eq("id", reportId);
    // 확정 일보 삭제 시 site_revenue.valet_fee 재계산
    if (target && target.status === "confirmed") {
      const monthStr = target.report_date.slice(0, 7);
      const remaining = reports.filter(r =>
        r.id !== reportId && r.site_code === target.site_code &&
        r.report_date.startsWith(monthStr) && r.status === "confirmed"
      );
      const totalValet = remaining.reduce((s, r) => s + toNum(r.valet_amount), 0);
      await supabase.from("site_revenue").upsert(
        { site_code: target.site_code, month: monthStr, valet_fee: totalValet },
        { onConflict: "site_code,month" }
      );
    }
    setEditMode(false);
    await loadReports();
    onDataChange?.();
  };

  // ── 일괄확정 ──
  const handleBatchConfirm = async () => {
    const targetReports = (selSite === "ALL" ? reports : reports.filter(r => r.site_code === selSite))
      .filter(r => r.status === "submitted");
    if (targetReports.length === 0) { alert("확정할 미확정 일보가 없습니다."); return; }
    const siteLabel = selSite === "ALL" ? "전체 사업장" : `${getSiteName(selSite)}`;
    if (!(await confirm(
      `${siteLabel} 미확정 일보 ${targetReports.length}건을 일괄 확정하시겠습니까?`,
      `${selMonth} 기준 · 확정 시 발렛비가 수익성 분석에 반영됩니다.`,
      { okLabel: "확정", okColor: C.navy }
    ))) return;
    setSaving(true);
    try {
      const ids = targetReports.map(r => r.id);
      const { error } = await supabase.from("daily_reports").update({
        status: "confirmed",
        confirmed_by: profile?.id || null,
        confirmed_at: new Date().toISOString(),
      }).in("id", ids);
      if (error) throw error;
      // 영향받는 사업장별 valet_fee 재계산
      const affectedSites = [...new Set(targetReports.map(r => r.site_code))];
      for (const siteCode of affectedSites) {
        const monthStr = selMonth;
        // 기존 확정 + 이번에 새로 확정된 것 합산
        const allConfirmed = reports.filter(r =>
          r.site_code === siteCode && r.report_date.startsWith(monthStr) &&
          (r.status === "confirmed" || ids.includes(r.id))
        );
        const totalValet = allConfirmed.reduce((s, r) => s + toNum(r.valet_amount), 0);
        await supabase.from("site_revenue").upsert(
          { site_code: siteCode, month: monthStr, valet_fee: totalValet },
          { onConflict: "site_code,month" }
        );
      }
      await loadReports();
      onDataChange?.();
    } catch (e) { alert("일괄확정 실패: " + (e.message || e)); }
    setSaving(false);
  };

  // ── 엑셀 Export ──
  const handleExportExcel = async () => {
    const XLSX = (await import("xlsx")).default || (await import("xlsx"));
    const filtered = selSite === "ALL" ? reports : reports.filter(r => r.site_code === selSite);
    const sorted = [...filtered].sort((a, b) => (a.report_date || "").localeCompare(b.report_date || ""));
    if (sorted.length === 0) { alert("내보낼 일보가 없습니다."); return; }

    // Sheet 1: 사업장별 요약
    const summaryMap = {};
    sorted.forEach(r => {
      if (!summaryMap[r.site_code]) summaryMap[r.site_code] = {
        사업장코드: r.site_code, 사업장명: getSiteName(r.site_code),
        작성일수: 0, 확정일수: 0, 총발렛건수: 0, 총발렛비: 0, 확정발렛비: 0, 근무자수: 0,
      };
      const m = summaryMap[r.site_code];
      m.작성일수++;
      if (r.status === "confirmed") { m.확정일수++; m.확정발렛비 += toNum(r.valet_amount); }
      m.총발렛건수 += toNum(r.valet_count);
      m.총발렛비 += toNum(r.valet_amount);
      m.근무자수 += (staffMap[r.id] || []).length;
    });
    const sheet1Data = Object.values(summaryMap);

    // Sheet 2: 일자별 상세
    const sheet2Data = sorted.map(r => {
      const staff = staffMap[r.id] || [];
      const pay = payMap[r.id] || [];
      const extra = extraMap[r.id] || [];
      return {
        날짜: r.report_date,
        사업장코드: r.site_code,
        사업장명: getSiteName(r.site_code),
        발렛건수: r.valet_count || 0,
        발렛비: r.valet_amount || 0,
        상태: r.status === "confirmed" ? "확정" : "미확정",
        근무자수: staff.length,
        근무자: staff.map(s => {
          const emp = s.employee_id ? employees.find(e => e.id === s.employee_id) : null;
          return `${emp?.name || s.name_raw || "?"}(${s.work_hours}h)`;
        }).join(", "),
        현금: pay.find(p => p.payment_type === "cash")?.amount || 0,
        카드: pay.find(p => p.payment_type === "card")?.amount || 0,
        계좌이체: pay.find(p => p.payment_type === "transfer")?.amount || 0,
        기타결제: pay.find(p => p.payment_type === "etc")?.amount || 0,
        추가수당합계: extra.reduce((s, e) => s + toNum(e.extra_amount), 0),
        메모: r.memo || "",
      };
    });

    // Sheet 3: 근무자 상세
    const sheet3Data = [];
    sorted.forEach(r => {
      const staff = staffMap[r.id] || [];
      staff.forEach(s => {
        const emp = s.employee_id ? employees.find(e => e.id === s.employee_id) : null;
        sheet3Data.push({
          날짜: r.report_date,
          사업장: getSiteName(r.site_code),
          이름: emp?.name || s.name_raw || "?",
          사번: emp?.emp_no || "",
          구분: s.staff_type === "regular" ? "정규" : s.staff_type === "substitute" ? "대근" : "추가",
          근무시간: s.work_hours || 0,
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
    const ws3 = XLSX.utils.json_to_sheet(sheet3Data);
    // 열 너비 설정
    ws1["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
    ws2["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 6 }, { wch: 6 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
    ws3["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws1, "사업장별 요약");
    XLSX.utils.book_append_sheet(wb, ws2, "일자별 상세");
    XLSX.utils.book_append_sheet(wb, ws3, "근무자 상세");
    const siteLabel = selSite === "ALL" ? "전체" : getSiteName(selSite);
    XLSX.writeFile(wb, `현장일보_${selMonth}_${siteLabel}.xlsx`);
  };

  // ── 월간 통계 ──
  const monthStats = useMemo(() => {
    const filtered = selSite === "ALL" ? reports : reports.filter(r => r.site_code === selSite);
    const confirmedFiltered = filtered.filter(r => r.status === "confirmed");
    return {
      totalDays: filtered.length,
      confirmedDays: confirmedFiltered.length,
      totalValet: filtered.reduce((s, r) => s + toNum(r.valet_count), 0),
      totalAmount: filtered.reduce((s, r) => s + toNum(r.valet_amount), 0),
      confirmedAmount: confirmedFiltered.reduce((s, r) => s + toNum(r.valet_amount), 0),
    };
  }, [reports, selSite]);

  // ── 사업장별 월 요약 (테이블뷰용) ──
  const siteMonthSummary = useMemo(() => {
    const map = {};
    FIELD_SITES.forEach(s => { map[s.code] = { code: s.code, name: s.name, days: 0, confirmed: 0, valetCount: 0, valetAmount: 0, staffCount: 0 }; });
    reports.forEach(r => {
      if (!map[r.site_code]) return;
      map[r.site_code].days++;
      if (r.status === "confirmed") map[r.site_code].confirmed++;
      map[r.site_code].valetCount += toNum(r.valet_count);
      map[r.site_code].valetAmount += toNum(r.valet_amount);
      map[r.site_code].staffCount += (staffMap[r.id] || []).length;
    });
    return Object.values(map).filter(s => s.days > 0).sort((a, b) => b.valetAmount - a.valetAmount);
  }, [reports, staffMap]);

  // ── 패널 열기 ──
  const openPanel = (siteCode) => {
    const { report } = siteStatusMap[siteCode] || {};
    setSelSite(siteCode);
    setPanelSiteCode(siteCode);
    if (report) {
      setEditMode(false);
    } else {
      // 새 일보 작성 모드
      const existing = reports.find(r => r.report_date === selDate && r.site_code === siteCode);
      if (existing) { setEditMode(false); }
      else {
        const siteEmps = employees.filter(e => e.site_code_1 === siteCode && e.status === "재직");
        setForm({
          site_code: siteCode,
          valet_count: 0, valet_amount: 0, memo: "",
          staffList: siteEmps.map(e => ({ employee_id: e.id, name_raw: e.name, staff_type: "regular", work_hours: 8 })),
          payList: PAYMENT_TYPES.map(p => ({ payment_type: p.key, count: 0, amount: 0, memo: "" })),
          extraList: [], images: [],
        });
        setEditMode(true);
      }
    }
  };
  const closePanel = () => { setPanelSiteCode(null); setSelSite("ALL"); setEditMode(false); };

  // ── 날짜 앞뒤 이동 ──
  const shiftDay = (delta) => {
    setSelDate(prev => {
      const dt = new Date(prev + "T00:00:00");
      dt.setDate(dt.getDate() + delta);
      const s = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
      setSelMonth(s.slice(0, 7));
      return s;
    });
  };
  const prevDay = () => shiftDay(-1);
  const nextDay = () => shiftDay(1);

  // ── 패널 내 일보 (panelSiteCode 기준) ──
  const panelReport = panelSiteCode ? reports.find(r => r.report_date === selDate && r.site_code === panelSiteCode) : null;

  // ── 스타일 ──
  const fieldSt = { ...inputStyle, fontSize: 12, padding: "7px 10px" };
  const labelSt = { fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 4, display: "block" };
  const miniBtn = { ...btnSmall, padding: "4px 10px", fontSize: 11, borderRadius: 6 };

  // ── 숫자 입력 헬퍼 (type="number" 대신 inputMode="decimal") ──
  const numFieldSt = { ...fieldSt, textAlign: "right", fontFamily: FONT };
  function renderNumField(value, onChange, opts = {}) {
    const { placeholder, style: st, step } = opts;
    return (
      <input inputMode="decimal" placeholder={placeholder} style={{ ...numFieldSt, ...st }}
        value={value === 0 || value === "0" ? "" : value}
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          onChange(raw === "" ? 0 : raw);
        }}
        onBlur={e => {
          const n = Number(String(e.target.value).replace(/[^0-9.]/g, ""));
          onChange(isNaN(n) ? 0 : (step === 0.5 ? Math.round(n * 2) / 2 : Math.round(n)));
        }}
      />
    );
  }

  // ── 직원 검색 ──
  const siteEmployees = useMemo(() => {
    const code = editMode ? form.site_code : selSite;
    if (!code || code === "ALL") return employees.filter(e => e.status === "재직");
    return employees.filter(e => e.site_code_1 === code && e.status === "재직");
  }, [employees, selSite, editMode, form.site_code]);

  // ── 결제수단 합계 vs 발렛비 불일치 체크 ──
  const paymentMismatch = useMemo(() => {
    if (!editMode) return null;
    const payTotal = form.payList.reduce((s, p) => s + toNum(p.amount), 0);
    const valetAmt = toNum(form.valet_amount);
    if (payTotal > 0 && valetAmt > 0 && Math.abs(payTotal - valetAmt) > 100) {
      return { payTotal, valetAmt, diff: payTotal - valetAmt };
    }
    return null;
  }, [editMode, form.payList, form.valet_amount]);

  // ── 렌더: 그리드 뷰 ──
  function renderGridView() {
    const filteredSites = FIELD_SITES.filter(s => {
      if (statusFilter === "all") return true;
      const { status } = siteStatusMap[s.code] || {};
      if (statusFilter === "confirmed") return status === "confirmed";
      if (statusFilter === "submitted") return status === "submitted";
      if (statusFilter === "pending") return !status || status === "pending";
      return true;
    });

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {filteredSites.map(site => {
          const { status, report } = siteStatusMap[site.code] || {};
          const staff = report ? (staffMap[report.id] || []) : [];
          const pay = report ? (payMap[report.id] || []) : [];
          const hasMemo = report?.memo?.trim();

          const isConfirmed = status === "confirmed";
          const isSubmitted = status === "submitted";
          const isPending = !status || status === "pending";

          const borderColor = isConfirmed ? "#1D9E75" : isSubmitted ? "#3B8BD4" : "#D8B84E";
          const badgeBg = isConfirmed ? "#E8F5E9" : isSubmitted ? "#E3F2FD" : "#FFF8E1";
          const badgeColor = isConfirmed ? "#2E7D32" : isSubmitted ? "#1565C0" : "#9A6700";
          const badgeLabel = isConfirmed ? "✅ 확정" : isSubmitted ? "📝 미확정" : "⏳ 미제출";

          // 결제수단: 현금, 카드만 표시
          const cash = pay.find(p => p.payment_type === "cash");
          const card = pay.find(p => p.payment_type === "card");

          // 근무인원 구성 (duty별)
          const siteStaff = staff.filter(s => s.staff_type !== "substitute");
          const extraStaff = staff.filter(s => s.staff_type === "substitute");

          return (
            <div
              key={site.code}
              onClick={() => openPanel(site.code)}
              style={{
                background: "#fff", borderRadius: 12,
                border: `0.5px solid #E0E4EF`,
                borderLeft: `3px solid ${borderColor}`,
                padding: "13px 14px",
                cursor: "pointer",
                transition: "box-shadow 0.15s, transform 0.1s",
                position: "relative",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.09)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
            >
              {/* 헤더 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 1 }}>{site.name}</div>
                  <div style={{ fontSize: 10, color: C.gray }}>{site.code}</div>
                </div>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700, background: badgeBg, color: badgeColor, whiteSpace: "nowrap" }}>
                  {badgeLabel}
                </span>
              </div>

              {isPending ? (
                <div style={{ padding: "14px 0", textAlign: "center", color: C.gray, fontSize: 12 }}>
                  마감 보고 없음
                  <div style={{ fontSize: 10, marginTop: 4, color: "#B0B0B0" }}>클릭하여 새 일보 작성</div>
                </div>
              ) : (
                <>
                  {/* 발렛 건수 + 발렛비 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                    <div style={{ background: "#F0F4FF", borderRadius: 8, padding: "7px 10px" }}>
                      <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>발렛 건수</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{fmt(report?.valet_count)}건</div>
                    </div>
                    <div style={{ background: "#FFF8E1", borderRadius: 8, padding: "7px 10px" }}>
                      <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>발렛비</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#9A6700" }}>{fmt(report?.valet_amount)}원</div>
                    </div>
                  </div>

                  {/* 결제수단 (현금/카드만) */}
                  {(cash || card) && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      {cash && cash.amount > 0 && (
                        <div style={{ flex: 1, background: "#F1F8E9", borderRadius: 6, padding: "5px 8px" }}>
                          <div style={{ fontSize: 9, color: C.gray }}>현금</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#2E7D32" }}>{fmt(cash.amount)}원</div>
                        </div>
                      )}
                      {card && card.amount > 0 && (
                        <div style={{ flex: 1, background: "#E8EAF6", borderRadius: 6, padding: "5px 8px" }}>
                          <div style={{ fontSize: 9, color: C.gray }}>카드</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#3949AB" }}>{fmt(card.amount)}원</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 근무인원 + 메모 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    {staff.length > 0 && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#EEF0FF", color: C.navy, fontWeight: 700 }}>
                        👥 {staff.length}명
                      </span>
                    )}
                    {staff.filter(s => s.staff_type === "substitute").length > 0 && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#FFF4EC", color: "#E97132", fontWeight: 700 }}>
                        추가 {staff.filter(s => s.staff_type === "substitute").length}명
                      </span>
                    )}
                    {hasMemo && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#F3F0FF", color: "#7B3FBE", fontWeight: 700 }}>📝</span>
                    )}
                    {isSubmitted && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleConfirm(report); }}
                        style={{ marginLeft: "auto", fontSize: 10, padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.success}`, background: "#E8F5E9", color: C.success, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
                      >
                        확정하기
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── 렌더: 슬라이드 패널 ──
  function renderSlidePanel() {
    if (!panelSiteCode) return null;
    const siteName = getSiteName(panelSiteCode);
    return (
      <>
        {/* 딤 배경 */}
        <div
          onClick={closePanel}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000 }}
        />
        {/* 패널 */}
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(520px, 100vw)",
          background: "#fff",
          zIndex: 1001,
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}>
          {/* 패널 헤더 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, background: C.navy, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>{siteName}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{panelSiteCode} · {selDate}</div>
            </div>
            <button onClick={closePanel} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: C.white, fontSize: 18, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>✕</button>
          </div>
          {/* 패널 내용 */}
          <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
            {editMode ? (
              renderEditForm()
            ) : panelReport ? (
              renderReportView(panelReport)
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>아직 일보가 없습니다</div>
                <button onClick={() => { openPanel(panelSiteCode); }} style={btnPrimary}>+ 새 일보 작성</button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── 렌더: 통계 카드 ──
  function renderStats() {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { icon: "📅", label: "작성일수", value: `${monthStats.totalDays}일`, sub: `확정 ${monthStats.confirmedDays}일`, subColor: C.success },
          { icon: "🚗", label: "총 발렛건수", value: `${fmt(monthStats.totalValet)}건` },
          { icon: "💰", label: "총 발렛비", value: `${fmt(monthStats.totalAmount)}원` },
          { icon: "✅", label: "확정 발렛비", value: `${fmt(monthStats.confirmedAmount)}원`, sub: monthStats.totalAmount > 0 ? `${Math.round(monthStats.confirmedAmount / monthStats.totalAmount * 100)}% 확정` : "", subColor: C.success },
          { icon: "📊", label: "일평균", value: `${fmt(monthStats.totalDays > 0 ? monthStats.totalAmount / monthStats.totalDays : 0)}원` },
        ].map((s, i) => (
          <div key={i} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.navy }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{s.label}</div>
            {s.sub && <div style={{ fontSize: 10, color: s.subColor || C.success, marginTop: 2, fontWeight: 700 }}>{s.sub}</div>}
          </div>
        ))}
      </div>
    );
  }

  // ── 렌더: 달력 ──
  function renderCalendar() {
    return (
      <div style={{ ...cardStyle, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={prevMonth} style={{ ...miniBtn, background: C.lightGray, color: C.dark }}>◀</button>
          <span style={{ fontSize: 15, fontWeight: 900, color: C.navy }}>{selMonth.replace("-", "년 ")}월</span>
          <button onClick={nextMonth} style={{ ...miniBtn, background: C.lightGray, color: C.dark }}>▶</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? C.error : i === 6 ? "#2196F3" : C.gray, padding: "4px 0" }}>{d}</div>
          ))}
          {calendarData.weeks.flat().map((cell, i) => {
            if (!cell) return <div key={`e${i}`} />;
            const isToday = cell.dateStr === todayStr;
            const isSel = cell.dateStr === selDate;
            return (
              <button key={cell.dateStr} onClick={() => { setSelDate(cell.dateStr); setEditMode(false); }}
                style={{
                  padding: "5px 2px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: isSel ? 900 : 600, textAlign: "center",
                  background: isSel ? C.navy : isToday ? "#E3F2FD" : "transparent",
                  color: isSel ? C.white : C.dark,
                  outline: isToday && !isSel ? `2px solid ${C.navy}` : "none",
                  minHeight: 38,
                }}>
                {cell.day}
                {cell.count > 0 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 1 }}>
                    {cell.hasConfirmed && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.success, display: "inline-block" }} />}
                    {cell.hasSubmitted && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold, display: "inline-block" }} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 10, justifyContent: "center" }}>
          <span style={{ fontSize: 10, color: C.gray, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.success, display: "inline-block" }} /> 확정</span>
          <span style={{ fontSize: 10, color: C.gray, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, display: "inline-block" }} /> 미확정</span>
        </div>
      </div>
    );
  }

  // ── 렌더: 일보 뷰 (읽기 전용) ──
  function renderReportView(report) {
    const staff = staffMap[report.id] || [];
    const pay = payMap[report.id] || [];
    const extra = extraMap[report.id] || [];
    const siteName = getSiteName(report.site_code);
    const isConfirmed = report.status === "confirmed";
    const reporterName = report.reporter_id ? (employees.find(e => e.id === report.reporter_id)?.name || "현장앱") : null;
    return (
      <div key={report.id} style={{ ...cardStyle, borderLeft: `4px solid ${isConfirmed ? C.success : C.gold}`, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 900, color: C.navy }}>{siteName}</span>
            <span style={{ fontSize: 11, color: C.gray, marginLeft: 8 }}>{report.site_code}</span>
            <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: isConfirmed ? "#E8F5E9" : "#FFF8E1", color: isConfirmed ? C.success : "#F57F17" }}>
              {isConfirmed ? "✅ 확정" : "📝 미확정"}
            </span>
            {reporterName && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#EDE7F6", color: "#5E35B1" }}>
                📱 {reporterName}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => startEdit(report)} style={{ ...miniBtn, background: C.white, color: C.navy, border: `1px solid ${C.border}` }}>수정</button>
            <button onClick={() => toggleConfirm(report)} style={{ ...miniBtn, background: isConfirmed ? C.lightGray : C.success, color: isConfirmed ? C.dark : C.white }}>
              {isConfirmed ? "확정해제" : "확정"}
            </button>
            <button onClick={() => handleDelete(report.id)} style={{ ...miniBtn, background: C.white, color: C.error, border: `1px solid ${C.error}` }}>삭제</button>
          </div>
        </div>
        {/* 발렛 현황 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ background: "#F0F4FF", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.navy }}>{fmt(report.valet_count)}건</div>
            <div style={{ fontSize: 11, color: C.gray }}>발렛 건수{valetRates[report.site_code] > 0 ? ` · @${fmt(valetRates[report.site_code])}원` : ""}</div>
          </div>
          <div style={{ background: "#FFF8E1", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#F57F17" }}>{fmt(report.valet_amount)}원</div>
            <div style={{ fontSize: 11, color: C.gray }}>발렛비</div>
          </div>
        </div>
        {/* 근무자 */}
        {staff.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 6 }}>👥 근무자 ({staff.length}명)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {staff.map((s, i) => {
                const emp = s.employee_id ? employees.find(e => e.id === s.employee_id) : null;
                const typeBg = s.staff_type === "regular" ? "#E3F2FD" : s.staff_type === "substitute" ? "#FFF3E0" : "#F3E5F5";
                const typeLabel = s.staff_type === "regular" ? "" : s.staff_type === "substitute" ? " 대근" : " 추가";
                return (
                  <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: typeBg, color: C.dark, fontWeight: 600 }}>
                    {emp?.name || s.name_raw || "?"}{typeLabel} · {s.work_hours}h
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {/* 결제수단 */}
        {pay.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 6 }}>💳 결제수단</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(pay.length, 4)}, 1fr)`, gap: 6 }}>
              {pay.map((p, i) => (
                <div key={i} style={{ background: C.bg, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>{fmt(p.amount)}원</div>
                  <div style={{ fontSize: 10, color: C.gray }}>{PAYMENT_TYPES.find(pt => pt.key === p.payment_type)?.label || p.payment_type} {p.count}건</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* 추가수당 */}
        {extra.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 6 }}>💵 추가수당</div>
            {extra.map((e, i) => {
              const emp = e.employee_id ? employees.find(emp2 => emp2.id === e.employee_id) : null;
              return (
                <div key={i} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.lightGray}` }}>
                  <span>{emp?.name || "?"} · {EXTRA_TYPES.find(t => t.key === e.extra_type)?.label || e.extra_type} {e.extra_hours}h</span>
                  <span style={{ fontWeight: 800, color: C.orange }}>{fmt(e.extra_amount)}원</span>
                </div>
              );
            })}
          </div>
        )}
        {report.memo && <div style={{ fontSize: 11, color: C.gray, background: C.bg, borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>📝 {report.memo}</div>}
        {/* 첨부 이미지 */}
        {(report.images || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 6 }}>📸 첨부 사진 ({report.images.length}장)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
              {report.images.map((img, i) => (
                <img key={i} src={img.url} alt={img.name || "사진"} onClick={() => setLightboxImg(img.url)}
                  style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: `1px solid ${C.border}` }} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 렌더: 편집 폼 ──
  function renderEditForm() {
    return (
      <div style={{ ...cardStyle, borderLeft: `4px solid ${C.gold}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: C.navy }}>{form.id ? "📝 일보 수정" : "📝 새 일보 작성"} — {selDate}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {!form.id && <button onClick={copyFromPrevDay} style={{ ...miniBtn, background: "#E3F2FD", color: C.navy }}>📋 전일복사</button>}
            <button onClick={() => setEditMode(false)} style={{ ...miniBtn, background: C.lightGray, color: C.dark }}>취소</button>
            <button onClick={handleSave} disabled={saving} style={{ ...miniBtn, background: C.navy, color: C.white }}>{saving ? "저장 중..." : "💾 저장"}</button>
          </div>
        </div>

        {/* 사업장 선택 — 크루는 본인 사업장 고정 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>사업장</label>
          {isCrewRole ? (
            <div style={{ ...fieldSt, background: "#e8ebf5", color: C.navy, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              🏢 {getSiteName(crewSiteCode)}
              <span style={{ fontSize: 10, color: C.gray, marginLeft: 4 }}>(소속 사업장)</span>
            </div>
          ) : (
            <select value={form.site_code} onChange={e => { const code = e.target.value; setForm(f => ({ ...f, site_code: code, staffList: employees.filter(emp => emp.site_code_1 === code && emp.status === "재직").map(emp => ({ employee_id: emp.id, name_raw: emp.name, staff_type: "regular", work_hours: 8 })) })); }} style={fieldSt} disabled={!!form.id}>
              {FIELD_SITES.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}
            </select>
          )}
        </div>

        {/* 발렛 현황 — 건수 × 단가 = 발렛비 자동계산 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "end" }}>
            <div>
              <label style={labelSt}>🚗 발렛 건수</label>
              {renderNumField(form.valet_count, v => {
                const cnt = toNum(v);
                const rate = valetRates[form.site_code] || 0;
                setForm(f => ({ ...f, valet_count: v, ...(rate > 0 ? { valet_amount: cnt * rate } : {}) }));
              }, { placeholder: "건수", style: { ...fieldSt } })}
            </div>
            <div>
              <label style={labelSt}>💲 단가 (원/건)</label>
              {renderNumField(valetRates[form.site_code] || 0, v => {
                const rate = toNum(v);
                saveValetRate(form.site_code, rate);
                const cnt = toNum(form.valet_count);
                if (cnt > 0 && rate > 0) setForm(f => ({ ...f, valet_amount: cnt * rate }));
              }, { placeholder: "단가", style: { ...fieldSt } })}
            </div>
            <div>
              <label style={labelSt}>💰 발렛비 (원)</label>
              {renderNumField(form.valet_amount, v => setForm(f => ({ ...f, valet_amount: v })), { placeholder: "금액", style: { ...fieldSt } })}
            </div>
          </div>
          {valetRates[form.site_code] > 0 && toNum(form.valet_count) > 0 && (
            <div style={{ fontSize: 11, color: C.navy, marginTop: 6, fontWeight: 600, textAlign: "right" }}>
              💡 {fmt(form.valet_count)}건 × {fmt(valetRates[form.site_code])}원 = {fmt(toNum(form.valet_count) * valetRates[form.site_code])}원
              {toNum(form.valet_amount) !== toNum(form.valet_count) * valetRates[form.site_code] && (
                <span style={{ color: "#E97132", marginLeft: 6 }}>(수동 수정됨)</span>
              )}
            </div>
          )}
        </div>

        {/* 근무자 배치 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>👥 근무자 ({form.staffList.length}명)</span>
            <button onClick={() => setForm(f => ({ ...f, staffList: [...f.staffList, { employee_id: "", name_raw: "", staff_type: "substitute", work_hours: 8 }] }))} style={{ ...miniBtn, background: "#E3F2FD", color: C.navy }}>+ 추가</button>
          </div>
          {form.staffList.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <select value={s.employee_id || ""} onChange={e => { const empId = e.target.value; const emp = employees.find(emp2 => emp2.id === empId); setForm(f => ({ ...f, staffList: f.staffList.map((ss, j) => j === i ? { ...ss, employee_id: empId, name_raw: emp?.name || ss.name_raw } : ss) })); }} style={{ ...fieldSt, flex: 2, minWidth: 120 }}>
                <option value="">직접입력</option>
                {siteEmployees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.emp_no})</option>)}
              </select>
              {!s.employee_id && <input placeholder="이름" value={s.name_raw} onChange={e => setForm(f => ({ ...f, staffList: f.staffList.map((ss, j) => j === i ? { ...ss, name_raw: e.target.value } : ss) }))} style={{ ...fieldSt, flex: 1, minWidth: 60 }} />}
              <select value={s.staff_type} onChange={e => setForm(f => ({ ...f, staffList: f.staffList.map((ss, j) => j === i ? { ...ss, staff_type: e.target.value } : ss) }))} style={{ ...fieldSt, width: 72, flex: "none" }}>
                <option value="regular">정규</option><option value="substitute">대근</option><option value="extra">추가</option>
              </select>
              {renderNumField(s.work_hours, v => setForm(f => ({ ...f, staffList: f.staffList.map((ss, j) => j === i ? { ...ss, work_hours: v } : ss) })), { placeholder: "h", style: { ...fieldSt, width: 52, flex: "none", textAlign: "center" }, step: 0.5 })}
              <span style={{ fontSize: 10, color: C.gray, flexShrink: 0 }}>h</span>
              <button onClick={() => setForm(f => ({ ...f, staffList: f.staffList.filter((_, j) => j !== i) }))} style={{ ...miniBtn, background: "#FFEBEE", color: C.error, padding: "4px 8px" }}>✕</button>
            </div>
          ))}
        </div>

        {/* 결제수단 */}
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.navy, display: "block", marginBottom: 8 }}>💳 결제수단별 매출</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {form.payList.map((p, i) => (
              <div key={p.payment_type} style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}>
                <label style={{ ...labelSt, marginBottom: 6 }}>{PAYMENT_TYPES.find(pt => pt.key === p.payment_type)?.label}</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {renderNumField(p.count, v => setForm(f => ({ ...f, payList: f.payList.map((pp, j) => j === i ? { ...pp, count: v } : pp) })), { placeholder: "건수", style: { ...fieldSt, flex: 1 } })}
                  {renderNumField(p.amount, v => setForm(f => ({ ...f, payList: f.payList.map((pp, j) => j === i ? { ...pp, amount: v } : pp) })), { placeholder: "금액", style: { ...fieldSt, flex: 2 } })}
                </div>
              </div>
            ))}
          </div>
          {/* 결제수단 합계 표시 + 불일치 경고 */}
          {(() => {
            const payTotal = form.payList.reduce((s, p) => s + toNum(p.amount), 0);
            return payTotal > 0 ? (
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "6px 10px", borderRadius: 6, background: paymentMismatch ? "#FFF3E0" : "#E8F5E9" }}>
                <span style={{ fontWeight: 700, color: C.gray }}>결제수단 합계</span>
                <span style={{ fontWeight: 900, color: paymentMismatch ? C.orange : C.success }}>{fmt(payTotal)}원
                  {paymentMismatch && <span style={{ color: C.error, marginLeft: 8 }}>⚠️ 발렛비와 {fmt(Math.abs(paymentMismatch.diff))}원 차이</span>}
                </span>
              </div>
            ) : null;
          })()}
        </div>

        {/* 추가수당 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>💵 추가수당</span>
            <button onClick={() => setForm(f => ({ ...f, extraList: [...f.extraList, { employee_id: "", extra_type: "overtime", extra_hours: 0, extra_amount: 0, memo: "" }] }))} style={{ ...miniBtn, background: "#FFF3E0", color: C.orange }}>+ 추가</button>
          </div>
          {form.extraList.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <select value={e.employee_id || ""} onChange={ev => setForm(f => ({ ...f, extraList: f.extraList.map((ee, j) => j === i ? { ...ee, employee_id: ev.target.value } : ee) }))} style={{ ...fieldSt, flex: 2, minWidth: 100 }}>
                <option value="">직원선택</option>
                {siteEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
              <select value={e.extra_type} onChange={ev => setForm(f => ({ ...f, extraList: f.extraList.map((ee, j) => j === i ? { ...ee, extra_type: ev.target.value } : ee) }))} style={{ ...fieldSt, width: 80, flex: "none" }}>
                {EXTRA_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {renderNumField(e.extra_hours, v => setForm(f => ({ ...f, extraList: f.extraList.map((ee, j) => j === i ? { ...ee, extra_hours: v } : ee) })), { placeholder: "h", style: { ...fieldSt, width: 48, flex: "none", textAlign: "center" }, step: 0.5 })}
              {renderNumField(e.extra_amount, v => setForm(f => ({ ...f, extraList: f.extraList.map((ee, j) => j === i ? { ...ee, extra_amount: v } : ee) })), { placeholder: "금액", style: { ...fieldSt, width: 80, flex: "none" } })}
              <button onClick={() => setForm(f => ({ ...f, extraList: f.extraList.filter((_, j) => j !== i) }))} style={{ ...miniBtn, background: "#FFEBEE", color: C.error, padding: "4px 8px" }}>✕</button>
            </div>
          ))}
          {form.extraList.length === 0 && <div style={{ fontSize: 11, color: C.gray, textAlign: "center", padding: 8 }}>추가수당 없음</div>}
        </div>

        {/* 메모 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelSt}>📝 메모</label>
          <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} style={{ ...fieldSt, height: 60, resize: "vertical" }} placeholder="특이사항, 주차장 상태 등" />
        </div>

        {/* 📸 영수증/사진 첨부 */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.navy }}>📸 영수증 · 사진 첨부</span>
            <button type="button" onClick={() => {
              const inp = document.getElementById("dr-img-input");
              if (inp) inp.click();
            }} disabled={imgUploading} style={{ ...miniBtn, background: "#E8F5E9", color: C.success, cursor: "pointer" }}>
              {imgUploading ? "업로드 중..." : "📷 추가"}
            </button>
            <input id="dr-img-input" type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: "none" }} />
          </div>
          {(form.images || []).length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
              {form.images.map((img, i) => (
                <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, background: "#f5f5f5" }}>
                  <img src={img.url} alt={img.name || "영수증"} onClick={() => setLightboxImg(img.url)}
                    style={{ width: "100%", height: 90, objectFit: "cover", cursor: "pointer", display: "block" }} />
                  <button onClick={() => removeImage(i)}
                    style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", lineHeight: "20px", padding: 0, textAlign: "center" }}>✕</button>
                  <div style={{ fontSize: 9, color: C.gray, padding: "2px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name || "사진"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div onClick={() => { const inp = document.getElementById("dr-img-input"); if (inp) inp.click(); }}
              style={{ fontSize: 11, color: C.gray, textAlign: "center", padding: "16px 0", background: C.bg, borderRadius: 8, border: `1px dashed ${C.border}`, cursor: "pointer" }}>
              📷 카드영수증, 현장사진 등을 첨부하세요
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 렌더: 월간 테이블 뷰 ──
  function renderTableView() {
    const filtered = selSite === "ALL" ? reports : reports.filter(r => r.site_code === selSite);
    const sorted = [...filtered].sort((a, b) => (a.report_date || "").localeCompare(b.report_date || ""));
    if (sorted.length === 0) return <div style={{ ...cardStyle, textAlign: "center", color: C.gray, padding: 30 }}>📋 이번 달 작성된 일보가 없습니다.</div>;

    return (
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {/* 사업장별 요약 */}
        {selSite === "ALL" && siteMonthSummary.length > 0 && (
          <div style={{ padding: 16, borderBottom: `2px solid ${C.lightGray}` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.navy, marginBottom: 10 }}>📊 사업장별 월 요약</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {siteMonthSummary.map(s => (
                <div key={s.code} style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }} onClick={() => setSelSite(s.code)}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.navy, marginBottom: 4 }}>{s.name} <span style={{ color: C.gray, fontWeight: 500 }}>{s.code}</span></div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.gold }}>{fmt(s.valetAmount)}원</div>
                  <div style={{ fontSize: 10, color: C.gray }}>{s.days}일 · 발렛 {fmt(s.valetCount)}건 · {s.confirmed}일 확정</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* 일자별 테이블 */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.navy }}>
                {["날짜", "사업장", "발렛건수", "발렛비", "근무자", "상태", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 12px", color: C.white, fontWeight: 800, textAlign: i >= 2 && i <= 4 ? "right" : "left", whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const staff = staffMap[r.id] || [];
                const isConfirmed = r.status === "confirmed";
                return (
                  <tr key={r.id} style={{ background: idx % 2 === 0 ? C.white : C.bg, borderBottom: `1px solid ${C.lightGray}` }}
                    onClick={() => { setSelDate(r.report_date); setViewMode("calendar"); setEditMode(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F0F4FF"}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? C.white : C.bg}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{r.report_date.slice(5)}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{getSiteName(r.site_code)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>{fmt(r.valet_count)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 800, color: C.navy }}>{fmt(r.valet_amount)}원</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: C.gray }}>{staff.length}명</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: isConfirmed ? "#E8F5E9" : "#FFF8E1", color: isConfirmed ? C.success : "#F57F17" }}>
                        {isConfirmed ? "확정" : "미확정"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={ev => { ev.stopPropagation(); startEdit(r); setViewMode("calendar"); }} style={{ ...miniBtn, background: C.white, color: C.navy, border: `1px solid ${C.border}` }}>수정</button>
                    </td>
                  </tr>
                );
              })}
              {/* 합계행 */}
              <tr style={{ background: C.navy }}>
                <td style={{ padding: "10px 12px", color: C.white, fontWeight: 900 }} colSpan={2}>합계 ({sorted.length}일)</td>
                <td style={{ padding: "10px 12px", color: C.white, fontWeight: 900, textAlign: "right" }}>{fmt(sorted.reduce((s, r) => s + toNum(r.valet_count), 0))}</td>
                <td style={{ padding: "10px 12px", color: C.gold, fontWeight: 900, textAlign: "right" }}>{fmt(sorted.reduce((s, r) => s + toNum(r.valet_amount), 0))}원</td>
                <td style={{ padding: "10px 12px", color: C.white, fontWeight: 700, textAlign: "right" }}>{sorted.reduce((s, r) => s + (staffMap[r.id] || []).length, 0)}명</td>
                <td colSpan={2} style={{ padding: "10px 12px", color: "#81C784", fontWeight: 700, fontSize: 11 }}>확정 {sorted.filter(r => r.status === "confirmed").length}일</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── 메인 렌더 ──
  return (
    <div>
      {/* ── 헤더 ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.dark, margin: 0 }}>📋 현장 일보 관리</h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {/* 일괄확정 */}
          {kpiStats.submitted > 0 && (
            <button onClick={handleBatchConfirm} disabled={saving}
              style={{ ...btnSmall, padding: "6px 14px", fontSize: 11, borderRadius: 8, background: C.success, color: C.white, fontWeight: 800, fontFamily: FONT, border: "none", cursor: "pointer" }}>
              ✅ 일괄확정 ({kpiStats.submitted})
            </button>
          )}
          {reports.length > 0 && (
            <button onClick={handleExportExcel}
              style={{ ...btnSmall, padding: "6px 14px", fontSize: 11, borderRadius: 8, background: "#E8F5E9", color: "#2E7D32", fontWeight: 800, fontFamily: FONT, border: "1px solid #A5D6A7", cursor: "pointer" }}>
              📥 엑셀
            </button>
          )}
          {/* 뷰 모드 토글 */}
          <div style={{ display: "flex", gap: 4, background: C.lightGray, borderRadius: 8, padding: 3 }}>
            {[["grid", "🃏 그리드"], ["table", "📊 목록"]].map(([k, v]) => (
              <button key={k} onClick={() => setViewMode(k)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, background: viewMode === k ? C.white : "transparent", color: viewMode === k ? C.navy : C.gray, boxShadow: viewMode === k ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <>
          {/* ── 날짜 네비게이션 ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "10px 16px" }}>
            <button onClick={() => {
              const [y, m] = selMonth.split("-").map(Number);
              const ny = m === 1 ? y - 1 : y;
              const nm = m === 1 ? 12 : m - 1;
              const newMonth = `${ny}-${String(nm).padStart(2, "0")}`;
              const [, , dd] = selDate.split("-").map(Number);
              const maxDay = new Date(ny, nm, 0).getDate();
              const newDay = Math.min(dd, maxDay);
              const newDate = `${newMonth}-${String(newDay).padStart(2, "0")}`;
              setSelMonth(newMonth); setSelDate(newDate);
            }} style={{ ...btnSmall, padding: "4px 10px", fontSize: 11, background: C.lightGray, color: C.dark }}>◀ 월</button>
            <button onClick={prevDay} style={{ ...btnSmall, padding: "4px 10px", fontSize: 11, background: C.lightGray, color: C.dark }}>◀ 일</button>
            <input type="date" value={selDate} onChange={e => { setSelDate(e.target.value); setSelMonth(e.target.value.slice(0,7)); }}
              style={{ ...inputStyle, width: 140, fontSize: 13, fontWeight: 700, color: C.navy, textAlign: "center", padding: "6px 10px" }} />
            <button onClick={nextDay} style={{ ...btnSmall, padding: "4px 10px", fontSize: 11, background: C.lightGray, color: C.dark }}>일 ▶</button>
            <button onClick={() => {
              const [y, m] = selMonth.split("-").map(Number);
              const ny = m === 12 ? y + 1 : y;
              const nm = m === 12 ? 1 : m + 1;
              const newMonth = `${ny}-${String(nm).padStart(2, "0")}`;
              const [, , dd] = selDate.split("-").map(Number);
              const maxDay = new Date(ny, nm, 0).getDate();
              const newDay = Math.min(dd, maxDay);
              const newDate = `${newMonth}-${String(newDay).padStart(2, "0")}`;
              setSelMonth(newMonth); setSelDate(newDate);
            }} style={{ ...btnSmall, padding: "4px 10px", fontSize: 11, background: C.lightGray, color: C.dark }}>월 ▶</button>
            {selDate !== todayStr && (
              <button onClick={() => { setSelDate(todayStr); setSelMonth(todayStr.slice(0,7)); }} style={{ ...btnSmall, padding: "4px 10px", fontSize: 11, background: "#E3F2FD", color: C.navy }}>오늘</button>
            )}
          </div>

          {/* ── KPI 스트립 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
            {[
              { label: "전체 사업장", value: FIELD_SITES.length, sub: "운영 중", color: C.dark, click: "all" },
              { label: "확정 완료", value: kpiStats.confirmed, sub: "오늘 기준", color: C.success, click: "confirmed" },
              { label: "제출 미확정", value: kpiStats.submitted, sub: "확정 대기", color: "#1565C0", click: "submitted" },
              { label: "미제출", value: kpiStats.pending, sub: "보고 없음", color: "#9A6700", click: "pending" },
              { label: "오늘 총 발렛비", value: `${pFmt(kpiStats.totalValet)}원`, sub: `확정 ${pFmt(kpiStats.confirmedValet)}원`, color: C.navy, click: null },
            ].map((k, i) => (
              <div key={i} onClick={() => k.click && setStatusFilter(statusFilter === k.click ? "all" : k.click)}
                style={{ background: "#fff", borderRadius: 10, border: `1px solid ${k.click && statusFilter === k.click ? k.color : C.border}`, padding: "11px 14px", textAlign: "center", cursor: k.click ? "pointer" : "default", transition: "border-color 0.15s", outline: k.click && statusFilter === k.click ? `2px solid ${k.color}20` : "none" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{k.label}</div>
                <div style={{ fontSize: 10, color: k.color, marginTop: 2, fontWeight: 700 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── 상태 필터 ── */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            {[["all", `전체 (${FIELD_SITES.length})`], ["confirmed", `확정 (${kpiStats.confirmed})`], ["submitted", `미확정 (${kpiStats.submitted})`], ["pending", `미제출 (${kpiStats.pending})`]].map(([k, v]) => (
              <button key={k} onClick={() => setStatusFilter(k)}
                style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${statusFilter === k ? C.navy : C.border}`, background: statusFilter === k ? C.navy : "#fff", color: statusFilter === k ? "#fff" : C.gray, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                {v}
              </button>
            ))}
            {loading && <span style={{ fontSize: 11, color: C.gray, marginLeft: 6 }}>로딩 중...</span>}
          </div>

          {/* ── 카드 그리드 ── */}
          {renderGridView()}
        </>
      ) : (
        /* ── 테이블/달력 뷰 (기존 로직 유지) ── */
        <>
          {/* 사업장 필터 탭 */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
            <button onClick={() => setSelSite("ALL")} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${selSite === "ALL" ? C.navy : C.border}`, background: selSite === "ALL" ? C.navy : "#fff", color: selSite === "ALL" ? "#fff" : C.gray, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>전체</button>
            {FIELD_SITES.map(s => (
              <button key={s.code} onClick={() => setSelSite(s.code)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${selSite === s.code ? C.navy : C.border}`, background: selSite === s.code ? C.navy : "#fff", color: selSite === s.code ? "#fff" : C.gray, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>{s.name}</button>
            ))}
          </div>
          {renderStats()}
          {renderTableView()}
        </>
      )}

      {/* ── 슬라이드 패널 ── */}
      {renderSlidePanel()}

      {/* 이미지 라이트박스 */}
      {lightboxImg && (
        <div onClick={() => setLightboxImg(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={lightboxImg} alt="확대 보기" style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8, objectFit: "contain" }} />
          <button onClick={(e) => { e.stopPropagation(); setLightboxImg(null); }}
            style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── 16-3. 발렛맨 서비스 견적 시스템 (원본 완전 이식) ─────

/* ═══════════════════════════════════════════
   (주)미스터팍 발렛맨 서비스 견적 시스템
   좌: 견적산출표  |  우: 견적서 폼 (실시간 연동)
   ═══════════════════════════════════════════ */

/* Google Font: Noto Sans KR (숫자 가독성용) */
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap";
const numFont = "'Noto Sans KR', sans-serif";

const QC = {
  navy: "#1428A0",
  navyLight: "#1e3ab8",
  gold: "#F5B731",
  goldLight: "#fdf0d0",
  dark: "#222222",
  gray: "#666666",
  lightGray: "#f2f3f7",
  border: "#dde0e8",
  white: "#ffffff",
  red: "#E53935",
  green: "#43A047",
};

const QC_WEEKS = 4.345;
const qFmt = (n) => Math.round(n).toLocaleString("ko-KR");

/* 사업주 4대보험 계산 */
function calcEmployerIns(gross) {
  const npBase = Math.min(gross, 6370000);
  const np = Math.round(npBase * 0.0475);
  const hi = Math.round(gross * 0.03595);
  const lt = Math.round(hi * 0.1314);
  const ei = Math.round(gross * 0.0105);
  const wi = Math.round(gross * 0.0147);
  return { np, hi, lt, ei, wi, total: np + hi + lt + ei + wi };
}

/* 평일 인건비 산출 */
function calcWeekday(salary, headcount, start, end, breakMin) {
  const sh = parseInt(start.split(":")[0]), sm = parseInt(start.split(":")[1]);
  const eh = parseInt(end.split(":")[0]), em = parseInt(end.split(":")[1]);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  const actualH = Math.max(0, (totalMin - breakMin) / 60);
  const weeklyH = actualH * 5;
  const hasWL = weeklyH >= 15;
  const wlH = hasWL ? actualH : 0;
  const monthlyBasicH = weeklyH * QC_WEEKS;
  const monthlyWLH = wlH * QC_WEEKS;
  const ins = calcEmployerIns(salary);
  const retirement = Math.round(salary / 12);
  const perPerson = salary + ins.total + retirement;
  const totalPaidH = monthlyBasicH + monthlyWLH;
  const hrCost = totalPaidH > 0 ? Math.round(perPerson / totalPaidH) : 0;
  return { salary, ins, retirement, perPerson, total: perPerson * headcount, hrCost, actualH, weeklyH, hasWL, headcount };
}

/* 주말 인건비 산출 */
function calcWeekend(dailyPay, headcount, days, start, end, breakMin) {
  const sh = parseInt(start.split(":")[0]), sm = parseInt(start.split(":")[1]);
  const eh = parseInt(end.split(":")[0]), em = parseInt(end.split(":")[1]);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  const actualH = Math.max(0, (totalMin - breakMin) / 60);
  const monthlyPay = dailyPay * days * 5;
  const ins = calcEmployerIns(monthlyPay);
  const retirement = Math.round(monthlyPay / 12);
  const perPerson = monthlyPay + ins.total + retirement;
  const hrCost = actualH > 0 ? Math.round(perPerson / (actualH * days * QC_WEEKS)) : 0;
  return { dailyPay, monthlyPay, ins, retirement, perPerson, total: perPerson * headcount, hrCost, actualH, days, headcount };
}

function SalaryCalculatorPage() {
  /* ── 견적산출표 state ── */
  const [wdSalary, setWdSalary] = useState(2200000);
  const [wdHead, setWdHead] = useState(1);
  const [wdStart, setWdStart] = useState("09:00");
  const [wdEnd, setWdEnd] = useState("18:00");
  const [wdBreak, setWdBreak] = useState(60);

  const [weChecked, setWeChecked] = useState({ sat: true, sun: true });
  const [wePay, setWePay] = useState(120000);
  const [weHead, setWeHead] = useState(1);
  const [weStart, setWeStart] = useState("09:00");
  const [weEnd, setWeEnd] = useState("18:00");
  const [weBreak, setWeBreak] = useState(60);

  const [opSupport, setOpSupport] = useState(2000000);
  const [insurance, setInsurance] = useState(500000);

  /* ── 에누리 ── */
  const [discountMode, setDiscountMode] = useState("amount"); // "amount" | "percent"
  const [discountValue, setDiscountValue] = useState(0);

  /* ── 견적서 폼 state ── */
  const [clientSite, setClientSite] = useState("");
  const [contractType, setContractType] = useState("협의 (참고자료)");
  const [contractPeriod, setContractPeriod] = useState("기본 1년");
  const [operatingHours, setOperatingHours] = useState("추후협의 (09-18시 예시)");

  const printRef = useRef(null);

  /* ── 폰트 로드 ── */
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_LINK}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  /* ── 계산 ── */
  const weDays = (weChecked.sat ? 1 : 0) + (weChecked.sun ? 1 : 0);

  const weekday = useMemo(() => calcWeekday(wdSalary, wdHead, wdStart, wdEnd, wdBreak), [wdSalary, wdHead, wdStart, wdEnd, wdBreak]);
  const weekend = useMemo(() => calcWeekend(wePay, weHead, weDays, weStart, weEnd, weBreak), [wePay, weHead, weDays, weStart, weEnd, weBreak]);

  const laborWeekday = weekday.total;
  const laborWeekend = weDays > 0 ? weekend.total : 0;
  const rawSubtotal = laborWeekday + laborWeekend + opSupport + insurance;
  const discountAmt = discountMode === "percent" ? Math.round(rawSubtotal * discountValue / 100) : discountValue;
  const subtotal = Math.max(0, rawSubtotal - discountAmt);
  const vat = Math.round(subtotal * 0.1);
  const grandTotal = subtotal + vat;

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일`;

  /* ── 인쇄 ── */
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    // 클론 후 인라인 스타일 직접 수정
    const clone = el.cloneNode(true);
    // 메인 컨테이너 패딩 축소
    const main = clone.querySelector("div");
    if (main) { main.style.padding = "16px 24px"; main.style.maxWidth = "100%"; main.style.boxShadow = "none"; main.style.border = "none"; main.style.borderRadius = "0"; }
    // h1 축소
    const h1 = clone.querySelector("h1");
    if (h1) { h1.style.fontSize = "22px"; h1.style.marginBottom = "6px"; }
    // 모든 테이블 셀 패딩 축소
    clone.querySelectorAll("td, th").forEach(td => {
      td.style.padding = td.style.padding ? td.style.padding.replace(/\d+px/g, m => Math.round(parseInt(m) * 0.6) + "px") : "5px 8px";
    });
    // marginBottom 큰 것들 축소
    clone.querySelectorAll("div, table, p").forEach(d => {
      const mb = parseInt(d.style.marginBottom);
      if (mb > 10) d.style.marginBottom = Math.round(mb * 0.5) + "px";
      const mt = parseInt(d.style.marginTop);
      if (mt > 10) d.style.marginTop = Math.round(mt * 0.5) + "px";
      const pb = parseInt(d.style.paddingBottom);
      if (pb > 12) d.style.paddingBottom = Math.round(pb * 0.6) + "px";
      const pt = parseInt(d.style.paddingTop);
      if (pt > 12) d.style.paddingTop = Math.round(pt * 0.6) + "px";
    });
    // lineHeight 축소
    clone.querySelectorAll("div").forEach(d => {
      if (parseFloat(d.style.lineHeight) > 1.6) d.style.lineHeight = "1.4";
    });

    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>견적서</title>
      <link rel="stylesheet" href="${FONT_LINK}">
      <style>
        @page{size:A4;margin:8mm 12mm}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Noto Sans KR','맑은 고딕','Malgun Gothic',sans-serif;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      </style></head><body>${clone.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  /* ═══ 공통 스타일 ═══ */
  const sectionHeader = (num, title, sub) => (
    <div style={{ background: QC.navy, borderRadius: "12px 12px 0 0", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 24, height: 24, borderRadius: "50%", background: QC.gold, color: QC.navy, fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{num}</div>
      <span style={{ color: QC.white, fontWeight: 800, fontSize: 14 }}>{title}</span>
      {sub && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{sub}</span>}
    </div>
  );

  const inputStyle = { width: "100%", padding: "8px 12px", border: `1.5px solid ${QC.border}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: QC.white, outline: "none" };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: QC.gray, marginBottom: 4 };
  const chipActive = { padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 800, border: `2px solid ${QC.navy}`, background: QC.navy, color: QC.white, cursor: "pointer" };
  const chipInactive = { padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: `2px solid ${QC.border}`, background: QC.white, color: QC.gray, cursor: "pointer" };

  return (
    <div style={{ minHeight: "100vh", background: "#eef0f5", fontFamily: "'맑은 고딕','Malgun Gothic',sans-serif" }}>

      {/* ═══ 헤더 ═══ */}
      <div style={{ background: QC.navy, padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 12px rgba(20,40,160,0.3)" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: QC.gold, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, color: QC.navy }}>P</div>
        <div>
          <div style={{ color: QC.white, fontWeight: 900, fontSize: 16, letterSpacing: -0.5 }}>(주)미스터팍 발렛맨 서비스</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>견적 산출 · 견적서 자동 생성 시스템 · 2026</div>
        </div>
      </div>

      {/* ═══ 2컬럼 레이아웃 ═══ */}
      <div style={{ display: "flex", gap: 0, maxWidth: 1440, margin: "0 auto", minHeight: "calc(100vh - 64px)" }}>

        {/* ──────────────────────────────────
            좌측: 견적산출표
        ────────────────────────────────── */}
        <div style={{ flex: "0 0 520px", background: "#f6f7fb", padding: "20px 16px", overflowY: "auto", maxHeight: "calc(100vh - 64px)", borderRight: `1px solid ${QC.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: QC.navy, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>📊</span> 견적 산출표
            <span style={{ fontSize: 10, color: QC.gray, fontWeight: 500 }}>좌측 입력 → 우측 견적서 자동 반영</span>
          </div>

          {/* ── 1. 인건비 ── */}
          <div style={{ background: QC.white, borderRadius: 12, marginBottom: 12, overflow: "hidden", border: `1px solid ${QC.border}` }}>
            {sectionHeader("1", "인건비", "급여 + 사업주 4대보험 + 퇴직충당금")}
            <div style={{ padding: 16 }}>

              {/* 평일 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ background: QC.navy, color: QC.white, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6 }}>평일</span>
                  <span style={{ fontSize: 11, color: QC.gray }}>월 ~ 금 (주 5일)</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={labelStyle}>급여 (월급 총액)</label>
                    <input type="text" value={qFmt(wdSalary)} onChange={e => setWdSalary(parseInt(e.target.value.replace(/,/g,"")) || 0)} style={{ ...inputStyle, fontWeight: 700, fontSize: 15, textAlign: "right" }} />
                  </div>
                  <div>
                    <label style={labelStyle}>인원 (명)</label>
                    <input type="number" value={wdHead} min={1} onChange={e => setWdHead(parseInt(e.target.value) || 1)} style={{ ...inputStyle, textAlign: "center", fontWeight: 700 }} />
                  </div>
                </div>
                <label style={labelStyle}>근무시간</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <input type="time" value={wdStart} onChange={e => setWdStart(e.target.value)} style={{ ...inputStyle, flex: 1, textAlign: "center" }} />
                  <span style={{ color: QC.gray }}>~</span>
                  <input type="time" value={wdEnd} onChange={e => setWdEnd(e.target.value)} style={{ ...inputStyle, flex: 1, textAlign: "center" }} />
                  <input type="number" value={wdBreak} min={0} step={30} onChange={e => setWdBreak(parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: 56, textAlign: "center" }} />
                  <span style={{ fontSize: 11, color: QC.gray, whiteSpace: "nowrap" }}>분 휴게</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: QC.navy, fontWeight: 700 }}>
                  <span>실근무 {weekday.actualH.toFixed(1)}h/일</span>
                  <span>주 {weekday.weeklyH.toFixed(1)}h</span>
                  {weekday.hasWL && <span style={{ color: QC.green }}>✓ 주휴포함</span>}
                </div>

                {/* 1인 산출내역 */}
                <div style={{ marginTop: 10, background: QC.lightGray, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: QC.navy, marginBottom: 6 }}>1인 산출내역</div>
                  {[
                    ["급여", weekday.salary],
                    ["사업주 4대보험", weekday.ins.total],
                    ["퇴직충당금 (÷12)", weekday.retirement],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: QC.gray }}>{l}</span>
                      <span style={{ fontWeight: 700, fontFamily: numFont }}>{qFmt(v)}원</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${QC.border}`, marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ fontWeight: 800 }}>1인 합계</span>
                    <span style={{ fontWeight: 900, color: QC.navy, fontSize: 13, fontFamily: numFont }}>{qFmt(weekday.perPerson)}원</span>
                  </div>
                  <div style={{ marginTop: 6, background: QC.navy, color: QC.white, borderRadius: 6, padding: "5px 0", textAlign: "center", fontSize: 11, fontWeight: 800 }}>
                    환산시급 <span style={{ fontFamily: numFont }}>{qFmt(weekday.hrCost)}</span>원/h
                  </div>
                </div>
              </div>

              {/* 구분선 */}
              <div style={{ borderTop: `1.5px dashed ${QC.border}`, margin: "12px 0" }} />

              {/* 주말 */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ background: QC.gold, color: QC.navy, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6 }}>주말</span>
                  {["토", "일"].map(d => {
                    const key = d === "토" ? "sat" : "sun";
                    const active = weChecked[key];
                    return (
                      <button key={d} onClick={() => setWeChecked(p => ({ ...p, [key]: !p[key] }))}
                        style={{ ...(active ? chipActive : chipInactive), background: active ? QC.red : QC.white, borderColor: active ? QC.red : QC.border, color: active ? QC.white : QC.gray, padding: "4px 12px", fontSize: 13, fontWeight: 900 }}>
                        {d}
                      </button>
                    );
                  })}
                  <span style={{ fontSize: 11, color: QC.gray, marginLeft: "auto" }}>주 {weDays}일</span>
                </div>

                {weDays > 0 && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={labelStyle}>일당 (1일 금액)</label>
                        <input type="text" value={qFmt(wePay)} onChange={e => setWePay(parseInt(e.target.value.replace(/,/g,"")) || 0)} style={{ ...inputStyle, fontWeight: 700, fontSize: 15, textAlign: "right" }} />
                      </div>
                      <div>
                        <label style={labelStyle}>인원 (명)</label>
                        <input type="number" value={weHead} min={1} onChange={e => setWeHead(parseInt(e.target.value) || 1)} style={{ ...inputStyle, textAlign: "center", fontWeight: 700 }} />
                      </div>
                    </div>
                    <label style={labelStyle}>근무시간</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <input type="time" value={weStart} onChange={e => setWeStart(e.target.value)} style={{ ...inputStyle, flex: 1, textAlign: "center" }} />
                      <span style={{ color: QC.gray }}>~</span>
                      <input type="time" value={weEnd} onChange={e => setWeEnd(e.target.value)} style={{ ...inputStyle, flex: 1, textAlign: "center" }} />
                      <input type="number" value={weBreak} min={0} step={30} onChange={e => setWeBreak(parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: 56, textAlign: "center" }} />
                      <span style={{ fontSize: 11, color: QC.gray, whiteSpace: "nowrap" }}>분 휴게</span>
                    </div>
                    <div style={{ fontSize: 11, color: QC.navy, fontWeight: 700 }}>
                      실근무 {weekend.actualH.toFixed(1)}h/일
                    </div>

                    <div style={{ marginTop: 10, background: QC.lightGray, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: QC.navy, marginBottom: 6 }}>1인 산출내역</div>
                      {[
                        [`일당 × ${weDays}일 × 5주`, weekend.monthlyPay],
                        ["사업주 4대보험", weekend.ins.total],
                        ["퇴직충당금 (÷12)", weekend.retirement],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: QC.gray }}>{l}</span>
                          <span style={{ fontWeight: 700, fontFamily: numFont }}>{qFmt(v)}원</span>
                        </div>
                      ))}
                      <div style={{ borderTop: `1px solid ${QC.border}`, marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ fontWeight: 800 }}>1인 합계</span>
                        <span style={{ fontWeight: 900, color: QC.navy, fontSize: 13, fontFamily: numFont }}>{qFmt(weekend.perPerson)}원</span>
                      </div>
                      <div style={{ marginTop: 6, background: QC.navy, color: QC.white, borderRadius: 6, padding: "5px 0", textAlign: "center", fontSize: 11, fontWeight: 800 }}>
                        환산시급 <span style={{ fontFamily: numFont }}>{qFmt(weekend.hrCost)}</span>원/h
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── 2. 운영지원금 ── */}
          <div style={{ background: QC.white, borderRadius: 12, marginBottom: 12, overflow: "hidden", border: `1px solid ${QC.border}` }}>
            {sectionHeader("2", "운영지원금", "운영관리 + 사고 리스크 대비금")}
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {[1000000, 2000000, 3000000, 4000000, 5000000].map(v => (
                  <button key={v} onClick={() => setOpSupport(v)}
                    style={opSupport === v ? chipActive : chipInactive}>
                    {v / 10000}만
                  </button>
                ))}
              </div>
              <input type="text" value={qFmt(opSupport)} onChange={e => setOpSupport(parseInt(e.target.value.replace(/,/g,"")) || 0)}
                style={{ ...inputStyle, fontWeight: 800, fontSize: 16, textAlign: "right" }} />
              <div style={{ textAlign: "right", fontSize: 11, color: QC.gray, marginTop: 4 }}>월 운영지원금</div>
            </div>
          </div>

          {/* ── 3. 발렛보험비 ── */}
          <div style={{ background: QC.white, borderRadius: 12, marginBottom: 12, overflow: "hidden", border: `1px solid ${QC.border}` }}>
            {sectionHeader("3", "발렛보험비", "50만 ~ 200만원 (10만원 단위)")}
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {[500000, 1000000, 1500000, 2000000].map(v => (
                  <button key={v} onClick={() => setInsurance(v)}
                    style={insurance === v ? chipActive : chipInactive}>
                    {v / 10000}만
                  </button>
                ))}
              </div>
              <input type="text" value={qFmt(insurance)} onChange={e => setInsurance(parseInt(e.target.value.replace(/,/g,"")) || 0)}
                style={{ ...inputStyle, fontWeight: 800, fontSize: 16, textAlign: "right" }} />
              <div style={{ textAlign: "right", fontSize: 11, color: QC.gray, marginTop: 4 }}>월 발렛보험비</div>
            </div>
          </div>

          {/* ── 합계 요약 ── */}
          <div style={{ background: QC.navy, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>견적 합 소계</span>
            </div>
            {[
              ["1. 인건비 (평일)", laborWeekday],
              ["1. 인건비 (주말)", laborWeekend],
              ["2. 운영지원금", opSupport],
              ["3. 발렛보험비", insurance],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 3 }}>
                <span>{l}</span>
                <span style={{ fontWeight: 700, fontFamily: numFont }}>{qFmt(v)}원</span>
              </div>
            ))}

            {/* 에누리 표시 */}
            {discountAmt > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#ff9800", marginTop: 4 }}>
                <span>에누리 ({discountMode === "percent" ? `${discountValue}%` : "직접입력"})</span>
                <span style={{ fontWeight: 800, fontFamily: numFont }}>-{qFmt(discountAmt)}원</span>
              </div>
            )}

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 8, paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: QC.gold, fontWeight: 800, fontSize: 13 }}>총 견적금액 (부가세 별도)</span>
                <span style={{ color: QC.gold, fontWeight: 900, fontSize: 22, fontFamily: numFont }}>{qFmt(subtotal)}원</span>
              </div>
              {discountAmt > 0 && (
                <div style={{ textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.35)", textDecoration: "line-through", marginTop: 1 }}>
                  {qFmt(rawSubtotal)}원
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                <span>+ 부가세 (10%)</span>
                <span style={{ fontFamily: numFont }}>{qFmt(vat)}원</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: QC.white, fontWeight: 900, marginTop: 4 }}>
                <span>합계 (VAT 포함)</span>
                <span style={{ fontFamily: numFont }}>{qFmt(grandTotal)}원</span>
              </div>
            </div>
          </div>

          {/* ── 에누리 ── */}
          <div style={{ background: QC.white, borderRadius: 12, overflow: "hidden", border: `1px solid ${QC.border}` }}>
            <div style={{ background: "#ff9800", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>🏷️</span>
              <span style={{ color: QC.white, fontWeight: 800, fontSize: 14 }}>에누리 (할인)</span>
              {discountAmt > 0 && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}>-{qFmt(discountAmt)}원 적용중</span>}
            </div>
            <div style={{ padding: 16 }}>
              {/* 모드 선택 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[["amount", "금액 직접입력"], ["percent", "% 할인율"]].map(([k, v]) => (
                  <button key={k} onClick={() => { setDiscountMode(k); setDiscountValue(0); }}
                    style={discountMode === k ? { ...chipActive, background: "#ff9800", borderColor: "#ff9800" } : chipInactive}>
                    {v}
                  </button>
                ))}
                {discountAmt > 0 && (
                  <button onClick={() => setDiscountValue(0)}
                    style={{ ...chipInactive, color: QC.red, borderColor: QC.red, marginLeft: "auto", fontSize: 11 }}>
                    초기화
                  </button>
                )}
              </div>

              {discountMode === "percent" ? (
                <>
                  {/* % 버튼 */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {[3, 5, 7, 10, 15, 20].map(p => (
                      <button key={p} onClick={() => setDiscountValue(p)}
                        style={discountValue === p
                          ? { ...chipActive, background: "#ff9800", borderColor: "#ff9800" }
                          : chipInactive}>
                        {p}%
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" value={discountValue} min={0} max={50} step={1}
                      onChange={e => setDiscountValue(Math.min(50, Math.max(0, parseInt(e.target.value) || 0)))}
                      style={{ ...inputStyle, width: 80, textAlign: "center", fontWeight: 800, fontSize: 18 }} />
                    <span style={{ fontWeight: 800, color: "#ff9800", fontSize: 16 }}>%</span>
                    <span style={{ fontSize: 12, color: QC.gray, marginLeft: "auto" }}>= -{qFmt(discountAmt)}원</span>
                  </div>
                </>
              ) : (
                <>
                  {/* 금액 버튼 */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {[100000, 200000, 300000, 500000].map(v => (
                      <button key={v} onClick={() => setDiscountValue(v)}
                        style={discountValue === v
                          ? { ...chipActive, background: "#ff9800", borderColor: "#ff9800" }
                          : chipInactive}>
                        {v / 10000}만
                      </button>
                    ))}
                  </div>
                  <input type="text" value={qFmt(discountValue)}
                    onChange={e => setDiscountValue(Math.max(0, parseInt(e.target.value.replace(/,/g,"")) || 0))}
                    style={{ ...inputStyle, fontWeight: 800, fontSize: 16, textAlign: "right" }} />
                  {discountValue > 0 && rawSubtotal > 0 && (
                    <div style={{ textAlign: "right", fontSize: 11, color: "#ff9800", marginTop: 4, fontWeight: 700 }}>
                      할인율 약 {(discountAmt / rawSubtotal * 100).toFixed(1)}%
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────
            우측: 견적서 폼
        ────────────────────────────────── */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", maxHeight: "calc(100vh - 64px)" }}>

          {/* 견적서 정보 입력 (인쇄 안됨) */}
          <div style={{ background: QC.white, borderRadius: 12, border: `1px solid ${QC.border}`, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: QC.navy, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>📝</span> 견적서 정보 입력
              <span style={{ fontSize: 10, color: QC.gray, fontWeight: 500 }}>아래 입력 → 견적서에 자동 반영</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>현장명</label>
                <input value={clientSite} onChange={e => setClientSite(e.target.value)} placeholder="예: OO병원, OO아파트" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>계약형태</label>
                <input value={contractType} onChange={e => setContractType(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>계약기간</label>
                <input value={contractPeriod} onChange={e => setContractPeriod(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>운영시간</label>
                <input value={operatingHours} onChange={e => setOperatingHours(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <button onClick={handlePrint} style={{ marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: QC.navy, color: QC.white, fontWeight: 900, fontSize: 14, cursor: "pointer", letterSpacing: -0.3 }}>
              🖨️ 견적서 인쇄 / PDF 저장
            </button>
          </div>

          {/* ═══ 견적서 폼 (A4 미리보기) ═══ */}
          <div ref={printRef}>
            <div style={{
              width: "100%", maxWidth: 680, margin: "0 auto",
              background: QC.white, borderRadius: 4, padding: "40px 36px",
              boxShadow: "0 2px 20px rgba(0,0,0,0.08)", border: `1px solid ${QC.border}`,
              fontFamily: "'맑은 고딕','Malgun Gothic',sans-serif", color: QC.dark, lineHeight: 1.6,
            }}>

              {/* 타이틀 */}
              <h1 style={{ fontSize: 28, fontWeight: 900, color: QC.dark, margin: "0 0 12px 0", letterSpacing: -0.5 }}>주차관리 서비스 견적서</h1>

              {/* 인사말 */}
              <div style={{ fontSize: 12, color: QC.gray, lineHeight: 1.9, marginBottom: 20 }}>
                최고의 고객 감동으로 사업체의 발전을 최우선하는 발렛맨입니다.<br />
                언제나 한결같은 마음가짐과 늘 발전하는 모습으로 나아갈 것을 약속드립니다.
              </div>

              {/* 정보 테이블 (좌: 고객/계약 정보, 우: 회사 정보) */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 12, border: `1px solid ${QC.border}`, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "35%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "35%" }} />
                </colgroup>
                <tbody>
                  {[
                    { leftLabel: "현장명", leftVal: clientSite || "(미입력)", rightLabel: "상호명", rightVal: "㈜미스터팍" },
                    { leftLabel: "견적일", leftVal: dateStr, rightLabel: "대표", rightVal: "이지섭" },
                    { leftLabel: "계약형태", leftVal: contractType, rightLabel: "등록번호", rightVal: "102-88-01109" },
                    { leftLabel: "계약기간", leftVal: contractPeriod, rightLabel: "주소", rightVal: "인천광역시 연수구 갯벌로 12, 인천테크노파크 갯벌타워 1501A,B호" },
                    { leftLabel: "운영시간", leftVal: operatingHours, rightLabel: "전화", rightVal: "1899-1871" },
                  ].map((row, i) => {
                    const thStyle = { padding: "10px 14px", background: "#f4f5f8", fontWeight: 700, color: QC.dark, textAlign: "center", borderBottom: `1px solid ${QC.border}`, borderRight: `1px solid ${QC.border}`, fontSize: 12, whiteSpace: "nowrap" };
                    const tdStyle = { padding: "10px 14px", borderBottom: `1px solid ${QC.border}`, borderRight: `1px solid ${QC.border}`, fontSize: 12, color: row.leftVal.includes("미입력") ? "#bbb" : QC.dark, textAlign: "center", wordBreak: "keep-all" };
                    const thStyleR = { ...thStyle, background: "#eef0f6", color: QC.navy };
                    const tdStyleR = { padding: "10px 14px", borderBottom: `1px solid ${QC.border}`, fontSize: 12, color: QC.dark, textAlign: "center", wordBreak: "keep-all" };
                    return (
                      <tr key={i}>
                        <td style={thStyle}>{row.leftLabel}</td>
                        <td style={tdStyle}>{row.leftVal}</td>
                        <td style={thStyleR}>{row.rightLabel}</td>
                        <td style={tdStyleR}>{row.rightVal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* 견적 금액 하이라이트 */}
              <div style={{ background: QC.navy, borderRadius: 8, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: QC.white, fontWeight: 800, fontSize: 14 }}>견적금액 (부가세 별도)</div>
                <div style={{ color: QC.gold, fontWeight: 900, fontSize: 24, letterSpacing: -0.5, fontFamily: numFont }}>₩ {qFmt(subtotal)}</div>
              </div>

              {/* 상세 내역 테이블 */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 12 }}>
                <thead>
                  <tr style={{ background: QC.navy }}>
                    <th style={{ padding: "8px 10px", color: QC.white, fontWeight: 700, textAlign: "left", fontSize: 11, width: 36 }}>No</th>
                    <th style={{ padding: "8px 10px", color: QC.white, fontWeight: 700, textAlign: "left", fontSize: 11 }}>항목</th>
                    <th style={{ padding: "8px 10px", color: QC.white, fontWeight: 700, textAlign: "right", fontSize: 11 }}>금액</th>
                    <th style={{ padding: "8px 10px", color: QC.white, fontWeight: 700, textAlign: "center", fontSize: 11, width: 50 }}>인원</th>
                    <th style={{ padding: "8px 10px", color: QC.white, fontWeight: 700, textAlign: "right", fontSize: 11 }}>소계</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { no: 1, name: "인건비 (평일 / 주5일)", amount: weekday.perPerson, qty: wdHead, sub: laborWeekday, detail: `월급 ${qFmt(wdSalary)}원 + 4대보험 + 퇴직충당금` },
                    ...(weDays > 0 ? [{ no: 2, name: `인건비 (주말 / 주${weDays}일)`, amount: weekend.perPerson, qty: weHead, sub: laborWeekend, detail: `일당 ${qFmt(wePay)}원 × ${weDays}일 × 5주 + 4대보험 + 퇴직충당금` }] : []),
                    { no: weDays > 0 ? 3 : 2, name: "운영지원금", amount: opSupport, qty: 1, sub: opSupport, detail: "운영관리 + 사고 리스크 대비" },
                    { no: weDays > 0 ? 4 : 3, name: "발렛보험비", amount: insurance, qty: 1, sub: insurance, detail: "발렛 차량 사고 보험" },
                  ].map((row, i) => (
                    <>
                      <tr key={row.no} style={{ borderBottom: `1px solid ${QC.border}`, background: i % 2 === 0 ? QC.white : "#fafbfd" }}>
                        <td style={{ padding: "9px 10px", fontWeight: 700, color: QC.navy }}>{row.no}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 700 }}>{row.name}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: numFont }}>{qFmt(row.amount)}</td>
                        <td style={{ padding: "9px 10px", textAlign: "center" }}>{row.qty}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, fontFamily: numFont }}>{qFmt(row.sub)}</td>
                      </tr>
                      <tr key={`d-${row.no}`} style={{ borderBottom: `1px solid ${QC.border}` }}>
                        <td />
                        <td colSpan={4} style={{ padding: "4px 10px 8px", fontSize: 10, color: QC.gray }}>{row.detail}</td>
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>

              {/* 합계 영역 */}
              <div style={{ borderTop: `2px solid ${QC.navy}`, paddingTop: 12, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: QC.gray }}>공급가액 소계</span>
                  <span style={{ fontWeight: 700, fontFamily: numFont }}>₩ {qFmt(rawSubtotal)}</span>
                </div>
                {discountAmt > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: "#ff9800" }}>
                    <span style={{ fontWeight: 700 }}>에누리 {discountMode === "percent" ? `(${discountValue}%)` : ""}</span>
                    <span style={{ fontWeight: 800, fontFamily: numFont }}>- ₩ {qFmt(discountAmt)}</span>
                  </div>
                )}
                {discountAmt > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: QC.gray }}>공급가액 (에누리 적용)</span>
                    <span style={{ fontWeight: 700, fontFamily: numFont }}>₩ {qFmt(subtotal)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: QC.gray }}>부가세 (10%)</span>
                  <span style={{ fontWeight: 700, fontFamily: numFont }}>₩ {qFmt(vat)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 900, marginTop: 8, padding: "10px 14px", background: QC.goldLight, borderRadius: 6, border: `1.5px solid ${QC.gold}` }}>
                  <span style={{ color: QC.navy }}>합계 (VAT 포함)</span>
                  <span style={{ color: QC.navy, fontFamily: numFont }}>₩ {qFmt(grandTotal)}</span>
                </div>
              </div>

              {/* 운영 중점 사항 */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: QC.dark, marginBottom: 12 }}>· 운영 중점 사항</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, lineHeight: 1.9 }}>
                  <tbody>
                    <tr style={{ verticalAlign: "top" }}>
                      <td style={{ width: 130, padding: "8px 0", fontWeight: 400, color: QC.dark, whiteSpace: "nowrap" }}>발렛요원 서비스 차별화</td>
                      <td style={{ padding: "8px 0 8px 16px", color: QC.dark }}>
                        <div>-전문 서비스 강사 교육 이수자 현장 투입</div>
                        <div>-고객 편의를 고려하는 감성 케어 서비스 제공</div>
                        <div>-매월 고객사 의견 수렴, 서비스 태도 부족 시 <strong>경고 및 교체 처리</strong></div>
                      </td>
                    </tr>
                    <tr style={{ verticalAlign: "top" }}>
                      <td style={{ padding: "8px 0", fontWeight: 400, color: QC.dark, whiteSpace: "nowrap" }}>현장 불편 최소화</td>
                      <td style={{ padding: "8px 0 8px 16px", color: QC.dark }}>
                        <div>-<strong>국내 유일 발렛 전용(주차장 및 도로) 보험 소유 (DB손해보험, 현대해상)</strong></div>
                        <div>-고객 차량 사고 시 보험 처리로 발생되는 자기 부담금 당사 전체 부담</div>
                        <div>-발렛비(주차 요금) 징수 방법 고객사 선택 가능 (현금, 카드 등) 필요시</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 하단 구분선 */}
              <div style={{ height: 2, background: QC.gold, borderRadius: 2, marginBottom: 20 }} />

              {/* 최하단 */}
              <div style={{ textAlign: "center", fontSize: 9, color: "#bbb", marginTop: 16 }}>
                본 견적서는 (주)미스터팍 견적시스템에서 자동 생성되었습니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 16-5. 급여대장 모듈 (v8.2) ────────────────────────
const PY_TAX_TYPES = [
  { key: "4대보험", label: "4대보험", color: "#1428A0" },
  { key: "3.3%", label: "3.3%", color: "#E97132" },
  { key: "3.3%(타인)", label: "3.3%(타인)", color: "#E97132" },
  { key: "고용&산재", label: "고용&산재", color: "#156082" },
  { key: "미신고", label: "미신고", color: "#999" },
];

const PY_PAY_FIELDS = [
  { key: "basic_pay", label: "기본급" },
  { key: "meal", label: "식대" },
  { key: "childcare", label: "보육수당" },
  { key: "car_allow", label: "자가운전" },
  { key: "team_allow", label: "팀장수당" },
  { key: "holiday_bonus", label: "명절상여" },
  { key: "incentive", label: "인센티브" },
  { key: "extra_work", label: "추가근무" },
  { key: "manual_write", label: "수기수당" },
  { key: "extra1", label: "기타수당" },
];

const PY_DED_FIELDS_4 = [
  { key: "np", label: "국민연금" },
  { key: "hi", label: "건강보험" },
  { key: "lt", label: "장기요양" },
  { key: "ei", label: "고용보험" },
  { key: "income_tax", label: "소득세" },
  { key: "local_tax", label: "지방소득세" },
];

function calcPyDeductions(record) {
  const gross = (record.basic_pay || 0) + (record.meal || 0) + (record.childcare || 0) +
    (record.car_allow || 0) + (record.team_allow || 0) + (record.holiday_bonus || 0) +
    (record.incentive || 0) + (record.extra_work || 0) + (record.manual_write || 0) + (record.extra1 || 0);

  let np=0, hi=0, lt=0, ei=0, income_tax=0, local_tax=0;

  if (record.tax_type === "3.3%" || record.tax_type === "3.3%(타인)") {
    income_tax = Math.round(gross * 0.03);
    local_tax = Math.round(gross * 0.003);
  }
  // 4대보험 → 수동입력 (자동계산 금지)
  // 고용&산재 → 수동입력
  // 미신고 → 전부 0

  const tot_ded = np + hi + lt + ei + income_tax + local_tax +
    (record.accident_deduct || 0) + (record.prepaid || 0);
  return { np, hi, lt, ei, income_tax, local_tax, gross_pay: gross, net_pay: gross - tot_ded };
}

function PayrollPage({ employees, profitState }) {
  const confirm = useConfirm();
  const now = new Date();
  const [pyYear, setPyYear] = useState(now.getFullYear());
  const [pyMonth, setPyMonth] = useState(now.getMonth() + 1);
  const [pyMonthData, setPyMonthData] = useState(null); // payroll_months row
  const [pyRecords, setPyRecords] = useState([]);
  const [pyLoading, setPyLoading] = useState(false);
  const [pySiteTab, setPySiteTab] = useState("all");
  const [pyEditRecord, setPyEditRecord] = useState(null); // slide panel
  const [pyEditTab, setPyEditTab] = useState("pay"); // pay / deduct / summary
  const [pySaving, setPySaving] = useState(false);
  const [pyBatchCreating, setPyBatchCreating] = useState(false);
  const [pyViewMode, setPyViewMode] = useState("payroll"); // payroll | transfer | payslip

  // ── 급여내역서 state ──
  const [psSlips, setPsSlips] = useState([]);
  const [psLoading, setPsLoading] = useState(false);
  const [psSending, setPsSending] = useState(false);
  const [psSelectedIds, setPsSelectedIds] = useState(new Set()); // employee_id Set

  // 급여내역서 로딩
  const loadPayslips = useCallback(async () => {
    setPsLoading(true);
    const { data } = await supabase.from("payslips")
      .select("*").eq("year", pyYear).eq("month", pyMonth).order("site_code");
    setPsSlips(data || []);
    setPsLoading(false);
  }, [pyYear, pyMonth]);

  useEffect(() => { if (pyViewMode === "payslip") loadPayslips(); }, [pyViewMode, loadPayslips]);

  // 발송 대상 slip 생성 헬퍼
  const buildSlip = (r) => {
    const emp = empMap[r.employee_id];
    const gross = PY_PAY_FIELDS.reduce((s, f) => s + (r[f.key] || 0), 0);
    const totDed = (r.np || 0) + (r.hi || 0) + (r.lt || 0) + (r.ei || 0) +
      (r.income_tax || 0) + (r.local_tax || 0) + (r.accident_deduct || 0) + (r.prepaid || 0);
    return {
      year: pyYear, month: pyMonth,
      employee_id: r.employee_id,
      emp_no: emp?.emp_no || "", emp_name: emp?.name || "",
      site_code: r.site_code || "",
      basic_pay: r.basic_pay || 0, meal: r.meal || 0,
      childcare: r.childcare || 0, car_allow: r.car_allow || 0,
      team_allow: r.team_allow || 0, holiday_bonus: r.holiday_bonus || 0,
      incentive: r.incentive || 0, extra_work: r.extra_work || 0,
      manual_write: r.manual_write || 0, extra1: r.extra1 || 0,
      gross_pay: gross,
      tax_type: r.tax_type || "4대보험",
      np: r.np || 0, hi: r.hi || 0, lt: r.lt || 0, ei: r.ei || 0,
      income_tax: r.income_tax || 0, local_tax: r.local_tax || 0,
      accident_deduct: r.accident_deduct || 0, prepaid: r.prepaid || 0,
      total_deduct: totDed, net_pay: gross - totDed,
      bank_name: emp?.bank_name || "", account_no: emp?.account_number || "",
      account_holder: emp?.account_holder || "",
      status: "sent", is_read: false, read_at: null,
      sent_at: new Date().toISOString(),
    };
  };

  // 급여내역서 발송 (선택 or 전체)
  const handleSendPayslips = async (mode) => {
    if (!pyMonthData || pyMonthData.status !== "confirmed") {
      alert("급여가 확정된 후에만 내역서를 발송할 수 있습니다.");
      return;
    }
    const targets = mode === "selected"
      ? pyRecords.filter(r => psSelectedIds.has(r.employee_id))
      : pyRecords;
    if (targets.length === 0) { alert("발송 대상이 없습니다."); return; }
    const label = mode === "selected" ? `선택한 ${targets.length}명` : `전 직원 ${targets.length}명`;
    const ok = await confirm("급여내역서 발송",
      `${pyYear}년 ${pyMonth}월 급여내역서를 ${label}에게 발송하시겠습니까?\n\n기존 발송 내역이 있으면 덮어씁니다.`,
      { okLabel: "발송", okColor: C.navy });
    if (!ok) return;
    setPsSending(true);
    try {
      const slips = targets.map(buildSlip);
      const { error } = await supabase.from("payslips").upsert(slips, { onConflict: "employee_id,year,month" });
      if (error) throw error;
      await loadPayslips();
      setPsSelectedIds(new Set());
      alert(`✅ ${slips.length}명에게 급여내역서가 발송되었습니다.`);
    } catch (err) { alert("발송 오류: " + err.message); }
    setPsSending(false);
  };

  // 개별 내역서 삭제
  const handleDeletePayslip = async (slipId) => {
    const ok = await confirm("삭제", "이 급여내역서를 삭제하시겠습니까?", { okLabel: "삭제", okColor: C.error });
    if (!ok) return;
    await supabase.from("payslips").delete().eq("id", slipId);
    setPsSlips(prev => prev.filter(s => s.id !== slipId));
  };

  // 월 데이터 로딩
  const loadPayrollMonth = useCallback(async () => {
    setPyLoading(true);
    const { data: mData } = await supabase.from("payroll_months")
      .select("*").eq("year", pyYear).eq("month", pyMonth).maybeSingle();
    setPyMonthData(mData || null);

    if (mData) {
      const { data: recs } = await supabase.from("payroll_records")
        .select("*").eq("month_id", mData.id).order("site_code");
      setPyRecords(recs || []);
    } else {
      setPyRecords([]);
    }
    setPyLoading(false);
  }, [pyYear, pyMonth]);

  useEffect(() => { loadPayrollMonth(); }, [loadPayrollMonth]);

  // 월 급여대장 생성 (재직 직원 기준 레코드 일괄 생성)
  const handleCreateMonth = async () => {
    const ok = await confirm("급여대장 생성", `${pyYear}년 ${pyMonth}월 급여대장을 생성하시겠습니까?\n재직 직원 기준으로 레코드가 자동 생성됩니다.`, { okLabel: "생성", okColor: C.navy });
    if (!ok) return;
    setPyBatchCreating(true);
    try {
      // 1. payroll_months 생성
      const { data: newMonth, error: mErr } = await supabase.from("payroll_months")
        .insert({ year: pyYear, month: pyMonth, status: "draft" })
        .select().single();
      if (mErr) throw mErr;

      // 2. 재직 직원 기준 레코드 생성
      const activeEmps = employees.filter(e => e.status === "재직");
      const records = activeEmps.map(e => ({
        month_id: newMonth.id,
        employee_id: e.id,
        site_code: e.site_code_1 || "V000",
        work_type: e.work_code || e.work_type || "",
        basic_pay: e.base_salary || 0,
        meal: e.meal_allow || 200000,
        childcare: e.childcare_allow || 0,
        car_allow: e.car_allow || 0,
        team_allow: e.leader_allow || 0,
        holiday_bonus: e.holiday_bonus || 0,
        incentive: e.incentive || 0,
        extra1: e.extra1 || 0,
        tax_type: e.tax_type || "4대보험",
        reporter_name: e.reporter_name || "",
        reporter_rrn: e.reporter_rrn || "",
      }));

      // gross, net 계산 후 저장
      const finalRecords = records.map(r => {
        const calc = calcPyDeductions(r);
        return { ...r, gross_pay: calc.gross_pay, net_pay: calc.gross_pay }; // 초기 생성 시 공제 미적용
      });

      if (finalRecords.length > 0) {
        const { error: rErr } = await supabase.from("payroll_records").insert(finalRecords);
        if (rErr) throw rErr;
      }

      await loadPayrollMonth();
    } catch (err) {
      alert("급여대장 생성 오류: " + err.message);
    }
    setPyBatchCreating(false);
  };

  // 레코드 저장
  const savePayrollRecord = async (rec) => {
    setPySaving(true);
    try {
      const gross = PY_PAY_FIELDS.reduce((s, f) => s + (rec[f.key] || 0), 0);
      const totDed = (rec.np || 0) + (rec.hi || 0) + (rec.lt || 0) + (rec.ei || 0) +
        (rec.income_tax || 0) + (rec.local_tax || 0) + (rec.accident_deduct || 0) + (rec.prepaid || 0);
      const net = gross - totDed;
      const updated = { ...rec, gross_pay: gross, net_pay: net };
      delete updated.created_at;
      const { error } = await supabase.from("payroll_records").update(updated).eq("id", rec.id);
      if (error) throw error;
      setPyRecords(prev => prev.map(r => r.id === rec.id ? updated : r));
      setPyEditRecord(updated);
    } catch (err) { alert("저장 오류: " + err.message); }
    setPySaving(false);
  };

  // 급여 확정
  const handleConfirmPayroll = async () => {
    if (!pyMonthData) return;
    const totalGross = pyRecords.reduce((s, r) => s + (r.gross_pay || 0), 0);
    const totalNet = pyRecords.reduce((s, r) => s + (r.net_pay || 0), 0);
    const ok = await confirm("급여 확정",
      `${pyYear}년 ${pyMonth}월 급여를 확정하시겠습니까?\n\n총 ${pyRecords.length}명\n급여총계: ${fmt(totalGross)}원\n실입금합계: ${fmt(totalNet)}원\n\n확정 후 site_revenue.labor_fixed가 자동 업데이트됩니다.`,
      { okLabel: "확정", okColor: C.navy });
    if (!ok) return;

    try {
      // 1. 사업장별 급여 합산 → site_revenue.labor_fixed 업데이트
      const bySite = {};
      pyRecords.forEach(r => {
        if (!r.site_code) return;
        bySite[r.site_code] = (bySite[r.site_code] || 0) + (r.gross_pay || 0);
      });
      const monthStr = `${pyYear}-${String(pyMonth).padStart(2, "0")}`;
      for (const [siteCode, total] of Object.entries(bySite)) {
        await supabase.from("site_revenue")
          .upsert({ site_code: siteCode, month: monthStr, labor_fixed: Math.round(total) },
            { onConflict: "site_code,month" });
      }

      // 2. payroll_months 상태 확정
      await supabase.from("payroll_months")
        .update({ status: "confirmed", total_gross: totalGross, total_net: totalNet, closed_at: new Date().toISOString() })
        .eq("id", pyMonthData.id);

      await loadPayrollMonth();
      // 수익성 데이터 리로드
      if (profitState?.saveLaborToDB) {
        // trigger reload in parent
      }
    } catch (err) { alert("확정 오류: " + err.message); }
  };

  // 필터링
  const filteredRecords = useMemo(() => {
    let list = pyRecords;
    if (pySiteTab !== "all") list = list.filter(r => r.site_code === pySiteTab);
    return list;
  }, [pyRecords, pySiteTab]);

  // 사업장별 집계
  const siteSummary = useMemo(() => {
    const map = {};
    pyRecords.forEach(r => {
      const sc = r.site_code || "unknown";
      if (!map[sc]) map[sc] = { count: 0, gross: 0, net: 0 };
      map[sc].count++;
      map[sc].gross += r.gross_pay || 0;
      map[sc].net += r.net_pay || 0;
    });
    return map;
  }, [pyRecords]);

  // KPI
  const totalGross = pyRecords.reduce((s, r) => s + (r.gross_pay || 0), 0);
  const totalNet = pyRecords.reduce((s, r) => s + (r.net_pay || 0), 0);
  const totalDed = totalGross - totalNet;

  // employee lookup
  const empMap = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const statusBadge = (s) => {
    const map = { draft: { bg: "#FFF3CD", color: "#856404", label: "🟡 작성중" },
      confirmed: { bg: "#D4EDDA", color: "#155724", label: "🟢 확정" },
      locked: { bg: "#E2E3E5", color: "#383D41", label: "🔒 잠금" } };
    const st = map[s] || map.draft;
    return { display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: st.bg, color: st.color, content: st.label };
  };

  // ── 급여 편집 패널 핸들러 ──
  const handleFieldChange = (field, value) => {
    setPyEditRecord(prev => {
      const updated = { ...prev, [field]: value };
      // 3.3% 자동계산
      if (field !== "income_tax" && field !== "local_tax" &&
          (updated.tax_type === "3.3%" || updated.tax_type === "3.3%(타인)")) {
        const gross = PY_PAY_FIELDS.reduce((s, f) => s + (updated[f.key] || 0), 0);
        updated.income_tax = Math.round(gross * 0.03);
        updated.local_tax = Math.round(gross * 0.003);
      }
      return updated;
    });
  };

  const handleTaxTypeChange = (newType) => {
    setPyEditRecord(prev => {
      const updated = { ...prev, tax_type: newType };
      // 타입 변경 시 공제 초기화
      if (newType === "미신고") {
        updated.np = 0; updated.hi = 0; updated.lt = 0; updated.ei = 0;
        updated.income_tax = 0; updated.local_tax = 0;
      } else if (newType === "3.3%" || newType === "3.3%(타인)") {
        updated.np = 0; updated.hi = 0; updated.lt = 0; updated.ei = 0;
        const gross = PY_PAY_FIELDS.reduce((s, f) => s + (updated[f.key] || 0), 0);
        updated.income_tax = Math.round(gross * 0.03);
        updated.local_tax = Math.round(gross * 0.003);
      } else if (newType === "고용&산재") {
        updated.np = 0; updated.hi = 0; updated.lt = 0;
        updated.income_tax = 0; updated.local_tax = 0;
      }
      return updated;
    });
  };

  // ── 은행 이체 목록 생성 ──
  const transferList = useMemo(() => {
    if (!pyRecords.length) return [];
    return pyRecords
      .filter(r => (r.net_pay || 0) > 0)
      .map(r => {
        const emp = empMap[r.employee_id];
        if (!emp) return null;
        const holder = emp.account_holder || emp.name;
        const isThirdParty = emp.is_third_party_payment || (holder && holder !== emp.name);
        return {
          id: r.id,
          emp_no: emp.emp_no || "",
          name: emp.name || "",
          site_code: r.site_code,
          account_holder: holder,
          bank_name: emp.bank_name || "",
          account_number: emp.account_number || "",
          amount: r.net_pay || 0,
          isThirdParty,
          noAccount: !emp.bank_name || !emp.account_number,
          tax_type: r.tax_type,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.site_code || "").localeCompare(b.site_code || "") || (a.emp_no || "").localeCompare(b.emp_no || ""));
  }, [pyRecords, empMap]);

  const transferTotal = transferList.reduce((s, t) => s + t.amount, 0);
  const transferWarnings = transferList.filter(t => t.isThirdParty).length;
  const transferNoAccount = transferList.filter(t => t.noAccount).length;

  // ── 급여 엑셀 Export ──
  const handlePayrollExport = async () => {
    const X = (await import("xlsx")).default || (await import("xlsx"));

    // Sheet 1: 급여 명세
    const sheet1 = pyRecords.map((r, idx) => {
      const emp = empMap[r.employee_id];
      const gross = r.gross_pay || 0;
      const net = r.net_pay || 0;
      return {
        "#": idx + 1,
        "사번": emp?.emp_no || "",
        "성명": emp?.name || "",
        "사업장": getSiteName(r.site_code),
        "근무형태": getWorkLabel(r.work_type),
        "세금처리": r.tax_type || "",
        "기본급": r.basic_pay || 0,
        "식대": r.meal || 0,
        "보육수당": r.childcare || 0,
        "자가운전": r.car_allow || 0,
        "팀장수당": r.team_allow || 0,
        "명절상여": r.holiday_bonus || 0,
        "인센티브": r.incentive || 0,
        "추가근무": r.extra_work || 0,
        "수기수당": r.manual_write || 0,
        "기타수당": r.extra1 || 0,
        "총지급액": gross,
        "국민연금": r.np || 0,
        "건강보험": r.hi || 0,
        "장기요양": r.lt || 0,
        "고용보험": r.ei || 0,
        "소득세": r.income_tax || 0,
        "지방소득세": r.local_tax || 0,
        "사고공제": r.accident_deduct || 0,
        "선지급": r.prepaid || 0,
        "공제합계": gross - net,
        "실입금": net,
      };
    });

    // Sheet 2: 은행 이체 목록
    const sheet2 = transferList.map((t, idx) => ({
      "#": idx + 1,
      "사번": t.emp_no,
      "성명": t.name,
      "사업장": getSiteName(t.site_code),
      "예금주": t.account_holder,
      "은행명": t.bank_name,
      "계좌번호": t.account_number,
      "이체금액": t.amount,
      "비고": t.isThirdParty ? "⚠️타인입금" : (t.noAccount ? "❌계좌미등록" : ""),
    }));

    // Sheet 3: 사업장별 집계
    const sheet3 = SITES.filter(s => siteSummary[s.code]).map(s => {
      const d = siteSummary[s.code];
      return {
        "코드": s.code,
        "사업장": s.name,
        "인원": d.count,
        "급여총계": d.gross,
        "실입금합계": d.net,
        "공제합계": d.gross - d.net,
      };
    });
    // 합계행
    sheet3.push({
      "코드": "",
      "사업장": "합 계",
      "인원": pyRecords.length,
      "급여총계": totalGross,
      "실입금합계": totalNet,
      "공제합계": totalDed,
    });

    const wb = X.utils.book_new();
    const ws1 = X.utils.json_to_sheet(sheet1);
    const ws2 = X.utils.json_to_sheet(sheet2);
    const ws3 = X.utils.json_to_sheet(sheet3);
    ws1["!cols"] = Array(27).fill({ wch: 12 });
    ws1["!cols"][0] = { wch: 4 };
    ws1["!cols"][1] = { wch: 10 };
    ws1["!cols"][2] = { wch: 8 };
    ws1["!cols"][3] = { wch: 14 };
    ws2["!cols"] = [{ wch: 4 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    ws3["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    X.utils.book_append_sheet(wb, ws1, "급여명세");
    X.utils.book_append_sheet(wb, ws2, "은행이체목록");
    X.utils.book_append_sheet(wb, ws3, "사업장별집계");
    X.writeFile(wb, `급여대장_${pyYear}년${pyMonth}월.xlsx`);
  };

  // ── 렌더 ──
  const pyCardStyle = { background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 20px", textAlign: "center", flex: 1 };
  const pyThStyle = { padding: "8px 6px", fontSize: 11, fontWeight: 700, color: C.white, background: C.navy, position: "sticky", top: 0, whiteSpace: "nowrap" };
  const pyTdStyle = { padding: "7px 6px", fontSize: 12, borderBottom: `1px solid ${C.lightGray}`, whiteSpace: "nowrap" };

  // ── 편집 패널 렌더 ──
  function renderEditPanel() {
    if (!pyEditRecord) return null;
    const rec = pyEditRecord;
    const emp = empMap[rec.employee_id];
    const gross = PY_PAY_FIELDS.reduce((s, f) => s + (rec[f.key] || 0), 0);
    const totDed = (rec.np || 0) + (rec.hi || 0) + (rec.lt || 0) + (rec.ei || 0) +
      (rec.income_tax || 0) + (rec.local_tax || 0) + (rec.accident_deduct || 0) + (rec.prepaid || 0);
    const net = gross - totDed;
    const isConfirmed = pyMonthData?.status === "confirmed" || pyMonthData?.status === "locked";

    return (
      <div style={{ position: "fixed", top: 0, right: 0, width: 480, height: "100vh", background: C.white,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: FONT }}>
        {/* 헤더 */}
        <div style={{ padding: "16px 20px", background: C.navy, color: C.white, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{emp?.name || "?"} ({emp?.emp_no || ""})</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{getSiteName(rec.site_code)} · {getWorkLabel(rec.work_type)}</div>
          </div>
          <button onClick={() => setPyEditRecord(null)} style={{ background: "none", border: "none", color: C.white, fontSize: 22, cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        {/* 요약 strip */}
        <div style={{ display: "flex", padding: "10px 20px", gap: 12, borderBottom: `1px solid ${C.lightGray}`, background: "#FAFBFC" }}>
          {[
            { label: "총지급", value: fmt(gross), color: C.navy },
            { label: "공제합계", value: fmt(totDed), color: C.error },
            { label: "실입금", value: fmt(net), color: C.success },
          ].map(k => (
            <div key={k.label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
              <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", borderBottom: `2px solid ${C.lightGray}` }}>
          {[{ k: "pay", label: "💰 급여항목" }, { k: "deduct", label: "📊 공제내역" }, { k: "summary", label: "📋 요약" }].map(t => (
            <button key={t.k} onClick={() => setPyEditTab(t.k)}
              style={{ flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: pyEditTab === t.k ? C.white : "#F4F5F7",
                color: pyEditTab === t.k ? C.navy : C.gray,
                borderBottom: pyEditTab === t.k ? `3px solid ${C.navy}` : "3px solid transparent",
                fontFamily: FONT }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {pyEditTab === "pay" && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 12 }}>급여 항목</div>
              {PY_PAY_FIELDS.map(f => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
                  <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray, flexShrink: 0 }}>{f.label}</label>
                  <NumInput value={rec[f.key] || 0} onChange={v => handleFieldChange(f.key, v)}
                    style={{ flex: 1, textAlign: "right", fontWeight: 700, fontSize: 13 }}
                    disabled={isConfirmed} />
                </div>
              ))}
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#EBF0FF", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.navy }}>총 지급액</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.navy, fontFamily: "monospace" }}>{fmt(gross)}원</span>
              </div>
            </div>
          )}

          {pyEditTab === "deduct" && (
            <div>
              {/* 세금처리방식 선택 */}
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 8 }}>세금 처리방식</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
                {PY_TAX_TYPES.map(t => (
                  <button key={t.key} onClick={() => !isConfirmed && handleTaxTypeChange(t.key)}
                    style={{ padding: "6px 12px", borderRadius: 20, border: rec.tax_type === t.key ? `2px solid ${t.color}` : `1px solid ${C.border}`,
                      background: rec.tax_type === t.key ? `${t.color}15` : C.white,
                      color: rec.tax_type === t.key ? t.color : C.gray,
                      fontSize: 11, fontWeight: 700, cursor: isConfirmed ? "default" : "pointer", fontFamily: FONT }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 4대보험: 수동입력 */}
              {rec.tax_type === "4대보험" && (
                <div>
                  <div style={{ fontSize: 11, color: C.gray, marginBottom: 8, padding: "6px 10px", background: "#FFF8E1", borderRadius: 6 }}>
                    ⚠️ 4대보험 공제액은 수동 입력해주세요 (합계만 자동 계산)
                  </div>
                  {PY_DED_FIELDS_4.map(f => (
                    <div key={f.key} style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
                      <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray, flexShrink: 0 }}>{f.label}</label>
                      <NumInput value={rec[f.key] || 0} onChange={v => handleFieldChange(f.key, v)}
                        style={{ flex: 1, textAlign: "right", fontSize: 12 }} disabled={isConfirmed} />
                    </div>
                  ))}
                </div>
              )}

              {/* 3.3% */}
              {(rec.tax_type === "3.3%" || rec.tax_type === "3.3%(타인)") && (
                <div>
                  <div style={{ fontSize: 11, color: C.orange, marginBottom: 8 }}>총지급액 × 3.3% 자동계산</div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
                    <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray }}>소득세(3%)</label>
                    <div style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: 700, color: C.error }}>{fmt(rec.income_tax || 0)}원</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
                    <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray }}>지방세(0.3%)</label>
                    <div style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: 700, color: C.error }}>{fmt(rec.local_tax || 0)}원</div>
                  </div>
                  {rec.tax_type === "3.3%(타인)" && (
                    <div style={{ marginTop: 12, padding: 12, background: "#FFF3E0", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: C.orange, marginBottom: 6 }}>타인신고 정보</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: C.gray }}>신고자명</label>
                          <input value={rec.reporter_name || ""} onChange={e => handleFieldChange("reporter_name", e.target.value)}
                            style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }} disabled={isConfirmed} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: C.gray }}>주민번호</label>
                          <input value={rec.reporter_rrn || ""} onChange={e => handleFieldChange("reporter_rrn", e.target.value)}
                            style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }} disabled={isConfirmed} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 고용&산재 */}
              {rec.tax_type === "고용&산재" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
                    <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray }}>고용보험</label>
                    <NumInput value={rec.ei || 0} onChange={v => handleFieldChange("ei", v)}
                      style={{ flex: 1, textAlign: "right", fontSize: 12 }} disabled={isConfirmed} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
                    <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray }}>산재공제</label>
                    <NumInput value={rec.accident_deduct || 0} onChange={v => handleFieldChange("accident_deduct", v)}
                      style={{ flex: 1, textAlign: "right", fontSize: 12 }} disabled={isConfirmed} />
                  </div>
                </div>
              )}

              {/* 미신고 */}
              {rec.tax_type === "미신고" && (
                <div style={{ padding: 16, background: "#F5F5F5", borderRadius: 8, textAlign: "center", color: C.gray, fontSize: 12 }}>
                  공제 없음 (총지급액 = 실입금)
                </div>
              )}

              {/* 공통: 사고공제 + 선지급 */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.lightGray}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 8 }}>기타 공제</div>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
                  <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray }}>사고공제</label>
                  <NumInput value={rec.accident_deduct || 0} onChange={v => handleFieldChange("accident_deduct", v)}
                    style={{ flex: 1, textAlign: "right", fontSize: 12 }} disabled={isConfirmed || rec.tax_type === "고용&산재"} />
                </div>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
                  <label style={{ width: 80, fontSize: 12, fontWeight: 600, color: C.gray }}>선지급</label>
                  <NumInput value={rec.prepaid || 0} onChange={v => handleFieldChange("prepaid", v)}
                    style={{ flex: 1, textAlign: "right", fontSize: 12 }} disabled={isConfirmed} />
                </div>
              </div>

              {/* 공제 합계 */}
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#FFEBEE", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.error }}>공제 합계</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.error, fontFamily: "monospace" }}>{fmt(totDed)}원</span>
              </div>
            </div>
          )}

          {pyEditTab === "summary" && (
            <div>
              {/* 급여 요약 */}
              <div style={{ padding: "16px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginBottom: 12 }}>급여 내역</div>
                {PY_PAY_FIELDS.filter(f => (rec[f.key] || 0) > 0).map(f => (
                  <div key={f.key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                    <span style={{ color: C.gray }}>{f.label}</span>
                    <span style={{ fontWeight: 700, fontFamily: "monospace" }}>{fmt(rec[f.key])}원</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 8, borderTop: `2px solid ${C.navy}`, fontSize: 14, fontWeight: 900, color: C.navy }}>
                  <span>총 지급액</span>
                  <span style={{ fontFamily: "monospace" }}>{fmt(gross)}원</span>
                </div>
              </div>

              {/* 공제 요약 */}
              <div style={{ padding: "16px 0", borderTop: `1px solid ${C.lightGray}` }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.error, marginBottom: 12 }}>공제 내역 ({rec.tax_type})</div>
                {[...PY_DED_FIELDS_4, { key: "accident_deduct", label: "사고공제" }, { key: "prepaid", label: "선지급" }]
                  .filter(f => (rec[f.key] || 0) > 0).map(f => (
                  <div key={f.key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                    <span style={{ color: C.gray }}>{f.label}</span>
                    <span style={{ fontWeight: 700, fontFamily: "monospace", color: C.error }}>-{fmt(rec[f.key])}원</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 8, borderTop: `2px solid ${C.error}`, fontSize: 14, fontWeight: 900, color: C.error }}>
                  <span>공제 합계</span>
                  <span style={{ fontFamily: "monospace" }}>-{fmt(totDed)}원</span>
                </div>
              </div>

              {/* 실입금 */}
              <div style={{ marginTop: 12, padding: 20, background: `linear-gradient(135deg, ${C.navy}, #1e3a8a)`, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>실입금액</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.gold, fontFamily: "monospace" }}>{fmt(net)}원</div>
              </div>

              {/* 계좌 정보 */}
              {emp && (emp.bank_name || emp.account_number) && (
                <div style={{ marginTop: 16, padding: 12, background: "#F5F5F5", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6 }}>💳 이체 정보</div>
                  <div style={{ fontSize: 12 }}>
                    <div>예금주: <strong>{emp.account_holder || emp.name}</strong></div>
                    <div>{emp.bank_name} {emp.account_number}</div>
                    {emp.is_third_party_payment && <div style={{ color: C.orange, fontWeight: 700, marginTop: 4 }}>⚠️ 타인 입금</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        {!isConfirmed && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.lightGray}`, display: "flex", gap: 8 }}>
            <button onClick={() => setPyEditRecord(null)} style={{ ...btnOutline, flex: 1, padding: "10px" }}>닫기</button>
            <button onClick={() => savePayrollRecord(pyEditRecord)} disabled={pySaving}
              style={{ ...btnPrimary, flex: 2, padding: "10px", opacity: pySaving ? 0.6 : 1 }}>
              {pySaving ? "저장 중..." : "💾 저장"}
            </button>
          </div>
        )}
        {isConfirmed && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.lightGray}` }}>
            <button onClick={() => setPyEditRecord(null)} style={{ ...btnOutline, width: "100%", padding: "10px" }}>닫기</button>
          </div>
        )}
      </div>
    );
  }

  // ── 메인 렌더 ──
  return (
    <div>
      {/* 페이지 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: C.dark }}>💰 급여대장</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.gray }}>월별 급여 관리 · 세금처리 · 은행이체 목록</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* 연/월 선택 */}
          <select value={pyYear} onChange={e => setPyYear(Number(e.target.value))}
            style={{ ...inputStyle, width: 90, padding: "8px", fontWeight: 700 }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select value={pyMonth} onChange={e => setPyMonth(Number(e.target.value))}
            style={{ ...inputStyle, width: 75, padding: "8px", fontWeight: 700 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          {pyMonthData && (
            <span style={(() => { const s = statusBadge(pyMonthData.status); return { display: s.display, padding: s.padding, borderRadius: s.borderRadius, fontSize: s.fontSize, fontWeight: s.fontWeight, background: s.bg, color: s.color }; })()}>
              {statusBadge(pyMonthData.status).content}
            </span>
          )}
        </div>
      </div>

      {/* 급여대장 없는 경우 */}
      {pyLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.gray }}>로딩 중...</div>
      ) : !pyMonthData ? (
        <div style={{ textAlign: "center", padding: 60, background: C.white, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.dark, marginBottom: 8 }}>
            {pyYear}년 {pyMonth}월 급여대장이 없습니다
          </div>
          <p style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>재직 직원 기준으로 급여 레코드가 자동 생성됩니다.</p>
          <button onClick={handleCreateMonth} disabled={pyBatchCreating}
            style={{ ...btnPrimary, padding: "12px 32px", fontSize: 14, opacity: pyBatchCreating ? 0.6 : 1 }}>
            {pyBatchCreating ? "생성 중..." : "📋 급여대장 생성"}
          </button>
        </div>
      ) : (
        <div>
          {/* KPI 카드 */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {[
              { icon: "👥", label: "총 인원", value: `${pyRecords.length}명`, color: C.navy },
              { icon: "💰", label: "급여 총계", value: `${fmt(totalGross)}원`, color: C.navy },
              { icon: "💚", label: "실입금 합계", value: `${fmt(totalNet)}원`, color: C.success },
              { icon: "📊", label: "공제 합계", value: `${fmt(totalDed)}원`, color: C.error },
            ].map(k => (
              <div key={k.label} style={pyCardStyle}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* 뷰 모드 토글 + Export */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 2, background: "#F0F1F4", padding: 3, borderRadius: 10 }}>
              {[
                { k: "payroll", label: "📋 급여대장" },
                { k: "transfer", label: "🏦 은행이체" },
                { k: "payslip", label: "💌 급여내역서" },
              ].map(m => (
                <button key={m.k} onClick={() => setPyViewMode(m.k)}
                  style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    background: pyViewMode === m.k ? C.white : "transparent",
                    color: pyViewMode === m.k ? C.navy : C.gray,
                    boxShadow: pyViewMode === m.k ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                    fontFamily: FONT }}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={handlePayrollExport}
              style={{ ...btnOutline, display: "flex", alignItems: "center", gap: 4, padding: "7px 16px", fontSize: 12 }}>
              📥 엑셀 Export
            </button>
          </div>

          {/* ── 급여대장 뷰 ── */}
          {pyViewMode === "payroll" && (<div>

          {/* 사업장 탭 */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16, background: C.white, padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.border}` }}>
            <button onClick={() => setPySiteTab("all")}
              style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                background: pySiteTab === "all" ? C.navy : "transparent", color: pySiteTab === "all" ? C.white : C.gray, fontFamily: FONT }}>
              전체 ({pyRecords.length})
            </button>
            {SITES.filter(s => siteSummary[s.code]).map(s => (
              <button key={s.code} onClick={() => setPySiteTab(s.code)}
                style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                  background: pySiteTab === s.code ? C.navy : "transparent", color: pySiteTab === s.code ? C.white : C.gray, fontFamily: FONT }}>
                {s.name} ({siteSummary[s.code]?.count || 0})
              </button>
            ))}
          </div>

          {/* 직원 급여 테이블 */}
          <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["#", "사번", "성명", "사업장", "근무형태", "세금처리", "기본급", "식대", "수당계", "총지급", "공제합계", "실입금", ""].map((h, i) => (
                      <th key={i} style={{ ...pyThStyle, textAlign: i >= 6 ? "right" : "left", ...(i === 0 ? { width: 30 } : {}) }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r, idx) => {
                    const emp = empMap[r.employee_id];
                    const gross = r.gross_pay || 0;
                    const net = r.net_pay || 0;
                    const totD = gross - net;
                    const extras = (r.childcare || 0) + (r.car_allow || 0) + (r.team_allow || 0) +
                      (r.holiday_bonus || 0) + (r.incentive || 0) + (r.extra_work || 0) + (r.manual_write || 0) + (r.extra1 || 0);
                    const taxInfo = PY_TAX_TYPES.find(t => t.key === r.tax_type);
                    return (
                      <tr key={r.id} style={{ background: idx % 2 ? "#FAFBFC" : C.white, cursor: "pointer" }}
                        onClick={() => { setPyEditRecord({ ...r }); setPyEditTab("pay"); }}>
                        <td style={{ ...pyTdStyle, textAlign: "center", color: C.gray }}>{idx + 1}</td>
                        <td style={{ ...pyTdStyle, fontWeight: 700, fontSize: 11, color: C.navy }}>{emp?.emp_no || "-"}</td>
                        <td style={{ ...pyTdStyle, fontWeight: 700 }}>{emp?.name || "-"}</td>
                        <td style={{ ...pyTdStyle, fontSize: 11, color: C.gray }}>{getSiteName(r.site_code)}</td>
                        <td style={pyTdStyle}>{getWorkLabel(r.work_type)}</td>
                        <td style={pyTdStyle}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                            background: `${taxInfo?.color || C.gray}15`, color: taxInfo?.color || C.gray }}>
                            {r.tax_type || "-"}
                          </span>
                        </td>
                        <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace" }}>{fmt(r.basic_pay)}</td>
                        <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace" }}>{fmt(r.meal)}</td>
                        <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace", color: extras > 0 ? C.blue : C.gray }}>{fmt(extras)}</td>
                        <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.navy }}>{fmt(gross)}</td>
                        <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace", color: C.error }}>{totD > 0 ? `-${fmt(totD)}` : "0"}</td>
                        <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.success }}>{fmt(net)}</td>
                        <td style={{ ...pyTdStyle, textAlign: "center" }}>
                          <span style={{ fontSize: 14, cursor: "pointer" }}>✏️</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* 합계행 */}
                <tfoot>
                  <tr style={{ background: C.navy }}>
                    <td colSpan={6} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 800, color: C.white }}>
                      합계 ({filteredRecords.length}명)
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.white }}>
                      {fmt(filteredRecords.reduce((s, r) => s + (r.basic_pay || 0), 0))}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.white }}>
                      {fmt(filteredRecords.reduce((s, r) => s + (r.meal || 0), 0))}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.white }}>
                      {fmt(filteredRecords.reduce((s, r) => s + ((r.childcare||0)+(r.car_allow||0)+(r.team_allow||0)+(r.holiday_bonus||0)+(r.incentive||0)+(r.extra_work||0)+(r.manual_write||0)+(r.extra1||0)), 0))}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: C.gold }}>
                      {fmt(filteredRecords.reduce((s, r) => s + (r.gross_pay || 0), 0))}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#FF8A80" }}>
                      -{fmt(filteredRecords.reduce((s, r) => s + ((r.gross_pay||0)-(r.net_pay||0)), 0))}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: C.gold }}>
                      {fmt(filteredRecords.reduce((s, r) => s + (r.net_pay || 0), 0))}
                    </td>
                    <td style={{ padding: "8px 6px" }} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 하단 액션 버튼 */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            {pyMonthData.status === "draft" && (
              <button onClick={handleConfirmPayroll} style={{ ...btnGold, padding: "12px 28px", fontSize: 14 }}>
                ✅ 급여 확정
              </button>
            )}
            {pyMonthData.status === "confirmed" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#D4EDDA", borderRadius: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#155724" }}>
                  {pyYear}년 {pyMonth}월 급여가 확정되었습니다
                  {pyMonthData.closed_at && ` (${fmtDateTime(pyMonthData.closed_at)})`}
                </span>
              </div>
            )}
          </div>

          {/* 사업장별 집계 카드 */}
          {pySiteTab === "all" && Object.keys(siteSummary).length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, marginBottom: 10 }}>📊 사업장별 급여 집계</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {SITES.filter(s => siteSummary[s.code]).map(s => {
                  const d = siteSummary[s.code];
                  return (
                    <div key={s.code} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14, cursor: "pointer" }}
                      onClick={() => setPySiteTab(s.code)}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 4 }}>{s.code}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 8 }}>{s.name}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.gray }}>{d.count}명</span>
                        <span style={{ fontWeight: 700, color: C.navy, fontFamily: "monospace" }}>{fmt(d.gross)}원</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>)}

          {/* ── 은행이체 뷰 ── */}
          {pyViewMode === "transfer" && (
            <div>
              {/* 이체 요약 KPI */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {[
                  { icon: "🏦", label: "이체 건수", value: `${transferList.length}건`, color: C.navy },
                  { icon: "💰", label: "이체 총액", value: `${fmt(transferTotal)}원`, color: C.success },
                  { icon: "⚠️", label: "타인입금", value: `${transferWarnings}건`, color: transferWarnings > 0 ? C.orange : C.gray },
                  { icon: "❌", label: "계좌미등록", value: `${transferNoAccount}건`, color: transferNoAccount > 0 ? C.error : C.gray },
                ].map(k => (
                  <div key={k.label} style={pyCardStyle}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* 이체 목록 테이블 */}
              <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {["#", "사번", "성명", "사업장", "예금주", "은행명", "계좌번호", "이체금액", "비고"].map((h, i) => (
                          <th key={i} style={{ ...pyThStyle, textAlign: i === 7 ? "right" : "left", ...(i === 0 ? { width: 30 } : {}) }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {transferList.map((t, idx) => (
                        <tr key={t.id} style={{ background: t.noAccount ? "#FFF3E0" : (t.isThirdParty ? "#FFF8E1" : (idx % 2 ? "#FAFBFC" : C.white)) }}>
                          <td style={{ ...pyTdStyle, textAlign: "center", color: C.gray }}>{idx + 1}</td>
                          <td style={{ ...pyTdStyle, fontWeight: 700, fontSize: 11, color: C.navy }}>{t.emp_no}</td>
                          <td style={{ ...pyTdStyle, fontWeight: 700 }}>{t.name}</td>
                          <td style={{ ...pyTdStyle, fontSize: 11, color: C.gray }}>{getSiteName(t.site_code)}</td>
                          <td style={{ ...pyTdStyle, fontWeight: 600, color: t.isThirdParty ? C.orange : C.dark }}>
                            {t.account_holder || "-"}
                            {t.isThirdParty && <span style={{ marginLeft: 4, fontSize: 10, color: C.orange }}>⚠️</span>}
                          </td>
                          <td style={pyTdStyle}>{t.bank_name || <span style={{ color: C.error, fontSize: 10 }}>미등록</span>}</td>
                          <td style={{ ...pyTdStyle, fontFamily: "monospace", fontSize: 11 }}>{t.account_number || <span style={{ color: C.error, fontSize: 10 }}>미등록</span>}</td>
                          <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.success }}>{fmt(t.amount)}</td>
                          <td style={pyTdStyle}>
                            {t.isThirdParty && <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#FFF3E0", color: C.orange }}>타인입금</span>}
                            {t.noAccount && <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#FFEBEE", color: C.error }}>계좌미등록</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: C.navy }}>
                        <td colSpan={7} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 800, color: C.white }}>
                          합계 ({transferList.length}건)
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: C.gold }}>
                          {fmt(transferTotal)}
                        </td>
                        <td style={{ padding: "8px 6px" }} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 주의사항 */}
              {(transferWarnings > 0 || transferNoAccount > 0) && (
                <div style={{ marginTop: 12, padding: 14, background: "#FFF8E1", borderRadius: 10, border: "1px solid #FFE082" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#F57F17", marginBottom: 6 }}>⚠️ 이체 시 주의사항</div>
                  {transferWarnings > 0 && (
                    <div style={{ fontSize: 12, color: C.orange, marginBottom: 4 }}>
                      • 타인 입금 {transferWarnings}건 — 예금주와 성명이 다릅니다. 이체 전 확인하세요.
                    </div>
                  )}
                  {transferNoAccount > 0 && (
                    <div style={{ fontSize: 12, color: C.error }}>
                      • 계좌 미등록 {transferNoAccount}건 — 직원현황에서 계좌정보를 등록해주세요.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 급여내역서 뷰 ── */}
          {pyViewMode === "payslip" && (() => {
            // psSlips를 employee_id로 매핑
            const slipMap = {};
            psSlips.forEach(s => { slipMap[s.employee_id] = s; });
            const sentCount = psSlips.length;
            const readCount = psSlips.filter(s => s.is_read).length;
            const unsentCount = pyRecords.length - sentCount;
            const allIds = pyRecords.map(r => r.employee_id);
            const allSelected = allIds.length > 0 && allIds.every(id => psSelectedIds.has(id));
            const selectedCount = psSelectedIds.size;
            return (
            <div>
              {/* KPI 카드 + 버튼 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", gap: 12, flex: 1 }}>
                  {[
                    { icon: "👥", label: "급여 대상", value: `${pyRecords.length}명`, color: C.navy },
                    { icon: "💌", label: "발송 완료", value: `${sentCount}명`, color: C.success },
                    { icon: "📭", label: "미발송", value: `${unsentCount}명`, color: unsentCount > 0 ? C.orange : C.gray },
                    { icon: "✅", label: "열람 확인", value: `${readCount}명`, color: readCount > 0 ? C.success : C.gray },
                  ].map(k => (
                    <div key={k.label} style={pyCardStyle}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
                      <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 버튼 영역 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                {selectedCount > 0 && (
                  <button onClick={() => handleSendPayslips("selected")} disabled={psSending || !pyMonthData || pyMonthData.status !== "confirmed"}
                    style={{ ...btnPrimary, padding: "10px 20px", fontSize: 13, opacity: (!pyMonthData || pyMonthData.status !== "confirmed") ? 0.4 : 1 }}>
                    {psSending ? "발송 중..." : `📨 선택 발송 (${selectedCount}명)`}
                  </button>
                )}
                <button onClick={() => handleSendPayslips("all")} disabled={psSending || !pyMonthData || pyMonthData.status !== "confirmed"}
                  style={{ ...btnPrimary, padding: "10px 20px", fontSize: 13, opacity: (!pyMonthData || pyMonthData.status !== "confirmed") ? 0.4 : 1,
                    background: selectedCount > 0 ? "#fff" : C.navy, color: selectedCount > 0 ? C.navy : "#fff",
                    border: `1.5px solid ${C.navy}` }}>
                  {psSending ? "발송 중..." : `💌 전체 발송 (${pyRecords.length}명)`}
                </button>
                {selectedCount > 0 && (
                  <button onClick={() => setPsSelectedIds(new Set())}
                    style={{ padding: "10px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.gray }}>
                    선택 해제
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {selectedCount > 0 && (
                  <span style={{ fontSize: 12, color: C.navy, fontWeight: 700 }}>✓ {selectedCount}명 선택</span>
                )}
              </div>

              {pyMonthData && pyMonthData.status !== "confirmed" && (
                <div style={{ padding: 14, background: "#FFF8E1", borderRadius: 10, border: "1px solid #FFE082", marginBottom: 16, fontSize: 12, color: "#F57F17", fontWeight: 700 }}>
                  ⚠️ 급여가 확정되지 않았습니다. 급여대장 탭에서 먼저 급여를 확정해주세요.
                </div>
              )}

              {psLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: C.gray }}>로딩 중...</div>
              ) : pyRecords.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: C.gray, fontSize: 14 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>💌</div>
                  급여 데이터가 없습니다. 급여대장 탭에서 먼저 급여를 생성해주세요.
                </div>
              ) : (
                <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ ...pyThStyle, width: 36, textAlign: "center" }}>
                            <input type="checkbox" checked={allSelected} onChange={e => {
                              if (e.target.checked) setPsSelectedIds(new Set(allIds));
                              else setPsSelectedIds(new Set());
                            }} style={{ cursor: "pointer", width: 15, height: 15 }} />
                          </th>
                          {["#", "사번", "성명", "사업장", "실수령액", "발송상태", "열람", ""].map((h, i) => (
                            <th key={i} style={{ ...pyThStyle, textAlign: i === 4 ? "right" : "left",
                              ...(i === 0 ? { width: 30 } : i === 7 ? { width: 40 } : {}) }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pyRecords.map((r, idx) => {
                          const emp = empMap[r.employee_id];
                          const slip = slipMap[r.employee_id];
                          const isSent = !!slip;
                          const isRead = slip?.is_read;
                          const gross = PY_PAY_FIELDS.reduce((s, f) => s + (r[f.key] || 0), 0);
                          const totDed = (r.np || 0) + (r.hi || 0) + (r.lt || 0) + (r.ei || 0) +
                            (r.income_tax || 0) + (r.local_tax || 0) + (r.accident_deduct || 0) + (r.prepaid || 0);
                          const net = gross - totDed;
                          const checked = psSelectedIds.has(r.employee_id);
                          return (
                          <tr key={r.employee_id} style={{ background: checked ? "#EEF2FF" : idx % 2 ? "#FAFBFC" : C.white, cursor: "pointer" }}
                            onClick={() => setPsSelectedIds(prev => {
                              const ns = new Set(prev);
                              if (ns.has(r.employee_id)) ns.delete(r.employee_id); else ns.add(r.employee_id);
                              return ns;
                            })}>
                            <td style={{ ...pyTdStyle, textAlign: "center" }} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={checked} onChange={() => setPsSelectedIds(prev => {
                                const ns = new Set(prev);
                                if (ns.has(r.employee_id)) ns.delete(r.employee_id); else ns.add(r.employee_id);
                                return ns;
                              })} style={{ cursor: "pointer", width: 15, height: 15 }} />
                            </td>
                            <td style={{ ...pyTdStyle, textAlign: "center", color: C.gray }}>{idx + 1}</td>
                            <td style={{ ...pyTdStyle, fontWeight: 700, fontSize: 11, color: C.navy }}>{emp?.emp_no || ""}</td>
                            <td style={{ ...pyTdStyle, fontWeight: 700 }}>{emp?.name || ""}</td>
                            <td style={{ ...pyTdStyle, fontSize: 11, color: C.gray }}>{getSiteName(r.site_code)}</td>
                            <td style={{ ...pyTdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: C.success }}>{fmt(net)}</td>
                            <td style={pyTdStyle}>
                              {isSent ? (
                                <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#D4EDDA", color: "#155724" }}>✅ 발송완료</span>
                              ) : (
                                <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#FFF3CD", color: "#856404" }}>📭 미발송</span>
                              )}
                            </td>
                            <td style={{ ...pyTdStyle, fontSize: 10, color: C.gray }}>
                              {isRead ? (
                                <span style={{ color: C.success, fontWeight: 700 }}>✅ {slip.read_at ? new Date(slip.read_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "확인"}</span>
                              ) : isSent ? "⏳ 미확인" : "-"}
                            </td>
                            <td style={{ ...pyTdStyle, textAlign: "center" }} onClick={e => e.stopPropagation()}>
                              {isSent && (
                                <button onClick={() => handleDeletePayslip(slip.id)} title="삭제"
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.gray, padding: 2 }}>🗑️</button>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: C.navy }}>
                          <td style={{ padding: "8px 6px" }} />
                          <td colSpan={4} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 800, color: C.white }}>
                            합계 ({pyRecords.length}명 중 {sentCount}명 발송)
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: C.gold }}>{fmt(pyRecords.reduce((s, r) => {
                            const g = PY_PAY_FIELDS.reduce((ss, f) => ss + (r[f.key] || 0), 0);
                            const d = (r.np || 0) + (r.hi || 0) + (r.lt || 0) + (r.ei || 0) + (r.income_tax || 0) + (r.local_tax || 0) + (r.accident_deduct || 0) + (r.prepaid || 0);
                            return s + g - d;
                          }, 0))}</td>
                          <td colSpan={3} style={{ padding: "8px 6px" }} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 안내 */}
              <div style={{ marginTop: 16, padding: 14, background: "#EDE7F6", borderRadius: 10, border: "1px solid #D1C4E9", fontSize: 12, color: "#4527A0" }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>💡 급여내역서 안내</div>
                <div>• 체크박스로 원하는 직원만 선택하여 발송할 수 있습니다.</div>
                <div>• 이미 발송된 직원을 재선택하면 내역이 덮어씌워집니다.</div>
                <div>• 직원이 현장앱에서 내역서를 열면 ✅확인 상태로 변경됩니다.</div>
              </div>
            </div>
            );
          })()}
        </div>
      )}

      {/* 편집 패널 (슬라이드 오버) */}
      {pyEditRecord && (
        <Fragment>
          <div onClick={() => setPyEditRecord(null)}
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.3)", zIndex: 999 }} />
          {renderEditPanel()}
        </Fragment>
      )}
    </div>
  );
}

// ── 16-7. 오류 보고 시스템 v2 (미팍티켓 동일) ───────────
const BUG_CATEGORIES = [
  { key: "ui",          label: "🖥️ UI 깨짐",   emoji: "🖥️" },
  { key: "feature",     label: "⚙️ 기능 오류",  emoji: "⚙️" },
  { key: "data",        label: "📊 데이터 이상", emoji: "📊" },
  { key: "performance", label: "🐌 느림/멈춤",  emoji: "🐌" },
  { key: "suggestion",  label: "💡 기타",       emoji: "💡" },
];
const BUG_STATUS = {
  open:        { label: "접수",     bg: "#fee2e2", color: "#DC2626" },
  in_progress: { label: "확인중",   bg: "#ffedd5", color: "#EA580C" },
  resolved:    { label: "해결됨",   bg: "#dcfce7", color: "#16A34A" },
  closed:      { label: "종료",     bg: "#E8E8E8", color: "#666" },
};
const BUG_PRIORITY = {
  low:      { label: "낮음", color: "#666",    bg: "#f3f4f6" },
  medium:   { label: "보통", color: "#EA580C", bg: "#fff7ed" },
  high:     { label: "높음", color: "#DC2626", bg: "#fef2f2" },
  critical: { label: "긴급", color: "#7C3AED", bg: "#f5f3ff" },
};
const PAGE_LABELS = {
  main_dashboard: "메인 대시보드", dashboard: "HR 대시보드", employees: "직원현황",
  contract: "계약서", history: "계약이력", settings: "계약서 조항변경",
  profit_summary: "전체 요약", profit_site_pl: "사업장 PL", profit_cost_input: "비용 입력",
  payroll: "급여대장", monthly_parking: "월주차 관리", profit_comparison: "비교 분석",
  profit_alloc: "배부 설정", profit_import: "데이터 Import",
  site_management: "사업장 관리", daily_report: "현장 일보",
  closing_report: "마감보고현황", attendance: "근태현황", full_calendar: "전체 캘린더",
  salary_calc: "인건비 견적", bug_reports: "오류 보고",
};

// 스크린샷 → base64
async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// AI 분석 — Supabase Edge Function 프록시 (API 키 보안 유지)
async function aiAnalyzeBug(title, description, pageName) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token || ""}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({ action: "analyze", title, description, page_name: pageName })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
    return await res.json();
  } catch { return null; }
}
async function aiClassifyBug(title, description) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token || ""}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({ action: "classify", title, description })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function BugReportFAB({ currentPage, reporterName, reporterEmpNo, reporterRole }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", category: "", description: "",
    priority: "medium", repro: "", screenshots: [],
  });
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef(null);
  const pasteAreaRef = useRef(null);

  // 클립보드 붙여넣기
  useEffect(() => {
    if (!open) return;
    const handler = async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgItems = items.filter(i => i.type.startsWith("image/"));
      if (imgItems.length === 0) return;
      e.preventDefault();
      const files = imgItems.map(i => i.getAsFile()).filter(Boolean);
      await addScreenshots(files);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [open, form.screenshots]);

  const addScreenshots = async (files) => {
    const remaining = 3 - form.screenshots.length;
    const toAdd = files.slice(0, remaining);
    const b64s = await Promise.all(toAdd.map(fileToBase64));
    setForm(f => ({ ...f, screenshots: [...f.screenshots, ...b64s] }));
  };
  const removeScreenshot = (i) => setForm(f => ({ ...f, screenshots: f.screenshots.filter((_, j) => j !== i) }));

  // AI 분류 (제목+내용 입력 완료 시)
  const runAI = async () => {
    if (!form.title || !form.description) return;
    setAiLoading(true);
    const result = await aiClassifyBug(form.title, form.description);
    if (result) {
      setAiResult(result);
      setForm(f => ({
        ...f,
        category: f.category || result.category,
        priority: result.priority || f.priority,
      }));
    }
    setAiLoading(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) { alert("제목과 내용을 입력해주세요."); return; }
    setLoading(true);
    try {
      // 제출 시 상세 AI 분석 실행
      const pageLabel = PAGE_LABELS[currentPage] || currentPage || "";
      let analysis = null;
      try {
        analysis = await aiAnalyzeBug(form.title.trim(), form.description.trim(), pageLabel);
      } catch { /* AI 실패해도 제출은 진행 */ }

      const finalCategory = form.category || analysis?.category || "suggestion";
      const finalPriority = form.priority || analysis?.priority || "medium";

      const { error } = await supabase.from("bug_reports").insert({
        app: "erp",
        reporter_name: reporterName || "알 수 없음",
        reporter_emp_no: reporterEmpNo || "",
        reporter_role: reporterRole || "",
        page: currentPage || "",
        page_label: pageLabel,
        category: finalCategory,
        title: form.title.trim(),
        description: form.description.trim(),
        repro_steps: form.repro.trim(),
        priority: finalPriority,
        status: "open",
        screenshots: form.screenshots,
        ai_summary: analysis?.summary || aiResult?.summary || null,
        ai_analysis: analysis ? {
          cause: analysis.cause || null,
          fix_direction: analysis.fix_direction || null,
          related_components: analysis.related_components || [],
          category: analysis.category,
          priority: analysis.priority,
          summary: analysis.summary,
        } : null,
      });
      if (error) throw error;
      setDone(true);
      setTimeout(() => {
        setOpen(false); setDone(false); setAiResult(null);
        setForm({ title: "", category: "", description: "", priority: "medium", repro: "", screenshots: [] });
      }, 1800);
    } catch (e) { alert("제출 실패: " + e.message); }
    finally { setLoading(false); }
  };

  const pageLabel = PAGE_LABELS[currentPage] || currentPage || "알 수 없음";

  return (
    <>
      <button onClick={() => setOpen(true)} title="오류 제보" style={{
        position: "fixed", bottom: 28, right: 28, zIndex: 1200,
        width: 52, height: 52, borderRadius: "50%",
        background: C.navy, border: `3px solid ${C.gold}`,
        color: "#fff", fontSize: 22, cursor: "pointer",
        boxShadow: "0 4px 16px rgba(20,40,160,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>🐛</button>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: 520, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}>
            {/* 헤더 */}
            <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: `1px solid #eee`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "16px 16px 0 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* 미팍 로고 인라인 */}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fff", border: "2px solid #1A1D2B", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: C.gold }} />
                  <span style={{ fontWeight: 900, fontSize: 16, color: "#1A1D2B", position: "relative", zIndex: 1, marginTop: -3 }}>P</span>
                </div>
                <span style={{ fontWeight: 900, fontSize: 15, color: "#1A1D2B", fontFamily: FONT }}>미팍<span style={{ color: C.gold }}>Ticket</span></span>
                <span style={{ fontSize: 12, background: "#fee2e2", color: "#DC2626", fontWeight: 700, padding: "2px 10px", borderRadius: 20, fontFamily: FONT }}>🐛 오류 제보</span>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999", padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: "20px 20px 4px" }}>
              {done ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: C.navy, fontFamily: FONT }}>접수 완료!</div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>빠르게 확인하겠습니다.</div>
                </div>
              ) : (
                <>
                  {/* AI 분석 결과 — 미팍티켓 스타일 */}
                  {aiResult && (
                    <div style={{ background: "#f0f4ff", border: `1px solid ${C.navy}22`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <span style={{ fontSize: 16 }}>🤖</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: C.navy, fontFamily: FONT }}>AI 분류 제안</span>
                        <span style={{ fontSize: 10, color: "#999", marginLeft: "auto" }}>자동 적용됨</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#444", fontFamily: FONT, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {BUG_CATEGORIES.find(c => c.key === aiResult.category) && (
                          <span style={{ background: "#EEF2FF", padding: "2px 10px", borderRadius: 12, fontWeight: 700, color: C.navy, fontSize: 11 }}>{BUG_CATEGORIES.find(c => c.key === aiResult.category)?.label}</span>
                        )}
                        {BUG_PRIORITY[aiResult.priority] && (
                          <span style={{ background: BUG_PRIORITY[aiResult.priority].bg, padding: "2px 10px", borderRadius: 12, fontWeight: 700, color: BUG_PRIORITY[aiResult.priority].color, fontSize: 11 }}>{BUG_PRIORITY[aiResult.priority].label}</span>
                        )}
                        {aiResult.summary && <span style={{ color: "#666", fontSize: 11, padding: "2px 0" }}>· {aiResult.summary}</span>}
                      </div>
                    </div>
                  )}

                  {/* 제목 */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6, fontFamily: FONT }}>제목 <span style={{ color: "#DC2626" }}>*</span></label>
                    <input
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      onBlur={runAI}
                      placeholder="어떤 문제가 발생했나요?"
                      style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #DDD", borderRadius: 10, fontSize: 14, fontFamily: FONT, boxSizing: "border-box", outline: "none" }}
                    />
                  </div>

                  {/* 카테고리 */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 8, fontFamily: FONT }}>카테고리 <span style={{ color: "#DC2626" }}>*</span></label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {BUG_CATEGORIES.map(c => (
                        <button key={c.key} onClick={() => setForm(f => ({ ...f, category: c.key }))} style={{
                          padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          border: `1.5px solid ${form.category === c.key ? C.navy : "#DDD"}`,
                          background: form.category === c.key ? "#EEF2FF" : "#fff",
                          color: form.category === c.key ? C.navy : "#666",
                        }}>{c.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* 심각도 */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 8, fontFamily: FONT }}>심각도</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {Object.entries(BUG_PRIORITY).map(([k, v]) => (
                        <button key={k} onClick={() => setForm(f => ({ ...f, priority: k }))} style={{
                          flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          border: `1.5px solid ${form.priority === k ? v.color : "#DDD"}`,
                          background: form.priority === k ? v.bg : "#fff",
                          color: form.priority === k ? v.color : "#999",
                        }}>{v.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* 발생 페이지 */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6, fontFamily: FONT }}>발생 페이지</label>
                    <select
                      value={currentPage || ""}
                      disabled
                      style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #DDD", borderRadius: 10, fontSize: 13, fontFamily: FONT, background: "#f9f9f9", color: "#444", boxSizing: "border-box" }}
                    >
                      <option value={currentPage}>{pageLabel}</option>
                    </select>
                  </div>

                  {/* 상세 설명 */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6, fontFamily: FONT }}>상세 설명 <span style={{ color: "#DC2626" }}>*</span></label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      onBlur={runAI}
                      placeholder="어떤 상황에서 발생했는지 자세히 적어주세요..."
                      rows={4}
                      style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #DDD", borderRadius: 10, fontSize: 13, fontFamily: FONT, resize: "vertical", boxSizing: "border-box", outline: "none" }}
                    />
                    {aiLoading && <div style={{ fontSize: 11, color: C.navy, marginTop: 4, fontFamily: FONT }}>🤖 AI가 분류 중...</div>}
                  </div>

                  {/* 재현 방법 */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6, fontFamily: FONT }}>재현 방법 <span style={{ color: "#999", fontWeight: 400 }}>(선택)</span></label>
                    <textarea
                      value={form.repro}
                      onChange={e => setForm(f => ({ ...f, repro: e.target.value }))}
                      placeholder={"1. 대시보드 접속 2. 매장 선택 클릭 3. 에러 발생"}
                      rows={3}
                      style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #DDD", borderRadius: 10, fontSize: 13, fontFamily: FONT, resize: "vertical", boxSizing: "border-box", outline: "none" }}
                    />
                  </div>

                  {/* 스크린샷 첨부 */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 8, fontFamily: FONT }}>
                      스크린샷 <span style={{ color: "#999", fontWeight: 400 }}>(선택, 최대 3장)</span>
                    </label>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={async e => { await addScreenshots(Array.from(e.target.files || [])); e.target.value = ""; }} />
                    {/* 첨부 버튼 */}
                    {form.screenshots.length < 3 && (
                      <div style={{ display: "flex", gap: 8, marginBottom: form.screenshots.length > 0 ? 10 : 0 }}>
                        <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1.5px dashed #CCC", background: "#FAFAFA", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, color: "#555" }}>🖼 갤러리</button>
                        <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1.5px dashed #CCC", background: "#FAFAFA", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, color: "#555" }}>📷 촬영</button>
                        <button
                          onClick={async () => {
                            try {
                              const items = await navigator.clipboard.read();
                              for (const item of items) {
                                const imgType = item.types.find(t => t.startsWith("image/"));
                                if (imgType) { const blob = await item.getType(imgType); await addScreenshots([new File([blob], "paste.png", { type: imgType })]); }
                              }
                            } catch { alert("Ctrl+V로 이미지를 붙여넣을 수도 있습니다."); }
                          }}
                          style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1.5px dashed #CCC", background: "#FAFAFA", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, color: "#555" }}>📋 붙여넣기</button>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#999", marginBottom: form.screenshots.length > 0 ? 8 : 0, fontFamily: FONT }}>Ctrl+V로 스크린샷을 붙여넣을 수 있습니다</div>
                    {/* 미리보기 */}
                    {form.screenshots.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {form.screenshots.map((s, i) => (
                          <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                            <img src={s} alt={`screenshot${i+1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #DDD" }} />
                            <button onClick={() => removeScreenshot(i)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#DC2626", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 제출 */}
                  <div style={{ marginBottom: 20 }}>
                    <button onClick={handleSubmit} disabled={loading} style={{
                      width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                      background: loading ? "#999" : "#DC2626",
                      color: "#fff", fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: FONT,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                      {loading ? "제출 중..." : "🐛 오류 제보 전송"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BugReportDashboard() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterApp, setFilterApp] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [selected, setSelected] = useState(null);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("bug_reports").select("*").order("created_at", { ascending: false });
    setReports(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = reports.filter(r =>
    (filterStatus === "all" || r.status === filterStatus) &&
    (filterApp === "all" || r.app === filterApp) &&
    (filterPriority === "all" || r.priority === filterPriority)
  );

  const updateStatus = async (id, status) => {
    await supabase.from("bug_reports").update({ status, updated_at: new Date().toISOString(), ...(status === "resolved" ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status }));
  };
  const saveMemo = async () => {
    if (!selected) return;
    setSaving(true);
    await supabase.from("bug_reports").update({ admin_memo: memo, updated_at: new Date().toISOString() }).eq("id", selected.id);
    setReports(prev => prev.map(r => r.id === selected.id ? { ...r, admin_memo: memo } : r));
    setSaving(false);
    alert("저장 완료");
  };
  const deleteReport = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await supabase.from("bug_reports").delete().eq("id", id);
    setReports(prev => prev.filter(r => r.id !== id));
    if (selected?.id === id) setSelected(null);
  };
  const reAnalyze = async () => {
    if (!selected) return;
    setAiAnalyzing(true);
    try {
      const analysis = await aiAnalyzeBug(selected.title, selected.description, selected.page_label || selected.page);
      if (analysis) {
        const aiData = {
          cause: analysis.cause || null,
          fix_direction: analysis.fix_direction || null,
          related_components: analysis.related_components || [],
          category: analysis.category,
          priority: analysis.priority,
          summary: analysis.summary,
        };
        await supabase.from("bug_reports").update({
          ai_analysis: aiData,
          ai_summary: analysis.summary || null,
          updated_at: new Date().toISOString(),
        }).eq("id", selected.id);
        const updated = { ...selected, ai_analysis: aiData, ai_summary: analysis.summary };
        setSelected(updated);
        setReports(prev => prev.map(r => r.id === selected.id ? updated : r));
      } else {
        alert("AI 분석에 실패했습니다. 다시 시도해주세요.");
      }
    } catch (e) { alert("AI 분석 오류: " + e.message); }
    setAiAnalyzing(false);
  };

  const kpi = {
    total: reports.length,
    open: reports.filter(r => r.status === "open").length,
    inProgress: reports.filter(r => r.status === "in_progress").length,
    resolved: reports.filter(r => r.status === "resolved").length,
  };
  const fmtDate = (d) => d ? new Date(d).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: C.navy, margin: 0, marginBottom: 4 }}>🐛 오류 보고 관리</h2>
        <p style={{ color: "#666", fontSize: 13, margin: 0 }}>ERP · 현장앱에서 접수된 오류 및 건의사항</p>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "전체", value: kpi.total, color: C.navy },
          { label: "접수", value: kpi.open, color: "#DC2626" },
          { label: "확인중", value: kpi.inProgress, color: "#EA580C" },
          { label: "해결됨", value: kpi.resolved, color: "#16A34A" },
        ].map(k => (
          <div key={k.label} style={{ background: "#fff", border: `1px solid ${C.border}`, borderLeft: `4px solid ${k.color}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* 목록 */}
        <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {/* 필터 */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[["all","전체"],["open","접수"],["in_progress","확인중"],["resolved","해결됨"],["closed","종료"]].map(([k, v]) => (
              <button key={k} onClick={() => setFilterStatus(k)} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${filterStatus === k ? C.navy : C.border}`,
                background: filterStatus === k ? C.navy : "#fff",
                color: filterStatus === k ? "#fff" : "#666", fontFamily: FONT,
              }}>{v}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <select value={filterApp} onChange={e => setFilterApp(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: FONT }}>
                <option value="all">전체 앱</option>
                <option value="erp">ERP</option>
                <option value="field">현장앱</option>
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: FONT }}>
                <option value="all">전체 심각도</option>
                <option value="critical">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
              <button onClick={load} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>새로고침</button>
            </div>
          </div>

          {/* 목록 */}
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>접수된 오류가 없습니다 🎉</div>
          ) : (
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {filtered.map(r => {
                const st = BUG_STATUS[r.status] || BUG_STATUS.open;
                const pr = BUG_PRIORITY[r.priority] || BUG_PRIORITY.medium;
                const cat = BUG_CATEGORIES.find(c => c.key === r.category);
                return (
                  <div key={r.id} onClick={() => { setSelected(r); setMemo(r.admin_memo || ""); }} style={{
                    padding: "14px 16px", borderBottom: `1px solid ${C.lightGray}`, cursor: "pointer",
                    background: selected?.id === r.id ? "#f0f4ff" : "#fff",
                    borderLeft: selected?.id === r.id ? `3px solid ${C.navy}` : "3px solid transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: pr.bg, color: pr.color, flexShrink: 0 }}>{pr.label}</span>
                      {cat && <span style={{ fontSize: 11, color: "#666", background: "#f3f4f6", padding: "2px 8px", borderRadius: 10 }}>{cat.label}</span>}
                      {r.ai_analysis ? <span style={{ fontSize: 10, color: C.navy, background: "#EEF2FF", padding: "2px 8px", borderRadius: 10, flexShrink: 0, fontWeight: 700 }}>🤖 AI 분석</span>
                       : r.ai_summary ? <span style={{ fontSize: 10, color: "#888", background: "#f3f4f6", padding: "2px 8px", borderRadius: 10, flexShrink: 0 }}>🤖 분류</span> : null}
                      <span style={{ fontSize: 11, color: "#999", marginLeft: "auto", flexShrink: 0 }}>{r.app === "erp" ? "ERP" : "현장앱"} · {fmtDate(r.created_at)}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#222", marginBottom: 4 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{r.page_label || r.page || "-"} · {r.reporter_name}</span>
                      {r.screenshots?.length > 0 && <span style={{ color: "#999" }}>📷 {r.screenshots.length}장</span>}
                    </div>
                    {r.ai_summary && <div style={{ fontSize: 11, color: "#666", marginTop: 4, background: "#f8f9ff", padding: "4px 8px", borderRadius: 6, borderLeft: `2px solid ${C.navy}` }}>💬 {r.ai_summary}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 상세 패널 */}
        {selected && (
          <div style={{ width: 320, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
            <div style={{ background: C.navy, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#fff", fontFamily: FONT }}>상세 정보</span>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ padding: 16, maxHeight: 640, overflowY: "auto" }}>
              {/* 기본 정보 */}
              <div style={{ fontSize: 12, color: "#444", marginBottom: 12, lineHeight: 2, background: "#f9f9f9", borderRadius: 8, padding: "10px 12px" }}>
                <div><strong>제목:</strong> {selected.title}</div>
                <div><strong>앱:</strong> {selected.app === "erp" ? "ERP" : "현장앱"}</div>
                <div><strong>발생 화면:</strong> {selected.page_label || selected.page || "-"}</div>
                <div><strong>보고자:</strong> {selected.reporter_name} ({selected.reporter_emp_no})</div>
                <div><strong>분류:</strong> {BUG_CATEGORIES.find(c => c.key === selected.category)?.label || selected.category}</div>
                <div><strong>심각도:</strong> <span style={{ color: BUG_PRIORITY[selected.priority]?.color, fontWeight: 700 }}>{BUG_PRIORITY[selected.priority]?.label}</span></div>
                <div><strong>접수일:</strong> {fmtDate(selected.created_at)}</div>
                {selected.resolved_at && <div><strong>해결일:</strong> {fmtDate(selected.resolved_at)}</div>}
              </div>

              {/* 🤖 AI 분석 결과 — 미팍티켓 스타일 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#666", display: "flex", alignItems: "center", gap: 4 }}>🤖 AI 분석 결과</div>
                  <button onClick={reAnalyze} disabled={aiAnalyzing} style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: aiAnalyzing ? "not-allowed" : "pointer",
                    border: `1px solid ${C.navy}44`, background: aiAnalyzing ? "#f0f4ff" : "#fff", color: C.navy, fontFamily: FONT,
                  }}>{aiAnalyzing ? "분석 중..." : "🔄 재분석"}</button>
                </div>
                {aiAnalyzing ? (
                  <div style={{ background: "#f0f4ff", borderRadius: 10, padding: "20px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
                    <div style={{ fontSize: 12, color: C.navy, fontWeight: 700, fontFamily: FONT }}>AI가 분석 중입니다...</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>시스템 구조 기반 원인 분석 진행 중</div>
                  </div>
                ) : selected.ai_analysis ? (
                  <div style={{ background: "#f0f4ff", border: `1px solid ${C.navy}22`, borderRadius: 10, overflow: "hidden" }}>
                    {/* 추정 원인 */}
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.navy}11` }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, marginBottom: 4, fontFamily: FONT }}>추정 원인</div>
                      <div style={{ fontSize: 12, color: "#444", lineHeight: 1.65, fontFamily: FONT }}>{selected.ai_analysis.cause || "분석 데이터 없음"}</div>
                    </div>
                    {/* 수정 방향 */}
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.navy}11` }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#16A34A", marginBottom: 4, fontFamily: FONT }}>수정 방향</div>
                      <div style={{ fontSize: 12, color: "#444", lineHeight: 1.65, fontFamily: FONT }}>{selected.ai_analysis.fix_direction || "분석 데이터 없음"}</div>
                    </div>
                    {/* 관련 컴포넌트 */}
                    {selected.ai_analysis.related_components?.length > 0 && (
                      <div style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#7C3AED", marginBottom: 6, fontFamily: FONT }}>관련 파일</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {selected.ai_analysis.related_components.map((comp, ci) => (
                            <div key={ci} style={{ fontSize: 11, fontFamily: "monospace", background: "#e8ecff", color: "#333", padding: "5px 10px", borderRadius: 6 }}>{comp}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : selected.ai_summary ? (
                  <div style={{ background: "#EEF2FF", border: `1px solid ${C.navy}33`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.navy, fontFamily: FONT }}>
                    🤖 {selected.ai_summary}
                    <div style={{ marginTop: 6, fontSize: 11, color: "#888" }}>상세 분석은 "🔄 재분석" 버튼을 눌러주세요</div>
                  </div>
                ) : (
                  <div style={{ background: "#f9f9f9", borderRadius: 8, padding: "14px 12px", textAlign: "center", fontSize: 12, color: "#999", fontFamily: FONT }}>
                    AI 분석 없음 — "🔄 재분석" 버튼으로 실행하세요
                  </div>
                )}
              </div>

              {/* 상세 내용 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>상세 설명</div>
                <div style={{ background: "#f8f9ff", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{selected.description}</div>
              </div>

              {/* 재현 방법 */}
              {selected.repro_steps && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>재현 방법</div>
                  <div style={{ background: "#fffbeb", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap", border: "1px solid #fde68a" }}>{selected.repro_steps}</div>
                </div>
              )}

              {/* 스크린샷 */}
              {selected.screenshots?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>스크린샷 ({selected.screenshots.length}장)</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selected.screenshots.map((s, i) => (
                      <a key={i} href={s} target="_blank" rel="noopener noreferrer">
                        <img src={s} alt={`스크린샷${i+1}`} style={{ width: 90, height: 70, objectFit: "cover", borderRadius: 8, border: "1px solid #DDD", cursor: "pointer" }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* 상태 변경 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>상태 변경</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {Object.entries(BUG_STATUS).map(([k, v]) => (
                    <button key={k} onClick={() => updateStatus(selected.id, k)} style={{
                      padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                      border: `1.5px solid ${selected.status === k ? v.color : C.border}`,
                      background: selected.status === k ? v.bg : "#fff",
                      color: selected.status === k ? v.color : "#666",
                    }}>{v.label}</button>
                  ))}
                </div>
              </div>

              {/* 관리자 메모 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>관리자 메모</div>
                <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} placeholder="처리 내용, 참고사항 등..." style={{ width: "100%", padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }} />
                <button onClick={saveMemo} disabled={saving} style={{ width: "100%", marginTop: 6, padding: "8px 0", borderRadius: 8, border: "none", background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  {saving ? "저장 중..." : "💾 메모 저장"}
                </button>
              </div>

              <button onClick={() => deleteReport(selected.id)} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: `1px solid #DC2626`, background: "#fff", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                🗑️ 삭제
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 17. 메인 앱 쉘 ────────────────────────────────────
function MainApp() {
  const { profile, signOut, can, isCrewRole } = useAuth();
  // 크루 역할: 기본 페이지를 현장일보로 고정
  const [page, setPage] = useState(isCrewRole ? "daily_report" : "main_dashboard");
  const [openSections, setOpenSections] = useState({ hr: !isCrewRole, site: true, profit: false, calc: false });
  const [employees, setEmployees] = useState([]);
  const [contractEmp, setContractEmp] = useState(null);
  const [docTargetEmp, setDocTargetEmp] = useState(null);
  const [contractEdit, setContractEdit] = useState(null);
  const [empLoading, setEmpLoading] = useState(true);

  // 수익성 분석 공유 state (MainDashboard + ProfitabilityPage)
  const [profitMonth, setProfitMonth] = useState("2026-02");
  const [revenueData, setRevenueData] = useState({});
  const [overheadData, setOverheadData] = useState({});
  const [laborData, setLaborData] = useState({});       // ★ 인건비(고정/대체)
  const [valetFeeData, setValetFeeData] = useState({}); // ★ 현장일보 확정 발렛비
  const [siteDetailsMap, setSiteDetailsMap] = useState({}); // ★ 사업장 상세(월계약금 등)

  // ★ Phase B: monthly_summary 로딩 (재무 KPI + 기간연산)
  const [monthlySummary, setMonthlySummary] = useState([]);
  const loadMonthlySummary = async () => {
    const { data } = await supabase.from("monthly_summary").select("*").order("month", { ascending: false });
    if (data) setMonthlySummary(data);
  };

  // ★ 현장일보 대시보드 연동 데이터
  const [dailyReportSummary, setDailyReportSummary] = useState({ todayReports: [], monthReports: [], staffMap: {} });
  const loadDailyReportSummary = async () => {
    try {
      const todayStr = today();
      const monthStr = todayStr.slice(0, 7);
      const startDate = `${monthStr}-01`;
      const [y, m] = monthStr.split("-").map(Number);
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      const endDate = `${ny}-${String(nm).padStart(2, "0")}-01`;
      const { data: reps } = await supabase.from("daily_reports").select("*").gte("report_date", startDate).lt("report_date", endDate).order("report_date");
      const reportList = reps || [];
      const todayReports = reportList.filter(r => r.report_date === todayStr);
      // staff count per report
      let sMap = {};
      if (reportList.length > 0) {
        const ids = reportList.map(r => r.id);
        const { data: staffData } = await supabase.from("daily_report_staff").select("report_id, id").in("report_id", ids);
        (staffData || []).forEach(s => { if (!sMap[s.report_id]) sMap[s.report_id] = 0; sMap[s.report_id]++; });
      }
      setDailyReportSummary({ todayReports, monthReports: reportList, staffMap: sMap });
    } catch (e) { console.error("loadDailyReportSummary error:", e); }
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

  // ★ Phase C: 비용입력 DB 저장 (site_revenue - 발렛비)
  const saveRevenueToDB = useCallback(async (month, siteCode, amount) => {
    const { error } = await supabase.from("site_revenue")
      .upsert({ site_code: siteCode, month, revenue: Math.round(amount) }, { onConflict: "site_code,month" });
    if (error) console.error("site_revenue save error:", error);
  }, []);

  // ★ 인건비(고정/대체) DB 저장 (site_revenue 동일 테이블)
  const saveLaborToDB = useCallback(async (month, siteCode, field, value) => {
    const { error } = await supabase.from("site_revenue")
      .upsert({ site_code: siteCode, month, [field]: Math.round(value) }, { onConflict: "site_code,month" });
    if (error) console.error("labor save error:", error);
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
      const labMap = {};
      const vfMap = {};
      revRows.forEach(r => {
        if (!revMap[r.month]) revMap[r.month] = {};
        revMap[r.month][r.site_code] = r.revenue;
        if (!labMap[r.month]) labMap[r.month] = {};
        labMap[r.month][r.site_code] = { fixed: r.labor_fixed || 0, sub: r.labor_sub || 0 };
        // valet_fee (현장일보 확정분)
        if (r.valet_fee) {
          if (!vfMap[r.month]) vfMap[r.month] = {};
          vfMap[r.month][r.site_code] = r.valet_fee;
        }
      });
      setRevenueData(revMap);
      setLaborData(labMap);
      setValetFeeData(vfMap);
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

  // ★ 사업장 상세정보 로딩 (월계약금 등)
  const loadSiteDetails = async () => {
    const { data } = await supabase.from("site_details").select("*");
    if (data) {
      const map = {};
      data.forEach(d => { map[d.site_code] = d; });
      _refreshGlobalSites(map); // ★ 동적 사업장 목록 갱신
      setSiteDetailsMap(map);
    }
  };

  // ★ 사업장 상세정보 저장 (비용입력 계약현황탭용)
  const saveDetailToDB = useCallback(async (code, field, value) => {
    const site = SITES.find(s => s.code === code);
    const { error } = await supabase.from("site_details")
      .upsert({ site_code: code, site_name: site?.name || "", [field]: value, updated_at: new Date().toISOString() }, { onConflict: "site_code" });
    if (error) console.error("site_details save error:", error);
    setSiteDetailsMap(prev => ({ ...prev, [code]: { ...(prev[code] || {}), site_code: code, [field]: value } }));
  }, []);

  // ★ 월주차 데이터 로딩 (대시보드 D-7 알림 + 매출 카드)
  const [monthlyParkingData, setMonthlyParkingData] = useState([]);
  const loadMonthlyParking = async () => {
    const { data } = await supabase.from("monthly_parking").select("*").eq("status", "계약중").order("contract_end");
    if (data) setMonthlyParkingData(data);
  };

  const profitState = {
    profitMonth, setProfitMonth,
    revenueData, setRevenueData, overheadData, setOverheadData,
    laborData, setLaborData,
    valetFeeData,
    siteDetailsMap,
    monthlySummary, chartTransactions,
    saveRevenueToDB, saveOverheadToDB, saveLaborToDB, saveDetailToDB,
    monthlyParkingData,
    dailyReportSummary, loadDailyReportSummary,
  };

  // Supabase에서 직원 데이터 로드
  const loadEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("*").order("emp_no");
    if (data) setEmployees(data.map(e => ({ ...e, status: e.status === "active" ? "재직" : e.status === "inactive" ? "퇴사" : e.status })));
    setEmpLoading(false);
  };

  useEffect(() => { (async () => { await loadSiteDetails(); loadEmployees(); loadMonthlySummary(); loadChartTransactions(); loadCostData(); loadMonthlyParking(); loadDailyReportSummary(); })(); }, []);

  // 직원 추가/수정
  const saveEmployee = async (emp) => {
    const { id, created_at, updated_at, ...rest } = emp;
    // status 역매핑: 재직→active, 퇴사→inactive
    if (rest.status === "재직") rest.status = "active";
    else if (rest.status === "퇴사") rest.status = "inactive";
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
  const goResign = (emp) => { setDocTargetEmp(emp || null); setPage("resignation"); };
  const goCertificate = (emp) => { setDocTargetEmp(emp || null); setPage("certificate"); };
  const goEditContract = (c) => { setContractEdit(c); setContractEmp(null); setPage("contract"); };
  const goNewContract = () => { setContractEdit(null); setContractEmp(null); setPage("contract"); };

  // 크루: 현장일보만 표시
  const hrNavItems = isCrewRole ? [] : [
    { key: "dashboard", icon: "📊", label: "HR 대시보드" },
    { key: "employees", icon: "👥", label: "직원현황" },
    { key: "history", icon: "📋", label: "계약 이력" },
    ...(can("settings") ? [{ key: "settings", icon: "⚙️", label: "계약서 조항변경" }] : []),
  ];

  const profitNavItems = isCrewRole ? [] : [
    { key: "profit_summary", icon: "📊", label: "전체 요약" },
    { key: "profit_site_pl", icon: "🏢", label: "사업장 PL" },
    { key: "profit_cost_input", icon: "✏️", label: "비용 입력" },
    { key: "payroll", icon: "💰", label: "급여대장" },
    { key: "monthly_parking", icon: "🅿️", label: "월주차 관리" },
    { key: "profit_comparison", icon: "📈", label: "비교 분석" },
    { key: "profit_alloc", icon: "⚙️", label: "배부 설정" },
    { key: "profit_import", icon: "📥", label: "데이터 Import" },
  ];

  const siteNavItems = isCrewRole
    ? [{ key: "daily_report", icon: "📋", label: "현장 일보" }]
    : [
        { key: "site_management", icon: "🏢", label: "사업장 관리" },
        { key: "daily_report", icon: "📋", label: "현장 일보" },
        { key: "closing_report", icon: "📊", label: "마감보고현황" },
        { key: "attendance", icon: "📅", label: "근태현황" },
        { key: "full_calendar", icon: "📆", label: "전체 캘린더" },
      ];

  const calcNavItems = isCrewRole ? [] : [
    { key: "salary_calc", icon: "📋", label: "인건비 견적" },
  ];
  const bugNavItems = (profile?.role === "super_admin" || profile?.role === "admin")
    ? [{ key: "bug_reports", icon: "🐛", label: "오류 보고" }]
    : [];

  // 아코디언: 페이지 변경 시 해당 섹션 자동 펼침
  const sectionKeyMap = { hr: hrNavItems, site: siteNavItems, profit: profitNavItems, calc: calcNavItems };
  useEffect(() => {
    for (const [sec, items] of Object.entries(sectionKeyMap)) {
      if (items.some(i => i.key === page)) {
        setOpenSections(prev => prev[sec] ? prev : { ...prev, [sec]: true });
        break;
      }
    }
  }, [page]);
  const toggleSection = (sec) => setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));

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
          <div onClick={() => toggleSection("hr")} style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1, flex: 1 }}>HR & 계약관리</span>
            <span style={{ fontSize: 10, color: C.gold, transition: "transform 0.2s", transform: openSections.hr ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </div>
          {openSections.hr && hrNavItems.map(item => (
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

          {/* 사업장 현황 영역 */}
          <div onClick={() => toggleSection("site")} style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1, flex: 1 }}>사업장 현황</span>
            <span style={{ fontSize: 10, color: C.gold, transition: "transform 0.2s", transform: openSections.site ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </div>
          {openSections.site && siteNavItems.map(item => (
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

          {/* 수익성 분석 영역 */}
          <div onClick={() => toggleSection("profit")} style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1, flex: 1 }}>수익성 분석</span>
            <span style={{ fontSize: 10, color: C.gold, transition: "transform 0.2s", transform: openSections.profit ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </div>
          {openSections.profit && profitNavItems.map(item => (
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
          <div onClick={() => toggleSection("calc")} style={{ margin: "4px 4px 8px", padding: "8px 14px", borderRadius: 20, background: "rgba(245,183,49,0.15)", display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold, letterSpacing: 1, flex: 1 }}>견적 계산기</span>
            <span style={{ fontSize: 10, color: C.gold, transition: "transform 0.2s", transform: openSections.calc ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </div>
          {openSections.calc && calcNavItems.map(item => (
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

        {/* 오류보고 메뉴 (admin 이상) */}
        {bugNavItems.length > 0 && (
          <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={() => setPage("bug_reports")} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px",
              borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: page === "bug_reports" ? "rgba(255,255,255,0.15)" : "transparent",
              color: page === "bug_reports" ? C.white : "rgba(255,255,255,0.65)",
              fontFamily: FONT,
            }}>
              <span style={{ fontSize: 15 }}>🐛</span> 오류 보고
            </button>
          </div>
        )}

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
        {page === "employees" && <EmployeeRoster employees={employees} saveEmployee={saveEmployee} deleteEmployee={deleteEmployee} onContract={goContract} onResign={goResign} onCertificate={goCertificate} onReload={loadEmployees} onNavigate={setPage} />}
        {page === "contract" && <ContractWriter employees={employees} initialEmp={contractEmp} initialContract={contractEdit} onSave={() => {}} />}
        {page === "history" && <ContractHistory employees={employees} onEditContract={goEditContract} onNewContract={goNewContract} />}
        {page === "resignation" && <Resignation employees={employees} initialEmp={docTargetEmp} />}
        {page === "certificate" && <Certificate employees={employees} initialEmp={docTargetEmp} />}
        {page === "settings" && <Settings />}
        {page === "profit_summary" && <ProfitabilityPage employees={employees} subPage="summary" profitState={profitState} />}
        {page === "profit_site_pl" && <ProfitabilityPage employees={employees} subPage="site_pl" profitState={profitState} />}
        {page === "profit_cost_input" && <ProfitabilityPage employees={employees} subPage="cost_input" profitState={profitState} />}
        {page === "profit_comparison" && <ProfitabilityPage employees={employees} subPage="comparison" profitState={profitState} />}
        {page === "profit_alloc" && <ProfitabilityPage employees={employees} subPage="alloc_settings" profitState={profitState} />}
        {page === "profit_import" && <FinancialImportPage onImportComplete={() => { loadMonthlySummary(); loadChartTransactions(); }} />}
        {page === "monthly_parking" && <MonthlyParkingPage employees={employees} onDataChange={loadMonthlyParking} />}
        {page === "payroll" && <PayrollPage employees={employees} profitState={profitState} />}
        {page === "site_management" && <SiteManagementPage employees={employees} onSiteChange={loadSiteDetails} />}
        {page === "daily_report" && <DailyReportPage employees={employees} onDataChange={() => { loadDailyReportSummary(); loadCostData(); }} />}
        {page === "closing_report" && <ClosingReportPage employees={employees} />}
        {page === "attendance" && <AttendancePage employees={employees} />}
        {page === "full_calendar" && <FullCalendarPage employees={employees} />}
        {page === "salary_calc" && <SalaryCalculatorPage />}
        {page === "bug_reports" && <BugReportDashboard />}
      </main>

      {/* 오류보고 FAB — 모든 로그인 사용자 */}
      <BugReportFAB
        currentPage={page}
        reporterName={profile?.name || ""}
        reporterEmpNo={profile?.emp_no || ""}
        reporterRole={profile?.role || ""}
      />
    </div>
  );
}

// ── 16-6-A. 마감보고현황 (v8.6) ─────────────────────────

function ClosingReportPage({ employees }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  // 전일 계산
  const yesterdayObj = new Date(); yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()); // 0-based
  const [selectedDate, setSelectedDate] = useState(todayStr); // 캘린더 선택 날짜
  const [kpiDate, setKpiDate] = useState(yesterdayStr); // KPI 기준 날짜 (전일 기본)
  const [siteFilter, setSiteFilter] = useState("all"); // 매장 필터
  const [reports, setReports] = useState([]);
  const [staffRows, setStaffRows] = useState([]);
  const [paymentRows, setPaymentRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // 활성 사업장 (재직자가 있는 사업장 + 커스텀 사업장)
  const [customSites, setCustomSites] = useState([]);
  useEffect(() => {
    (async () => {
      const { data: details } = await supabase.from("site_details").select("site_code, site_name");
      if (details) {
        const extras = details.filter(d => !SITES.find(s => s.code === d.site_code) && d.site_name)
          .map(d => ({ code: d.site_code, name: d.site_name }));
        setCustomSites(extras);
      }
    })();
  }, []);

  const allFieldSites = useMemo(() => {
    const base = FIELD_SITES;
    return [...base, ...customSites.filter(cs => !base.find(b => b.code === cs.code))];
  }, [customSites]);

  const activeFieldEmps = useMemo(() =>
    employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000")
      .sort((a, b) => (a.site_code_1 || "").localeCompare(b.site_code_1 || "") || (a.name || "").localeCompare(b.name || ""))
  , [employees]);
  const activeSites = useMemo(() => {
    const codes = new Set(activeFieldEmps.map(e => e.site_code_1));
    return allFieldSites.filter(s => codes.has(s.code));
  }, [activeFieldEmps, allFieldSites]);

  // 매장필터 적용된 사이트
  const filteredSites = useMemo(() => {
    if (siteFilter === "all") return activeSites;
    return activeSites.filter(s => s.code === siteFilter);
  }, [activeSites, siteFilter]);

  // 월 데이터 로딩
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const startDate = `${monthStr}-01`;
        const nm = month === 11 ? 1 : month + 2;
        const ny = month === 11 ? year + 1 : year;
        const endDate = `${ny}-${String(nm).padStart(2, "0")}-01`;
        const { data: reps } = await supabase.from("daily_reports").select("*")
          .gte("report_date", startDate).lt("report_date", endDate).order("report_date");
        const repList = reps || [];
        setReports(repList);
        if (repList.length > 0) {
          const ids = repList.map(r => r.id);
          const { data: staff } = await supabase.from("daily_report_staff").select("*").in("report_id", ids);
          setStaffRows(staff || []);
          const { data: pay } = await supabase.from("daily_report_payment").select("*").in("report_id", ids);
          setPaymentRows(pay || []);
        } else {
          setStaffRows([]);
          setPaymentRows([]);
        }
      } catch (e) { console.error("마감보고 로드 오류:", e); }
      setLoading(false);
    })();
  }, [monthStr]);

  // 캘린더 날짜 계산
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=일
  const calendarDays = useMemo(() => {
    const days = [];
    const startIdx = firstDow === 0 ? 6 : firstDow - 1; // 월요일 시작
    for (let i = 0; i < startIdx; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [year, month, daysInMonth, firstDow]);

  const getDateStr = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // 날짜별 → 사업장별 리포트맵
  const reportMap = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = getDateStr(d);
      map[ds] = {};
      const dayReps = reports.filter(r => r.report_date === ds);
      dayReps.forEach(r => {
        const stf = staffRows.filter(s => s.report_id === r.id);
        const pay = paymentRows.filter(p => p.report_id === r.id);
        map[ds][r.site_code] = { report: r, staffCount: stf.length, staff: stf, payments: pay };
      });
    }
    return map;
  }, [reports, staffRows, paymentRows, daysInMonth, monthStr]);

  // 월 이동
  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth()); setSelectedDate(todayStr); };

  // 통계 — kpiDate 기준 (전일 기본, 날짜선택 가능)
  const stats = useMemo(() => {
    const dayReports = reports.filter(r => r.report_date === kpiDate);
    // 사이트 필터 적용
    const filteredDayReports = siteFilter === "all" ? dayReports : dayReports.filter(r => r.site_code === siteFilter);
    const totalReps = filteredDayReports.length;
    const dayStaff = staffRows.filter(s => filteredDayReports.some(r => r.id === s.report_id));
    const uniqueStaff = new Set(dayStaff.map(s => s.employee_id).filter(Boolean)).size;
    const uniqueSites = new Set(filteredDayReports.map(r => r.site_code)).size;
    // 미제출: kpiDate 기준 활성 사업장 중 일보 없는 곳
    const kpiDow = new Date(kpiDate + "T00:00:00").getDay();
    const kpiIsOff = kpiDow === 0 || isHoliday(kpiDate);
    let missingCount = 0;
    if (!kpiIsOff && kpiDate <= todayStr) {
      const reportedSites = new Set(filteredDayReports.map(r => r.site_code));
      filteredSites.forEach(site => { if (!reportedSites.has(site.code)) missingCount++; });
    }
    const totalValet = filteredDayReports.reduce((s, r) => s + toNum(r.valet_amount), 0);
    return { totalReps, uniqueStaff, uniqueSites, missingCount, totalValet };
  }, [reports, staffRows, reportMap, filteredSites, kpiDate, siteFilter]);

  // 선택된 날짜의 매장별 카드 데이터
  const selectedDayData = useMemo(() => {
    const dayData = reportMap[selectedDate] || {};
    return filteredSites.map(site => {
      const info = dayData[site.code] || null;
      return { code: site.code, name: site.name, info };
    });
  }, [selectedDate, reportMap, filteredSites]);

  // 날짜 셀 클릭
  const handleDayClick = (dayNum) => {
    if (!dayNum) return;
    setSelectedDate(getDateStr(dayNum));
  };

  // 셀 상태 (제출/미제출만 구분) — 매장필터 적용
  const getDayCellInfo = (dayNum) => {
    if (!dayNum) return null;
    const ds = getDateStr(dayNum);
    const dow = new Date(year, month, dayNum).getDay();
    const holiday = isHoliday(ds);
    const isSun = dow === 0;
    const dayData = reportMap[ds] || {};
    // 매장필터 적용
    const filteredEntries = siteFilter === "all" ? Object.values(dayData) : Object.entries(dayData).filter(([code]) => code === siteFilter).map(([, v]) => v);
    const totalStaff = filteredEntries.reduce((s, e) => s + e.staffCount, 0);
    return { 
      ds, holiday, isSun, 
      reportCount: filteredEntries.length, 
      staffCount: totalStaff,
      isFuture: ds > todayStr,
      isSelected: ds === selectedDate,
    };
  };

  // 날짜 셀 렌더
  const renderCell = (dayNum) => {
    const info = getDayCellInfo(dayNum);
    if (!info) return <div style={{ minHeight: 80 }} />;
    const { ds, holiday, isSun, reportCount, staffCount, isFuture, isSelected } = info;
    const isToday = ds === todayStr;
    const isSat = new Date(year, month, dayNum).getDay() === 6;

    let bg = C.white;
    let borderColor = "#E8E8E8";
    if (isSelected) { bg = "#E3F2FD"; borderColor = C.navy; }
    else if (holiday || isSun) { bg = "#FFF5F5"; borderColor = "#FFCDD2"; }
    else if (reportCount > 0) { bg = "#F0FFF4"; borderColor = "#A5D6A7"; }
    else if (!isFuture) { bg = "#FFFBF0"; borderColor = "#FFE0B2"; }

    return (
      <div onClick={() => handleDayClick(dayNum)} style={{
        minHeight: 80, padding: "5px 6px", borderRadius: 8, position: "relative",
        background: bg, border: isSelected ? `2.5px solid ${C.navy}` : `1px solid ${borderColor}`,
        cursor: "pointer", transition: "all 0.15s",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <span style={{
            fontSize: 13, fontWeight: isToday ? 900 : 700,
            color: isSun ? C.error : isSat ? C.blue : isToday ? C.navy : C.dark,
            width: isToday ? 24 : "auto", height: isToday ? 24 : "auto",
            borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: isToday ? C.gold : "transparent",
          }}>{dayNum}</span>
          {holiday && <span style={{ fontSize: 8, color: "#D32F2F", fontWeight: 700 }}>{HOLIDAY_NAMES[ds] || "공휴"}</span>}
        </div>
        {/* 제출 현황 */}
        {reportCount > 0 && (
          <div style={{ fontSize: 10, lineHeight: 1.4 }}>
            <div style={{ color: C.success, fontWeight: 800 }}>✅ {reportCount}업장</div>
            <div style={{ color: C.gray, fontSize: 9 }}>{staffCount}명 근무</div>
          </div>
        )}
        {reportCount === 0 && !holiday && !isSun && !isFuture && (
          <div style={{ fontSize: 10, color: C.orange, fontWeight: 700 }}>미제출</div>
        )}
      </div>
    );
  };

  // 선택된 날짜 포맷
  const selDateObj = new Date(selectedDate + "T00:00:00");
  const selDow = ["일", "월", "화", "수", "목", "금", "토"][selDateObj.getDay()];
  const selDateLabel = `${selDateObj.getMonth() + 1}월 ${selDateObj.getDate()}일 (${selDow})`;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: FONT }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: C.dark, margin: 0 }}>📊 마감보고현황</h2>
      </div>

      {/* KPI 스트립 — kpiDate 기준 (전일 기본) */}
      <div style={{ background: "#fff", border: `1.5px solid ${C.lightGray}`, borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: C.dark }}>📋 일일 현황</span>
          <input type="date" value={kpiDate} max={todayStr}
            onChange={e => setKpiDate(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: FONT, fontWeight: 700, background: "#F4F6FB", color: C.navy, cursor: "pointer" }}
          />
          <button onClick={() => setKpiDate(yesterdayStr)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${kpiDate === yesterdayStr ? C.navy : C.border}`, background: kpiDate === yesterdayStr ? C.navy : "#fff", color: kpiDate === yesterdayStr ? "#fff" : C.gray, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>전일</button>
          <button onClick={() => setKpiDate(todayStr)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${kpiDate === todayStr ? C.navy : C.border}`, background: kpiDate === todayStr ? C.navy : "#fff", color: kpiDate === todayStr ? "#fff" : C.gray, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>오늘</button>
          <span style={{ fontSize: 11, color: C.gray, marginLeft: 4 }}>
            ({(() => { const d = new Date(kpiDate + "T00:00:00"); return `${d.getMonth()+1}/${d.getDate()}(${["일","월","화","수","목","금","토"][d.getDay()]})`; })()})
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {[
            { icon: "📋", label: "제출 일보", value: stats.totalReps, unit: "건", color: C.navy },
            { icon: "⚠️", label: "미제출", value: stats.missingCount, unit: "건", color: stats.missingCount > 0 ? C.error : C.gray },
            { icon: "👥", label: "출근 인원", value: stats.uniqueStaff, unit: "명", color: C.blue },
            { icon: "🏢", label: "운영 사업장", value: stats.uniqueSites, unit: "개", color: C.skyBlue },
            { icon: "💰", label: "발렛비 합계", value: pFmt(stats.totalValet), unit: "", color: C.success },
          ].map((k, i) => (
            <div key={i} style={{ background: "#F8F9FC", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.gray, marginBottom: 3, fontWeight: 700 }}>{k.icon} {k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: k.color, fontFamily: "monospace" }}>
                {k.value}<span style={{ fontSize: 10, fontWeight: 600, color: C.gray }}>{k.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>범례:</span>
        {[
          { color: "#F0FFF4", border: "#A5D6A7", label: "제출", dot: C.success },
          { color: "#FFFBF0", border: "#FFE0B2", label: "미제출", dot: C.orange },
          { color: "#FFF5F5", border: "#FFCDD2", label: "공휴일", dot: "#D32F2F" },
          { color: "#E3F2FD", border: C.navy, label: "선택됨", dot: C.navy },
        ].map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: l.color, border: `1px solid ${l.border}` }} />
            <span style={{ fontSize: 11, color: C.dark, fontWeight: 600 }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* 월 네비게이션 + 매장 선택 */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={prevMonth} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 16, fontWeight: 700, color: C.dark, fontFamily: FONT }}>◀</button>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.navy, minWidth: 160, textAlign: "center" }}>
          {year}년 {month + 1}월
        </div>
        <button onClick={nextMonth} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: 16, fontWeight: 700, color: C.dark, fontFamily: FONT }}>▶</button>
        <button onClick={goToday} style={{
          padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.navy}`,
          background: C.navy, color: C.white, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
        }}>오늘</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.gray }}>매장</span>
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: FONT, fontWeight: 700, background: "#fff", color: C.dark, minWidth: 130 }}>
            <option value="all">전체 ({activeSites.length}개)</option>
            {activeSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: C.gray }}>로딩 중...</div>}

      {/* 캘린더 그리드 */}
      {!loading && (
        <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.lightGray}`, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `2px solid ${C.navy}` }}>
            {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
              <div key={d} style={{
                padding: "10px 0", textAlign: "center", fontSize: 12, fontWeight: 900,
                color: i === 6 ? C.error : i === 5 ? C.blue : C.dark,
                background: C.navy + "0A",
              }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, padding: 4 }}>
            {calendarDays.map((dayNum, idx) => (
              <div key={idx}>{renderCell(dayNum)}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── 선택된 날짜 → 매장별 카드 ── */}
      {!loading && selectedDate && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
            padding: "12px 20px", background: C.navy, borderRadius: 12,
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: C.white }}>📅 {selDateLabel}</span>
            <span style={{ fontSize: 13, color: C.gold, fontWeight: 700 }}>
              {(() => {
                const dayData = reportMap[selectedDate] || {};
                const cnt = Object.keys(dayData).length;
                return cnt > 0 ? `${cnt}개 매장 보고완료` : "보고 없음";
              })()}
            </span>
            {isHoliday(selectedDate) && (
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#E53935", color: C.white, fontWeight: 700 }}>
                {HOLIDAY_NAMES[selectedDate] || "공휴일"}
              </span>
            )}
          </div>

          {/* 매장별 카드 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {selectedDayData.map(({ code, name, info }) => {
              const submitted = !!info;
              const selDow2 = new Date(selectedDate + "T00:00:00").getDay();
              const isFutureDate = selectedDate > todayStr;
              const isOffDay = selDow2 === 0 || isHoliday(selectedDate);

              return (
                <div key={code} style={{
                  background: C.white, borderRadius: 14, overflow: "hidden",
                  border: submitted ? `1.5px solid ${C.success}` : isOffDay ? `1px solid ${C.lightGray}` : isFutureDate ? `1px solid ${C.lightGray}` : `1.5px solid ${C.orange}`,
                  opacity: isOffDay && !submitted ? 0.5 : 1,
                }}>
                  {/* 카드 헤더 */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px",
                    background: submitted ? "#F0FFF4" : isOffDay ? "#F9F9F9" : isFutureDate ? "#FAFAFA" : "#FFF8F0",
                    borderBottom: `1px solid ${submitted ? "#C8E6C9" : C.lightGray}`,
                  }}>
                    <div>
                      <span style={{ fontSize: 10, color: C.gray, fontWeight: 700, marginRight: 6 }}>{code}</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: C.dark }}>{name}</span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6,
                      background: submitted ? "#E8F5E9" : isOffDay ? "#F5F5F5" : isFutureDate ? "#F5F5F5" : "#FFF3E0",
                      color: submitted ? C.success : isOffDay ? C.gray : isFutureDate ? C.gray : C.orange,
                    }}>
                      {submitted ? "✅ 보고완료" : isOffDay ? "휴무" : isFutureDate ? "예정" : "⚠️ 미제출"}
                    </span>
                  </div>

                  {/* 카드 바디 */}
                  {submitted ? (
                    <div style={{ padding: "12px 14px" }}>
                      {/* 핵심 수치 */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div style={{ textAlign: "center", padding: "8px 4px", background: "#F4F6FB", borderRadius: 8 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: C.navy }}>{info.staffCount}</div>
                          <div style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>근무인원</div>
                        </div>
                        <div style={{ textAlign: "center", padding: "8px 4px", background: "#F4F6FB", borderRadius: 8 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: C.success }}>{fmt(toNum(info.report.valet_amount))}</div>
                          <div style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>발렛비(원)</div>
                        </div>
                        <div style={{ textAlign: "center", padding: "8px 4px", background: "#F4F6FB", borderRadius: 8 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: C.blue }}>
                            {info.payments.reduce((s, p) => s + toNum(p.amount), 0) > 0 ? fmt(info.payments.reduce((s, p) => s + toNum(p.amount), 0)) : "—"}
                          </div>
                          <div style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>결제금액</div>
                        </div>
                      </div>
                      {/* 근무자 리스트 */}
                      {info.staff.length > 0 && (
                        <div style={{ borderTop: `1px solid ${C.lightGray}`, paddingTop: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: C.gray, marginBottom: 6 }}>👤 근무자</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {info.staff.map((s, si) => {
                              const emp = employees.find(e => e.id === s.employee_id);
                              return (
                                <span key={si} style={{
                                  fontSize: 11, padding: "3px 8px", borderRadius: 6,
                                  background: "#E3F2FD", color: C.navy, fontWeight: 700,
                                }}>{emp?.name || s.name || "—"}</span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* 메모 */}
                      {info.report.memo && (
                        <div style={{ marginTop: 8, fontSize: 11, color: C.gray, padding: "6px 8px", background: "#FAFAFA", borderRadius: 6, borderLeft: `3px solid ${C.gold}` }}>
                          {info.report.memo}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "16px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 12, color: isOffDay ? C.gray : isFutureDate ? C.gray : C.orange, fontWeight: 600 }}>
                        {isOffDay ? "공휴일/일요일" : isFutureDate ? "아직 도래하지 않은 날짜" : "일보가 제출되지 않았습니다"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 16-6-C. 전체 캘린더 (v8.7) ──────────────────────────────────────

function FullCalendarPage({ employees }) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [viewMode, setViewMode] = useState("all"); // all / site / worker
  const [selSite, setSelSite] = useState("");
  const [selEmpId, setSelEmpId] = useState("");
  const [reports, setReports] = useState([]);
  const [staffRows, setStaffRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  // 활성 사업장 (재직자가 있는 곳, V000 제외)
  const activeSites = useMemo(() => {
    const codes = new Set();
    employees.filter(e => e.status === "재직").forEach(e => {
      const sc = e.site_code_1;
      if (sc && sc !== "V000") codes.add(sc);
    });
    return SITES.filter(s => codes.has(s.code) && s.code !== "V000");
  }, [employees]);

  // 활성 근무자 (재직, V000 제외)
  const activeWorkers = useMemo(() => {
    let list = employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000");
    if (empSearch) {
      const q = empSearch.toLowerCase();
      list = list.filter(e => (e.name || "").includes(q) || (e.emp_no || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const sa = a.site_code_1 || a.site_code || "";
      const sb = b.site_code_1 || b.site_code || "";
      return sa.localeCompare(sb) || (a.name || "").localeCompare(b.name || "");
    });
  }, [employees, empSearch]);

  // 해당 월 날짜 배열
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=일
  const dates = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    return { day: d, dateStr, dow, dayName: DAY_NAMES[dow], isWeekend: dow === 0 || dow === 6, isHoliday: isHoliday(dateStr), isToday: dateStr === todayStr, holidayName: HOLIDAY_NAMES[dateStr] || null, isFuture: dateStr > todayStr };
  }), [year, month, daysInMonth, todayStr]);

  // 월 이동
  const moveMonth = (dir) => {
    let m = month + dir, y = year;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    setYear(y); setMonth(m);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); };

  // 데이터 로딩
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const monthStr = `${year}-${String(month).padStart(2, "0")}`;
        const startDate = `${monthStr}-01`;
        const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;
        const { data: reps } = await supabase.from("daily_reports").select("*").gte("report_date", startDate).lte("report_date", endDate).order("report_date");
        const repList = reps || [];
        setReports(repList);
        if (repList.length > 0) {
          const ids = repList.map(r => r.id);
          // batch fetch (in 절 최대 제한 고려)
          let allStaff = [];
          for (let i = 0; i < ids.length; i += 300) {
            const batch = ids.slice(i, i + 300);
            const { data: st } = await supabase.from("daily_report_staff").select("*").in("report_id", batch);
            if (st) allStaff = allStaff.concat(st);
          }
          setStaffRows(allStaff);
        } else {
          setStaffRows([]);
        }
      } catch (e) { console.error("캘린더 로드 오류:", e); }
      setLoading(false);
    })();
  }, [year, month, daysInMonth]);

  // ── 일보 상태 맵 ── { "site_code-date" → "confirmed" | "submitted" }
  const reportMap = useMemo(() => {
    const map = {};
    reports.forEach(r => {
      const key = `${r.site_code}-${r.report_date}`;
      map[key] = r.status; // "confirmed" or "submitted"
    });
    return map;
  }, [reports]);

  // ── 근무자 출근 맵 ── { "empId-date" → "confirmed" | "submitted" }
  const workerMap = useMemo(() => {
    const map = {};
    staffRows.forEach(s => {
      if (!s.employee_id) return;
      const rep = reports.find(r => r.id === s.report_id);
      if (!rep) return;
      const key = `${s.employee_id}-${rep.report_date}`;
      const st = rep.status === "confirmed" ? "confirmed" : "submitted";
      // confirmed가 우선
      if (!map[key] || st === "confirmed") map[key] = st;
    });
    return map;
  }, [staffRows, reports]);

  // ── 날짜별 사이트 상태 집계 (전체 뷰용) ──
  const dateSummary = useMemo(() => {
    const map = {};
    dates.forEach(d => {
      if (d.isFuture) return;
      let confirmed = 0, submitted = 0, missing = 0;
      activeSites.forEach(site => {
        const key = `${site.code}-${d.dateStr}`;
        const st = reportMap[key];
        if (st === "confirmed") confirmed++;
        else if (st === "submitted") submitted++;
        else missing++;
      });
      map[d.dateStr] = { confirmed, submitted, missing, total: activeSites.length };
    });
    return map;
  }, [dates, activeSites, reportMap]);

  // ── 상태 색상 ──
  const statusColor = (status, isHol, isFuture) => {
    if (isFuture) return { bg: "#F9FAFB", text: "#D1D5DB", border: "#E5E7EB" };
    if (isHol) return { bg: "#FFF5F5", text: "#E53935", border: "#FFCDD2" };
    if (status === "confirmed") return { bg: "#E8F5E9", text: "#2E7D32", border: "#A5D6A7" };
    if (status === "submitted") return { bg: "#FFF3E0", text: "#E65100", border: "#FFCC80" };
    return { bg: "#FFEBEE", text: "#C62828", border: "#EF9A9A" }; // missing
  };

  // ── KPI 계산 ──
  const kpi = useMemo(() => {
    // 오늘 또는 최근 과거일 기준
    const baseDate = todayStr <= dates[dates.length - 1]?.dateStr ? todayStr : dates[dates.length - 1]?.dateStr;
    const pastDates = dates.filter(d => !d.isFuture && !d.isHoliday);
    let totalConfirmed = 0, totalSubmitted = 0, totalMissing = 0, totalWorkers = 0;
    pastDates.forEach(d => {
      const s = dateSummary[d.dateStr];
      if (s) { totalConfirmed += s.confirmed; totalSubmitted += s.submitted; totalMissing += s.missing; }
    });
    // 총 출근 인원 (해당 월)
    const uniqueWorkers = new Set();
    staffRows.forEach(s => { if (s.employee_id) uniqueWorkers.add(s.employee_id); });
    totalWorkers = uniqueWorkers.size;
    const totalSlots = totalConfirmed + totalSubmitted + totalMissing;
    const confirmRate = totalSlots > 0 ? ((totalConfirmed / totalSlots) * 100).toFixed(1) : "0.0";
    // 오늘 기준
    const todaySummary = dateSummary[todayStr] || dateSummary[dates.filter(d => !d.isFuture).pop()?.dateStr] || { confirmed: 0, submitted: 0, missing: 0 };
    return { activeSiteCount: activeSites.length, totalConfirmed, totalSubmitted, totalMissing, confirmRate, totalWorkers, pastDays: pastDates.length, todaySummary };
  }, [dates, dateSummary, activeSites, staffRows, todayStr]);

  // ── 캘린더 그리드 빈 셀 (앞쪽 패딩) ──
  const padBefore = firstDayOfWeek; // 일요일=0

  // ── 스타일 ──
  const cardStyle = { background: "#fff", borderRadius: 16, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 };
  const kpiCardStyle = (color) => ({ background: color + "12", border: `1.5px solid ${color}40`, borderRadius: 12, padding: "12px 16px", textAlign: "center", flex: 1, minWidth: 100 });

  // ── 셀 상태 결정 (매장별 뷰) ──
  const getSiteStatus = (siteCode, dateStr) => reportMap[`${siteCode}-${dateStr}`] || null;

  // ── 셀 상태 결정 (근무자별 뷰) ──
  const getWorkerStatus = (empId, dateStr) => workerMap[`${empId}-${dateStr}`] || null;

  // ── 전체 뷰 셀 내용 ──
  const renderAllCell = (d) => {
    if (d.isFuture) return <div style={{ fontSize: 9, color: "#D1D5DB" }}>—</div>;
    if (d.isHoliday) return <div style={{ fontSize: 9, color: C.error, fontWeight: 700 }}>{d.holidayName || "공휴일"}</div>;
    const s = dateSummary[d.dateStr];
    if (!s) return null;
    const total = s.total;
    // 도넛 대신 미니 바 표시
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
        {s.confirmed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#43A047", flexShrink: 0 }} /><span style={{ color: "#2E7D32", fontWeight: 700 }}>{s.confirmed}</span></div>}
        {s.submitted > 0 && <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#E97132", flexShrink: 0 }} /><span style={{ color: "#E65100", fontWeight: 700 }}>{s.submitted}</span></div>}
        {s.missing > 0 && <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#E53935", flexShrink: 0 }} /><span style={{ color: "#C62828", fontWeight: 700 }}>{s.missing}</span></div>}
      </div>
    );
  };

  // ── 매장별/근무자별 셀 내용 ──
  const renderStatusCell = (status, d) => {
    if (d.isFuture) return <div style={{ fontSize: 10, color: "#D1D5DB" }}>—</div>;
    if (d.isHoliday) return <div style={{ fontSize: 9, color: C.error, fontWeight: 700 }}>{d.holidayName || "공휴일"}</div>;
    if (status === "confirmed") return <div style={{ fontSize: 11, fontWeight: 800, color: "#2E7D32" }}>✓ 확정</div>;
    if (status === "submitted") return <div style={{ fontSize: 11, fontWeight: 800, color: "#E65100" }}>● 미확정</div>;
    return <div style={{ fontSize: 11, fontWeight: 800, color: "#C62828" }}>✕ 미제출</div>;
  };

  // ── 근무자별: 근무자 셀 내용 ──
  const renderWorkerCell = (status, d) => {
    if (d.isFuture) return <div style={{ fontSize: 10, color: "#D1D5DB" }}>—</div>;
    if (d.isHoliday) return <div style={{ fontSize: 9, color: C.error, fontWeight: 700 }}>{d.holidayName || "공휴일"}</div>;
    if (status === "confirmed") return <div style={{ fontSize: 11, fontWeight: 800, color: "#2E7D32" }}>✓ 출근</div>;
    if (status === "submitted") return <div style={{ fontSize: 11, fontWeight: 800, color: "#E65100" }}>● 출근</div>;
    return <div style={{ fontSize: 10, color: "#9E9E9E" }}>—</div>;
  };

  // ── 캘린더 렌더 ──
  const renderCalendar = () => {
    const cells = [];
    // 앞쪽 빈 셀
    for (let i = 0; i < padBefore; i++) cells.push(<div key={`pad-${i}`} style={{ background: "#FAFBFC", borderRadius: 8 }} />);
    // 날짜 셀
    dates.forEach(d => {
      let cellBg = "#fff";
      let cellBorder = "#E5E7EB";
      let status = null;

      if (viewMode === "all") {
        // 전체 뷰: 배경은 가장 나쁜 상태 기준
        const s = dateSummary[d.dateStr];
        if (d.isHoliday) { cellBg = "#FFF5F5"; cellBorder = "#FFCDD2"; }
        else if (d.isFuture) { cellBg = "#F9FAFB"; cellBorder = "#E5E7EB"; }
        else if (s?.missing > 0) { cellBg = "#FFEBEE"; cellBorder = "#EF9A9A"; }
        else if (s?.submitted > 0) { cellBg = "#FFF3E0"; cellBorder = "#FFCC80"; }
        else if (s?.confirmed > 0) { cellBg = "#E8F5E9"; cellBorder = "#A5D6A7"; }
      } else if (viewMode === "site" && selSite) {
        status = getSiteStatus(selSite, d.dateStr);
        const sc = statusColor(status, d.isHoliday, d.isFuture);
        cellBg = sc.bg; cellBorder = sc.border;
      } else if (viewMode === "worker" && selEmpId) {
        status = getWorkerStatus(selEmpId, d.dateStr);
        if (d.isHoliday) { cellBg = "#FFF5F5"; cellBorder = "#FFCDD2"; }
        else if (d.isFuture) { cellBg = "#F9FAFB"; cellBorder = "#E5E7EB"; }
        else if (status === "confirmed") { cellBg = "#E8F5E9"; cellBorder = "#A5D6A7"; }
        else if (status === "submitted") { cellBg = "#FFF3E0"; cellBorder = "#FFCC80"; }
        else { cellBg = "#F9FAFB"; cellBorder = "#E5E7EB"; }
      }

      cells.push(
        <div key={d.dateStr} style={{ background: cellBg, border: `1.5px solid ${cellBorder}`, borderRadius: 10, padding: "6px 8px", minHeight: 72, display: "flex", flexDirection: "column", position: "relative", transition: "all 0.15s" }}>
          {/* 날짜 헤더 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: d.isToday ? 900 : 700, color: d.isToday ? C.navy : d.isWeekend || d.isHoliday ? C.error : C.dark }}>
              {d.day}
            </span>
            {d.isToday && <span style={{ fontSize: 8, background: C.navy, color: "#fff", padding: "1px 5px", borderRadius: 8, fontWeight: 800 }}>TODAY</span>}
          </div>
          {/* 셀 내용 */}
          {viewMode === "all" && renderAllCell(d)}
          {viewMode === "site" && selSite && renderStatusCell(status, d)}
          {viewMode === "worker" && selEmpId && renderWorkerCell(status, d)}
        </div>
      );
    });
    return cells;
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: C.dark, margin: 0 }}>📆 전체 캘린더</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {[["all", "📋 전체"], ["site", "🏢 매장별"], ["worker", "👤 근무자별"]].map(([k, v]) => (
            <button key={k} onClick={() => setViewMode(k)} style={{ padding: "8px 16px", borderRadius: 10, border: `2px solid ${viewMode === k ? C.navy : C.border}`, background: viewMode === k ? C.navy : "#fff", color: viewMode === k ? "#fff" : C.gray, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* KPI 스트립 */}
      <div style={{ ...cardStyle, padding: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "운영 사업장", value: kpi.activeSiteCount + "개", color: C.navy },
            { label: "확정률", value: kpi.confirmRate + "%", color: C.success },
            { label: "확정", value: fmt(kpi.totalConfirmed), color: "#43A047" },
            { label: "미확정", value: fmt(kpi.totalSubmitted), color: C.orange },
            { label: "미제출", value: fmt(kpi.totalMissing), color: C.error },
            { label: "출근 인원", value: kpi.totalWorkers + "명", color: C.blue },
            { label: "영업일수", value: kpi.pastDays + "일", color: C.gray },
          ].map(k => (
            <div key={k.label} style={kpiCardStyle(k.color)}>
              <div style={{ fontSize: 18, fontWeight: 900, color: k.color, fontFamily: "'Noto Sans KR', monospace" }}>{k.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 필터 영역 (매장별 / 근무자별) */}
      {viewMode === "site" && (
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>🏢 사업장 선택</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {activeSites.map(s => {
              const isSel = selSite === s.code;
              return (
                <button key={s.code} onClick={() => setSelSite(isSel ? "" : s.code)} style={{ padding: "7px 14px", borderRadius: 8, border: `2px solid ${isSel ? C.navy : C.border}`, background: isSel ? C.navy : "#fff", color: isSel ? "#fff" : C.dark, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  {s.name}
                </button>
              );
            })}
          </div>
          {selSite && (() => {
            // 선택된 매장의 월 요약
            const siteConf = dates.filter(d => !d.isFuture && !d.isHoliday && getSiteStatus(selSite, d.dateStr) === "confirmed").length;
            const siteSub = dates.filter(d => !d.isFuture && !d.isHoliday && getSiteStatus(selSite, d.dateStr) === "submitted").length;
            const siteMiss = dates.filter(d => !d.isFuture && !d.isHoliday && !getSiteStatus(selSite, d.dateStr)).length;
            return (
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#2E7D32", background: "#E8F5E9", padding: "4px 10px", borderRadius: 6 }}>✓ 확정 {siteConf}일</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#E65100", background: "#FFF3E0", padding: "4px 10px", borderRadius: 6 }}>● 미확정 {siteSub}일</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#C62828", background: "#FFEBEE", padding: "4px 10px", borderRadius: 6 }}>✕ 미제출 {siteMiss}일</span>
              </div>
            );
          })()}
        </div>
      )}

      {viewMode === "worker" && (
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>👤 근무자 선택</div>
          <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="이름 또는 사번 검색..." style={{ width: "100%", maxWidth: 300, padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: FONT, marginBottom: 10, outline: "none" }} />
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
            {activeWorkers.slice(0, 60).map(w => {
              const isSel = selEmpId === w.id;
              const sc = w.site_code_1 || w.site_code;
              const siteName = SITES.find(s => s.code === sc)?.name || sc;
              return (
                <button key={w.id} onClick={() => setSelEmpId(isSel ? "" : w.id)} style={{ padding: "6px 12px", borderRadius: 8, border: `2px solid ${isSel ? C.navy : C.border}`, background: isSel ? C.navy : "#fff", color: isSel ? "#fff" : C.dark, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
                  <span>{w.name}</span>
                  <span style={{ fontSize: 10, color: isSel ? "rgba(255,255,255,0.7)" : C.gray, marginLeft: 4 }}>{siteName}</span>
                </button>
              );
            })}
          </div>
          {selEmpId && (() => {
            const emp = employees.find(e => e.id === selEmpId);
            const wConf = dates.filter(d => !d.isFuture && !d.isHoliday && getWorkerStatus(selEmpId, d.dateStr) === "confirmed").length;
            const wSub = dates.filter(d => !d.isFuture && !d.isHoliday && getWorkerStatus(selEmpId, d.dateStr) === "submitted").length;
            return (
              <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>{emp?.name} ({emp?.emp_no})</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#2E7D32", background: "#E8F5E9", padding: "4px 10px", borderRadius: 6 }}>✓ 출근(확정) {wConf}일</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#E65100", background: "#FFF3E0", padding: "4px 10px", borderRadius: 6 }}>● 출근(미확정) {wSub}일</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* 캘린더 본체 */}
      <div style={cardStyle}>
        {/* 월 네비게이션 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => moveMonth(-1)} style={{ width: 36, height: 36, borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>◀</button>
            <span style={{ fontSize: 20, fontWeight: 900, color: C.dark, minWidth: 140, textAlign: "center" }}>{year}년 {month}월</span>
            <button onClick={() => moveMonth(1)} style={{ width: 36, height: 36, borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>▶</button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={goToday} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>오늘</button>
            {loading && <span style={{ fontSize: 12, color: C.gray }}>⏳ 로딩...</span>}
          </div>
        </div>

        {/* 범례 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { label: "확정", bg: "#E8F5E9", border: "#A5D6A7", text: "#2E7D32" },
            { label: "미확정", bg: "#FFF3E0", border: "#FFCC80", text: "#E65100" },
            { label: "미제출", bg: "#FFEBEE", border: "#EF9A9A", text: "#C62828" },
            { label: "공휴일", bg: "#FFF5F5", border: "#FFCDD2", text: "#E53935" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: l.text }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: l.bg, border: `1.5px solid ${l.border}` }} />
              {l.label}
            </div>
          ))}
        </div>

        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {DAY_NAMES.map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: i === 0 ? C.error : i === 6 ? "#1565C0" : C.gray, padding: "6px 0" }}>
              {d}
            </div>
          ))}
        </div>

        {/* 캘린더 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {renderCalendar()}
        </div>
      </div>

      {/* 전체 뷰: 하단 사업장별 상세 리스트 */}
      {viewMode === "all" && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, marginBottom: 12 }}>📊 사업장별 일보 현황 ({year}년 {month}월)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.navy }}>
                  <th style={{ padding: "10px 12px", color: "#fff", fontWeight: 800, textAlign: "left", borderRadius: "8px 0 0 0", position: "sticky", left: 0, zIndex: 2, background: C.navy, minWidth: 100 }}>사업장</th>
                  <th style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "center", minWidth: 50 }}>확정</th>
                  <th style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "center", minWidth: 50 }}>미확정</th>
                  <th style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "center", minWidth: 50 }}>미제출</th>
                  <th style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "center", borderRadius: "0 8px 0 0", minWidth: 60 }}>확정률</th>
                </tr>
              </thead>
              <tbody>
                {activeSites.map((site, idx) => {
                  const pastNonHol = dates.filter(d => !d.isFuture && !d.isHoliday);
                  const conf = pastNonHol.filter(d => getSiteStatus(site.code, d.dateStr) === "confirmed").length;
                  const sub = pastNonHol.filter(d => getSiteStatus(site.code, d.dateStr) === "submitted").length;
                  const miss = pastNonHol.filter(d => !getSiteStatus(site.code, d.dateStr)).length;
                  const rate = pastNonHol.length > 0 ? ((conf / pastNonHol.length) * 100).toFixed(0) : "0";
                  return (
                    <tr key={site.code} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: `1px solid ${C.lightGray}` }}>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: C.dark, position: "sticky", left: 0, background: idx % 2 === 0 ? "#fff" : "#FAFBFC", zIndex: 1 }}>
                        <span style={{ fontSize: 10, color: C.gray, marginRight: 4 }}>{site.code}</span>{site.name}
                      </td>
                      <td style={{ padding: "9px 8px", textAlign: "center", fontWeight: 700, color: "#2E7D32" }}>{conf}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", fontWeight: 700, color: "#E65100" }}>{sub}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", fontWeight: 700, color: "#C62828" }}>{miss}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, background: Number(rate) >= 80 ? "#E8F5E9" : Number(rate) >= 50 ? "#FFF3E0" : "#FFEBEE", color: Number(rate) >= 80 ? "#2E7D32" : Number(rate) >= 50 ? "#E65100" : "#C62828" }}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 16-6-B. 근태현황 — 전체캘린더 (v8.5) ─────────────────────────────

// 2026년 법정공휴일
const HOLIDAYS_2026 = new Set([
  "2026-01-01","2026-01-27","2026-01-28","2026-01-29","2026-01-30",
  "2026-03-01","2026-05-05","2026-05-06","2026-05-15",
  "2026-06-06","2026-08-15",
  "2026-09-17","2026-09-18","2026-09-19",
  "2026-10-03","2026-10-09","2026-12-25",
]);
const isHoliday = (dateStr) => HOLIDAYS_2026.has(dateStr);
const HOLIDAY_NAMES = {
  "2026-01-01":"신정","2026-01-27":"설날전날","2026-01-28":"설날","2026-01-29":"설날다음날","2026-01-30":"대체공휴일",
  "2026-03-01":"삼일절","2026-05-05":"어린이날","2026-05-06":"대체공휴일","2026-05-15":"부처님오신날",
  "2026-06-06":"현충일","2026-08-15":"광복절",
  "2026-09-17":"추석전날","2026-09-18":"추석","2026-09-19":"추석다음날",
  "2026-10-03":"개천절","2026-10-09":"한글날","2026-12-25":"크리스마스",
};

const ATT_STATUSES = [
  { key: "출근", label: "출근", color: "#C8E6C9", text: "#2E7D32", bg: "#E8F5E9" },
  { key: "추가", label: "추가", color: "#E8D5F5", text: "#7C3AED", bg: "#F3EDFF" },
  { key: "지각", label: "지각", color: "#FFF9C4", text: "#F57F17", bg: "#FFFDE7" },
  { key: "결근", label: "결근", color: "#FFCDD2", text: "#C62828", bg: "#FFEBEE" },
  { key: "휴무", label: "휴무", color: "#E0E0E0", text: "#757575", bg: "#F5F5F5" },
  { key: "연차", label: "연차", color: "#E1BEE7", text: "#6A1B9A", bg: "#F3E5F5" },
];
const ATT_MAP = Object.fromEntries(ATT_STATUSES.map(s => [s.key, s]));
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 근무코드별 비근무 요일 (0=일, 1=월, ..., 6=토)
const getOffDays = (workCode) => {
  if (!workCode) return null;
  const base = workCode.replace(/P/g, "");
  switch (base) {
    case "A": case "B": case "C": return [0, 6];   // 평일제 → 토/일 휴무
    case "D":                      return [0];       // 평(6) → 일요일만 휴무
    case "E":                      return [1,2,3,4,5]; // 주(2) → 평일 휴무
    case "F":                      return [0,1,2,3,4,5]; // 주(토) → 토요일만 근무
    case "G":                      return [1,2,3,4,5,6]; // 주(일) → 일요일만 근무
    case "AE":                     return null;       // 평(3)+주(2) → 매일 근무
    case "CF":                     return [0];         // 평(5)+주(토) → 일요일 휴무
    case "CG":                     return [6];         // 평(5)+주(일) → 토요일 휴무
    case "FG":                     return [1,2,3,4,5]; // 주(토)+주(일) → 평일 휴무
    default:                       return null;
  }
};

// ── 16-6-C. v9.3 근태분석 공통 유틸 ─────────────────────────────────

// 근무형태별 월간 근무예정일수 계산
function getExpectedWorkDays(workCode, year, month) {
  if (!workCode) return 0;
  const offDays = getOffDays(workCode);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    if (HOLIDAYS_2026.has(dateStr)) continue;
    if (offDays && offDays.includes(dow)) continue;
    count++;
  }
  return count;
}

// 근무형태별 주말 근무예정일수 (주말제/복합 직원의 주말 카운트)
function getExpectedWeekendDays(workCode, year, month) {
  if (!workCode) return 0;
  const cat = getWorkCat(workCode);
  if (cat === "weekday") return 0; // 순수 평일제는 주말근무 없음
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    if (HOLIDAYS_2026.has(dateStr)) continue;
    if (dow !== 0 && dow !== 6) continue; // 평일 skip
    const offDays = getOffDays(workCode);
    if (offDays && offDays.includes(dow)) continue;
    count++;
  }
  return count;
}

// 개인별 근태 통계 계산
function calcPersonalAttStats(empId, workCode, dates, getCellStatusFn, todayStr) {
  let att = 0, extra = 0, late = 0, absent = 0, leave = 0, offDay = 0;
  const pastDates = dates.filter(d => d.dateStr <= todayStr);
  pastDates.forEach(d => {
    const st = getCellStatusFn(empId, d.dateStr, workCode);
    if (st === "출근") att++;
    else if (st === "추가") extra++;
    else if (st === "지각") late++;
    else if (st === "결근") absent++;
    else if (st === "연차") leave++;
    else if (st === "휴무") offDay++;
  });
  const worked = att + extra + late;
  const regularWorked = att + late; // 출근률 산정 기준: 정규출근 + 지각만 (추가근무 제외)
  const totalWorkable = pastDates.filter(d => {
    const offDays = getOffDays(workCode);
    if (d.isHoliday) return false;
    if (offDays && offDays.includes(d.dayOfWeek)) return false;
    return true;
  }).length;
  const attRate = totalWorkable > 0 ? Math.round((regularWorked / totalWorkable) * 100) : 0;
  const lateRate = totalWorkable > 0 ? Math.round((late / totalWorkable) * 100) : 0;
  return { att, extra, late, absent, leave, offDay, worked, regularWorked, totalWorkable, attRate, lateRate };
}

// 예상급여 계산 (근태기반)
function calcExpectedPay(emp, stats, year, month) {
  if (!emp) return { expectedPay: 0, contractPay: 0, diff: 0, method: "" };
  const cat = getWorkCat(emp.work_code);
  const baseSalary = toNum(emp.base_salary);
  const weekendDaily = toNum(emp.weekend_daily);
  const expectedTotal = getExpectedWorkDays(emp.work_code, year, month);

  if (cat === "weekday") {
    // 월급제: base_salary × (실출근 / 예정근무일)
    const ratio = expectedTotal > 0 ? stats.worked / expectedTotal : 0;
    const expected = Math.round(baseSalary * ratio);
    return { expectedPay: expected, contractPay: baseSalary, diff: expected - baseSalary, method: "월급비례" };
  } else if (cat === "weekend") {
    // 일당제: weekend_daily × 실출근일
    const expected = weekendDaily * stats.worked;
    const expectedWeekend = getExpectedWeekendDays(emp.work_code, year, month);
    const contractPay = weekendDaily * expectedWeekend;
    return { expectedPay: expected, contractPay, diff: expected - contractPay, method: "일당제" };
  } else if (cat === "mixed") {
    // 복합: base_salary + weekend_daily × 주말실출근
    const weekdayExpected = expectedTotal - getExpectedWeekendDays(emp.work_code, year, month);
    const weekdayWorked = stats.att + stats.late; // 주중 출근 (추가근무는 별도)
    const weekdayRatio = weekdayExpected > 0 ? Math.min(1, weekdayWorked / weekdayExpected) : 0;
    const weekendWorked = stats.extra; // 주말분은 추가로 잡힘
    const expected = Math.round(baseSalary * weekdayRatio) + (weekendDaily * weekendWorked);
    const contractPay = baseSalary + (weekendDaily * getExpectedWeekendDays(emp.work_code, year, month));
    return { expectedPay: expected, contractPay, diff: expected - contractPay, method: "복합" };
  } else {
    // 알바(W): 일당 × 출근일
    const dailyPay = weekendDaily || baseSalary;
    const expected = dailyPay * stats.worked;
    return { expectedPay: expected, contractPay: expected, diff: 0, method: "알바일당" };
  }
}

// 연차일수 자동 계산 (근로기준법 제60조)
function calcAnnualLeave(hireDate, targetYear) {
  if (!hireDate) return { total: 0, detail: "입사일 미등록" };
  const hire = new Date(hireDate + "T00:00:00");
  const targetStart = new Date(targetYear, 0, 1);
  const diffMs = targetStart - hire;
  const diffYears = diffMs / (365.25 * 86400000);

  if (diffYears < 0) return { total: 0, detail: "미입사" };
  if (diffYears < 1) {
    // 1년 미만: 매월 개근 시 1일 (최대 11일)
    const months = Math.min(11, Math.floor(diffYears * 12));
    return { total: months, detail: `1년 미만 (${months}개월분)` };
  }
  // 1년 이상: 15일 + 2년 초과 매 2년마다 +1일 (최대 25일)
  const fullYears = Math.floor(diffYears);
  const extra = Math.max(0, Math.floor((fullYears - 1) / 2));
  const total = Math.min(25, 15 + extra);
  return { total, detail: `${fullYears}년차 (기본15+${extra})` };
}

// 근태 등급 판정
function getAttendanceGrade(attRate, lateRate, absentCount) {
  if (attRate >= 95 && lateRate <= 2 && absentCount === 0) return { grade: "A", label: "우수", color: "#16A34A" };
  if (attRate >= 85 && absentCount <= 1) return { grade: "B", label: "양호", color: "#1428A0" };
  if (attRate >= 70) return { grade: "C", label: "주의", color: "#E97132" };
  return { grade: "D", label: "경고", color: "#E53935" };
}

// ── 16-6-D. 개인분석 탭 (v9.3 P1) ─────────────────────────────────

function PersonalAnalyticsTab({ employees, year, month, dates, getCellStatus, todayStr, staffRows, reports, extraAmountMap, moveMonth, goToday, loading }) {
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [siteFilter, setSiteFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [payrollCache, setPayrollCache] = useState({}); // { "empId-YYYY-MM": net_pay }
  const [loadingPayroll, setLoadingPayroll] = useState(false);

  // 직원 필터
  const activeEmps = useMemo(() => employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000"), [employees]);
  const filteredEmps = useMemo(() => {
    let list = activeEmps;
    if (siteFilter !== "all") list = list.filter(e => e.site_code_1 === siteFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => (e.name || "").toLowerCase().includes(s) || (e.emp_no || "").toLowerCase().includes(s));
    }
    return list.sort((a, b) => (a.site_code_1 || "").localeCompare(b.site_code_1 || "") || (a.name || "").localeCompare(b.name || ""));
  }, [activeEmps, siteFilter, search]);

  const siteOptions = useMemo(() => SITES.filter(s => s.code !== "V000" && activeEmps.some(e => e.site_code_1 === s.code)), [activeEmps]);

  // 선택 직원 근태 통계
  const empStats = useMemo(() => {
    if (!selectedEmp) return null;
    return calcPersonalAttStats(selectedEmp.id, selectedEmp.work_code, dates, getCellStatus, todayStr);
  }, [selectedEmp, dates, getCellStatus, todayStr]);

  // 예상급여
  const payCalc = useMemo(() => {
    if (!selectedEmp || !empStats) return null;
    return calcExpectedPay(selectedEmp, empStats, year, month);
  }, [selectedEmp, empStats, year, month]);

  // 연차
  const annualLeave = useMemo(() => {
    if (!selectedEmp) return null;
    return calcAnnualLeave(selectedEmp.hire_date, year);
  }, [selectedEmp, year]);

  // 등급
  const grade = useMemo(() => {
    if (!empStats) return null;
    return getAttendanceGrade(empStats.attRate, empStats.lateRate, empStats.absent);
  }, [empStats]);

  // 추가수당
  const extraAmt = selectedEmp ? (extraAmountMap[selectedEmp.id] || 0) : 0;

  // payroll_records 로드 (선택 직원 바뀔 때)
  useEffect(() => {
    if (!selectedEmp) return;
    const key = `${selectedEmp.id}-${year}-${String(month).padStart(2, "0")}`;
    if (payrollCache[key] !== undefined) return;
    (async () => {
      setLoadingPayroll(true);
      try {
        const { data } = await supabase.from("payroll_records").select("net_pay,year,month")
          .eq("employee_id", selectedEmp.id).eq("year", year).eq("month", month).limit(1);
        setPayrollCache(prev => ({ ...prev, [key]: data?.[0]?.net_pay ?? null }));
      } catch (e) { console.error(e); }
      setLoadingPayroll(false);
    })();
  }, [selectedEmp, year, month]);

  const actualPay = selectedEmp ? payrollCache[`${selectedEmp.id}-${year}-${String(month).padStart(2, "0")}`] : null;

  // 일별 상세 데이터
  const dailyDetails = useMemo(() => {
    if (!selectedEmp) return [];
    return dates.filter(d => d.dateStr <= todayStr).map(d => {
      const status = getCellStatus(selectedEmp.id, d.dateStr, selectedEmp.work_code);
      // 출퇴근 시간 찾기
      const staffRow = staffRows.find(s => {
        if (s.employee_id !== selectedEmp.id) return false;
        const rep = reports.find(r => r.id === s.report_id);
        return rep && rep.report_date === d.dateStr;
      });
      return {
        ...d,
        status: status || (d.isHoliday ? "공휴일" : d.isWeekend ? "주말" : ""),
        checkIn: staffRow?.check_in || "",
        checkOut: staffRow?.check_out || "",
        extraAmt: staffRow ? toNum(staffRow.extra_amount) : 0,
      };
    }).reverse(); // 최신순
  }, [selectedEmp, dates, getCellStatus, todayStr, staffRows, reports]);

  // 6개월 추이 데이터 (간이 계산)
  const trendData = useMemo(() => {
    if (!selectedEmp) return [];
    const result = [];
    for (let i = 5; i >= 0; i--) {
      let m = month - i, y = year;
      while (m < 1) { m += 12; y--; }
      const mDays = new Date(y, m, 0).getDate();
      const mDates = Array.from({ length: mDays }, (_, d) => {
        const dd = d + 1;
        const ds = `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        const dow = new Date(y, m - 1, dd).getDay();
        return { day: dd, dateStr: ds, dayOfWeek: dow, isWeekend: dow === 0 || dow === 6, isHoliday: HOLIDAYS_2026.has(ds) };
      });
      const pastDs = mDates.filter(d => d.dateStr <= todayStr);
      // 간이 통계: staffRows 기반으로 해당 월 출근 횟수 계산
      let worked = 0;
      pastDs.forEach(d => {
        const st = getCellStatus(selectedEmp.id, d.dateStr, selectedEmp.work_code);
        if (st === "출근" || st === "추가" || st === "지각") worked++;
      });
      const expected = getExpectedWorkDays(selectedEmp.work_code, y, m);
      const pastExpected = pastDs.filter(d => {
        if (d.isHoliday) return false;
        const offDays = getOffDays(selectedEmp.work_code);
        if (offDays && offDays.includes(d.dayOfWeek)) return false;
        return true;
      }).length;
      const rate = pastExpected > 0 ? Math.round((worked / pastExpected) * 100) : 0;
      const pk = `${selectedEmp.id}-${y}-${String(m).padStart(2, "0")}`;
      const pay = payrollCache[pk];
      result.push({ label: `${m}월`, month: m, year: y, rate, worked, expected: pastExpected, pay: pay ?? null });
    }
    return result;
  }, [selectedEmp, year, month, todayStr, getCellStatus, payrollCache]);

  // Excel Export
  const exportPersonalExcel = async () => {
    if (!selectedEmp) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // Sheet 1: 일별 상세
    const rows1 = dailyDetails.map(d => ({
      "날짜": d.dateStr, "요일": d.dayName, "상태": d.status,
      "출근시간": d.checkIn || "", "퇴근시간": d.checkOut || "",
      "추가수당": d.extraAmt || "",
    }));
    const ws1 = XLSX.utils.json_to_sheet(rows1);
    ws1["!cols"] = [{ wch: 12 }, { wch: 4 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, "일별상세");
    // Sheet 2: 요약
    const rows2 = [{
      "사번": selectedEmp.emp_no, "이름": selectedEmp.name, "사업장": getSiteName(selectedEmp.site_code_1),
      "근무형태": getWorkLabel(selectedEmp.work_code), "출근일": empStats?.worked || 0,
      "결근": empStats?.absent || 0, "지각": empStats?.late || 0, "연차": empStats?.leave || 0,
      "출근률(%)": empStats?.attRate || 0, "등급": grade?.grade || "",
      "계약급여": payCalc?.contractPay || 0, "예상급여": payCalc?.expectedPay || 0,
      "실지급액": actualPay ?? "", "차이": payCalc?.diff || 0,
    }];
    const ws2 = XLSX.utils.json_to_sheet(rows2);
    XLSX.utils.book_append_sheet(wb, ws2, "요약");
    const { saveAs } = await import("file-saver");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `개인근태_${selectedEmp.name}_${year}년${month}월.xlsx`);
  };

  const statusBg = (st) => {
    const s = ATT_MAP[st];
    return s ? s.bg : "transparent";
  };
  const statusColor = (st) => {
    const s = ATT_MAP[st];
    return s ? s.text : C.gray;
  };

  return (
    <div>
      {/* 월 네비 + 필터 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 12, padding: "10px 16px", flexWrap: "wrap" }}>
        <button onClick={() => moveMonth(-1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E8ECF4", background: "#F4F6FB", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.dark, minWidth: 120, textAlign: "center" }}>{year}년 {month}월</div>
        <button onClick={() => moveMonth(1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E8ECF4", background: "#F4F6FB", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        <button onClick={goToday} style={{ padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: "transparent", color: C.navy, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>오늘</button>
        <div style={{ flex: 1 }} />
        <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); setSelectedEmp(null); }} style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #D8DCE3", fontSize: 12, fontFamily: FONT, fontWeight: 600, background: "#fff" }}>
          <option value="all">전체 사업장</option>
          {siteOptions.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 이름/사번" style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #D8DCE3", fontSize: 12, fontFamily: FONT, width: 130, background: "#fff" }} />
        {selectedEmp && (
          <button onClick={exportPersonalExcel} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: "transparent", color: C.navy, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📥 Excel</button>
        )}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 30, color: C.gray }}>⏳ 로딩 중...</div>}

      <div style={{ display: "grid", gridTemplateColumns: selectedEmp ? "280px 1fr" : "1fr", gap: 16, alignItems: "start" }}>
        {/* 좌측: 직원 목록 */}
        <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden", maxHeight: selectedEmp ? "calc(100vh - 260px)" : 600, overflowY: "auto" }}>
          <div style={{ background: C.navy, padding: "10px 14px", color: "#fff", fontSize: 13, fontWeight: 800 }}>
            👤 직원 선택 <span style={{ fontWeight: 400, opacity: 0.6, marginLeft: 6 }}>{filteredEmps.length}명</span>
          </div>
          {filteredEmps.map(emp => {
            const isSelected = selectedEmp?.id === emp.id;
            const st = calcPersonalAttStats(emp.id, emp.work_code, dates, getCellStatus, todayStr);
            const gr = getAttendanceGrade(st.attRate, st.lateRate, st.absent);
            return (
              <div key={emp.id} onClick={() => setSelectedEmp(emp)} style={{
                padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #F0F2F8",
                background: isSelected ? "#EEF2FF" : "transparent", transition: "background 0.1s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: isSelected ? C.navy : C.dark }}>{emp.name}</span>
                    <span style={{ fontSize: 11, color: C.gray, marginLeft: 6 }}>{emp.emp_no}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: gr.color, background: gr.color + "18", padding: "2px 8px", borderRadius: 6 }}>{gr.grade}</span>
                </div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 3 }}>
                  {getSiteName(emp.site_code_1)} · {getWorkLabel(emp.work_code)} · 출근률 {st.attRate}%
                </div>
              </div>
            );
          })}
          {filteredEmps.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.gray, fontSize: 13 }}>검색 결과 없음</div>}
        </div>

        {/* 우측: 개인 분석 상세 */}
        {selectedEmp && empStats && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 프로필 카드 */}
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ background: C.navy, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: "#fff" }}>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{selectedEmp.name} <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.7 }}>{selectedEmp.emp_no}</span></div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{getSiteName(selectedEmp.site_code_1)} · {getWorkLabel(selectedEmp.work_code)} · 입사 {dateFmt(selectedEmp.hire_date)}</div>
                </div>
                {grade && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: grade.color, background: "#fff", borderRadius: 12, width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>{grade.grade}</div>
                    <div style={{ fontSize: 10, color: "#fff", opacity: 0.7, marginTop: 3 }}>{grade.label}</div>
                  </div>
                )}
              </div>
              {/* KPI 4개 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
                {[
                  { label: "출근률", value: `${empStats.attRate}%`, color: empStats.attRate >= 90 ? C.success : empStats.attRate >= 70 ? C.orange : C.error },
                  { label: "지각률", value: `${empStats.lateRate}%`, color: empStats.lateRate > 5 ? C.error : empStats.lateRate > 0 ? "#F57F17" : C.success },
                  { label: "결근일", value: `${empStats.absent}일`, color: empStats.absent > 0 ? C.error : C.success },
                  { label: "추가근무", value: `${empStats.extra}일`, color: empStats.extra > 0 ? "#7C3AED" : C.gray },
                ].map((k, i) => (
                  <div key={k.label} style={{ padding: "14px", textAlign: "center", borderRight: i < 3 ? "1px solid #F0F2F8" : "none", borderTop: "1px solid #F0F2F8" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: k.color, fontFamily: FONT }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: C.gray, marginTop: 3, fontWeight: 600 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 💰 급여 비교 카드 */}
            {payCalc && (
              <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ background: "#F8F9FC", padding: "10px 16px", borderBottom: "1px solid #E8ECF4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>💰 급여 비교</span>
                  <span style={{ fontSize: 11, color: C.gray }}>{payCalc.method} · {year}년 {month}월{loadingPayroll ? " · ⏳" : ""}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: actualPay !== null ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 0 }}>
                  {[
                    { label: "계약 급여", value: fmt(payCalc.contractPay), sub: "기준액", color: C.navy },
                    { label: "예상 급여", value: fmt(payCalc.expectedPay), sub: empStats.extra > 0 ? `출근 ${empStats.regularWorked}+추가${empStats.extra}/${empStats.totalWorkable}일` : `출근 ${empStats.regularWorked}/${empStats.totalWorkable}일`, color: payCalc.diff < 0 ? C.error : C.success },
                    ...(actualPay !== null ? [{ label: "실지급액", value: fmt(actualPay), sub: "급여대장 기준", color: "#7C3AED" }] : []),
                    { label: "차이", value: `${payCalc.diff >= 0 ? "+" : ""}${fmt(payCalc.diff)}`, sub: payCalc.diff < 0 ? "미달" : payCalc.diff > 0 ? "초과" : "일치", color: payCalc.diff < 0 ? C.error : payCalc.diff > 0 ? C.success : C.gray },
                  ].map((k, i) => (
                    <div key={k.label} style={{ padding: "14px", textAlign: "center", borderRight: i < (actualPay !== null ? 3 : 2) ? "1px solid #F0F2F8" : "none" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: k.color, fontFamily: FONT }}>{k.value}<span style={{ fontSize: 11, fontWeight: 600 }}>원</span></div>
                      <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{k.label}</div>
                      <div style={{ fontSize: 10, color: k.color, marginTop: 1, opacity: 0.7 }}>{k.sub}</div>
                    </div>
                  ))}
                </div>
                {extraAmt > 0 && (
                  <div style={{ padding: "8px 16px", background: "#F3EDFF", fontSize: 12, color: "#7C3AED", fontWeight: 700 }}>
                    💜 추가수당 합계: {fmt(extraAmt)}원 (별도)
                  </div>
                )}
                {annualLeave && (
                  <div style={{ padding: "8px 16px", background: "#F0FDF4", fontSize: 12, color: C.success, fontWeight: 600, borderTop: "1px solid #E8ECF4" }}>
                    🏖️ {year}년 연차: <strong>{annualLeave.total}일</strong> <span style={{ color: C.gray, fontWeight: 400 }}>({annualLeave.detail}) · 사용 {empStats.leave}일 · 잔여 {Math.max(0, annualLeave.total - empStats.leave)}일</span>
                  </div>
                )}
              </div>
            )}

            {/* 일별 출퇴근 상세 */}
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ background: "#F8F9FC", padding: "10px 16px", borderBottom: "1px solid #E8ECF4", fontSize: 13, fontWeight: 800, color: C.dark }}>
                📋 일별 출퇴근 상세 <span style={{ fontSize: 11, color: C.gray, fontWeight: 400 }}>({dailyDetails.length}일)</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F8F9FC", position: "sticky", top: 0 }}>
                      {["날짜", "요일", "상태", "출근", "퇴근", "추가수당"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", fontWeight: 700, color: C.gray, textAlign: "center", borderBottom: "1.5px solid #E8ECF4", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyDetails.map(d => (
                      <tr key={d.dateStr} style={{ background: statusBg(d.status), borderBottom: "1px solid #F0F2F8" }}>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 600 }}>{d.dateStr.slice(5)}</td>
                        <td style={{ textAlign: "center", color: d.isWeekend || d.isHoliday ? C.error : C.dark, fontWeight: 700 }}>{d.dayName}{d.isHoliday ? "🎌" : ""}</td>
                        <td style={{ textAlign: "center" }}>
                          {d.status && <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: statusColor(d.status), background: statusBg(d.status) || "#F5F5F5" }}>{d.status}</span>}
                        </td>
                        <td style={{ textAlign: "center", color: C.gray }}>{d.checkIn || "-"}</td>
                        <td style={{ textAlign: "center", color: C.gray }}>{d.checkOut || "-"}</td>
                        <td style={{ textAlign: "center", color: d.extraAmt > 0 ? "#7C3AED" : C.gray, fontWeight: d.extraAmt > 0 ? 700 : 400 }}>{d.extraAmt > 0 ? fmt(d.extraAmt) + "원" : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 근무현황 요약 (수치) */}
            <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>📊 월간 요약</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                {[
                  { label: "출근", value: empStats.att, color: C.success },
                  { label: "추가", value: empStats.extra, color: "#7C3AED" },
                  { label: "지각", value: empStats.late, color: "#F57F17" },
                  { label: "결근", value: empStats.absent, color: C.error },
                  { label: "연차", value: empStats.leave, color: "#6A1B9A" },
                  { label: "휴무", value: empStats.offDay, color: C.gray },
                ].map(k => (
                  <div key={k.label} style={{ textAlign: "center", background: k.color + "10", borderRadius: 10, padding: "10px 6px" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: C.gray, marginTop: 2, fontWeight: 600 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!selectedEmp && (
          <div style={{ display: "none" }} />
        )}
      </div>
    </div>
  );
}


// ── 사업장분석 탭 (v9.3 P2) ─────────────────────────────
function SiteAnalyticsTab({ employees, year, month, dates, getCellStatus, todayStr, staffRows, reports, extraAmountMap, moveMonth, goToday, loading }) {
  const [siteFilter, setSiteFilter] = useState("all");
  const [trendMonths, setTrendMonths] = useState(6);
  const [trendData, setTrendData] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(false);

  // 재직 현장직원 (V000 제외)
  const activeEmps = useMemo(() => employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000"), [employees]);

  // 사업장 목록
  const siteOptions = useMemo(() => {
    const codes = [...new Set(activeEmps.map(e => e.site_code_1))].sort();
    return codes.map(c => ({ code: c, name: getSiteName(c), count: activeEmps.filter(e => e.site_code_1 === c).length }));
  }, [activeEmps]);

  // 사업장별 근태 집계
  const siteStats = useMemo(() => {
    return siteOptions.map(site => {
      const emps = activeEmps.filter(e => e.site_code_1 === site.code);
      let totalAtt = 0, totalWorkable = 0, totalLate = 0, totalAbsent = 0, totalExtra = 0, totalExtraAmt = 0;
      const empDetails = emps.map(emp => {
        const st = calcPersonalAttStats(emp.id, emp.work_code, dates, getCellStatus, todayStr);
        const gr = getAttendanceGrade(st.attRate, st.lateRate, st.absent);
        const pay = calcExpectedPay(emp, st, year, month);
        const extraAmt = extraAmountMap[emp.id] || 0;
        totalAtt += st.worked;
        totalWorkable += st.totalWorkable;
        totalLate += st.late;
        totalAbsent += st.absent;
        totalExtra += st.extra;
        totalExtraAmt += extraAmt;
        return { emp, st, gr, pay, extraAmt };
      }).sort((a, b) => b.st.attRate - a.st.attRate);
      const avgAttRate = totalWorkable > 0 ? Math.round((totalAtt / totalWorkable) * 100) : 0;
      return { ...site, emps: empDetails, totalAtt, totalWorkable, totalLate, totalAbsent, totalExtra, totalExtraAmt, avgAttRate };
    }).sort((a, b) => b.avgAttRate - a.avgAttRate);
  }, [siteOptions, activeEmps, dates, getCellStatus, todayStr, year, month, extraAmountMap]);

  // 전체 KPI
  const totalKpi = useMemo(() => {
    const data = siteFilter === "all" ? siteStats : siteStats.filter(s => s.code === siteFilter);
    const totalEmps = data.reduce((s, d) => s + d.count, 0);
    const totalWorkable = data.reduce((s, d) => s + d.totalWorkable, 0);
    const totalAtt = data.reduce((s, d) => s + d.totalAtt, 0);
    const avgRate = totalWorkable > 0 ? Math.round((totalAtt / totalWorkable) * 100) : 0;
    const totalAbsent = data.reduce((s, d) => s + d.totalAbsent, 0);
    const totalLate = data.reduce((s, d) => s + d.totalLate, 0);
    const totalExtraAmt = data.reduce((s, d) => s + d.totalExtraAmt, 0);
    return { totalEmps, avgRate, totalAbsent, totalLate, totalExtraAmt };
  }, [siteStats, siteFilter]);

  // 선택 사업장 데이터
  const selectedSite = siteFilter !== "all" ? siteStats.find(s => s.code === siteFilter) : null;

  // 비교 차트 데이터
  const compareChartData = useMemo(() => {
    return siteStats.map(s => ({
      name: s.name.length > 6 ? s.name.slice(0, 6) + ".." : s.name,
      code: s.code,
      출근률: s.avgAttRate,
      인원: s.count,
      결근: s.totalAbsent,
      지각: s.totalLate,
    }));
  }, [siteStats]);

  // 월별 추이 로드 (최근 N개월)
  useEffect(() => {
    if (siteFilter === "all") { setTrendData([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingTrend(true);
      const months = [];
      for (let i = trendMonths - 1; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        months.push({ y: d.getFullYear(), m: d.getMonth() + 1, label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}` });
      }
      const results = [];
      for (const mo of months) {
        try {
          const startDate = `${mo.y}-${String(mo.m).padStart(2, "0")}-01`;
          const lastDay = new Date(mo.y, mo.m, 0).getDate();
          const endDate = `${mo.y}-${String(mo.m).padStart(2, "0")}-${lastDay}`;
          const { data: reps } = await supabase.from("daily_reports").select("id, report_date, site_code, status").gte("report_date", startDate).lte("report_date", endDate).eq("site_code", siteFilter);
          const repIds = (reps || []).map(r => r.id);
          let stRows = [];
          if (repIds.length > 0) {
            const chunks = [];
            for (let ci = 0; ci < repIds.length; ci += 50) chunks.push(repIds.slice(ci, ci + 50));
            for (const chunk of chunks) {
              const { data: s } = await supabase.from("daily_report_staff").select("employee_id, report_id, check_in, check_out, staff_type, extra_amount").in("report_id", chunk);
              if (s) stRows.push(...s);
            }
          }
          const siteEmps = activeEmps.filter(e => e.site_code_1 === siteFilter);
          const repMap = {};
          (reps || []).forEach(r => { repMap[r.id] = r; });
          const stMap = {};
          stRows.forEach(s => {
            if (!s.employee_id) return;
            const rep = repMap[s.report_id];
            if (!rep) return;
            stMap[`${s.employee_id}-${rep.report_date}`] = s.staff_type === "extra" ? "추가" : "출근";
          });
          let totalWorkable = 0, totalWorked = 0;
          siteEmps.forEach(emp => {
            const offDays = getOffDays(emp.work_code);
            for (let day = 1; day <= lastDay; day++) {
              const dt = new Date(mo.y, mo.m - 1, day);
              const dateStr = `${mo.y}-${String(mo.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              if (dateStr > todayStr) continue;
              const dow = dt.getDay();
              const isHoliday = HOLIDAYS_2026.has(dateStr);
              if (isHoliday) continue;
              if (offDays && offDays.includes(dow)) continue;
              totalWorkable++;
              const key = `${emp.id}-${dateStr}`;
              const st = stMap[key];
              if (st === "출근" || st === "추가") totalWorked++;
            }
          });
          const attRate = totalWorkable > 0 ? Math.round((totalWorked / totalWorkable) * 100) : 0;
          results.push({ label: mo.label, 출근률: attRate, 근무: totalWorked, 인원: siteEmps.length });
        } catch (e) {
          results.push({ label: mo.label, 출근률: 0, 근무: 0, 인원: 0 });
        }
      }
      // 실지급 payroll
      try {
        const { data: pr } = await supabase.from("payroll_records").select("employee_id, net_pay, year, month").in("employee_id", activeEmps.filter(e => e.site_code_1 === siteFilter).map(e => e.id));
        if (pr) {
          const prMap = {};
          pr.forEach(p => {
            const key = `${p.year}.${String(p.month).padStart(2, "0")}`;
            prMap[key] = (prMap[key] || 0) + toNum(p.net_pay);
          });
          results.forEach(r => { r.실지급 = prMap[r.label] || 0; });
        }
      } catch (e) { /* ignore */ }
      if (!cancelled) { setTrendData(results); setLoadingTrend(false); }
    })();
    return () => { cancelled = true; };
  }, [siteFilter, trendMonths, year, month, activeEmps, todayStr]);

  // Excel Export
  const exportSiteExcel = async () => {
    const XLSX = await import("xlsx");
    const { saveAs } = await import("file-saver");
    const wb = XLSX.utils.book_new();
    // Sheet 1: 사업장 요약
    const rows1 = siteStats.map(s => ({
      사업장코드: s.code, 사업장명: s.name, 소속인원: s.count, 평균출근률: s.avgAttRate + "%",
      총결근: s.totalAbsent, 총지각: s.totalLate, 추가근무: s.totalExtra, 추가수당합계: s.totalExtraAmt,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows1), "사업장요약");
    // Sheet 2: 직원별 상세
    const rows2 = [];
    siteStats.forEach(s => s.emps.forEach(d => {
      rows2.push({
        사업장: s.name, 사번: d.emp.emp_no, 이름: d.emp.name, 근무형태: getWorkLabel(d.emp.work_code),
        출근: d.st.att, 추가: d.st.extra, 지각: d.st.late, 결근: d.st.absent, 연차: d.st.leave,
        출근률: d.st.attRate + "%", 등급: d.gr.grade, 예상급여: d.pay.expectedPay, 추가수당: d.extraAmt,
      });
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows2), "직원별상세");
    // Sheet 3: 월별추이 (선택 사업장)
    if (trendData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendData), "월별추이");
    }
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `사업장근태_${year}년${month}월.xlsx`);
  };

  const kpiCards = [
    { icon: "👥", label: "소속인원", value: totalKpi.totalEmps + "명", color: C.navy },
    { icon: "📊", label: "평균출근률", value: totalKpi.avgRate + "%", color: totalKpi.avgRate >= 90 ? C.success : totalKpi.avgRate >= 70 ? C.orange : C.error },
    { icon: "❌", label: "총 결근", value: totalKpi.totalAbsent + "건", color: totalKpi.totalAbsent > 0 ? C.error : C.success },
    { icon: "⏰", label: "총 지각", value: totalKpi.totalLate + "건", color: totalKpi.totalLate > 0 ? C.orange : C.success },
    { icon: "💰", label: "추가수당합계", value: fmt(totalKpi.totalExtraAmt) + "원", color: C.navy },
  ];

  return (
    <div>
      {/* 필터 바 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #D8DCE3", fontSize: 12, fontFamily: FONT, background: "#fff" }}>
          <option value="all">🏢 전체 사업장 비교</option>
          {siteOptions.map(s => <option key={s.code} value={s.code}>{s.code} {s.name} ({s.count}명)</option>)}
        </select>
        {siteFilter !== "all" && (
          <div style={{ display: "flex", gap: 4, background: "#F3F4F6", padding: 3, borderRadius: 8 }}>
            {[3, 6, 12].map(n => (
              <button key={n} onClick={() => setTrendMonths(n)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, background: trendMonths === n ? C.navy : "transparent", color: trendMonths === n ? "#fff" : C.gray }}>{n}개월</button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={exportSiteExcel} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: "transparent", color: C.navy, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📥 Excel</button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 30, color: C.gray }}>⏳ 로딩 중...</div>}

      {/* KPI 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
        {kpiCards.map((k, i) => (
          <div key={i} style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 12, padding: "14px 12px", textAlign: "center", borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: k.color, fontFamily: FONT }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* 전체 비교 모드 */}
      {siteFilter === "all" && (<>
        {/* 사업장 간 비교 차트 */}
        <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ background: C.navy, padding: "10px 16px", color: "#fff", fontSize: 13, fontWeight: 800 }}>
            📊 사업장별 출근률 비교 <span style={{ fontWeight: 400, opacity: 0.6, marginLeft: 6 }}>{year}년 {month}월</span>
          </div>
          <div style={{ padding: 16 }}>
            <ResponsiveContainer width="100%" height={Math.max(260, siteStats.length * 36)}>
              <BarChart data={compareChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => v + "%"} tick={{ fontSize: 11, fill: C.gray }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: C.dark, fontWeight: 700 }} />
                <Tooltip formatter={(v, name) => [v + "%", name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="출근률" radius={[0, 6, 6, 0]} barSize={20}>
                  {compareChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry["출근률"] >= 90 ? C.success : entry["출근률"] >= 70 ? C.orange : C.error} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 사업장별 랭킹 테이블 */}
        <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ background: C.navy, padding: "10px 16px", color: "#fff", fontSize: 13, fontWeight: 800 }}>
            🏆 사업장 근태 랭킹
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
              <thead>
                <tr style={{ background: "#F8F9FC" }}>
                  {["#", "사업장", "인원", "출근률", "출근", "결근", "지각", "추가근무", "추가수당"].map(h => (
                    <th key={h} style={{ padding: "10px 8px", fontWeight: 800, color: C.gray, borderBottom: `2px solid ${C.navy}`, textAlign: h === "사업장" ? "left" : "center", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {siteStats.map((s, i) => (
                  <tr key={s.code} onClick={() => setSiteFilter(s.code)} style={{ cursor: "pointer", borderBottom: "1px solid #F0F2F8", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                    <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 800, color: i < 3 ? C.gold : C.gray }}>{i + 1}</td>
                    <td style={{ padding: "10px 8px", fontWeight: 700 }}>
                      <span style={{ color: C.navy }}>{s.code}</span>
                      <span style={{ marginLeft: 6, color: C.dark }}>{s.name}</span>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>{s.count}명</td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <span style={{ fontWeight: 800, color: s.avgAttRate >= 90 ? C.success : s.avgAttRate >= 70 ? C.orange : C.error, background: (s.avgAttRate >= 90 ? C.success : s.avgAttRate >= 70 ? C.orange : C.error) + "15", padding: "3px 10px", borderRadius: 6 }}>{s.avgAttRate}%</span>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center", color: C.navy, fontWeight: 700 }}>{s.totalAtt}</td>
                    <td style={{ padding: "10px 8px", textAlign: "center", color: s.totalAbsent > 0 ? C.error : C.gray, fontWeight: 700 }}>{s.totalAbsent}</td>
                    <td style={{ padding: "10px 8px", textAlign: "center", color: s.totalLate > 0 ? C.orange : C.gray, fontWeight: 700 }}>{s.totalLate}</td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>{s.totalExtra}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>{fmt(s.totalExtraAmt)}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* 개별 사업장 상세 모드 */}
      {siteFilter !== "all" && selectedSite && (<>
        {/* 사업장 헤더 */}
        <div style={{ background: C.navy, borderRadius: "14px 14px 0 0", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: "#fff" }}>
            <span style={{ fontWeight: 900, fontSize: 15 }}>{selectedSite.code} {selectedSite.name}</span>
            <span style={{ marginLeft: 10, opacity: 0.6, fontSize: 13 }}>{selectedSite.count}명</span>
          </div>
          <button onClick={() => setSiteFilter("all")} style={{ padding: "4px 12px", borderRadius: 6, border: "1.5px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>← 전체비교</button>
        </div>

        {/* 직원별 랭킹 테이블 */}
        <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: "0 0 14px 14px", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
              <thead>
                <tr style={{ background: "#F8F9FC" }}>
                  {["#", "사번", "이름", "근무형태", "출근률", "출근", "추가", "지각", "결근", "연차", "등급", "예상급여", "추가수당"].map(h => (
                    <th key={h} style={{ padding: "10px 6px", fontWeight: 800, color: C.gray, borderBottom: `2px solid ${C.navy}`, textAlign: h === "이름" ? "left" : "center", whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedSite.emps.map((d, i) => (
                  <tr key={d.emp.id} style={{ borderBottom: "1px solid #F0F2F8", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                    <td style={{ padding: "9px 6px", textAlign: "center", fontWeight: 800, color: i < 3 ? C.gold : C.gray }}>{i + 1}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", fontSize: 11, color: C.gray }}>{d.emp.emp_no}</td>
                    <td style={{ padding: "9px 6px", fontWeight: 700 }}>{d.emp.name}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", fontSize: 11 }}>{getWorkLabel(d.emp.work_code)}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center" }}>
                      <span style={{ fontWeight: 800, color: d.st.attRate >= 90 ? C.success : d.st.attRate >= 70 ? C.orange : C.error }}>{d.st.attRate}%</span>
                    </td>
                    <td style={{ padding: "9px 6px", textAlign: "center", color: C.navy, fontWeight: 700 }}>{d.st.att}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", color: "#7C3AED", fontWeight: 700 }}>{d.st.extra}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", color: d.st.late > 0 ? C.orange : C.gray }}>{d.st.late}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center", color: d.st.absent > 0 ? C.error : C.gray }}>{d.st.absent}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center" }}>{d.st.leave}</td>
                    <td style={{ padding: "9px 6px", textAlign: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: d.gr.color, background: d.gr.color + "18", padding: "2px 8px", borderRadius: 6 }}>{d.gr.grade}</span>
                    </td>
                    <td style={{ padding: "9px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 11 }}>{fmt(d.pay.expectedPay)}</td>
                    <td style={{ padding: "9px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 11, color: d.extraAmt > 0 ? "#7C3AED" : C.gray }}>{d.extraAmt > 0 ? fmt(d.extraAmt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#F0F4FF", borderTop: `2px solid ${C.navy}` }}>
                  <td colSpan={4} style={{ padding: "10px 6px", fontWeight: 900, color: C.navy, textAlign: "center" }}>합계 / 평균</td>
                  <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 900, color: C.navy }}>{selectedSite.avgAttRate}%</td>
                  <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 800 }}>{selectedSite.totalAtt}</td>
                  <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 800, color: "#7C3AED" }}>{selectedSite.totalExtra}</td>
                  <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 800 }}>{selectedSite.totalLate}</td>
                  <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 800, color: selectedSite.totalAbsent > 0 ? C.error : C.gray }}>{selectedSite.totalAbsent}</td>
                  <td style={{ padding: "10px 6px", textAlign: "center" }}>{selectedSite.emps.reduce((s, d) => s + d.st.leave, 0)}</td>
                  <td style={{ padding: "10px 6px", textAlign: "center" }}>—</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: C.navy }}>{fmt(selectedSite.emps.reduce((s, d) => s + d.pay.expectedPay, 0))}</td>
                  <td style={{ padding: "10px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, color: "#7C3AED" }}>{fmt(selectedSite.totalExtraAmt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 월별 추이 차트 */}
        <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ background: C.navy, padding: "10px 16px", color: "#fff", fontSize: 13, fontWeight: 800 }}>
            📈 월별 출근률 추이 <span style={{ fontWeight: 400, opacity: 0.6, marginLeft: 6 }}>최근 {trendMonths}개월</span>
          </div>
          <div style={{ padding: 16 }}>
            {loadingTrend ? (
              <div style={{ textAlign: "center", padding: 40, color: C.gray }}>⏳ 추이 데이터 로딩 중...</div>
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.gray }} />
                  <YAxis domain={[0, 100]} tickFormatter={v => v + "%"} tick={{ fontSize: 11, fill: C.gray }} />
                  <Tooltip formatter={(v, name) => [name === "출근률" ? v + "%" : fmt(v), name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="출근률" stroke={C.navy} strokeWidth={2.5} dot={{ fill: C.navy, r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: C.gray, fontSize: 13 }}>데이터 없음</div>
            )}
          </div>
        </div>

        {/* 실지급 비교 (payroll_records 있는 달만) */}
        {trendData.some(d => d.실지급 > 0) && (
          <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ background: C.navy, padding: "10px 16px", color: "#fff", fontSize: 13, fontWeight: 800 }}>
              💰 월별 인건비 추이 (실지급 기준)
            </div>
            <div style={{ padding: 16 }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData.filter(d => d.실지급 > 0)} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.gray }} />
                  <YAxis tickFormatter={v => pFmt(v)} tick={{ fontSize: 11, fill: C.gray }} />
                  <Tooltip formatter={(v) => [fmt(v) + "원"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="실지급" fill={C.gold} radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </>)}

      {siteStats.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 60, color: C.gray }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 14 }}>현장 직원 데이터가 없습니다</div>
        </div>
      )}
    </div>
  );
}

// ── 16-6-F. 이상감지 탭 (v9.3 P3) ─────────────────────────────────

function AnomalyDetectionTab({ employees, year, month, dates, getCellStatus, todayStr, staffRows, reports, extraAmountMap, moveMonth, goToday, loading }) {
  const [sevFilter, setSevFilter] = useState("all"); // all / critical / warning / info
  const [siteFilter, setSiteFilter] = useState("all");

  const activeEmps = useMemo(() => employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000"), [employees]);

  // ── 이상 패턴 감지 엔진 ────────────────
  const anomalies = useMemo(() => {
    const results = [];
    const pastDates = dates.filter(d => d.dateStr <= todayStr);
    if (pastDates.length === 0) return results;

    activeEmps.forEach(emp => {
      const stats = calcPersonalAttStats(emp.id, emp.work_code, dates, getCellStatus, todayStr);
      const siteName = SITES.find(s => s.code === emp.site_code_1)?.name || emp.site_code_1;
      const base = { empId: emp.id, empNo: emp.emp_no, empName: emp.name, siteCode: emp.site_code_1, siteName };

      // 1) 연속결근 감지
      let consecutive = 0, maxConsec = 0, streakStart = null, lastStreakStart = null;
      const offDays = getOffDays(emp.work_code);
      pastDates.forEach(d => {
        // 근무 예정일인지 확인
        const isWorkDay = !(d.isHoliday || (offDays && offDays.includes(d.dayOfWeek)));
        if (!isWorkDay) return;
        const st = getCellStatus(emp.id, d.dateStr, emp.work_code);
        if (st === "결근") {
          if (consecutive === 0) streakStart = d.dateStr;
          consecutive++;
          if (consecutive > maxConsec) { maxConsec = consecutive; lastStreakStart = streakStart; }
        } else {
          consecutive = 0; streakStart = null;
        }
      });
      // 현재 진행중인 연속결근도 체크
      if (consecutive > maxConsec) { maxConsec = consecutive; lastStreakStart = streakStart; }

      if (maxConsec >= 5) {
        results.push({ ...base, type: "consecutive_absent", severity: "critical", icon: "🚨",
          title: `연속 ${maxConsec}일 결근`, detail: `${lastStreakStart} 부터 ${maxConsec}일 연속 결근 — 즉시 확인 필요`,
          metric: maxConsec, sortOrder: 1 });
      } else if (maxConsec >= 3) {
        results.push({ ...base, type: "consecutive_absent", severity: "warning", icon: "⚠️",
          title: `연속 ${maxConsec}일 결근`, detail: `${lastStreakStart} 부터 ${maxConsec}일 연속 결근`,
          metric: maxConsec, sortOrder: 2 });
      } else if (maxConsec >= 2) {
        results.push({ ...base, type: "consecutive_absent", severity: "info", icon: "ℹ️",
          title: `연속 ${maxConsec}일 결근`, detail: `${lastStreakStart} 부터 ${maxConsec}일 연속 결근`,
          metric: maxConsec, sortOrder: 3 });
      }

      // 2) 지각률 이상
      if (stats.totalWorkable >= 5) {
        if (stats.lateRate >= 30) {
          results.push({ ...base, type: "high_late_rate", severity: "critical", icon: "🕐",
            title: `지각률 ${stats.lateRate}%`, detail: `${stats.totalWorkable}일 중 ${stats.late}회 지각 — 심각 수준`,
            metric: stats.lateRate, sortOrder: 1 });
        } else if (stats.lateRate >= 15) {
          results.push({ ...base, type: "high_late_rate", severity: "warning", icon: "🕐",
            title: `지각률 ${stats.lateRate}%`, detail: `${stats.totalWorkable}일 중 ${stats.late}회 지각`,
            metric: stats.lateRate, sortOrder: 2 });
        }
      }

      // 3) 출근률 급락
      if (stats.totalWorkable >= 5) {
        if (stats.attRate < 60) {
          results.push({ ...base, type: "low_attendance", severity: "critical", icon: "📉",
            title: `출근률 ${stats.attRate}%`, detail: `예정 ${stats.totalWorkable}일 중 정규출근 ${stats.regularWorked}일 — 심각`,
            metric: stats.attRate, sortOrder: 1 });
        } else if (stats.attRate < 80) {
          results.push({ ...base, type: "low_attendance", severity: "warning", icon: "📉",
            title: `출근률 ${stats.attRate}%`, detail: `예정 ${stats.totalWorkable}일 중 정규출근 ${stats.regularWorked}일`,
            metric: stats.attRate, sortOrder: 2 });
        }
      }

      // 4) 추가근무(비번투입) 과다
      if (stats.extra >= 10) {
        results.push({ ...base, type: "excessive_extra", severity: "critical", icon: "🔥",
          title: `추가근무 ${stats.extra}일`, detail: `이번 달 비번투입 ${stats.extra}회 — 과로 위험`,
          metric: stats.extra, sortOrder: 1 });
      } else if (stats.extra >= 6) {
        results.push({ ...base, type: "excessive_extra", severity: "warning", icon: "💪",
          title: `추가근무 ${stats.extra}일`, detail: `이번 달 비번투입 ${stats.extra}회 — 관리 필요`,
          metric: stats.extra, sortOrder: 2 });
      }

      // 5) 결근 다수 (비연속이라도)
      if (stats.absent >= 5 && maxConsec < 5) {
        const sev = stats.absent >= 8 ? "critical" : "warning";
        results.push({ ...base, type: "high_absent", severity: sev, icon: "🚫",
          title: `월 결근 ${stats.absent}일`, detail: `이번 달 총 ${stats.absent}일 결근 (예정 ${stats.totalWorkable}일)`,
          metric: stats.absent, sortOrder: sev === "critical" ? 1 : 2 });
      }
    });

    // 정렬: severity (critical→warning→info) → metric 내림차순
    results.sort((a, b) => a.sortOrder - b.sortOrder || b.metric - a.metric);
    return results;
  }, [activeEmps, dates, getCellStatus, todayStr]);

  // ── 필터링 ────────────────
  const filtered = useMemo(() => {
    return anomalies.filter(a => {
      if (sevFilter !== "all" && a.severity !== sevFilter) return false;
      if (siteFilter !== "all" && a.siteCode !== siteFilter) return false;
      return true;
    });
  }, [anomalies, sevFilter, siteFilter]);

  // ── 사업장별 요약 ────────────────
  const siteSummary = useMemo(() => {
    const map = {};
    anomalies.forEach(a => {
      if (!map[a.siteCode]) map[a.siteCode] = { code: a.siteCode, name: a.siteName, critical: 0, warning: 0, info: 0, total: 0 };
      map[a.siteCode][a.severity]++;
      map[a.siteCode].total++;
    });
    return Object.values(map).sort((a, b) => b.critical - a.critical || b.total - a.total);
  }, [anomalies]);

  // ── 유형별 카운트 ────────────────
  const typeCounts = useMemo(() => {
    const map = { consecutive_absent: 0, high_late_rate: 0, low_attendance: 0, excessive_extra: 0, high_absent: 0 };
    anomalies.forEach(a => { map[a.type] = (map[a.type] || 0) + 1; });
    return map;
  }, [anomalies]);

  // Excel Export
  const exportAnomalyExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // Sheet 1: 이상감지 목록
    const rows1 = anomalies.map((a, i) => ({
      "#": i + 1, "심각도": a.severity === "critical" ? "심각" : a.severity === "warning" ? "주의" : "참고",
      "유형": a.type === "consecutive_absent" ? "연속결근" : a.type === "high_late_rate" ? "지각률" : a.type === "low_attendance" ? "출근률급락" : a.type === "excessive_extra" ? "추가근무과다" : "월결근다수",
      "사번": a.empNo, "이름": a.empName, "사업장": a.siteName, "제목": a.title, "상세": a.detail,
    }));
    const ws1 = XLSX.utils.json_to_sheet(rows1);
    ws1["!cols"] = [{ wch: 4 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws1, "이상감지목록");
    // Sheet 2: 사업장별 요약
    const rows2 = siteSummary.map(s => ({ "사업장": s.name, "심각": s.critical, "주의": s.warning, "참고": s.info, "합계": s.total }));
    const ws2 = XLSX.utils.json_to_sheet(rows2);
    ws2["!cols"] = [{ wch: 14 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, ws2, "사업장별요약");
    const { saveAs } = await import("file-saver");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `이상감지_${year}년${month}월.xlsx`);
  };

  const sevColors = { critical: { bg: "#FEE2E2", border: "#E53935", text: "#B71C1C", label: "심각" },
    warning: { bg: "#FFF3E0", border: "#E97132", text: "#BF360C", label: "주의" },
    info: { bg: "#E3F2FD", border: "#0F9ED5", text: "#0D47A1", label: "참고" } };

  const siteList = useMemo(() => {
    const codes = [...new Set(activeEmps.map(e => e.site_code_1))].sort();
    return codes.map(c => ({ code: c, name: SITES.find(s => s.code === c)?.name || c }));
  }, [activeEmps]);

  const critCount = anomalies.filter(a => a.severity === "critical").length;
  const warnCount = anomalies.filter(a => a.severity === "warning").length;
  const infoCount = anomalies.filter(a => a.severity === "info").length;

  return (
    <div>
      {/* 월 네비게이션 */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <button onClick={() => moveMonth(-1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #D0D2DA", background: "#fff", fontWeight: 700, cursor: "pointer" }}>◀</button>
        <span style={{ fontSize: 18, fontWeight: 900, color: C.dark }}>{year}년 {month}월</span>
        <button onClick={() => moveMonth(1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #D0D2DA", background: "#fff", fontWeight: 700, cursor: "pointer" }}>▶</button>
        <button onClick={goToday} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid " + C.navy, background: C.navy, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>오늘</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.gray }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 14 }}>근태 데이터 분석 중...</div>
        </div>
      ) : (
        <>
          {/* ── KPI 스트립 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "전체 이상", value: anomalies.length, unit: "건", color: C.dark, bg: "#F5F5F5" },
              { label: "🚨 심각", value: critCount, unit: "건", color: "#E53935", bg: "#FEE2E2" },
              { label: "⚠️ 주의", value: warnCount, unit: "건", color: "#E97132", bg: "#FFF3E0" },
              { label: "ℹ️ 참고", value: infoCount, unit: "건", color: "#0F9ED5", bg: "#E3F2FD" },
            ].map((k, i) => (
              <div key={i} style={{ background: k.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: k.color, fontFamily: "'Noto Sans KR'" }}>{k.value}<span style={{ fontSize: 12, fontWeight: 700 }}>{k.unit}</span></div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* ── 유형별 분포 ── */}
          <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>📊 유형별 분포</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                { key: "consecutive_absent", label: "연속결근", icon: "🚨", color: "#E53935" },
                { key: "high_absent", label: "월 결근 다수", icon: "🚫", color: "#E53935" },
                { key: "high_late_rate", label: "지각률 이상", icon: "🕐", color: "#E97132" },
                { key: "low_attendance", label: "출근률 급락", icon: "📉", color: "#E97132" },
                { key: "excessive_extra", label: "추가근무 과다", icon: "🔥", color: "#0F9ED5" },
              ].map(t => (
                <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, background: typeCounts[t.key] > 0 ? "#FFF8F0" : "#F5F5F5", border: `1px solid ${typeCounts[t.key] > 0 ? t.color : "#E8E8E8"}` }}>
                  <span style={{ fontSize: 13 }}>{t.icon}</span>
                  <span style={{ fontSize: 12, color: C.dark, fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: typeCounts[t.key] > 0 ? t.color : C.gray }}>{typeCounts[t.key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 사업장별 이상 건수 요약 ── */}
          {siteSummary.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, marginBottom: 10 }}>🏢 사업장별 이상 건수</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {siteSummary.map(s => (
                  <div key={s.code} onClick={() => setSiteFilter(siteFilter === s.code ? "all" : s.code)}
                    style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${siteFilter === s.code ? C.navy : "#E8E8E8"}`, background: siteFilter === s.code ? "#EEF0FF" : "#FAFAFA", cursor: "pointer", transition: "all 0.15s" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, marginBottom: 6 }}>{s.name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {s.critical > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#E53935", background: "#FEE2E2", padding: "2px 7px", borderRadius: 6 }}>심각 {s.critical}</span>}
                      {s.warning > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#E97132", background: "#FFF3E0", padding: "2px 7px", borderRadius: 6 }}>주의 {s.warning}</span>}
                      {s.info > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#0F9ED5", background: "#E3F2FD", padding: "2px 7px", borderRadius: 6 }}>참고 {s.info}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 필터 ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.gray }}>심각도:</span>
            {[["all", "전체"], ["critical", "🚨 심각"], ["warning", "⚠️ 주의"], ["info", "ℹ️ 참고"]].map(([k, v]) => (
              <button key={k} onClick={() => setSevFilter(k)}
                style={{ padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${sevFilter === k ? C.navy : "#D0D2DA"}`, background: sevFilter === k ? C.navy : "#fff", color: sevFilter === k ? "#fff" : C.gray, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{v}</button>
            ))}
            <span style={{ fontSize: 12, fontWeight: 800, color: C.gray, marginLeft: 8 }}>사업장:</span>
            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #D0D2DA", fontSize: 12, fontWeight: 600 }}>
              <option value="all">전체</option>
              {siteList.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
            {(sevFilter !== "all" || siteFilter !== "all") && (
              <button onClick={() => { setSevFilter("all"); setSiteFilter("all"); }}
                style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #D0D2DA", background: "#fff", color: C.gray, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✕ 초기화</button>
            )}
            <span style={{ fontSize: 12, color: C.gray, marginLeft: "auto" }}>{filtered.length}건</span>
            <button onClick={exportAnomalyExcel} disabled={anomalies.length === 0} style={{ padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: "transparent", color: anomalies.length > 0 ? C.navy : C.gray, fontWeight: 700, fontSize: 12, cursor: anomalies.length > 0 ? "pointer" : "default", opacity: anomalies.length > 0 ? 1 : 0.5 }}>📥 Excel</button>
          </div>

          {/* ── 알림 카드 리스트 ── */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 50, color: C.gray }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.dark, marginBottom: 4 }}>{anomalies.length === 0 ? "이상 패턴 없음" : "해당 조건 없음"}</div>
              <div style={{ fontSize: 13 }}>{anomalies.length === 0 ? `${year}년 ${month}월 — 모든 직원의 근태가 정상 범위입니다` : "필터 조건을 변경해 보세요"}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((a, i) => {
                const sc = sevColors[a.severity];
                return (
                  <div key={i} style={{ background: sc.bg, border: `1.5px solid ${sc.border}`, borderRadius: 12, padding: "14px 16px", borderLeft: `5px solid ${sc.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{a.icon}</span>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 900, color: sc.text }}>{a.title}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: sc.border, background: "#fff", padding: "1px 8px", borderRadius: 6, marginLeft: 8 }}>{sc.label}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.dark }}>{a.empName}</div>
                        <div style={{ fontSize: 11, color: C.gray }}>{a.empNo}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: sc.text, lineHeight: 1.5, marginBottom: 4 }}>{a.detail}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: C.gray, background: "#fff", padding: "2px 8px", borderRadius: 6 }}>🏢 {a.siteName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 감지 기준 안내 ── */}
          <div style={{ marginTop: 20, background: "#F5F5F5", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, marginBottom: 8 }}>📌 이상 감지 기준</div>
            <div style={{ fontSize: 11, color: C.gray, lineHeight: 2.0 }}>
              <div>• <b style={{ color: "#E53935" }}>연속결근</b>: 2일↑ 참고 / 3일↑ 주의 / 5일↑ 심각</div>
              <div>• <b style={{ color: "#E97132" }}>지각률</b>: 15%↑ 주의 / 30%↑ 심각 (근무예정 5일 이상 시 판정)</div>
              <div>• <b style={{ color: "#E97132" }}>출근률</b>: 80% 미만 주의 / 60% 미만 심각</div>
              <div>• <b style={{ color: "#0F9ED5" }}>추가근무</b>: 6일↑ 주의 / 10일↑ 심각 (과로 방지)</div>
              <div>• <b style={{ color: "#E53935" }}>월 결근</b>: 5일↑ 주의 / 8일↑ 심각 (비연속 포함)</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AttendancePage({ employees }) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [siteFilter, setSiteFilter] = useState("all");
  const [attRecords, setAttRecords] = useState([]);
  const [reports, setReports] = useState([]);
  const [staffRows, setStaffRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState(null); // { empId, date, x, y }
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState("calendar"); // calendar / card
  const [empSearch, setEmpSearch] = useState("");
  const [attTab, setAttTab] = useState("status"); // status / personal / site / anomaly

  // 해당 월 날짜 배열
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    return { day: d, dateStr, dayOfWeek, dayName: DAY_NAMES[dayOfWeek], isWeekend: dayOfWeek === 0 || dayOfWeek === 6, isHoliday: isHoliday(dateStr), isToday: dateStr === todayStr, holidayName: HOLIDAY_NAMES[dateStr] || null };
  });

  // 월 이동
  const moveMonth = (dir) => {
    let m = month + dir, y = year;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    setYear(y); setMonth(m);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); };

  // 데이터 로딩
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const monthStr = `${year}-${String(month).padStart(2, "0")}`;
        const startDate = `${monthStr}-01`;
        const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

        // 1) attendance_records (수동 기록)
        const { data: att } = await supabase
          .from("attendance_records").select("*")
          .gte("att_date", startDate).lte("att_date", endDate);
        setAttRecords(att || []);

        // 2) daily_reports + daily_report_staff (현장일보 기반 자동 출근)
        const { data: reps } = await supabase
          .from("daily_reports").select("*")
          .gte("report_date", startDate).lte("report_date", endDate)
          .order("report_date");
        const repList = reps || [];
        setReports(repList);
        if (repList.length > 0) {
          const ids = repList.map(r => r.id);
          const { data: staff } = await supabase
            .from("daily_report_staff").select("*").in("report_id", ids);
          setStaffRows(staff || []);
        } else {
          setStaffRows([]);
        }
      } catch (e) { console.error("근태 로드 오류:", e); }
      setLoading(false);
    })();
  }, [year, month, daysInMonth]);

  // 일보 기반 자동 출근 맵: { empId-date: "출근" | "추가" }
  // staff_type: field앱 "extra"(비번투입) / ERP "substitute"(대근) 모두 "추가"로 처리
  const autoAttMap = useMemo(() => {
    const map = {};
    staffRows.forEach(s => {
      if (!s.employee_id) return;
      const rep = reports.find(r => r.id === s.report_id);
      if (!rep) return;
      const key = `${s.employee_id}-${rep.report_date}`;
      const isExtra = s.staff_type === "extra" || s.staff_type === "substitute";
      // site/hq/regular 출근이 있으면 "출근" 우선, extra/substitute만 있으면 "추가"
      if (!map[key]) {
        map[key] = isExtra ? "추가" : "출근";
      } else if (!isExtra) {
        map[key] = "출근"; // 정규 출근이 추가되면 승격
      }
    });
    return map;
  }, [staffRows, reports]);

  // 직원별 추가수당 합계 맵: { empId: totalAmount }
  const extraAmountMap = useMemo(() => {
    const map = {};
    staffRows.forEach(s => {
      if (!s.employee_id) return;
      const amt = toNum(s.extra_amount);
      if (!amt) return;
      map[s.employee_id] = (map[s.employee_id] || 0) + amt;
    });
    return map;
  }, [staffRows]);

  // 수동 기록 맵: { empId-date: status }
  const manualAttMap = useMemo(() => {
    const map = {};
    (attRecords || []).forEach(a => {
      map[`${a.employee_id}-${a.att_date}`] = a.status;
    });
    return map;
  }, [attRecords]);

  // 셀 상태 결정: 수동 > 일보자동 > 근무코드 자동휴무
  const getCellStatus = (empId, dateStr, workCode) => {
    const key = `${empId}-${dateStr}`;
    if (manualAttMap[key]) return manualAttMap[key];
    if (autoAttMap[key]) return autoAttMap[key]; // "출근" 또는 "추가"
    // 근무코드 기반 자동 휴무 (과거+오늘만, 미래 제외)
    if (workCode && dateStr <= todayStr) {
      const offDays = getOffDays(workCode);
      if (offDays) {
        const dow = new Date(dateStr + "T00:00:00").getDay();
        if (offDays.includes(dow)) return "휴무";
      }
    }
    return null;
  };

  // 사업장별 직원 그룹
  const activeEmps = employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000");
  const siteGroups = useMemo(() => {
    const groups = {};
    activeEmps.forEach(e => {
      const sc = e.site_code_1 || "V000";
      if (sc === "V000") return;
      if (siteFilter !== "all" && sc !== siteFilter) return;
      if (empSearch && !e.name.includes(empSearch) && !(e.emp_no || "").toLowerCase().includes(empSearch.toLowerCase())) return;
      if (!groups[sc]) groups[sc] = [];
      groups[sc].push(e);
    });
    // 사이트 코드 순 정렬
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).map(([code, emps]) => ({
      code, name: SITES.find(s => s.code === code)?.name || code,
      emps: emps.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    }));
  }, [activeEmps, siteFilter, empSearch]);

  const allFilteredEmps = siteGroups.flatMap(g => g.emps);

  // KPI
  const totalEmps = allFilteredEmps.length;
  const holidaysInMonth = dates.filter(d => d.isHoliday).length;
  const pastWorkDates = dates.filter(d => !d.isWeekend && !d.isHoliday && d.dateStr <= todayStr);
  const totalWorkableDays = pastWorkDates.length;
  const kpiAttCount = allFilteredEmps.reduce((sum, emp) => {
    return sum + dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "출근").length;
  }, 0);
  const kpiExtraCount = allFilteredEmps.reduce((sum, emp) => {
    return sum + dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "추가").length;
  }, 0);
  const kpiLateCount = allFilteredEmps.reduce((sum, emp) => {
    return sum + dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "지각").length;
  }, 0);
  const kpiAbsentCount = allFilteredEmps.reduce((sum, emp) => {
    return sum + dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "결근").length;
  }, 0);
  const kpiLeaveCount = allFilteredEmps.reduce((sum, emp) => {
    return sum + dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "연차").length;
  }, 0);
  const expectedTotal = totalEmps * totalWorkableDays;
  const overallAttRate = expectedTotal > 0 ? Math.round(((kpiAttCount + kpiExtraCount + kpiLateCount) / expectedTotal) * 100) : 0;
  const kpiExtraAmount = allFilteredEmps.reduce((sum, emp) => sum + (extraAmountMap[emp.id] || 0), 0);

  // Per-employee stats (for card view)
  const empStats = useMemo(() => {
    return allFilteredEmps.map(emp => {
      const att = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "출근").length;
      const extra = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "추가").length;
      const late = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "지각").length;
      const absent = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "결근").length;
      const leave = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "연차").length;
      const worked = att + extra + late;
      const rate = totalWorkableDays > 0 ? Math.round((worked / totalWorkableDays) * 100) : 0;
      const extraAmt = extraAmountMap[emp.id] || 0;
      return { ...emp, att, extra, late, absent, leave, worked, rate, extraAmt };
    });
  }, [allFilteredEmps, dates, getCellStatus, totalWorkableDays, extraAmountMap]);

  // Excel Export
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // Sheet 1: 근태 요약
    const summaryRows = empStats.map(e => ({
      "사번": e.emp_no || "", "이름": e.name, "사업장": getSiteName(e.site_code_1),
      "근무형태": getWorkLabel(e.work_code), "출근": e.att, "추가": e.extra,
      "지각": e.late, "결근": e.absent, "연차": e.leave, "근무일수": e.worked,
      "출근률(%)": e.rate, "추가수당(원)": e.extraAmt,
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryRows);
    ws1["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, "근태요약");

    // Sheet 2: 일별 상세
    const detailRows = empStats.flatMap(e =>
      dates.filter(d => d.dateStr <= todayStr).map(d => ({
        "사번": e.emp_no || "", "이름": e.name, "사업장": getSiteName(e.site_code_1),
        "날짜": d.dateStr, "요일": d.dayName, "상태": getCellStatus(e.id, d.dateStr, e.work_code) || (d.isHoliday ? "공휴일" : d.isWeekend ? "주말" : ""),
      }))
    );
    const ws2 = XLSX.utils.json_to_sheet(detailRows);
    ws2["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 4 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws2, "일별상세");

    // Sheet 3: 매장별 집계
    const siteRows = siteGroups.map(g => {
      const gEmps = empStats.filter(e => e.site_code_1 === g.code);
      const gAtt = gEmps.reduce((s, e) => s + e.att, 0);
      const gExtra = gEmps.reduce((s, e) => s + e.extra, 0);
      const gLate = gEmps.reduce((s, e) => s + e.late, 0);
      const gAbsent = gEmps.reduce((s, e) => s + e.absent, 0);
      const gExtraAmt = gEmps.reduce((s, e) => s + e.extraAmt, 0);
      const gExpected = gEmps.length * totalWorkableDays;
      const gRate = gExpected > 0 ? Math.round(((gAtt + gExtra + gLate) / gExpected) * 100) : 0;
      return { "사업장": `${g.code} ${g.name}`, "인원": gEmps.length, "출근": gAtt, "추가": gExtra, "지각": gLate, "결근": gAbsent, "출근률(%)": gRate, "추가수당합계(원)": gExtraAmt };
    });
    const ws3 = XLSX.utils.json_to_sheet(siteRows);
    ws3["!cols"] = [{ wch: 18 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, "매장별집계");

    // Sheet 4: 이상감지 목록
    const anomalyRows = [];
    const allActiveForAnomaly = employees.filter(e => e.status === "재직" && e.site_code_1 && e.site_code_1 !== "V000");
    allActiveForAnomaly.forEach(emp => {
      const stats = calcPersonalAttStats(emp.id, emp.work_code, dates, getCellStatus, todayStr);
      if (!stats || stats.totalWorkable < 3) return;
      const siteName = getSiteName(emp.site_code_1);
      const base = { "사번": emp.emp_no || "", "이름": emp.name, "사업장": siteName };
      // 연속결근
      let maxConsec = 0, consec = 0;
      dates.filter(d => d.dateStr <= todayStr).forEach(d => {
        const st = getCellStatus(emp.id, d.dateStr, emp.work_code);
        if (st === "결근") { consec++; maxConsec = Math.max(maxConsec, consec); } else if (st && st !== "결근") consec = 0;
      });
      if (maxConsec >= 2) anomalyRows.push({ ...base, "심각도": maxConsec >= 5 ? "심각" : maxConsec >= 3 ? "주의" : "참고", "유형": "연속결근", "상세": `최대 ${maxConsec}일 연속 결근` });
      // 지각률
      if (stats.totalWorkable >= 5 && stats.lateRate >= 15) anomalyRows.push({ ...base, "심각도": stats.lateRate >= 30 ? "심각" : "주의", "유형": "지각률이상", "상세": `${stats.totalWorkable}일 중 ${stats.late}회 지각 (${stats.lateRate}%)` });
      // 출근률
      if (stats.totalWorkable >= 5 && stats.attRate < 80) anomalyRows.push({ ...base, "심각도": stats.attRate < 60 ? "심각" : "주의", "유형": "출근률급락", "상세": `출근률 ${stats.attRate}% (정규출근 ${stats.regularWorked}/${stats.totalWorkable}일)` });
      // 추가근무 과다
      if (stats.extra >= 6) anomalyRows.push({ ...base, "심각도": stats.extra >= 10 ? "심각" : "주의", "유형": "추가근무과다", "상세": `비번투입 ${stats.extra}회` });
      // 월 결근 다수
      if (stats.absent >= 5 && maxConsec < 5) anomalyRows.push({ ...base, "심각도": stats.absent >= 8 ? "심각" : "주의", "유형": "월결근다수", "상세": `총 ${stats.absent}일 결근` });
    });
    if (anomalyRows.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(anomalyRows);
      ws4["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 6 }, { wch: 12 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, ws4, "이상감지목록");
    }

    // Sheet 5: 사업장 근태 비교
    const siteCompareRows = siteGroups.map(g => {
      const gEmps = allActiveForAnomaly.filter(e => e.site_code_1 === g.code);
      const gStats = gEmps.map(e => calcPersonalAttStats(e.id, e.work_code, dates, getCellStatus, todayStr)).filter(Boolean);
      const avgAtt = gStats.length > 0 ? Math.round(gStats.reduce((s, st) => s + st.attRate, 0) / gStats.length) : 0;
      const avgLate = gStats.length > 0 ? Math.round(gStats.reduce((s, st) => s + st.lateRate, 0) / gStats.length) : 0;
      const totalAbsent = gStats.reduce((s, st) => s + st.absent, 0);
      const totalExtra = gStats.reduce((s, st) => s + st.extra, 0);
      const anomalyCount = anomalyRows.filter(a => a["사업장"] === g.name).length;
      const grade = getAttendanceGrade(avgAtt, avgLate, totalAbsent);
      return { "사업장": `${g.code} ${g.name}`, "인원": gEmps.length, "평균출근률(%)": avgAtt, "평균지각률(%)": avgLate, "총결근": totalAbsent, "총추가근무": totalExtra, "이상건수": anomalyCount, "등급": grade };
    });
    if (siteCompareRows.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(siteCompareRows);
      ws5["!cols"] = [{ wch: 18 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 6 }];
      XLSX.utils.book_append_sheet(wb, ws5, "사업장근태비교");
    }

    const { saveAs } = await import("file-saver");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `근태종합보고서_${year}년${month}월.xlsx`);
  };

  // 셀 클릭 → 팝업
  const handleCellClick = (empId, dateStr, e, workCode) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({ empId, dateStr, x: rect.left, y: rect.bottom + 2, workCode });
  };

  // 상태 저장
  const saveStatus = async (empId, dateStr, status) => {
    setSaving(true);
    try {
      if (status === null) {
        // 삭제
        await supabase.from("attendance_records").delete()
          .eq("employee_id", empId).eq("att_date", dateStr);
        setAttRecords(prev => prev.filter(a => !(a.employee_id === empId && a.att_date === dateStr)));
      } else {
        const { data, error } = await supabase.from("attendance_records").upsert(
          { employee_id: empId, att_date: dateStr, status },
          { onConflict: "employee_id,att_date" }
        ).select();
        if (error) throw error;
        setAttRecords(prev => {
          const filtered = prev.filter(a => !(a.employee_id === empId && a.att_date === dateStr));
          return [...filtered, ...(data || [])];
        });
      }
    } catch (e) { console.error("저장 오류:", e); alert("저장 실패: " + e.message); }
    setSaving(false);
    setPopup(null);
  };

  // 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!popup) return;
    const handler = () => setPopup(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [popup]);

  // 사업장 필터 옵션
  const siteFilterOptions = SITES.filter(s => s.code !== "V000" && activeEmps.some(e => e.site_code_1 === s.code));

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: C.dark, margin: 0 }}>📅 근태현황</h2>
          <div style={{ fontSize: 12, color: C.gray, marginTop: 3 }}>현장일보 자동반영 + 수동 편집 · 셀 클릭으로 상태 선택</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: C.gray }}>⏳ 로딩 중...</span>}
          {saving && <span style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>💾 저장 중...</span>}
          <button onClick={exportExcel} style={{ padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: "transparent", color: C.navy, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📥 종합 Excel</button>
        </div>
      </div>

      {/* 탭 바 (v9.3) */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#F0F2F8", borderRadius: 10, padding: 3 }}>
        {[["status", "📅 근무현황"], ["personal", "👤 개인분석"], ["site", "🏢 사업장분석"], ["anomaly", "⚠️ 이상감지"]].map(([k, v]) => (
          <button key={k} onClick={() => setAttTab(k)} style={{
            flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
            background: attTab === k ? "#fff" : "transparent", color: attTab === k ? C.navy : C.gray,
            border: "none", boxShadow: attTab === k ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s",
          }}>{v}</button>
        ))}
      </div>

      {/* ── 근무현황 탭 ── */}
      {attTab === "status" && (<>

      {/* 월 네비게이션 + 뷰 전환 + 검색 + 필터 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 12, padding: "10px 16px", flexWrap: "wrap" }}>
        <button onClick={() => moveMonth(-1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E8ECF4", background: "#F4F6FB", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.dark, minWidth: 120, textAlign: "center" }}>{year}년 {month}월</div>
        <button onClick={() => moveMonth(1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E8ECF4", background: "#F4F6FB", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        <button onClick={goToday} style={{ padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${C.navy}`, background: "transparent", color: C.navy, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>오늘</button>
        {holidaysInMonth > 0 && (
          <div style={{ fontSize: 11, color: "#C62828", background: "#FFEBEE", borderRadius: 6, padding: "3px 10px", fontWeight: 700 }}>
            🎌 공휴일 {holidaysInMonth}일
          </div>
        )}
        <div style={{ display: "flex", background: "#F0F2F8", borderRadius: 8, padding: 2, marginLeft: 8 }}>
          {[["calendar", "📅 캘린더"], ["card", "🃏 카드"], ["extra", "💜 추가근무"]].map(([k, v]) => (
            <button key={k} onClick={() => setViewMode(k)} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              background: viewMode === k ? "#fff" : "transparent", color: viewMode === k ? (k === "extra" ? "#7C3AED" : C.navy) : C.gray,
              border: "none", boxShadow: viewMode === k ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}>{v}</button>
          ))}
        </div>
        <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="🔍 이름/사번 검색" style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #D8DCE3", fontSize: 12, fontFamily: FONT, width: 140, background: "#fff" }} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.gray }}>사업장</span>
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #D8DCE3", fontSize: 12, fontFamily: FONT, fontWeight: 600, background: "#fff" }}>
            <option value="all">전체 ({activeEmps.length}명)</option>
            {siteFilterOptions.map(s => {
              const cnt = activeEmps.filter(e => e.site_code_1 === s.code).length;
              return <option key={s.code} value={s.code}>{s.name} ({cnt}명)</option>;
            })}
          </select>
        </div>
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
          {ATT_STATUSES.map(s => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: s.color, border: "1px solid #ddd" }} />
              <span style={{ fontWeight: 600, color: s.text }}>{s.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: "#fff", border: "2px solid #43A047" }} />
            <span style={{ fontWeight: 600, color: "#43A047" }}>일보 자동</span>
          </div>
        </div>
      </div>

      {/* KPI 스트립 (8개) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { icon: "👥", label: "표시 인원", value: `${totalEmps}명`, color: C.navy },
          { icon: "📊", label: "출근률", value: `${overallAttRate}%`, color: overallAttRate >= 80 ? C.success : overallAttRate >= 60 ? C.orange : C.error },
          { icon: "✅", label: "출근", value: `${kpiAttCount}건`, color: C.success },
          { icon: "💜", label: "추가근무", value: `${kpiExtraCount}건`, color: "#7C3AED" },
          { icon: "💰", label: "추가수당합계", value: kpiExtraAmount > 0 ? `${pFmt(kpiExtraAmount)}원` : "0원", color: "#7C3AED" },
          { icon: "⏰", label: "지각", value: `${kpiLateCount}건`, color: "#F57F17" },
          { icon: "❌", label: "결근", value: `${kpiAbsentCount}건`, color: C.error },
          { icon: "🏖️", label: "연차", value: `${kpiLeaveCount}건`, color: "#6A1B9A" },
        ].map(k => (
          <div key={k.label} style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{k.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: k.color, fontFamily: FONT }}>{k.value}</div>
            <div style={{ fontSize: 10, color: C.gray, marginTop: 2, fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── 추가근무 탭 ── */}
      {viewMode === "extra" && (() => {
        // staffRows에서 extra_amount 또는 staff_type=extra/substitute 인 행만 추출
        const extraRows = staffRows
          .filter(s => s.employee_id && (toNum(s.extra_amount) > 0 || s.staff_type === "extra" || s.staff_type === "substitute"))
          .map(s => {
            const rep = reports.find(r => r.id === s.report_id);
            const emp = employees.find(e => e.id === s.employee_id);
            return { ...s, report_date: rep?.report_date || "", site_code: rep?.site_code || "", empName: emp?.name || s.name_raw || "?", empNo: emp?.emp_no || "" };
          })
          .filter(s => s.report_date)
          .sort((a, b) => b.report_date.localeCompare(a.report_date));

        const totalAmt = extraRows.reduce((s, r) => s + toNum(r.extra_amount), 0);

        return (
          <div>
            {/* 헤더 요약 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ background: "#F3EDFF", border: "1.5px solid #DDD0F5", borderRadius: 12, padding: "10px 20px", display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#7C3AED", fontFamily: FONT }}>{extraRows.length}건</div>
                  <div style={{ fontSize: 11, color: C.gray }}>추가근무 총계</div>
                </div>
                <div style={{ width: 1, height: 36, background: "#DDD0F5" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#7C3AED", fontFamily: FONT }}>{fmt(totalAmt)}원</div>
                  <div style={{ fontSize: 11, color: C.gray }}>수당 합계</div>
                </div>
              </div>
            </div>

            {extraRows.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: C.gray, fontSize: 14, background: "#fff", borderRadius: 14, border: "1.5px solid #E8ECF4" }}>
                {loading ? "로딩 중..." : "이번 달 추가근무 내역이 없습니다"}
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "#F4F6FB" }}>
                      {[["날짜", 100], ["사업장", 140], ["사번", 90], ["이름", 80], ["구분", 90], ["추가수당유형", 130], ["수당(원)", 110]].map(([h, w]) => (
                        <th key={h} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, color: C.dark, textAlign: h === "수당(원)" ? "right" : "left", borderBottom: "2px solid #E8ECF4", minWidth: w }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extraRows.map((row, i) => {
                      const typeLabel = row.staff_type === "extra" ? "비번투입" : row.staff_type === "substitute" ? "대근" : row.staff_type === "hq" ? "본사지원" : row.staff_type === "part" ? "알바지원" : "추가";
                      const typeBg = row.staff_type === "extra" ? "#F3EDFF" : row.staff_type === "substitute" ? "#FFF3E0" : "#F0F4FF";
                      const typeColor = row.staff_type === "extra" ? "#7C3AED" : row.staff_type === "substitute" ? "#E65100" : C.navy;
                      const siteName = SITES.find(s => s.code === row.site_code)?.name || row.site_code || "—";
                      const amt = toNum(row.extra_amount);
                      return (
                        <tr key={row.id || i} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "1px solid #F0F2F8" }}>
                          <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: C.dark }}>{row.report_date}</td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: C.dark }}>
                            <span style={{ fontSize: 10, color: C.gray, marginRight: 4 }}>{row.site_code}</span>{siteName}
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 11, color: C.gray }}>{row.empNo || "—"}</td>
                          <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 800, color: C.dark }}>{row.empName}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, background: typeBg, color: typeColor, borderRadius: 6, padding: "2px 8px" }}>{typeLabel}</span>
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: C.gray }}>{row.extra_type || "—"}</td>
                          <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 900, color: amt > 0 ? "#7C3AED" : C.gray, textAlign: "right", fontFamily: FONT }}>
                            {amt > 0 ? `${fmt(amt)}원` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#F3EDFF", borderTop: "2px solid #DDD0F5" }}>
                      <td colSpan={6} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 800, color: "#7C3AED" }}>합계 ({extraRows.length}건)</td>
                      <td style={{ padding: "8px 12px", fontSize: 14, fontWeight: 900, color: "#7C3AED", textAlign: "right", fontFamily: FONT }}>{fmt(totalAmt)}원</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 카드 뷰 ── */}
      {viewMode === "card" && (
        <div>
          {siteGroups.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.gray, fontSize: 14 }}>{loading ? "로딩 중..." : "표시할 직원이 없습니다"}</div>}
          {siteGroups.map(group => (
            <div key={group.code} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                🏢 {group.name} <span style={{ color: C.gray, fontWeight: 600 }}>({group.code}) · {group.emps.length}명</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280, 1fr))", gap: 10 }}>
                {empStats.filter(e => e.site_code_1 === group.code).map(emp => {
                  const rateColor = emp.rate >= 80 ? C.success : emp.rate >= 60 ? C.orange : C.error;
                  return (
                    <div key={emp.id} style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, padding: "16px 18px", transition: "box-shadow 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                      {/* 카드 헤더 */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: C.dark }}>{emp.name}</div>
                          <div style={{ fontSize: 11, color: C.gray }}>{emp.emp_no} · {getWorkLabel(emp.work_code)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: rateColor }}>{emp.rate}%</div>
                          <div style={{ fontSize: 10, color: C.gray }}>출근률</div>
                        </div>
                      </div>
                      {/* 출근률 바 */}
                      <div style={{ height: 6, background: "#F0F2F8", borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(emp.rate, 100)}%`, background: rateColor, borderRadius: 3, transition: "width 0.4s" }} />
                      </div>
                      {/* 상세 카운트 */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, textAlign: "center" }}>
                        {[
                          { label: "출근", val: emp.att, color: C.success },
                          { label: "추가", val: emp.extra, color: "#7C3AED" },
                          { label: "지각", val: emp.late, color: "#F57F17" },
                          { label: "결근", val: emp.absent, color: C.error },
                          { label: "연차", val: emp.leave, color: "#6A1B9A" },
                        ].map(s => (
                          <div key={s.label}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: s.val > 0 ? s.color : "#DDD" }}>{s.val}</div>
                            <div style={{ fontSize: 9, color: C.gray, marginTop: 1 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      {/* 추가수당 뱃지 */}
                      {emp.extraAmt > 0 && (
                        <div style={{ marginTop: 8, background: "#F3EDFF", border: "1px solid #DDD0F5", borderRadius: 8, padding: "5px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED" }}>💰 추가수당</span>
                          <span style={{ fontSize: 12, fontWeight: 900, color: "#7C3AED", fontFamily: FONT }}>{fmt(emp.extraAmt)}원</span>
                        </div>
                      )}
                      {/* 미니 달력 도트 */}
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 2 }}>
                        {dates.filter(d => d.dateStr <= todayStr).map(d => {
                          const st = getCellStatus(emp.id, d.dateStr, emp.work_code);
                          const dotColor = st === "출근" ? "#C8E6C9" : st === "추가" ? "#E8D5F5" : st === "지각" ? "#FFF9C4" : st === "결근" ? "#FFCDD2" : st === "연차" ? "#E1BEE7" : st === "휴무" ? "#E0E0E0" : d.isHoliday || d.isWeekend ? "#F5F5F5" : "#EEEEEE";
                          return <div key={d.dateStr} title={`${d.dateStr} ${st || ""}`} style={{ width: 8, height: 8, borderRadius: 2, background: dotColor }} />;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 캘린더 그리드 테이블 ── */}
      {viewMode === "calendar" && (
      <div style={{ background: "#fff", border: "1.5px solid #E8ECF4", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: daysInMonth * 40 + 230, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#F4F6FB", padding: "8px 12px", fontSize: 12, fontWeight: 800, color: C.dark, borderBottom: "2px solid #E8ECF4", borderRight: "2px solid #E8ECF4", textAlign: "left", minWidth: 150 }}>
                  근무자
                </th>
                {dates.map(d => {
                  const isRed = d.isWeekend || d.isHoliday;
                  return (
                    <th key={d.day} title={`${d.dateStr} (${d.dayName})${d.holidayName ? ` · ${d.holidayName}` : ""}`} style={{
                      padding: "4px 2px", fontSize: 10, fontWeight: 700, textAlign: "center",
                      borderBottom: "2px solid #E8ECF4", minWidth: 36,
                      background: d.isToday ? C.navy : d.isHoliday ? "#FFF3F3" : "#F4F6FB",
                      color: d.isToday ? "#fff" : isRed ? "#C62828" : C.dark,
                      borderLeft: d.day === 1 ? "none" : "1px solid #F0F0F0",
                    }}>
                      <div>{d.day}</div>
                      <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.8 }}>{d.dayName}</div>
                    </th>
                  );
                })}
                <th style={{ padding: "8px 6px", fontSize: 11, fontWeight: 800, color: C.dark, background: "#F4F6FB", borderBottom: "2px solid #E8ECF4", borderLeft: "2px solid #E8ECF4", textAlign: "center", minWidth: 52 }}>
                  합계
                </th>
              </tr>
            </thead>
            <tbody>
              {siteGroups.length === 0 && (
                <tr><td colSpan={daysInMonth + 2} style={{ padding: 40, textAlign: "center", color: C.gray, fontSize: 14 }}>
                  {loading ? "로딩 중..." : "표시할 직원이 없습니다"}
                </td></tr>
              )}
              {siteGroups.map(group => (
                <Fragment key={group.code}>
                  {/* 사업장 그룹 헤더 */}
                  <tr>
                    <td colSpan={daysInMonth + 2} style={{ padding: "6px 12px", background: "#EEF1F8", fontSize: 11, fontWeight: 800, color: C.navy, borderBottom: "1px solid #E8ECF4" }}>
                      🏢 {group.name} <span style={{ color: C.gray, fontWeight: 600 }}>({group.code}) · {group.emps.length}명</span>
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600 }}>
                        <span style={{ color: "#1565C0" }}>평{group.emps.filter(e => getWorkCat(e.work_code) === "weekday").length}</span>
                        <span style={{ color: "#E65100", marginLeft: 4 }}>주{group.emps.filter(e => getWorkCat(e.work_code) === "weekend").length}</span>
                        {group.emps.filter(e => getWorkCat(e.work_code) === "mixed").length > 0 && <span style={{ color: "#7B1FA2", marginLeft: 4 }}>복합{group.emps.filter(e => getWorkCat(e.work_code) === "mixed").length}</span>}
                        {group.emps.filter(e => getWorkCat(e.work_code) === "parttime").length > 0 && <span style={{ color: "#2E7D32", marginLeft: 4 }}>알바{group.emps.filter(e => getWorkCat(e.work_code) === "parttime").length}</span>}
                      </span>
                    </td>
                  </tr>
                  {group.emps.map((emp, idx) => {
                    const attDays = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "출근").length;
                    const extraDays = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "추가").length;
                    const lateDays = dates.filter(d => getCellStatus(emp.id, d.dateStr, emp.work_code) === "지각").length;
                    const workableDays = dates.filter(d => !d.isWeekend && !d.isHoliday && d.dateStr <= todayStr).length;
                    const totalWorked = attDays + extraDays + lateDays;
                    const rate = workableDays > 0 ? Math.round((totalWorked / workableDays) * 100) : 0;
                    return (
                      <tr key={emp.id} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                        <td style={{
                          position: "sticky", left: 0, zIndex: 5, padding: "5px 8px", fontSize: 12, fontWeight: 700, color: C.dark, borderBottom: "1px solid #F0F2F8", borderRight: "2px solid #E8ECF4",
                          background: idx % 2 === 0 ? "#fff" : "#FAFBFC", whiteSpace: "nowrap", minWidth: 150,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: 12 }}>{emp.name}</span>
                            {emp.work_code && (() => {
                              const cat = getWorkCat(emp.work_code);
                              const wl = WORK_CODES.find(w => w.code === emp.work_code)?.label || emp.work_code;
                              const catColor = cat === "weekday" ? { bg: "#E3F2FD", color: "#1565C0" } : cat === "weekend" ? { bg: "#FFF3E0", color: "#E65100" } : cat === "mixed" ? { bg: "#F3E5F5", color: "#7B1FA2" } : { bg: "#E8F5E9", color: "#2E7D32" };
                              return <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: catColor.bg, color: catColor.color, fontWeight: 800 }}>{wl}</span>;
                            })()}
                          </div>
                          <div style={{ fontSize: 9, color: C.gray, fontWeight: 600, marginTop: 1 }}>
                            <span style={{ color: C.navy, fontWeight: 700 }}>{emp.emp_no || "—"}</span>
                            {emp.position && emp.position !== "일반" && <span> · {emp.position}</span>}
                          </div>
                        </td>
                        {dates.map(d => {
                          const st = getCellStatus(emp.id, d.dateStr, emp.work_code);
                          const isAuto = !manualAttMap[`${emp.id}-${d.dateStr}`] && autoAttMap[`${emp.id}-${d.dateStr}`];
                          const info = st ? ATT_MAP[st] : null;
                          const isFuture = d.dateStr > todayStr;
                          return (
                            <td key={d.day}
                              onClick={isFuture ? undefined : (e) => handleCellClick(emp.id, d.dateStr, e, emp.work_code)}
                              style={{
                                padding: 0, textAlign: "center", borderBottom: "1px solid #F0F2F8",
                                borderLeft: "1px solid #F0F0F0", cursor: isFuture ? "default" : "pointer",
                                background: isFuture ? "#FAFAFA" : info ? info.bg : (d.isHoliday ? "#FFF8F8" : "transparent"),
                                transition: "background 0.15s",
                                position: "relative",
                              }}
                              title={`${d.dateStr} (${d.dayName})${d.holidayName ? ` · ${d.holidayName}` : ""}${st ? ` — ${st}` : ""}`}
                            >
                              {st && (
                                <div style={{
                                  fontSize: 10, fontWeight: 700, color: info?.text || C.dark, padding: "4px 2px", lineHeight: 1.2,
                                  ...(isAuto ? { borderBottom: `2px solid ${st === "추가" ? "#7C3AED" : C.success}` } : {}),
                                }}>
                                  {st === "출근" ? "출근" : st === "지각" ? "지각" : st === "결근" ? "결근" : st === "휴무" ? "·" : st === "연차" ? "연차" : st}
                                </div>
                              )}
                              {!st && d.isHoliday && (
                                <div style={{ fontSize: 8, color: "#E57373", padding: "4px 0" }}>🎌</div>
                              )}
                            </td>
                          );
                        })}
                        <td style={{
                          padding: "4px 6px", textAlign: "center", borderBottom: "1px solid #F0F2F8", borderLeft: "2px solid #E8ECF4", fontSize: 11, fontWeight: 800,
                        }}>
                          <div style={{ color: C.dark }}>{totalWorked}일</div>
                          <div style={{ fontSize: 10, color: rate >= 80 ? C.success : rate >= 50 ? C.orange : C.error, fontWeight: 700 }}>{rate}%</div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* 하단 요약 */}
        {allFilteredEmps.length > 0 && (
          <div style={{ padding: "10px 16px", background: "#F8F9FC", borderTop: "1.5px solid #EEF1F8", fontSize: 12, color: C.gray, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>👥 총 {totalEmps}명</span>
            <span>📊 출근률 {overallAttRate}%</span>
            <span>✅ 출근 {kpiAttCount}건</span>
            <span>💜 추가 {kpiExtraCount}건</span>
            {kpiExtraAmount > 0 && <span style={{ color: "#7C3AED", fontWeight: 700 }}>💰 추가수당 {fmt(kpiExtraAmount)}원</span>}
            <span>⏰ 지각 {kpiLateCount}건</span>
            <span>❌ 결근 {kpiAbsentCount}건</span>
            <span>🏖️ 연차 {kpiLeaveCount}건</span>
          </div>
        )}
      </div>
      )}

      {/* 공휴일 목록 */}
      {holidaysInMonth > 0 && (
        <div style={{ marginTop: 16, background: "#FFF3E0", border: "1.5px solid #FFE0B2", borderRadius: 12, padding: "10px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#E65100", marginBottom: 6 }}>🎌 이번 달 공휴일</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {dates.filter(d => d.isHoliday).map(d => (
              <span key={d.dateStr} style={{ fontSize: 11, background: "#fff", border: "1px solid #FFE0B2", borderRadius: 8, padding: "2px 10px", color: "#C62828", fontWeight: 700 }}>
                {d.day}일({d.dayName}) {d.holidayName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 상태 선택 팝업 */}
      {popup && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "fixed", left: Math.min(popup.x, window.innerWidth - 180), top: Math.min(popup.y, window.innerHeight - 240),
          zIndex: 9999, background: "#fff", border: "1.5px solid #D8DCE3", borderRadius: 12, padding: 8, minWidth: 130,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: 10, color: C.gray, padding: "2px 8px 6px", fontWeight: 700, borderBottom: "1px solid #eee", marginBottom: 4 }}>
            {popup.dateStr.slice(5)} 상태 변경
          </div>
          {ATT_STATUSES.map(s => {
            const isActive = getCellStatus(popup.empId, popup.dateStr, popup.workCode) === s.key;
            return (
              <button key={s.key} onClick={() => saveStatus(popup.empId, popup.dateStr, s.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none",
                  background: isActive ? s.bg : "transparent", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  fontWeight: isActive ? 800 : 600, color: s.text, fontFamily: FONT,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F5F5F5"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 3, background: s.color, border: "1px solid #ddd", flexShrink: 0 }} />
                {s.label}
                {isActive && <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span>}
              </button>
            );
          })}
          {/* 삭제(초기화) */}
          {getCellStatus(popup.empId, popup.dateStr, popup.workCode) && (
            <>
              <div style={{ height: 1, background: "#eee", margin: "4px 0" }} />
              <button onClick={() => saveStatus(popup.empId, popup.dateStr, null)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none",
                  background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  fontWeight: 600, color: C.error, fontFamily: FONT,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#FFF0F0"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                🗑 삭제 (초기화)
              </button>
            </>
          )}
        </div>
      )}

      </>)}

      {/* ── 개인분석 탭 (v9.3) ── */}
      {attTab === "personal" && (
        <PersonalAnalyticsTab
          employees={employees}
          year={year} month={month}
          dates={dates}
          getCellStatus={getCellStatus}
          todayStr={new Date().toISOString().slice(0, 10)}
          staffRows={staffRows}
          reports={reports}
          extraAmountMap={extraAmountMap}
          moveMonth={moveMonth}
          goToday={goToday}
          loading={loading}
        />
      )}

      {/* ── 사업장분석 탭 (v9.3 P2) ── */}
      {attTab === "site" && (
        <SiteAnalyticsTab
          employees={employees}
          year={year} month={month}
          dates={dates}
          getCellStatus={getCellStatus}
          todayStr={new Date().toISOString().slice(0, 10)}
          staffRows={staffRows}
          reports={reports}
          extraAmountMap={extraAmountMap}
          moveMonth={moveMonth}
          goToday={goToday}
          loading={loading}
        />
      )}

      {/* ── 이상감지 탭 (v9.3 P3) ── */}
      {attTab === "anomaly" && (
        <AnomalyDetectionTab
          employees={employees}
          year={year} month={month}
          dates={dates}
          getCellStatus={getCellStatus}
          todayStr={new Date().toISOString().slice(0, 10)}
          staffRows={staffRows}
          reports={reports}
          extraAmountMap={extraAmountMap}
          moveMonth={moveMonth}
          goToday={goToday}
          loading={loading}
        />
      )}

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
    <ErrorBoundary>
      <ConfirmProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ConfirmProvider>
    </ErrorBoundary>
  );
}

function AppRouter() {
  const { user, profile, loading } = useAuth();
  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, background: C.bg }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: C.gold, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: C.navy, marginBottom: 12 }}>MP</div>
      <div style={{ color: C.gray, fontSize: 13 }}>로딩 중...</div>
    </div>
  </div>;
  // field_member(마감앱 전용) 차단 — crew는 ERP 접근 허용
  if (user && profile && profile.role === "field_member") {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, background: C.bg }}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: C.gold, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: C.navy, marginBottom: 16 }}>MP</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.dark, margin: "0 0 12px" }}>관리자 전용 시스템</h2>
        <p style={{ fontSize: 14, color: C.gray, lineHeight: 1.6, margin: "0 0 24px" }}>
          현장 계정({profile.emp_no || profile.name})은 이 시스템에 접근할 수 없습니다.<br/>
          현장일보 앱(마감앱)을 이용해주세요.
        </p>
        <button onClick={() => supabase.auth.signOut()} style={{ ...btnPrimary, padding: "12px 32px", fontSize: 14 }}>로그아웃</button>
      </div>
    </div>;
  }
  return user ? <MainApp /> : <LoginPage />;
}
