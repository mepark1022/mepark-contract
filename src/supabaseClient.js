import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://rtmdvzavbatzjqaoltfd.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bWR2emF2YmF0empxYW9sdGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzAzNTUsImV4cCI6MjA4ODQ0NjM1NX0.2Gc47-TXKehGRurqLJHUhHKVNirhHc2D-0C6ByKMBoA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ★ supabaseAdmin 제거 — service_role 키를 클라이언트에 노출하지 않음
// 계정 생성/삭제/비밀번호 리셋은 Edge Function(admin-api)을 통해 처리

/**
 * Edge Function 호출 헬퍼
 * @param {string} action - "create_user" | "ban_user" | "reset_password" | "unban_user" | "bulk_create_field"
 * @param {object} payload - action별 필요 데이터
 * @returns {Promise<{data?: any, error?: string}>}
 */
export const callAdminApi = async (action, payload = {}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: "로그인이 필요합니다." };

    const res = await fetch(`${supabaseUrl}/functions/v1/admin-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      return { error: result.error || `HTTP ${res.status}` };
    }

    return { data: result };
  } catch (e) {
    return { error: e.message || "Edge Function 호출 실패" };
  }
};
