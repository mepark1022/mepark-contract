// ============================================================
// 미팍ERP — admin-api Edge Function
// Supabase Dashboard → Edge Functions → "Deploy a new function" → 코드 붙여넣기
// 함수 이름: admin-api
// ============================================================
// service_role 키는 서버(Edge Function)에서만 사용 — 클라이언트 노출 제거
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1) 요청자 인증 확인 (anon JWT 검증) ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "인증이 필요합니다." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // anon 클라이언트로 요청자 확인
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

    // ── 2) 요청자 역할 확인 (super_admin만 허용) ──
    const { data: callerProfile } = await supabaseAnon
      .from("profiles").select("role").eq("id", caller.id).single();

    if (!callerProfile || callerProfile.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "슈퍼관리자만 실행 가능합니다." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3) Admin 클라이언트 (service_role — 서버에서만) ──
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 4) 요청 처리 ──
    const body = await req.json();
    const { action } = body;

    // ────────────────────────────────────────────────────────
    // ACTION: create_user — 계정 생성 (관리자 or 현장요원)
    // ────────────────────────────────────────────────────────
    if (action === "create_user") {
      const { email, password, name, role, site_code, employee_id, emp_no } = body;

      if (!email || !password || !name || !role) {
        return new Response(JSON.stringify({ error: "필수 정보가 누락되었습니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auth 유저 생성
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

      // 프로필 생성
      const profileData = {
        id: userId,
        email,
        name,
        role,
        created_at: new Date().toISOString(),
      };

      // 현장 계정인 경우 추가 필드
      if (site_code) profileData.site_code = site_code;
      if (employee_id) profileData.employee_id = employee_id;
      if (emp_no) profileData.emp_no = emp_no;

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
    // ACTION: ban_user — 계정 비활성화 (퇴사/제거)
    // ────────────────────────────────────────────────────────
    if (action === "ban_user") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId가 필요합니다." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auth ban (로그인 차단)
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "876600h", // ~100년 = 사실상 영구 차단
      });

      if (banError) {
        return new Response(JSON.stringify({ error: "계정 차단 실패: " + banError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 프로필 삭제
      await supabaseAdmin.from("profiles").delete().eq("id", userId);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ────────────────────────────────────────────────────────
    // ACTION: reset_password — PIN/비밀번호 리셋
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
    // ACTION: unban_user — 계정 재활성화
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
    // ACTION: bulk_create_field — 현장 계정 일괄 생성
    // ────────────────────────────────────────────────────────
    if (action === "bulk_create_field") {
      const { accounts } = body; // [{ emp_no, name, role, site_code, employee_id, pin }]
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
        const email = `${acc.emp_no.toLowerCase()}@field.mepark.app`;
        const password = acc.pin || "0000";

        try {
          // Auth 유저 생성
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name: acc.name },
          });

          if (createError) {
            results.push({ emp_no: acc.emp_no, success: false, error: createError.message });
            continue;
          }

          const userId = newUser?.user?.id;

          // 프로필 생성
          await supabaseAdmin.from("profiles").upsert({
            id: userId,
            email,
            name: acc.name,
            role: acc.role || "field_member",
            site_code: acc.site_code,
            employee_id: acc.employee_id,
            emp_no: acc.emp_no,
            created_at: new Date().toISOString(),
          }, { onConflict: "id" });

          results.push({ emp_no: acc.emp_no, success: true, userId });
        } catch (e) {
          results.push({ emp_no: acc.emp_no, success: false, error: e.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return new Response(JSON.stringify({ success: true, results, successCount, totalCount: accounts.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 알 수 없는 action
    return new Response(JSON.stringify({ error: `알 수 없는 action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "서버 오류" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
