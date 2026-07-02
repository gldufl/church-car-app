// Supabase Edge Function: reminder-check
// pg_cron이 1분마다 이 함수를 호출합니다.
// 승인된 예약 중 '오늘', '시작 5분 전'인 건을 찾아 운전자에게 문자를 보내고,
// 중복 발송을 막기 위해 smsReminderSent 플래그를 예약 데이터에 표시합니다.
//
// 필요한 Supabase 시크릿 (secrets):
//   ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER   - send-sms와 동일
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      - DB 읽기/쓰기용 (Supabase가 기본 제공)

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STORAGE_KEY = "choChung-carBooking-v1";
const ALIGO_URL = "https://apis.aligo.in/send/";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 서버는 UTC로 동작하므로, 한국시간(KST, UTC+9)으로 변환합니다.
function nowKST() {
  const utc = new Date();
  return new Date(utc.getTime() + 9 * 60 * 60 * 1000);
}

async function sendAligoSms(phone: string, message: string) {
  const apiKey = Deno.env.get("ALIGO_API_KEY");
  const userId = Deno.env.get("ALIGO_USER_ID");
  const sender = Deno.env.get("ALIGO_SENDER");
  if (!apiKey || !userId || !sender) throw new Error("SMS 시크릿 누락");

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const form = new URLSearchParams();
  form.set("key", apiKey);
  form.set("user_id", userId);
  form.set("sender", sender);
  form.set("receiver", cleanPhone);
  form.set("msg", message);
  form.set("msg_type", "SMS");

  const res = await fetch(ALIGO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return res.json();
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: row, error } = await supabase
      .from("app_storage")
      .select("value")
      .eq("key", STORAGE_KEY)
      .maybeSingle();

    if (error || !row) {
      return new Response(JSON.stringify({ skipped: true, reason: "데이터 없음" }), { status: 200 });
    }

    const appData = JSON.parse(row.value);
    const bookings = appData.bookings || [];
    const vehicles = appData.vehicles || [];

    const now = nowKST();
    const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let sentCount = 0;
    const updatedBookings = [];

    for (const b of bookings) {
      let shouldUpdate = false;
      const next = { ...b };

      if (
        b.status === "approved" &&
        !b.smsReminderSent &&
        b.date === nowStr &&
        b.phone
      ) {
        const [sh, sm] = String(b.start).split(":").map(Number);
        const startMin = sh * 60 + sm;
        const diff = startMin - nowMin;

        if (diff <= 5 && diff >= 0) {
          const v = vehicles.find((x: any) => x.id === b.vehicleId);
          const msg = `[초청교회 배차] ${v?.name || "차량"} 운행이 ${b.start}에 시작됩니다. 앱에서 운행전 정보를 입력해 주세요.`;
          try {
            await sendAligoSms(b.phone, msg);
            sentCount++;
          } catch (e) {
            console.error("SMS 발송 실패:", e);
          }
          next.smsReminderSent = true;
          shouldUpdate = true;
        }
      }

      updatedBookings.push(shouldUpdate ? next : b);
    }

    if (sentCount > 0) {
      const nextData = { ...appData, bookings: updatedBookings };
      await supabase
        .from("app_storage")
        .update({ value: JSON.stringify(nextData), updated_at: new Date().toISOString() })
        .eq("key", STORAGE_KEY);
    }

    return new Response(JSON.stringify({ checked: bookings.length, sent: sentCount }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
