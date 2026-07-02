// 신청/승인/반려 시점에 Supabase Edge Function(send-sms)을 호출해 문자를 보냅니다.
// 문자 발송이 실패해도 배차 신청/승인 자체는 계속 진행되어야 하므로,
// 이 함수는 에러를 던지지 않고 콘솔에만 남깁니다.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function sendSms(phone, message) {
  if (!phone || !message) return;
  if (!supabaseUrl || !supabaseKey) {
    console.warn("SMS 발송 건너뜀: Supabase 환경변수 없음");
    return;
  }
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({ phone, message }),
    });
  } catch (e) {
    console.error("SMS 발송 실패:", e);
  }
}
