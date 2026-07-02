// Supabase Edge Function: send-sms
// 알리고(Aligo) SMS API를 호출해서 문자를 발송하는 공용 함수입니다.
// 클라이언트(App.jsx)에서 신청/승인/반려 시점에 이 함수를 호출합니다.
//
// 필요한 Supabase 시크릿 (secrets):
//   ALIGO_API_KEY   - 알리고에서 발급받은 API Key
//   ALIGO_USER_ID   - 알리고 로그인 아이디
//   ALIGO_SENDER    - 등록해 둔 발신번호 (하이픈 없이, 예: 01012345678)

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const ALIGO_URL = "https://apis.aligo.in/send/";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const { phone, message } = await req.json();

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "phone과 message가 필요합니다." }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const cleanPhone = String(phone).replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10) {
      return new Response(JSON.stringify({ error: "유효하지 않은 전화번호입니다." }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ALIGO_API_KEY");
    const userId = Deno.env.get("ALIGO_USER_ID");
    const sender = Deno.env.get("ALIGO_SENDER");

    if (!apiKey || !userId || !sender) {
      return new Response(JSON.stringify({ error: "SMS 시크릿(ALIGO_API_KEY/USER_ID/SENDER)이 설정되지 않았습니다." }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const form = new URLSearchParams();
    form.set("key", apiKey);
    form.set("user_id", userId);
    form.set("sender", sender);
    form.set("receiver", cleanPhone);
    form.set("msg", message);
    form.set("msg_type", "SMS"); // 90byte 초과 시 알리고가 자동으로 LMS로 전환

    const res = await fetch(ALIGO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const result = await res.json();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
