// ============================================================
// 미팍ERP — ai-analyze Edge Function v1
// Anthropic API 프록시 (API 키 보안 유지)
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ERP_SYSTEM_CONTEXT = `미팍ERP 시스템 구조:
- React + Vite 단일파일 (App.jsx ~12,000줄), Supabase 백엔드
- 화면: 메인대시보드, HR대시보드, 직원현황(계정관리통합), 계약서, 계약이력, 조항변경, 전체요약, 사업장PL, 비용입력, 급여대장(3탭), 월주차관리, 비교분석, 배부설정, 데이터Import, 사업장관리, 현장일보, 마감보고현황, 근태현황, 전체캘린더, 인건비견적, 오류보고
- DB: profiles, employees, contracts, financial_transactions, monthly_summary, site_revenue, site_overhead, site_details, site_parking, monthly_parking, payroll_records, payslips, daily_reports, daily_report_staff, daily_report_payment, daily_report_extra, attendance_records, bug_reports
- 컴포넌트: NumInput, MeParkCalendar, BugReportFAB, LoginPage, EmployeeRoster, ContractWriter, MainDashboard, DailyReportPage, PayrollPage, SiteManagementPage, ClosingReportPage, AttendancePage, FullCalendarPage, SalaryCalculatorPage
- 인라인 스타일 (Tailwind 미사용), Noto Sans KR 폰트
- Edge Function: admin-api (계정관리), ai-analyze (본 함수)
- 현장앱(mepark-field): 별도 레포, 사번+PIN 로그인, 일보 제출/급여내역서 조회`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, title, description, page_name } = body;

    // ── ACTION: classify — 간이 분류 (제보 폼 입력 중) ──
    if (action === "classify") {
      if (!title || !description) {
        return new Response(
          JSON.stringify({ error: "title과 description이 필요합니다." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{
            role: "user",
            content: `다음 오류 보고를 분석해서 JSON으로만 응답하세요 (다른 텍스트 없이):
제목: ${title}
내용: ${description}

응답 형식:
{"category": "ui|feature|data|performance|suggestion", "priority": "low|medium|high|critical", "summary": "한줄 요약(30자 이내)"}`
          }]
        })
      });

      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(
          JSON.stringify({ error: "AI 응답 파싱 실패", raw: text }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── ACTION: analyze — 상세 분석 (미팍티켓 스타일) ──
    if (action === "analyze") {
      if (!title || !description) {
        return new Response(
          JSON.stringify({ error: "title과 description이 필요합니다." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          messages: [{
            role: "user",
            content: `${ERP_SYSTEM_CONTEXT}

다음 오류 보고를 분석해서 JSON으로만 응답하세요 (마크다운이나 다른 텍스트 없이 순수 JSON만):
발생화면: ${page_name || "알 수 없음"}
제목: ${title}
내용: ${description}

응답 형식:
{
  "category": "ui|feature|data|performance|suggestion",
  "priority": "low|medium|high|critical",
  "summary": "한줄 요약(30자 이내)",
  "cause": "추정 원인 (2~3문장, 시스템 구조 기반 분석)",
  "fix_direction": "수정 방향 (구체적 해결 방법 2~3문장)",
  "related_components": ["관련 컴포넌트나 화면 이름 배열 (최대 3개)"]
}`
          }]
        })
      });

      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(
          JSON.stringify({ error: "AI 응답 파싱 실패", raw: text }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: `알 수 없는 action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || "서버 오류" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
