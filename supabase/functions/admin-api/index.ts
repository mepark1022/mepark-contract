// ============================================================
// 미팍ERP — admin-api Edge Function v9 (AI 분석 통합)
// ============================================================
// v9 변경: ai_classify / ai_analyze 액션 추가 (Anthropic API 프록시)
// v8: phone_login, field_login, change_password (비밀번호 기반)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeInitialPassword(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const last4 = digits.length >= 4 ? digits.slice(-4) : "0000";
  return last4 + "12";
}

function makeAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ────────────────────────────────────────────────────────
    // ACTION: phone_login — 전화번호 + 비밀번호 로그인 (v8)
    // ────────────────────────────────────────────────────────
    if (action === "phone_login") {
      const { phone, password: userPassword } = body;
      if (!phone) return jsonRes({ error: "전화번호가 필요합니다." }, 400);

      const digits = (phone || "").replace(/\D/g, "");
      if (digits.length !== 11) return jsonRes({ error: "전화번호 11자리를 입력해주세요." }, 400);
      if (!userPassword) return jsonRes({ error: "비밀번호를 입력해주세요." }, 400);

      const adminClient = makeAdminClient();

      // 1. employees에서 전화번호로 조회 (숫자 / 하이픈 양쪽 시도)
      let emp: any = null;
      const { data: empList } = await adminClient
        .from("employees")
        .select("id, name, emp_no, site_code_1, site_code_2, work_code, phone, auth_id, system_role, account_email, account_status, status")
        .eq("phone", digits)
        .limit(1);

      if (empList && empList.length > 0) {
        emp = empList[0];
      } else {
        const formatted = digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
        const { data: empList2 } = await adminClient
          .from("employees")
          .select("id, name, emp_no, site_code_1, site_code_2, work_code, phone, auth_id, system_role, account_email, account_status, status")
          .eq("phone", formatted)
          .limit(1);
        if (empList2 && empList2.length > 0) emp = empList2[0];
      }

      if (!emp) return jsonRes({ error: "등록되지 않은 전화번호입니다." }, 401);

      // 2. 퇴사자 차단
      if (emp.status === "퇴사") return jsonRes({ error: "퇴사 처리된 직원입니다. 관리자에게 문의하세요." }, 401);

      // 3. 이메일/역할 결정
      const role = emp.system_role || "field_member";
      const isERP = ["crew", "admin", "super_admin"].includes(role);
      const email = isERP
        ? `${emp.emp_no.toLowerCase()}@mepark.internal`
        : `${emp.emp_no.toLowerCase()}@field.mepark.internal`;

      const initialPw = makeInitialPassword(emp.phone);
      let authId = emp.auth_id;

      // 4. auth_id 없으면 이메일로 탐색
      if (!authId) {
        const { data: userList } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const existing = userList?.users?.find((u: any) => u.email === email);
        if (existing) {
          authId = existing.id;
          await adminClient.from("employees").update({ auth_id: authId }).eq("id", emp.id);
        }
      }

      // 5. 계정 없으면 자동 생성 (초기 비밀번호)
      if (!authId) {
        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password: initialPw,
          email_confirm: true,
          user_metadata: { emp_no: emp.emp_no, name: emp.name, role, site_code: emp.site_code_1 },
        });

        if (createErr && !createErr.message.includes("already been registered")) {
          return jsonRes({ error: "계정 생성 실패: " + createErr.message }, 500);
        }

        if (createErr) {
          const { data: ul } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          authId = ul?.users?.find((u: any) => u.email === email)?.id ?? null;
        } else {
          authId = newUser?.user?.id ?? null;
        }

        if (authId) {
          await adminClient.from("employees").update({ auth_id: authId }).eq("id", emp.id);
        }
      }

      if (!authId) {
        return jsonRes({
          error: isERP
            ? "ERP 계정이 없습니다. 관리자에게 계정 생성을 요청하세요."
            : "Auth 계정을 찾을 수 없습니다.",
        }, 500);
      }

      // 6. 로그인 시도
      const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
        email, password: userPassword,
      });

      if (!signInErr && signInData?.session) {
        return jsonRes({
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          employee: {
            id: emp.id, name: emp.name, emp_no: emp.emp_no, emp_id: emp.emp_no,
            site_code: emp.site_code_1, site_code_2: emp.site_code_2 || null,
            work_type: emp.work_code, role,
          },
        });
      }

      // 7. 로그인 실패 — 마이그레이션: 초기비번 입력 시 기존 비번 리셋
      if (userPassword === initialPw) {
        await adminClient.auth.admin.updateUserById(authId, { password: initialPw });
        const { data: retryData, error: retryErr } = await adminClient.auth.signInWithPassword({
          email, password: initialPw,
        });
        if (!retryErr && retryData?.session) {
          return jsonRes({
            access_token: retryData.session.access_token,
            refresh_token: retryData.session.refresh_token,
            employee: {
              id: emp.id, name: emp.name, emp_no: emp.emp_no, emp_id: emp.emp_no,
              site_code: emp.site_code_1, site_code_2: emp.site_code_2 || null,
              work_type: emp.work_code, role,
            },
          });
        }
      }

      return jsonRes({ error: "비밀번호가 올바르지 않습니다." }, 401);
    }

    // ────────────────────────────────────────────────────────
    // ACTION: field_login — 사번 + 비밀번호 로그인 (v8)
    // ────────────────────────────────────────────────────────
    if (action === "field_login") {
      const { emp_id, password: userPassword } = body;
      if (!emp_id) return jsonRes({ error: "사번이 필요합니다." }, 400);
      if (!userPassword) return jsonRes({ error: "비밀번호를 입력해주세요." }, 400);

      const adminClient = makeAdminClient();

      const { data: emp, error: empErr } = await adminClient
        .from("employees")
        .select("id, name, emp_no, site_code_1, site_code_2, work_code, phone, auth_id, system_role, account_email, account_status, status")
        .eq("emp_no", emp_id.trim().toUpperCase())
        .single();

      if (empErr || !emp) return jsonRes({ error: "등록되지 않은 사번입니다." }, 401);
      if (emp.status === "퇴사") return jsonRes({ error: "퇴사 처리된 직원입니다." }, 401);

      const role = emp.system_role || "field_member";
      const isERP = ["crew", "admin", "super_admin"].includes(role);
      const email = isERP
        ? `${emp.emp_no.toLowerCase()}@mepark.internal`
        : `${emp.emp_no.toLowerCase()}@field.mepark.internal`;

      const initialPw = makeInitialPassword(emp.phone);
      let authId = emp.auth_id;

      if (!authId) {
        const { data: userList } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const existing = userList?.users?.find((u: any) => u.email === email);
        if (existing) {
          authId = existing.id;
          await adminClient.from("employees").update({ auth_id: authId }).eq("id", emp.id);
        }
      }

      if (!authId && !isERP) {
        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email, password: initialPw, email_confirm: true,
          user_metadata: { emp_no: emp.emp_no, name: emp.name, role, site_code: emp.site_code_1 },
        });
        if (createErr && !createErr.message.includes("already been registered")) {
          return jsonRes({ error: "계정 생성 실패: " + createErr.message }, 500);
        }
        if (createErr) {
          const { data: ul } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          authId = ul?.users?.find((u: any) => u.email === email)?.id ?? null;
        } else {
          authId = newUser?.user?.id ?? null;
        }
        if (authId) {
          await adminClient.from("employees").update({ auth_id: authId }).eq("id", emp.id);
        }
      }

      if (!authId) {
        return jsonRes({ error: isERP ? "ERP 계정이 없습니다." : "Auth 계정을 찾을 수 없습니다." }, 500);
      }

      const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
        email, password: userPassword,
      });

      if (!signInErr && signInData?.session) {
        return jsonRes({
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          employee: {
            id: emp.id, name: emp.name, emp_no: emp.emp_no, emp_id: emp.emp_no,
            site_code: emp.site_code_1, site_code_2: emp.site_code_2 || null,
            work_type: emp.work_code, role,
          },
        });
      }

      // 마이그레이션
      if (userPassword === initialPw) {
        await adminClient.auth.admin.updateUserById(authId, { password: initialPw });
        const { data: retryData, error: retryErr } = await adminClient.auth.signInWithPassword({
          email, password: initialPw,
        });
        if (!retryErr && retryData?.session) {
          return jsonRes({
            access_token: retryData.session.access_token,
            refresh_token: retryData.session.refresh_token,
            employee: {
              id: emp.id, name: emp.name, emp_no: emp.emp_no, emp_id: emp.emp_no,
              site_code: emp.site_code_1, site_code_2: emp.site_code_2 || null,
              work_type: emp.work_code, role,
            },
          });
        }
      }

      return jsonRes({ error: "비밀번호가 올바르지 않습니다." }, 401);
    }

    // ────────────────────────────────────────────────────────
    // ACTION: change_password — 비밀번호 변경
    // ────────────────────────────────────────────────────────
    if (action === "change_password") {
      const { phone, emp_no, current_password, new_password } = body;
      if (!current_password || !new_password) return jsonRes({ error: "현재 비밀번호와 새 비밀번호가 필요합니다." }, 400);
      if (new_password.length < 6) return jsonRes({ error: "새 비밀번호는 6자 이상이어야 합니다." }, 400);
      if (!phone && !emp_no) return jsonRes({ error: "전화번호 또는 사번이 필요합니다." }, 400);

      const adminClient = makeAdminClient();

      let emp: any = null;
      if (phone) {
        const digits = (phone || "").replace(/\D/g, "");
        const { data: list1 } = await adminClient.from("employees")
          .select("id, emp_no, phone, auth_id, system_role, status")
          .eq("phone", digits).limit(1);
        if (list1 && list1.length > 0) emp = list1[0];
        if (!emp) {
          const formatted = digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
          const { data: list2 } = await adminClient.from("employees")
            .select("id, emp_no, phone, auth_id, system_role, status")
            .eq("phone", formatted).limit(1);
          if (list2 && list2.length > 0) emp = list2[0];
        }
      } else {
        const { data } = await adminClient.from("employees")
          .select("id, emp_no, phone, auth_id, system_role, status")
          .eq("emp_no", emp_no.trim().toUpperCase()).single();
        if (data) emp = data;
      }

      if (!emp) return jsonRes({ error: "등록되지 않은 사용자입니다." }, 401);
      if (!emp.auth_id) return jsonRes({ error: "계정이 생성되지 않았습니다. 먼저 로그인해주세요." }, 400);

      const role = emp.system_role || "field_member";
      const isERP = ["crew", "admin", "super_admin"].includes(role);
      const email = isERP
        ? `${emp.emp_no.toLowerCase()}@mepark.internal`
        : `${emp.emp_no.toLowerCase()}@field.mepark.internal`;

      // 현재 비밀번호 검증
      const { error: verifyErr } = await adminClient.auth.signInWithPassword({
        email, password: current_password,
      });

      if (verifyErr) {
        // 마이그레이션: 초기비번으로 현재비번 검증
        const initialPw = makeInitialPassword(emp.phone);
        if (current_password === initialPw) {
          await adminClient.auth.admin.updateUserById(emp.auth_id, { password: initialPw });
          const { error: retryErr } = await adminClient.auth.signInWithPassword({ email, password: initialPw });
          if (retryErr) return jsonRes({ error: "현재 비밀번호가 올바르지 않습니다." }, 401);
        } else {
          return jsonRes({ error: "현재 비밀번호가 올바르지 않습니다." }, 401);
        }
      }

      // 새 비밀번호로 변경
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(emp.auth_id, {
        password: new_password,
      });
      if (updateErr) return jsonRes({ error: "비밀번호 변경 실패: " + updateErr.message }, 500);

      return jsonRes({ success: true, message: "비밀번호가 변경되었습니다." });
    }

    // ────────────────────────────────────────────────────────
    // ACTION: ai_classify — 오류보고 간이 분류
    // ACTION: ai_analyze — 오류보고 상세 분석
    // ────────────────────────────────────────────────────────
    if (action === "ai_classify" || action === "ai_analyze") {
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) {
        return jsonRes({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. Supabase Secrets에서 설정해주세요." }, 500);
      }

      const { title, description, page_name } = body;
      if (!title || !description) return jsonRes({ error: "title과 description이 필요합니다." }, 400);

      const ERP_CONTEXT = `미팍ERP 시스템: React+Vite 단일파일(App.jsx ~14,000줄), Supabase 백엔드. 화면: 메인대시보드, HR대시보드, 직원현황, 계약서, 계약이력, 조항변경, 전체요약, 사업장PL, 비용입력, 급여대장(3탭), 월주차관리, 비교분석, 배부설정, 데이터Import, 사업장관리, 현장일보, 마감보고현황, 근태현황, 전체캘린더, 인건비견적, 오류보고. DB: profiles,employees,contracts,financial_transactions,monthly_summary,site_revenue,site_overhead,site_details,site_parking,monthly_parking,payroll_records,payslips,daily_reports,daily_report_staff,daily_report_payment,daily_report_extra,attendance_records,bug_reports. Edge Function: admin-api. 현장앱(mepark-field): 별도레포, 전화번호+비밀번호 로그인, 일보제출/급여내역서조회.`;

      const isClassify = action === "ai_classify";
      const prompt = isClassify
        ? `다음 오류 보고를 분석해서 JSON으로만 응답하세요 (다른 텍스트 없이):\n제목: ${title}\n내용: ${description}\n\n응답 형식:\n{"category": "ui|feature|data|performance|suggestion", "priority": "low|medium|high|critical", "summary": "한줄 요약(30자 이내)"}`
        : `${ERP_CONTEXT}\n\n다음 오류 보고를 분석해서 JSON으로만 응답하세요 (마크다운이나 다른 텍스트 없이 순수 JSON만):\n발생화면: ${page_name || "알 수 없음"}\n제목: ${title}\n내용: ${description}\n\n응답 형식:\n{\n  "category": "ui|feature|data|performance|suggestion",\n  "priority": "low|medium|high|critical",\n  "summary": "한줄 요약(30자 이내)",\n  "cause": "추정 원인 (2~3문장, 시스템 구조 기반 분석)",\n  "fix_direction": "수정 방향 (구체적 해결 방법 2~3문장)",\n  "related_components": ["관련 컴포넌트나 화면 이름 배열 (최대 3개)"]\n}`;

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: isClassify ? 200 : 600,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        const data = await res.json();
        const text = data.content?.[0]?.text || "";
        try {
          const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
          return jsonRes(parsed);
        } catch {
          return jsonRes({ error: "AI 응답 파싱 실패", raw: text }, 500);
        }
      } catch (e: any) {
        return jsonRes({ error: "Anthropic API 호출 실패: " + e.message }, 500);
      }
    }

    // ── 아래부터 super_admin 인증 필요 ──────────────────────

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "인증이 필요합니다." }, 401);

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser();
    if (authError || !caller) return jsonRes({ error: "인증 실패" }, 401);

    const { data: callerProfile } = await supabaseAnon
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || callerProfile.role !== "super_admin") {
      return jsonRes({ error: "슈퍼관리자만 실행 가능합니다." }, 403);
    }

    const supabaseAdmin = makeAdminClient();

    // ACTION: create_user
    if (action === "create_user") {
      const { email, password, name, role, site_code, employee_id, emp_no, work_code } = body;
      if (!email || !password || !name || !role) return jsonRes({ error: "필수 정보가 누락되었습니다." }, 400);

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (createError) return jsonRes({ error: "계정 생성 실패: " + createError.message }, 400);

      const userId = newUser?.user?.id;
      if (!userId) return jsonRes({ error: "계정 생성 실패: ID를 받지 못했습니다." }, 500);

      const profileData: any = { id: userId, email, name, role, created_at: new Date().toISOString() };
      if (site_code) profileData.site_code = site_code;
      if (employee_id) profileData.employee_id = employee_id;
      if (emp_no) profileData.emp_no = emp_no;
      if (work_code) profileData.work_code = work_code;

      const { error: profErr } = await supabaseAdmin.from("profiles").upsert(profileData, { onConflict: "id" });
      if (profErr) return jsonRes({ error: "프로필 저장 실패: " + profErr.message }, 500);

      return jsonRes({ success: true, userId });
    }

    // ACTION: ban_user
    if (action === "ban_user") {
      const { userId } = body;
      if (!userId) return jsonRes({ error: "userId가 필요합니다." }, 400);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
      if (error) return jsonRes({ error: "계정 차단 실패: " + error.message }, 500);
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      return jsonRes({ success: true });
    }

    // ACTION: reset_password
    if (action === "reset_password") {
      const { userId, newPassword } = body;
      if (!userId || !newPassword) return jsonRes({ error: "userId와 newPassword가 필요합니다." }, 400);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) return jsonRes({ error: "비밀번호 리셋 실패: " + error.message }, 500);
      return jsonRes({ success: true });
    }

    // ACTION: unban_user
    if (action === "unban_user") {
      const { userId } = body;
      if (!userId) return jsonRes({ error: "userId가 필요합니다." }, 400);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (error) return jsonRes({ error: "재활성화 실패: " + error.message }, 500);
      return jsonRes({ success: true });
    }

    // ACTION: sync_email — 역할 변경 시 이메일 도메인 동기화 (v11)
    if (action === "sync_email") {
      const { userId, newEmail } = body;
      if (!userId || !newEmail) return jsonRes({ error: "userId와 newEmail이 필요합니다." }, 400);
      const adminClient = makeAdminClient();
      const { error } = await adminClient.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
      if (error) return jsonRes({ error: "이메일 변경 실패: " + error.message }, 500);
      return jsonRes({ success: true });
    }

    // ACTION: bulk_create_field
    if (action === "bulk_create_field") {
      const { accounts } = body;
      if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
        return jsonRes({ error: "생성할 계정 목록이 필요합니다." }, 400);
      }
      if (accounts.length > 50) return jsonRes({ error: "한 번에 최대 50개까지 생성 가능합니다." }, 400);

      const results = [];
      for (const acc of accounts) {
        const email = `${acc.emp_no.toLowerCase()}@field.mepark.internal`;
        const password = makeInitialPassword(acc.phone || "");

        try {
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email, password, email_confirm: true,
            user_metadata: { name: acc.name, emp_no: acc.emp_no },
          });

          if (createError && !createError.message.includes("already been registered")) {
            results.push({ emp_no: acc.emp_no, success: false, error: createError.message });
            continue;
          }

          const userId = newUser?.user?.id;
          if (userId && acc.employee_id) {
            await supabaseAdmin.from("employees").update({ auth_id: userId }).eq("id", acc.employee_id);
          }

          results.push({ emp_no: acc.emp_no, success: true, userId });
        } catch (e: any) {
          results.push({ emp_no: acc.emp_no, success: false, error: e.message });
        }
      }

      const successCount = results.filter((r: any) => r.success).length;
      return jsonRes({ success: true, results, successCount, totalCount: accounts.length });
    }

    return jsonRes({ error: `알 수 없는 action: ${action}` }, 400);

  } catch (err: any) {
    return jsonRes({ error: err.message || "서버 오류" }, 500);
  }
});
