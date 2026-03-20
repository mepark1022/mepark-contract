// ============================================================
// 미팍ERP — admin-api Edge Function v5 (phone_login + field_login)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ────────────────────────────────────────────────────────
    // ACTION: phone_login — 전화번호 1단계 로그인 (v9.2)
    // 클라이언트는 전화번호만 전송 → 서버에서 사번 조회 + 인증 일괄 처리
    // PIN/비밀번호가 클라이언트에 노출되지 않음
    // ────────────────────────────────────────────────────────
    if (action === "phone_login") {
      const { phone } = body;
      if (!phone) {
        return new Response(JSON.stringify({ error: "전화번호가 필요합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const digits = (phone || "").replace(/\D/g, "");
      if (digits.length !== 11) {
        return new Response(JSON.stringify({ error: "전화번호 11자리를 입력해주세요." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      // 1. employees에서 전화번호로 조회
      const { data: empList, error: empErr } = await adminClient
        .from("employees")
        .select("id, name, emp_no, site_code_1, work_code, phone, auth_id, system_role, account_email, account_status, status")
        .eq("phone", digits)
        .limit(1);

      if (empErr || !empList || empList.length === 0) {
        // 하이픈 포함 형식도 시도 (010-1234-5678)
        const formatted = digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
        const { data: empList2, error: empErr2 } = await adminClient
          .from("employees")
          .select("id, name, emp_no, site_code_1, work_code, phone, auth_id, system_role, account_email, account_status, status")
          .eq("phone", formatted)
          .limit(1);

        if (empErr2 || !empList2 || empList2.length === 0) {
          return new Response(JSON.stringify({ error: "등록되지 않은 전화번호입니다." }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        var emp = empList2[0];
      } else {
        var emp = empList[0];
      }

      // 2. 퇴사자 차단
      if (emp.status === "퇴사") {
        return new Response(JSON.stringify({ error: "퇴사 처리된 직원입니다. 관리자에게 문의하세요." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3. PIN 생성 (전화번호 뒤 4자리)
      const phoneDigits = (emp.phone || "").replace(/\D/g, "");
      const pin4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : digits.slice(-4);
      const password = `mp${pin4}`;

      // 4. 역할에 따라 이메일 형식 분기
      const role = emp.system_role || "field_member";
      const isERP = ["crew", "admin", "super_admin"].includes(role);
      const email = isERP
        ? `${emp.emp_no.toLowerCase()}@mepark.internal`
        : `${emp.emp_no.toLowerCase()}@field.mepark.internal`;

      let authId = emp.auth_id;

      // 5. auth_id 없으면 이메일로 탐색
      if (!authId) {
        const { data: userList } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const existing = userList?.users?.find((u: any) => u.email === email);
        if (existing) {
          authId = existing.id;
          await adminClient.from("employees").update({ auth_id: authId }).eq("id", emp.id);
        }
      }

      // 6. field_member 신규 계정 자동 생성
      if (!authId && !isERP) {
        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            emp_no: emp.emp_no,
            name: emp.name,
            role,
            site_code: emp.site_code_1,
          },
        });

        if (createErr && !createErr.message.includes("already been registered")) {
          return new Response(JSON.stringify({ error: "계정 생성 실패: " + createErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
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
        return new Response(JSON.stringify({
          error: isERP
            ? "ERP 계정이 없습니다. 관리자에게 계정 생성을 요청하세요."
            : "Auth 계정을 찾을 수 없습니다.",
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 7. 비밀번호 최신화 → 로그인
      await adminClient.auth.admin.updateUserById(authId, { password });

      const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr || !signInData?.session) {
        return new Response(JSON.stringify({ error: "세션 생성 실패: " + (signInErr?.message || "unknown") }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        employee: {
          id: emp.id,
          name: emp.name,
          emp_no: emp.emp_no,
          emp_id: emp.emp_no,
          site_code: emp.site_code_1,
          work_type: emp.work_code,
          role,
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ────────────────────────────────────────────────────────
    // ACTION: field_login — 사번+PIN 로그인 (기존 호환 유지)
    // 역할별 이메일 형식 분기:
    //   crew / admin / super_admin → empNo@mepark.internal
    //   field_member (기본)        → empNo@field.mepark.internal
    // ────────────────────────────────────────────────────────
    if (action === "field_login") {
      const { emp_id, pin } = body;
      if (!emp_id || !pin) {
        return new Response(JSON.stringify({ error: "emp_id와 pin이 필요합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      // 1. employees 조회
      const { data: emp, error: empErr } = await adminClient
        .from("employees")
        .select("id, name, emp_no, site_code_1, work_code, phone, auth_id, system_role, account_email, account_status")
        .eq("emp_no", emp_id.trim().toUpperCase())
        .single();

      if (empErr || !emp) {
        return new Response(JSON.stringify({ error: "등록되지 않은 사번입니다." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. PIN 검증 — phone 뒤 4자리
      const phoneDigits = (emp.phone || "").replace(/\D/g, "");
      const pin4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : "";
      if (!pin4) {
        return new Response(JSON.stringify({ error: "전화번호가 등록되지 않았습니다. 관리자에게 문의하세요." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (pin !== pin4) {
        return new Response(JSON.stringify({ error: "PIN이 올바르지 않습니다." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3. 역할에 따라 이메일 형식 분기
      const role = emp.system_role || "field_member";
      const isERP = ["crew", "admin", "super_admin"].includes(role);

      // crew/admin: mepark.internal / field_member: field.mepark.internal
      const email = isERP
        ? `${emp.emp_no.toLowerCase()}@mepark.internal`
        : `${emp.emp_no.toLowerCase()}@field.mepark.internal`;
      const password = `mp${pin4}`;

      let authId = emp.auth_id;

      // 4. crew/admin 계정은 ERP에서 이미 생성됨 → auth_id로 탐색
      if (!authId) {
        // auth_id 없으면 이메일로 탐색
        const { data: userList } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const existing = userList?.users?.find((u: any) => u.email === email);
        if (existing) {
          authId = existing.id;
          // employees.auth_id 동기화
          await adminClient.from("employees").update({ auth_id: authId }).eq("id", emp.id);
        }
      }

      if (!authId && !isERP) {
        // field_member 신규 계정 생성
        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            emp_no: emp.emp_no,
            name: emp.name,
            role,
            site_code: emp.site_code_1,
          },
        });

        if (createErr && !createErr.message.includes("already been registered")) {
          return new Response(JSON.stringify({ error: "계정 생성 실패: " + createErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
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
        return new Response(JSON.stringify({
          error: isERP
            ? "ERP 계정이 없습니다. 관리자에게 계정 생성을 요청하세요."
            : "Auth 계정을 찾을 수 없습니다.",
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 5. 비밀번호 최신화 (전화번호 변경 대응) → 로그인
      await adminClient.auth.admin.updateUserById(authId, { password });

      const { data: signInData, error: signInErr } = await adminClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr || !signInData?.session) {
        return new Response(JSON.stringify({ error: "세션 생성 실패: " + (signInErr?.message || "unknown") }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        employee: {
          id: emp.id,
          name: emp.name,
          emp_no: emp.emp_no,
          emp_id: emp.emp_no,
          site_code: emp.site_code_1,
          work_type: emp.work_code,
          role,
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 아래부터 super_admin 인증 필요 ──────────────────────

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "인증이 필요합니다." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "인증 실패" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAnon
      .from("profiles").select("role").eq("id", caller.id).single();

    if (!callerProfile || callerProfile.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "슈퍼관리자만 실행 가능합니다." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ────────────────────────────────────────────────────────
    // ACTION: create_user
    // ────────────────────────────────────────────────────────
    if (action === "create_user") {
      const { email, password, name, role, site_code, employee_id, emp_no, work_code } = body;

      if (!email || !password || !name || !role) {
        return new Response(JSON.stringify({ error: "필수 정보가 누락되었습니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: "계정 생성 실패: " + createError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = newUser?.user?.id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "계정 생성 실패: ID를 받지 못했습니다." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const profileData: any = { id: userId, email, name, role, created_at: new Date().toISOString() };
      if (site_code) profileData.site_code = site_code;
      if (employee_id) profileData.employee_id = employee_id;
      if (emp_no) profileData.emp_no = emp_no;
      if (work_code) profileData.work_code = work_code;

      const { error: profErr } = await supabaseAdmin.from("profiles").upsert(profileData, { onConflict: "id" });
      if (profErr) {
        return new Response(JSON.stringify({ error: "프로필 저장 실패: " + profErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, userId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ────────────────────────────────────────────────────────
    // ACTION: ban_user
    // ────────────────────────────────────────────────────────
    if (action === "ban_user") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId가 필요합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
      if (banError) {
        return new Response(JSON.stringify({ error: "계정 차단 실패: " + banError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ────────────────────────────────────────────────────────
    // ACTION: reset_password
    // ────────────────────────────────────────────────────────
    if (action === "reset_password") {
      const { userId, newPassword } = body;
      if (!userId || !newPassword) {
        return new Response(JSON.stringify({ error: "userId와 newPassword가 필요합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
      if (resetError) {
        return new Response(JSON.stringify({ error: "비밀번호 리셋 실패: " + resetError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ────────────────────────────────────────────────────────
    // ACTION: unban_user
    // ────────────────────────────────────────────────────────
    if (action === "unban_user") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId가 필요합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (unbanError) {
        return new Response(JSON.stringify({ error: "재활성화 실패: " + unbanError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ────────────────────────────────────────────────────────
    // ACTION: bulk_create_field
    // ────────────────────────────────────────────────────────
    if (action === "bulk_create_field") {
      const { accounts } = body;
      if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
        return new Response(JSON.stringify({ error: "생성할 계정 목록이 필요합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (accounts.length > 50) {
        return new Response(JSON.stringify({ error: "한 번에 최대 50개까지 생성 가능합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];
      for (const acc of accounts) {
        const email = `${acc.emp_no.toLowerCase()}@field.mepark.internal`;
        const phoneDigits = (acc.phone || "").replace(/\D/g, "");
        const pin4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : acc.pin || "0000";
        const password = `mp${pin4}`;

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
      return new Response(JSON.stringify({ success: true, results, successCount, totalCount: accounts.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `알 수 없는 action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "서버 오류" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
