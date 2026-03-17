// ============================================================
// 미팍ERP — admin-api Edge Function v3 (컬럼명 교정 + field_login 수정)
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
    // ACTION: field_login — 현장앱 사번+PIN 로그인 (인증 불필요)
    // 전화번호 로그인 흐름에서 Auth 계정 없는 field_member를 처리
    // ────────────────────────────────────────────────────────
    if (action === "field_login") {
      const { emp_id, pin } = body; // emp_id = emp_no 값
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

      // 1. employees 조회 — 정확한 컬럼명 사용 (emp_no, auth_id, system_role, site_code_1, work_code)
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

      // 2. PIN 검증 — phone 뒤 4자리 (field_pin 컬럼 없음, 전화번호에서 파생)
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

      // 3. Auth 계정 확인/생성 — 이메일: empNo@field.mepark.internal / 비밀번호: mp{pin4}
      const email = `${emp.emp_no.toLowerCase()}@field.mepark.internal`;
      const password = `mp${pin4}`;
      let authId = emp.auth_id;

      if (!authId) {
        // 계정 신규 생성 시도
        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            emp_no: emp.emp_no,
            name: emp.name,
            role: emp.system_role || "field_member",
            site_code: emp.site_code_1,
          },
        });

        if (createErr && !createErr.message.includes("already been registered")) {
          return new Response(JSON.stringify({ error: "계정 생성 실패: " + createErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (createErr) {
          // 이미 존재하는 경우 listUsers로 탐색
          const { data: userList } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          const existing = userList?.users?.find((u: any) => u.email === email);
          authId = existing?.id ?? null;
        } else {
          authId = newUser?.user?.id ?? null;
        }

        if (authId) {
          // auth_id를 employees 테이블에 저장 (정확한 컬럼명: auth_id)
          await adminClient.from("employees").update({ auth_id: authId }).eq("id", emp.id);
        }
      }

      if (!authId) {
        return new Response(JSON.stringify({ error: "Auth 계정을 찾을 수 없습니다." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. 비밀번호 최신화 (전화번호 변경에 대응) → signInWithPassword
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
          role: emp.system_role || "field_member",
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
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
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

      const profileData: any = {
        id: userId, email, name, role,
        created_at: new Date().toISOString(),
      };
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

      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "876600h",
      });
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

      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
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

      const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
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
    // ACTION: bulk_create_field — 현장 직원 계정 일괄 생성
    // 이메일 형식: empNo@field.mepark.internal / 비밀번호: mp{pin4}
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
        // 이메일: empNo@field.mepark.internal (field_login과 동일 형식)
        const email = `${acc.emp_no.toLowerCase()}@field.mepark.internal`;
        // 비밀번호: mp + 전화번호 뒤 4자리
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
          if (userId) {
            // employees.auth_id 업데이트
            if (acc.employee_id) {
              await supabaseAdmin.from("employees")
                .update({ auth_id: userId })
                .eq("id", acc.employee_id);
            }
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
