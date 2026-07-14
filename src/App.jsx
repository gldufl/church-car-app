import React, { useState, useEffect, useMemo, useRef } from "react";
import { storage } from "./storage";
import { sendSms } from "./sms";

/* ─────────────────────────────────────────────
   초청교회 배차 신청
   디자인 토큰
   bg #F4F6F2 / surface #FFFFFF / ink #23302B
   primary(pine) #1F5C46 / accent(amber) #C88A2D
   danger #B5443C / muted #7C877F
────────────────────────────────────────────── */

const STORAGE_KEY = "choChung-carBooking-v1";
const REMEMBER_KEY = "choChung-rememberedUserId";

// 차량 구분용 색상 팔레트 (10가지 지정색)
const VEHICLE_COLORS = [
  { name: "검정", hex: "#1A1A1A" },
  { name: "하양", hex: "#FFFFFF" },
  { name: "빨강", hex: "#E5231B" },
  { name: "주황", hex: "#F97316" },
  { name: "초록", hex: "#16A34A" },
  { name: "하늘", hex: "#0EA5E9" },
  { name: "보라", hex: "#7C3AED" },
  { name: "노랑", hex: "#FACC15" },
  { name: "파랑", hex: "#2563EB" },
  { name: "자주", hex: "#C2185B" },
];
const colorForIndex = (i) => VEHICLE_COLORS[i % VEHICLE_COLORS.length].hex;
// 차량 색상을 옅은 배경색(카드 tint)으로 변환. 하양은 옅은 회색으로 대체(흰 배경에서 안 보이는 문제 방지)
const tintBg = (hex, alpha = 0.12) => {
  if (!hex) return "transparent";
  if (hex.toUpperCase() === "#FFFFFF") return "#F1F3F5";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const SEED = {
  users: [{ id: "admin", name: "관리자", pw: "0000", isAdmin: true, phone: "" }],
  vehicles: [
    { id: "v1", name: "1호차 스타렉스", plate: "12가 3456", capacity: 12, color: colorForIndex(0) },
    { id: "v2", name: "2호차 카니발", plate: "34나 5678", capacity: 9, color: colorForIndex(1) },
    { id: "v3", name: "3호차 카운티", plate: "56다 7890", capacity: 25, color: colorForIndex(2) },
  ],
  bookings: [],
  settings: { managerName: "차량국장", managerPhone: "010-8641-2350", smsRecipients: [] },
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtDate = (s) => {
  const [y, m, d] = s.split("-");
  return `${m}/${d}`;
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
// 같은 날 시간대 overlap (문자열 "HH:MM" 비교)
const overlap = (aS, aE, bS, bE) => aS < bE && aE > bS;
// 날짜+시간 문자열을 비교 가능한 값으로
const toDT = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00`).getTime();
// 여러 날에 걸친 예약(시작일~종료일, 시작시간~종료시간) 두 건이 겹치는지 확인
const rangeOverlap = (aDate, aStart, aEndDate, aEnd, bDate, bStart, bEndDate, bEnd) =>
  toDT(aDate, aStart) < toDT(aEndDate || aDate, aEnd) &&
  toDT(bDate, bStart) < toDT(bEndDate || bDate, bEnd) &&
  toDT(aDate, aStart) < toDT(bEndDate || bDate, bEnd) &&
  toDT(bDate, bStart) < toDT(aEndDate || aDate, aEnd);
// 특정 날짜가 예약의 시작일~종료일 구간에 포함되는지
const dateInBookingRange = (dateStr, b) => dateStr >= b.date && dateStr <= (b.endDate || b.date);
// 매주 반복 날짜 목록 생성 (startDate부터 recurEnd까지 7일 간격)
const buildWeeklyDates = (startDate, recurEnd) => {
  const out = [];
  let cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${recurEnd}T00:00:00`);
  while (cur <= end) {
    const y = cur.getFullYear(), m = pad(cur.getMonth() + 1), d = pad(cur.getDate());
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 7);
  }
  return out;
};

/* ───────── 공용 UI ───────── */
const Btn = ({ children, onClick, kind = "primary", full, small, disabled }) => {
  const base = {
    primary: "bg-c-1F5C46 text-white active:bg-c-17482F",
    ghost: "bg-white text-c-1F5C46 border border-c-1F5C46",
    soft: "bg-c-E9EFE9 text-c-23302B",
    danger: "bg-white text-c-B5443C border border-c-B5443C",
    amber: "bg-c-C88A2D text-white",
  }[kind];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${full ? "w-full" : ""} ${
        small ? "px-3 py-1.5 text-sm" : "px-4 py-3 text-base"
      } rounded-xl font-semibold disabled:opacity-40 transition`}
    >
      {children}
    </button>
  );
};

const Field = ({ label, children }) => (
  <label className="block mb-3">
    <span className="block text-sm font-semibold text-c-54615A mb-1">{label}</span>
    {children}
  </label>
);

const inputCls =
  "w-full px-3 py-3 rounded-xl border border-c-D6DED6 bg-white text-c-23302B text-base focus:outline-none focus:border-c-1F5C46";

const Modal = ({ children, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={onClose}>
    <div
      className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

const Toast = ({ msg }) =>
  msg ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-c-23302B text-white px-5 py-3 rounded-full text-sm shadow-lg">
      {msg}
    </div>
  ) : null;

/* ───────── 월 캘린더 ───────── */
function MonthCalendar({ bookings, vehicles, onSelectDate, selected }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const startDow = first.getDay();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const colorsByDate = useMemo(() => {
    const map = {}; // dateStr -> Set of vehicleId
    bookings.filter((b) => b.status !== "rejected").forEach((b) => {
      let cur = new Date(`${b.date}T00:00:00`);
      const end = new Date(`${b.endDate || b.date}T00:00:00`);
      let guard = 0;
      while (cur <= end && guard < 60) {
        const key = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
        if (!map[key]) map[key] = new Set();
        map[key].add(b.vehicleId);
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    });
    const out = {};
    Object.keys(map).forEach((k) => {
      out[k] = [...map[k]]
        .map((vid) => vehicles.find((v) => v.id === vid)?.color)
        .filter(Boolean);
    });
    return out;
  }, [bookings, vehicles]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <button className="px-3 py-1 text-c-1F5C46 font-bold" onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}>
          ◀
        </button>
        <div className="font-bold text-c-23302B">
          {cursor.y}년 {cursor.m + 1}월
        </div>
        <button className="px-3 py-1 text-c-1F5C46 font-bold" onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}>
          ▶
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-c-7C877F mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={i === 0 ? "text-c-B5443C" : i === 6 ? "text-c-2A5C8A" : ""}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
          const dots = colorsByDate[dateStr] || [];
          const isSel = selected === dateStr;
          const isToday = dateStr === todayStr();
          return (
            <button
              key={i}
              onClick={() => onSelectDate(dateStr)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative
                ${isSel ? "bg-c-1F5C46 text-white" : isToday ? "bg-c-E9EFE9" : "bg-transparent"}
              `}
            >
              <span className={`${i % 7 === 0 && !isSel ? "text-c-B5443C" : ""}`}>{d}</span>
              {dots.length > 0 && (
                <span className="flex items-center gap-0.5 mt-0.5">
                  {dots.slice(0, 4).map((c, idx) => (
                    <span
                      key={idx}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: c, opacity: isSel ? 0.9 : 1 }}
                    />
                  ))}
                  {dots.length > 4 && (
                    <span className={`text-[9px] font-bold ${isSel ? "text-c-F0D9A8" : "text-c-7C877F"}`}>
                      +{dots.length - 4}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── 하루 타임라인(시간별 현황) ───────── */
function DayTimeline({ date, bookings, vehicles, showContact, onEdit, onDelete }) {
  const dayBookings = bookings.filter((b) => dateInBookingRange(date, b) && b.status !== "rejected");
  if (dayBookings.length === 0)
    return <div className="text-sm text-c-7C877F py-4 text-center">이 날짜에 신청된 배차가 없습니다.</div>;

  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  // 여러 날 예약일 경우, 보고 있는 날짜가 첫날/중간날/마지막날인지에 따라 표시 시간 계산
  const displayRange = (b) => {
    const isFirst = date === b.date;
    const isLast = date === (b.endDate || b.date);
    const dispStart = isFirst ? b.start : "00:00";
    const dispEnd = isLast ? b.end : "24:00";
    return { dispStart, dispEnd, isFirst, isLast, multiDay: (b.endDate || b.date) !== b.date };
  };

  return (
    <div className="space-y-3">
      {vehicles.map((v) => {
        const vb = dayBookings.filter((b) => b.vehicleId === v.id).sort((a, b) => a.start.localeCompare(b.start));
        if (vb.length === 0) return null;
        return (
          <div key={v.id} className="bg-white rounded-xl p-3 shadow-sm">
            <div className="font-bold text-sm text-c-23302B mb-1.5 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: v.color || "#1F5C46" }} />
              {v.name}
            </div>
            {/* 24시간 타임라인 바 */}
            <div className="relative h-4 rounded-full bg-c-EDF1EC overflow-hidden mb-2">
              {vb.map((b) => {
                const { dispStart, dispEnd } = displayRange(b);
                const l = (toMin(dispStart) / 1440) * 100;
                const w = ((toMin(dispEnd === "24:00" ? "23:59" : dispEnd) + (dispEnd === "24:00" ? 1 : 0) - toMin(dispStart)) / 1440) * 100;
                return (
                  <div
                    key={b.id}
                    className="absolute top-0 h-full"
                    style={{ left: `${l}%`, width: `${Math.max(w, 2)}%`, backgroundColor: v.color || "#1F5C46" }}
                  />
                );
              })}
            </div>
            {vb.map((b) => {
              const { dispStart, dispEnd, multiDay } = displayRange(b);
              return (
                <div key={b.id} className={`py-1.5 border-t border-c-F0F3EF ${b.status === "pending" ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold text-c-1F5C46">
                        {dispStart}–{dispEnd === "24:00" ? "24:00(익일)" : dispEnd}
                      </span>{" "}
                      <span className="text-c-54615A">
                        {b.userName} · {b.purpose}
                      </span>
                      {multiDay && (
                        <span className="ml-1 text-[10px] font-bold text-c-C88A2D">
                          [{fmtDate(b.date)}~{fmtDate(b.endDate)}]
                        </span>
                      )}
                      {b.seriesId && (
                        <span className="ml-1 text-[10px] font-bold text-c-2A5C8A">[매주반복]</span>
                      )}
                      {b.status === "pending" && (
                        <span className="ml-1 text-[10px] font-bold text-c-6B5A2E">[승인대기]</span>
                      )}
                    </div>
                  </div>
                  {(showContact || onEdit || onDelete) && (
                    <div className="flex gap-1.5 mt-1.5">
                      {showContact && b.phone && (
                        <>
                          <a href={`tel:${b.phone}`} className="px-2 py-1 rounded-lg bg-c-1F5C46 text-white text-xs font-bold">
                            전화
                          </a>
                          <a href={`sms:${b.phone}`} className="px-2 py-1 rounded-lg bg-c-C88A2D text-white text-xs font-bold">
                            문자
                          </a>
                        </>
                      )}
                      {onEdit && (
                        <button onClick={() => onEdit(b)} className="px-2 py-1 rounded-lg bg-c-C88A2D text-white text-xs font-bold">
                          수정
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(b)} className="px-2 py-1 rounded-lg border border-c-B5443C text-c-B5443C text-xs font-bold">
                          삭제
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ───────── 메인 앱 ───────── */
export default function App() {
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("login"); // login | signup | main | request | myList | admin
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null); // {type, payload}
  const [selDate, setSelDate] = useState(todayStr());
  const [adminTab, setAdminTab] = useState("approval"); // approval | calendar | status | log | vehicles | users | settings
  const [editBooking, setEditBooking] = useState(null);
  const [reminderBanner, setReminderBanner] = useState(null); // 5분 전 알림 대상 예약
  const notifiedRef = useRef(new Set()); // 중복 알림 방지

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  /* 데이터 로드 */
  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get(STORAGE_KEY);
        setData(JSON.parse(r.value));
      } catch {
        setData(SEED);
        try {
          await storage.set(STORAGE_KEY, JSON.stringify(SEED));
        } catch (e) {
          console.error(e);
        }
      }
    })();
  }, []);

  /* 로그인 기억하기: 데이터가 처음 로드된 시점에 저장된 아이디가 있으면 자동 로그인 */
  const autoLoginDoneRef = useRef(false);
  useEffect(() => {
    if (!data || autoLoginDoneRef.current) return;
    autoLoginDoneRef.current = true;
    try {
      const savedId = localStorage.getItem(REMEMBER_KEY);
      if (savedId) {
        const u = data.users.find((x) => x.id === savedId);
        if (u) {
          setUser(u);
          setView(u.isAdmin ? "admin" : "main");
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      }
    } catch {}
  }, [data]);

  /* 운행 5분 전 알림: 로그인한 운전자 본인의 오늘 예약을 30초마다 확인합니다.
     이 방식은 앱(브라우저 탭)이 열려있을 때만 동작하는 한계가 있습니다. */
  useEffect(() => {
    if (!user || !data) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    const check = () => {
      const now = new Date();
      const nowStr = todayStr();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      (data.bookings || []).forEach((b) => {
        if (b.userId !== user.id) return;
        if (b.status !== "approved") return; // 승인된 예약만 알림 대상
        if (b.pre) return; // 이미 운행전정보 입력함
        if (b.date !== nowStr) return; // 오늘 시작하는 예약만 대상
        const [sh, sm] = b.start.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const diff = startMin - nowMin;
        if (diff <= 5 && diff >= -1 && !notifiedRef.current.has(b.id)) {
          notifiedRef.current.add(b.id);
          setReminderBanner(b);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const v = data.vehicles.find((x) => x.id === b.vehicleId);
            try {
              new Notification("🚐 배차 알림", {
                body: `${v?.name || "차량"} 운행이 곧 시작됩니다 (${b.start}). 운행전 정보를 입력해 주세요.`,
              });
            } catch {}
          }
        }
      });
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [user, data]);

  /* 새 배차 신청 알림: 관리자가 앱을 열어두고 있는 동안, 새로 들어온 승인대기 신청을 30초마다 확인합니다.
     운전자 알림과 마찬가지로 앱(브라우저 탭)이 열려있을 때만 동작합니다. */
  const adminNotifiedRef = useRef(new Set());
  useEffect(() => {
    if (!user?.isAdmin || !data) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    // 처음 관리자 모드에 들어왔을 때 이미 쌓여있던 대기 건은 알림을 새로 띄우지 않도록 미리 표시
    if (adminNotifiedRef.current.size === 0) {
      (data.bookings || []).forEach((b) => {
        if (b.status === "pending") adminNotifiedRef.current.add(b.id);
      });
    }
    const check = () => {
      (data.bookings || []).forEach((b) => {
        if (b.status !== "pending") return;
        if (adminNotifiedRef.current.has(b.id)) return;
        adminNotifiedRef.current.add(b.id);
        const v = data.vehicles.find((x) => x.id === b.vehicleId);
        showToast(`🔔 새 배차 신청: ${v?.name || "차량"} · ${b.userName}`);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("🔔 새 배차 신청", {
              body: `${v?.name || "차량"} · ${b.date} ${b.start} · 신청자 ${b.userName}`,
            });
          } catch {}
        }
      });
    };
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [user, data]);

  const persist = async (next) => {
    setData(next);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      showToast("저장 중 오류가 발생했습니다.");
    }
  };

  const approveBooking = async (b) => {
    // 최신 데이터로 다시 확인 (그 사이 다른 신청이 먼저 승인됐을 수 있음)
    let latest = data;
    try {
      const r = await storage.get(STORAGE_KEY);
      latest = JSON.parse(r.value);
    } catch {}
    const clash = latest.bookings.some(
      (x) =>
        x.id !== b.id &&
        x.vehicleId === b.vehicleId &&
        x.status === "approved" &&
        rangeOverlap(b.date, b.start, b.endDate, b.end, x.date, x.start, x.endDate, x.end)
    );
    if (clash) return showToast("이미 같은 시간에 승인된 배차가 있습니다. 먼저 그 신청을 확인해 주세요.");

    const nextBookings = latest.bookings.map((x) => (x.id === b.id ? { ...x, status: "approved", adminNote: null } : x));
    await persist({ ...latest, bookings: nextBookings });
    showToast("승인되었습니다.");

    if (b.phone) {
      sendSms(
        b.phone,
        "[배차 신청이 수락되었습니다] 안전하게 운행하시기 바라며 운행 전/후 차량 정보를 꼭 기록해 주세요."
      );
    }
  };

  const rejectBooking = async (b, note) => {
    let latest = data;
    try {
      const r = await storage.get(STORAGE_KEY);
      latest = JSON.parse(r.value);
    } catch {}
    const nextBookings = latest.bookings.map((x) => (x.id === b.id ? { ...x, status: "rejected", adminNote: note || null } : x));
    await persist({ ...latest, bookings: nextBookings });
    showToast("반려되었습니다.");
  };

  const changeVehicleColor = async (vId, color) => {
    const nextVehicles = vehicles.map((v) => (v.id === vId ? { ...v, color } : v));
    await persist({ ...data, vehicles: nextVehicles });
    showToast("색상이 변경되었습니다.");
  };

  const updateVehicleInfo = async (vId, info) => {
    const nextVehicles = vehicles.map((v) => (v.id === vId ? { ...v, ...info } : v));
    await persist({ ...data, vehicles: nextVehicles });
    showToast("차량 정보가 수정되었습니다.");
  };

  if (!data)
    return (
      <div className="min-h-screen flex items-center justify-center bg-c-F4F6F2 text-c-7C877F">
        불러오는 중…
      </div>
    );

  const { users, vehicles, bookings, settings } = data;

  /* ── 로그인 ── */
  const LoginPage = () => {
    const [id, setId] = useState("");
    const [pw, setPw] = useState("");
    const [remember, setRemember] = useState(false);

    const login = () => {
      const u = users.find((x) => x.id === id.trim() && x.pw === pw);
      if (!u) return showToast("아이디 또는 비밀번호가 맞지 않습니다.");
      setUser(u);
      setView(u.isAdmin ? "admin" : "main");
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, u.id);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {}
    };

    return (
      <div className="min-h-screen bg-c-F4F6F2 flex flex-col items-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-4xl mb-2">⛪</div>
            <h1 className="text-2xl font-extrabold text-c-1F5C46 tracking-tight">초청교회 배차 신청</h1>
            <p className="text-sm text-c-7C877F mt-1">차량 운행을 신청하고 확인하세요</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <Field label="아이디 (핸드폰번호)">
              <input className={inputCls} value={id} onChange={(e) => setId(e.target.value)} placeholder="01012345678" />
            </Field>
            <Field label="비밀번호">
              <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
            </Field>
            <label className="flex items-center gap-2 mb-4 text-sm text-c-54615A">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 accent-c-1F5C46" />
              로그인 상태 기억하기
            </label>
            <Btn full onClick={login}>
              로그인
            </Btn>
            <div className="mt-3">
              <Btn full kind="ghost" onClick={() => setView("signup")}>
                회원가입
              </Btn>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── 회원가입 ── */
  const SignupPage = () => {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [pw, setPw] = useState("");

    const submit = async () => {
      const p = phone.replace(/[^0-9]/g, "");
      if (!name.trim() || p.length < 10 || pw.length < 4)
        return showToast("이름, 핸드폰번호, 비밀번호(4자 이상)를 확인해 주세요.");
      if (users.find((u) => u.id === p)) return showToast("이미 가입된 번호입니다.");
      const nu = { id: p, name: name.trim(), pw, isAdmin: false, phone: p };
      await persist({ ...data, users: [...users, nu] });
      showToast("가입 완료! 로그인해 주세요.");
      setView("login");
    };

    return (
      <div className="min-h-screen bg-c-F4F6F2 flex flex-col items-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-xl font-extrabold text-c-23302B mb-4">회원가입</h2>
          <Field label="이름">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
          </Field>
          <Field label="핸드폰번호 (아이디로 사용됩니다)">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" inputMode="numeric" />
          </Field>
          <Field label="비밀번호">
            <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Btn full onClick={submit}>
            가입하기
          </Btn>
          <div className="mt-2">
            <Btn full kind="soft" onClick={() => setView("login")}>
              돌아가기
            </Btn>
          </div>
        </div>
      </div>
    );
  };

  /* ── 상단 바 ── */
  const TopBar = ({ title }) => (
    <div className="sticky top-0 z-40 bg-c-1F5C46 text-white px-4 py-3 flex items-center justify-between shadow">
      <div className="font-extrabold">{title}</div>
      <div className="flex items-center gap-3 text-sm">
        <span className="opacity-80">{user?.name}님</span>
        {user?.isAdmin && (
          <button
            className="underline opacity-90"
            onClick={() => setView(view === "admin" ? "main" : "admin")}
          >
            {view === "admin" ? "일반 모드로" : "관리자 모드로"}
          </button>
        )}
        <button
          className="underline opacity-90"
          onClick={() => {
            setUser(null);
            setView("login");
            try {
              localStorage.removeItem(REMEMBER_KEY);
            } catch {}
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  );

  /* ── 메인 페이지 ── */
  const MainPage = () => {
    const todays = bookings
      .filter((b) => dateInBookingRange(todayStr(), b) && b.status === "approved")
      .sort((a, b) => a.start.localeCompare(b.start));

    return (
      <div className="min-h-screen bg-c-F4F6F2 pb-10">
        <TopBar title="초청교회 배차 신청" />
        <div className="p-4 max-w-md mx-auto space-y-4">
          <div className="flex gap-3">
            <Btn full onClick={() => { setEditBooking(null); setView("request"); }}>
              🚐 운행신청
            </Btn>
            <Btn full kind="ghost" onClick={() => setView("myList")}>
              📋 신청현황
            </Btn>
          </div>

          <MonthCalendar bookings={bookings} vehicles={vehicles} selected={selDate} onSelectDate={setSelDate} />

          <div>
            <h3 className="font-bold text-c-23302B mb-2 px-1">
              {fmtDate(selDate)} 시간대별 배차
            </h3>
            <DayTimeline date={selDate} bookings={bookings} vehicles={vehicles} showContact={false} />
          </div>

          <div>
            <h3 className="font-bold text-c-23302B mb-2 px-1">오늘 배차 현황</h3>
            {todays.length === 0 ? (
              <div className="bg-white rounded-xl p-4 text-sm text-c-7C877F text-center">
                오늘 신청된 차량이 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {todays.map((b) => {
                  const v = vehicles.find((x) => x.id === b.vehicleId);
                  return (
                    <div
                      key={b.id}
                      className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center border-l-4"
                      style={{ borderLeftColor: v?.color || "#1F5C46" }}
                    >
                      <div>
                        <div className="font-bold text-sm text-c-1F5C46 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: v?.color || "#1F5C46" }} />
                          {v?.name || "차량"}
                        </div>
                        <div className="text-sm text-c-54615A">
                          {b.start}–{b.end} · 운전 {b.userName}
                        </div>
                      </div>
                      <div className="text-xs text-c-7C877F">{b.destination}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ── 운행신청 (신규/수정 겸용) ── */
  const RequestPage = () => {
    const e = editBooking;
    const [startDate, setStartDate] = useState(e?.date || todayStr());
    const [endDate, setEndDate] = useState(e?.endDate || e?.date || todayStr());
    const [start, setStart] = useState(e?.start || "09:00");
    const [end, setEnd] = useState(e?.end || "12:00");
    const [vehicleId, setVehicleId] = useState(e?.vehicleId || "");
    const [purpose, setPurpose] = useState(e?.purpose || "");
    const [destination, setDestination] = useState(e?.destination || "");
    const [passengers, setPassengers] = useState(e?.passengers || "");
    const [recurring, setRecurring] = useState(false); // 매주 반복 (신규 신청에서만 사용)
    const [recurEnd, setRecurEnd] = useState(todayStr());

    const dateOk = endDate >= startDate;
    const timeOk = start < end;

    // 매주 반복을 켜면 기간(며칠 사용) 개념과 섞이지 않도록 종료일을 시작일로 고정
    const onToggleRecurring = (checked) => {
      setRecurring(checked);
      if (checked) {
        setEndDate(startDate);
        setRecurEnd(startDate);
      }
    };
    const onChangeStartDate = (v) => {
      setStartDate(v);
      // 시작일을 바꾸면 종료일도 기본적으로 같은 날짜로 맞춰줍니다.
      // (종료일은 이후 사용자가 직접 다시 조정할 수 있습니다)
      setEndDate(v);
    };

    const availability = vehicles.map((v) => {
      const conflict = bookings.some(
        (b) =>
          b.vehicleId === v.id &&
          b.id !== e?.id &&
          b.status === "approved" &&
          rangeOverlap(startDate, start, endDate, end, b.date, b.start, b.endDate, b.end)
      );
      return { ...v, conflict };
    });

    const save = async () => {
      if (!dateOk) return showToast("운행종료일이 운행시작일보다 빠를 수 없습니다.");
      if (!timeOk) return showToast("종료 시간이 시작 시간보다 늦어야 합니다.");
      if (!vehicleId) return showToast("차량을 선택해 주세요.");
      if (!purpose.trim() || !destination.trim() || !passengers)
        return showToast("사용 목적, 목적지, 탑승인원을 입력해 주세요.");
      if (recurring && recurEnd < startDate) return showToast("반복 종료일이 시작일보다 빠를 수 없습니다.");

      // 이번 신청으로 만들어질 예약(들) 목록: 매주 반복이면 여러 건, 아니면 한 건(기간 포함)
      const occurrences = recurring
        ? buildWeeklyDates(startDate, recurEnd).map((d) => ({ date: d, endDate: d }))
        : [{ date: startDate, endDate }];

      if (occurrences.length === 0) return showToast("반복 종료일을 확인해 주세요.");
      if (occurrences.length > 26) return showToast("반복 기간이 너무 깁니다. 26주 이내로 설정해 주세요.");

      // 저장 직전 최신 데이터로 중복 재확인 (동시 신청 대비)
      let latest = data;
      try {
        const r = await storage.get(STORAGE_KEY);
        latest = JSON.parse(r.value);
      } catch {}

      const conflictDate = occurrences.find((occ) =>
        latest.bookings.some(
          (b) =>
            b.vehicleId === vehicleId &&
            b.id !== e?.id &&
            b.status === "approved" &&
            rangeOverlap(occ.date, start, occ.endDate, end, b.date, b.start, b.endDate, b.end)
        )
      );
      if (conflictDate)
        return showToast(`${fmtDate(conflictDate.date)}에 이미 승인된 배차가 있습니다. 날짜나 차량을 확인해 주세요.`);

      // 관리자가 만들거나 수정하면 바로 승인 처리됩니다.
      // 운전자가 신규 신청하면 승인 대기, 운전자가 기존 예약을 수정하면 내용이 바뀌었으니 다시 승인 대기로 돌립니다.
      const status = user.isAdmin ? "approved" : "pending";
      const seriesId = recurring && occurrences.length > 1 ? uid() : null;
      const baseRec = {
        vehicleId,
        start, end,
        purpose: purpose.trim(),
        destination: destination.trim(),
        passengers: Number(passengers),
        // 수정하는 경우 원래 신청자(운전자) 정보를 그대로 유지합니다 (관리자가 대신 수정해도 신청자는 바뀌지 않음)
        userId: e ? e.userId : user.id,
        userName: e ? e.userName : user.name,
        phone: e ? e.phone : (user.isAdmin ? "" : user.id),
        pre: null, post: null,
        createdAt: Date.now(),
        seriesId,
        status,
        adminNote: null,
      };

      const newRecords = occurrences.map((occ) => ({
        ...baseRec,
        id: e?.id || uid(),
        date: occ.date,
        endDate: occ.endDate,
        pre: e?.pre || null,
        post: e?.post || null,
        createdAt: e?.createdAt || Date.now(),
      }));

      const nextBookings = e
        ? latest.bookings.map((b) => (b.id === e.id ? newRecords[0] : b))
        : [...latest.bookings, ...newRecords];
      await persist({ ...latest, bookings: nextBookings });
      setModal({ type: "saved", payload: { count: newRecords.length } });

      // 운전자가 새로 신청(대기중)하면, 문자 수신을 선택한 관리자들에게 알립니다.
      if (!e && !user.isAdmin) {
        const recipientIds = latest.settings.smsRecipients || [];
        const recipients = latest.users.filter((u) => recipientIds.includes(u.id) && u.phone);
        recipients.forEach((r) => {
          sendSms(r.phone, "[배차 신청이 들어왔습니다] 관리자 모드에서 승인/반려해 주세요.");
        });
      }
    };

    return (
      <div className="min-h-screen bg-c-F4F6F2 pb-10">
        <TopBar title={e ? "운행신청 수정" : "운행신청"} />
        <div className="p-4 max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="운행시작일">
                  <input type="date" className={inputCls} value={startDate} onChange={(ev) => onChangeStartDate(ev.target.value)} />
                </Field>
              </div>
              <div className="flex-1">
                <Field label="운행종료일">
                  <input
                    type="date"
                    className={inputCls}
                    value={endDate}
                    min={startDate}
                    disabled={recurring}
                    onChange={(ev) => setEndDate(ev.target.value)}
                  />
                </Field>
              </div>
            </div>
            {!dateOk && <div className="text-xs text-c-B5443C -mt-1 mb-2">운행종료일이 운행시작일보다 빠를 수 없습니다.</div>}

            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="시작 시간">
                  <input type="time" className={inputCls} value={start} onChange={(ev) => setStart(ev.target.value)} />
                </Field>
              </div>
              <div className="flex-1">
                <Field label="종료 시간">
                  <input type="time" className={inputCls} value={end} onChange={(ev) => setEnd(ev.target.value)} />
                </Field>
              </div>
            </div>
            {!timeOk && <div className="text-xs text-c-B5443C -mt-1">종료 시간이 시작 시간보다 늦어야 합니다.</div>}

            {!e && (
              <div className="mt-3 pt-3 border-t border-c-F0F3EF">
                <label className="flex items-center gap-2 text-sm text-c-23302B font-semibold">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(ev) => onToggleRecurring(ev.target.checked)}
                    className="w-4 h-4 accent-c-1F5C46"
                  />
                  매주 반복 (같은 요일, 같은 시간으로 반복 등록)
                </label>
                {recurring && (
                  <div className="mt-2">
                    <Field label="반복 종료일 (마지막으로 사용하는 날짜)">
                      <input
                        type="date"
                        className={inputCls}
                        value={recurEnd}
                        min={startDate}
                        onChange={(ev) => setRecurEnd(ev.target.value)}
                      />
                    </Field>
                    <p className="text-xs text-c-7C877F -mt-2">
                      {startDate} 부터 매주 {DOW[new Date(`${startDate}T00:00:00`).getDay()]}요일마다 {start}~{end}로 등록됩니다.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 className="font-bold text-c-23302B mb-2 px-1">사용 가능 차량</h3>
          <div className="space-y-2 mb-3">
            {availability.map((v) => (
              <button
                key={v.id}
                disabled={v.conflict}
                onClick={() => setVehicleId(v.id)}
                className={`w-full text-left rounded-xl p-3 border transition
                  ${v.conflict
                    ? "bg-c-EFEFEA border-transparent text-c-A9B2AA"
                    : vehicleId === v.id
                    ? "bg-c-1F5C46 border-c-1F5C46 text-white"
                    : "bg-white border-c-D6DED6 text-c-23302B"}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: v.color || "#1F5C46" }} />
                      {v.name}
                    </div>
                    <div className={`text-xs ${vehicleId === v.id && !v.conflict ? "text-c-CFE3D6" : "text-c-7C877F"}`}>
                      {v.plate} · {v.capacity}인승
                    </div>
                  </div>
                  {v.conflict && <span className="text-xs font-bold text-c-B5443C">예약됨</span>}
                  {!v.conflict && vehicleId === v.id && <span className="text-lg">✓</span>}
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-c-7C877F -mt-2 mb-3">
            * 매주 반복 신청 시, 첫 주 기준으로 표시됩니다. 저장 시 전체 기간의 겹침 여부를 다시 확인합니다.
          </p>

          <div className="bg-c-FBF4E4 border border-c-EAD9AE rounded-xl p-3 text-sm text-c-6B5A2E mb-4">
            배차 조율이 필요하시면 {settings.managerName}에게 연락해 주세요.{" "}
            <a href={`tel:${settings.managerPhone}`} className="font-bold underline text-c-C88A2D">
              📞 {settings.managerPhone}
            </a>
          </div>

          {vehicleId && (
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <Field label="사용 목적">
                <input className={inputCls} value={purpose} onChange={(ev) => setPurpose(ev.target.value)} placeholder="예: 청년부 수련회" />
              </Field>
              <Field label="목적지">
                <input className={inputCls} value={destination} onChange={(ev) => setDestination(ev.target.value)} placeholder="예: 강촌 수양관" />
              </Field>
              <Field label="탑승인원">
                <input type="number" min="1" className={inputCls} value={passengers} onChange={(ev) => setPassengers(ev.target.value)} placeholder="8" />
              </Field>
            </div>
          )}

          <div className="flex gap-2">
            <Btn full kind="soft" onClick={() => setView(user.isAdmin ? "admin" : e ? "myList" : "main")}>
              취소
            </Btn>
            <Btn full onClick={save}>
              저장하기
            </Btn>
          </div>
        </div>
      </div>
    );
  };

  /* ── 신청현황(내 목록) ── */
  const MyListPage = () => {
    const mine = bookings
      .filter((b) => b.userId === user.id)
      .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));

    return (
      <div className="min-h-screen bg-c-F4F6F2 pb-10">
        <TopBar title="신청현황" />
        <div className="p-4 max-w-md mx-auto space-y-3">
          <Btn kind="soft" small onClick={() => setView("main")}>
            ← 메인으로
          </Btn>
          {mine.length === 0 && (
            <div className="bg-white rounded-xl p-6 text-center text-sm text-c-7C877F">
              신청 내역이 없습니다. 메인에서 운행신청을 해보세요.
            </div>
          )}
          {mine.map((b) => {
            const v = vehicles.find((x) => x.id === b.vehicleId);
            const statusBadge = {
              pending: { label: "⏳ 승인대기", cls: "bg-c-FBF4E4 text-c-6B5A2E" },
              approved: { label: "✅ 승인됨", cls: "bg-c-E9EFE9 text-c-1F5C46" },
              rejected: { label: "❌ 반려됨", cls: "bg-c-EFEFEA text-c-B5443C" },
            }[b.status || "approved"];
            return (
              <div key={b.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <div className="font-extrabold text-c-1F5C46">{v?.name || "차량"}</div>
                  <div className="text-sm text-c-54615A text-right">
                    {b.endDate && b.endDate !== b.date ? (
                      <>{fmtDate(b.date)}~{fmtDate(b.endDate)}</>
                    ) : (
                      b.date
                    )}{" "}
                    · {b.start}–{b.end}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusBadge.cls}`}>
                    {statusBadge.label}
                  </span>
                  {b.seriesId && (
                    <span className="text-[10px] font-bold text-c-2A5C8A">매주 반복 신청</span>
                  )}
                </div>
                {b.status === "rejected" && b.adminNote && (
                  <div className="text-xs text-c-B5443C mb-2">반려 사유: {b.adminNote}</div>
                )}
                <div className="text-sm text-c-54615A mb-3">
                  {b.purpose} → {b.destination} · {b.passengers}명
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn small kind={b.pre ? "soft" : "ghost"} onClick={() => setModal({ type: "pre", payload: b })}>
                    운행전정보{b.pre ? " ✓" : ""}
                  </Btn>
                  <Btn small kind={b.post ? "soft" : "ghost"} onClick={() => setModal({ type: "post", payload: b })}>
                    운행후정보{b.post ? " ✓" : ""}
                  </Btn>
                  <Btn small kind="amber" onClick={() => { setEditBooking(b); setView("request"); }}>
                    수정
                  </Btn>
                  <Btn small kind="danger" onClick={() => setModal({ type: "confirmDelete", payload: b })}>
                    삭제
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── 관리자 페이지 ── */
  const AdminPage = () => {
    // 탭 상태(adminTab)는 App 최상위에서 관리합니다 (재렌더링에도 유지되도록)
    const [vName, setVName] = useState("");
    const [vPlate, setVPlate] = useState("");
    const [vCap, setVCap] = useState("");

    // 관리자 계정 설정 (아이디/비밀번호 변경)
    const [curPw, setCurPw] = useState("");
    const [newId, setNewId] = useState(user.id);
    const [newPw, setNewPw] = useState("");
    const [newPw2, setNewPw2] = useState("");

    // 차량국장 연락처 설정
    const [mgrName, setMgrName] = useState(settings.managerName);
    const [mgrPhone, setMgrPhone] = useState(settings.managerPhone);

    const saveManagerContact = async () => {
      if (!mgrName.trim() || !mgrPhone.trim()) return showToast("이름과 연락처를 입력해 주세요.");
      await persist({ ...data, settings: { ...settings, managerName: mgrName.trim(), managerPhone: mgrPhone.trim() } });
      showToast("차량국장 연락처가 저장되었습니다.");
    };

    const addVehicle = async () => {
      if (!vName.trim()) return showToast("차량 이름을 입력해 주세요.");
      const nv = {
        id: uid(),
        name: vName.trim(),
        plate: vPlate.trim(),
        capacity: Number(vCap) || 0,
        color: colorForIndex(vehicles.length),
      };
      await persist({ ...data, vehicles: [...vehicles, nv] });
      setVName(""); setVPlate(""); setVCap("");
      showToast("차량이 추가되었습니다.");
    };

    const saveAdminAccount = async () => {
      const me = users.find((u) => u.id === user.id);
      if (!me || me.pw !== curPw) return showToast("현재 비밀번호가 일치하지 않습니다.");
      const cleanId = newId.trim();
      if (!cleanId) return showToast("새 아이디를 입력해 주세요.");
      if (cleanId !== user.id && users.some((u) => u.id === cleanId))
        return showToast("이미 사용 중인 아이디입니다.");
      if (newPw && newPw.length < 4) return showToast("새 비밀번호는 4자 이상으로 입력해 주세요.");
      if (newPw && newPw !== newPw2) return showToast("새 비밀번호가 서로 다릅니다.");

      const updated = { ...me, id: cleanId, pw: newPw ? newPw : me.pw };
      const nextUsers = users.map((u) => (u.id === user.id ? updated : u));
      // 아이디가 바뀌면 이 계정이 신청한 기존 배차 기록도 함께 갱신
      const nextBookings = bookings.map((b) =>
        b.userId === user.id ? { ...b, userId: cleanId, userName: updated.name } : b
      );
      await persist({ ...data, users: nextUsers, bookings: nextBookings });
      setUser(updated);
      setCurPw(""); setNewPw(""); setNewPw2("");
      showToast("관리자 계정 정보가 변경되었습니다.");
    };

    const toggleAdminRole = async (u) => {
      if (u.id === user.id) return; // 본인 권한은 계정 설정에서만 변경
      if (u.isAdmin) {
        const adminCount = users.filter((x) => x.isAdmin).length;
        if (adminCount <= 1) return showToast("마지막 관리자 권한은 해제할 수 없습니다.");
      }
      const nextUsers = users.map((x) => (x.id === u.id ? { ...x, isAdmin: !x.isAdmin } : x));
      await persist({ ...data, users: nextUsers });
      showToast(u.isAdmin ? `${u.name}님의 관리자 권한을 해제했습니다.` : `${u.name}님에게 관리자 권한을 부여했습니다.`);
    };

    return (
      <div className="min-h-screen bg-c-F4F6F2 pb-10">
        <TopBar title="관리자 모드" />
        <div className="p-4 max-w-md mx-auto">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {[
              ["approval", `승인 대기${bookings.filter((b) => b.status === "pending").length > 0 ? ` (${bookings.filter((b) => b.status === "pending").length})` : ""}`],
              ["calendar", "배차 현황"],
              ["status", "차량 상태"],
              ["log", "운행 기록"],
              ["vehicles", "차량 관리"],
              ["users", "운전자 관리"],
              ["settings", "계정 설정"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setAdminTab(k)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold ${
                  adminTab === k ? "bg-c-1F5C46 text-white" : "bg-white text-c-54615A"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {adminTab === "approval" && (
            <div className="space-y-3">
              {bookings.filter((b) => b.status === "pending").length === 0 && (
                <div className="bg-white rounded-xl p-6 text-center text-sm text-c-7C877F">
                  승인 대기중인 신청이 없습니다.
                </div>
              )}
              {bookings
                .filter((b) => b.status === "pending")
                .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
                .map((b) => {
                  const v = vehicles.find((x) => x.id === b.vehicleId);
                  return (
                    <div key={b.id} className="bg-white rounded-2xl p-4 shadow-sm border-l-4" style={{ borderLeftColor: v?.color || "#1F5C46" }}>
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-extrabold text-c-23302B flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: v?.color || "#1F5C46" }} />
                          {v?.name || "차량"}
                        </div>
                        <div className="text-sm text-c-54615A text-right">
                          {b.endDate && b.endDate !== b.date ? (
                            <>{fmtDate(b.date)}~{fmtDate(b.endDate)}</>
                          ) : (
                            b.date
                          )}{" "}
                          · {b.start}–{b.end}
                        </div>
                      </div>
                      {b.seriesId && <div className="text-[10px] font-bold text-c-2A5C8A mb-1">매주 반복 신청</div>}
                      <div className="text-sm text-c-54615A mb-1">
                        신청자: {b.userName} {b.phone && <a href={`tel:${b.phone}`} className="underline text-c-1F5C46 font-bold ml-1">전화</a>}
                      </div>
                      <div className="text-sm text-c-54615A mb-3">
                        {b.purpose} → {b.destination} · {b.passengers}명
                      </div>
                      <div className="flex gap-2">
                        <Btn full kind="danger" onClick={() => setModal({ type: "confirmReject", payload: b })}>
                          반려
                        </Btn>
                        <Btn full onClick={() => approveBooking(b)}>
                          승인
                        </Btn>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {adminTab === "calendar" && (
            <div className="space-y-4">
              <MonthCalendar bookings={bookings} vehicles={vehicles} selected={selDate} onSelectDate={setSelDate} />
              <div>
                <h3 className="font-bold text-c-23302B mb-2 px-1">{fmtDate(selDate)} 시간대별 현황</h3>
                <DayTimeline
                  date={selDate}
                  bookings={bookings}
                  vehicles={vehicles}
                  showContact={true}
                  onEdit={(b) => { setEditBooking(b); setView("request"); }}
                  onDelete={(b) => setModal({ type: "confirmDelete", payload: b })}
                />
              </div>
            </div>
          )}

          {adminTab === "status" && (
            <div className="space-y-3">
              {vehicles.map((v) => {
                const now = new Date();
                const nowStr = todayStr();
                const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

                // 현재 사용중/다음 예정은 승인된 예약만 기준으로 판단
                const vBookingsApproved = bookings.filter((b) => b.vehicleId === v.id && b.status === "approved");
                // 최신 키로수·연료는 운전자가 입력한 모든 기록(승인 대기/반려 포함)에서 찾습니다
                const vBookingsAll = bookings.filter((b) => b.vehicleId === v.id);

                // 현재 사용중인지 (오늘 날짜가 구간에 포함되고, 첫날이면 start~, 마지막날이면 ~end, 중간날이면 종일 사용중으로 간주)
                const current = vBookingsApproved.find((b) => {
                  if (!dateInBookingRange(nowStr, b)) return false;
                  const isFirst = nowStr === b.date;
                  const isLast = nowStr === (b.endDate || b.date);
                  const from = isFirst ? b.start : "00:00";
                  const to = isLast ? b.end : "23:59";
                  return nowHM >= from && nowHM <= to;
                });

                // 가장 최근 운행 기록 (운행후정보 우선, 없으면 운행전정보) - 날짜/시간이 같으면 최근에 입력한 순서로
                const past = vBookingsAll
                  .filter((b) => b.post || b.pre)
                  .sort((a, b) => {
                    const aKey = (a.endDate || a.date) + a.end;
                    const bKey = (b.endDate || b.date) + b.end;
                    if (aKey !== bKey) return aKey < bKey ? 1 : -1;
                    return (b.createdAt || 0) - (a.createdAt || 0);
                  });
                const latest = past[0];
                const latestInfo = latest?.post || latest?.pre;
                const latestType = latest?.post ? "운행후" : latest?.pre ? "운행전" : null;

                // 다음 예정
                const upcoming = vBookingsApproved
                  .filter((b) => b.date + b.start > nowStr + nowHM)
                  .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];

                return (
                  <div
                    key={v.id}
                    className="rounded-2xl p-4 shadow-sm border-l-8"
                    style={{ borderLeftColor: v.color || "#1F5C46", backgroundColor: tintBg(v.color) }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-4 h-4 rounded-full inline-block border border-c-D6DED6"
                        style={{ backgroundColor: v.color || "#1F5C46" }}
                      />
                      <div className="font-extrabold" style={{ color: v.color === "#FFFFFF" ? "#23302B" : (v.color || "#1F5C46") }}>
                        {v.name}
                      </div>
                      <span className="text-xs text-c-7C877F">{v.plate}</span>
                      <span className="ml-auto">
                        {current ? (
                          <span className="text-xs font-bold bg-c-C88A2D text-white px-2 py-0.5 rounded-full">🚗 운행중</span>
                        ) : (
                          <span className="text-xs font-bold bg-c-E9EFE9 text-c-54615A px-2 py-0.5 rounded-full">대기중</span>
                        )}
                      </span>
                    </div>

                    {current && (
                      <div className="text-sm text-c-54615A mb-2 bg-c-FBF4E4 rounded-lg p-2">
                        {current.userName} · {current.destination} · ~{current.end}까지
                        {current.phone && (
                          <a href={`tel:${current.phone}`} className="ml-2 font-bold text-c-1F5C46 underline">전화</a>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-c-7C877F mb-1">최근 기록{latestType ? ` (${latestType})` : ""}</div>
                    {latestInfo ? (
                      <div className="text-sm text-c-23302B mb-2">
                        {fmtDate(latest.endDate || latest.date)} · {latestInfo.km || "-"}km · 연료 {latestInfo.fuel || "-"}%
                        {latest.post?.refuel && <span className="ml-1 text-c-2A5C8A font-bold">(주유함)</span>}
                        {latest.post?.memo && (
                          <div className="mt-1 text-xs text-c-B5443C bg-c-FBF4E4 rounded-lg p-1.5">
                            📝 {latest.post.memo}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-c-A9B2AA mb-2">기록 없음</div>
                    )}

                    <div className="text-xs text-c-7C877F mb-1">다음 예정</div>
                    {upcoming ? (
                      <div className="text-sm text-c-23302B">
                        {fmtDate(upcoming.date)} {upcoming.start} · {upcoming.userName} · {upcoming.destination}
                      </div>
                    ) : (
                      <div className="text-sm text-c-A9B2AA">예정된 배차 없음</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {adminTab === "log" && (
            <div className="space-y-3">
              {bookings.filter((b) => b.pre || b.post).length === 0 && (
                <div className="bg-white rounded-xl p-6 text-center text-sm text-c-7C877F">
                  아직 입력된 운행 기록이 없습니다.
                </div>
              )}
              {bookings
                .filter((b) => b.pre || b.post)
                .sort((a, b) => (b.endDate || b.date) + b.end < (a.endDate || a.date) + a.end ? -1 : 1)
                .map((b) => {
                  const v = vehicles.find((x) => x.id === b.vehicleId);
                  const hasMemo = !!b.post?.memo;
                  return (
                    <div
                      key={b.id}
                      className="rounded-2xl p-4 shadow-sm border-l-8"
                      style={{
                        borderLeftColor: v?.color || "#1F5C46",
                        backgroundColor: tintBg(v?.color),
                        outline: hasMemo ? "2px solid #B5443C" : "none",
                      }}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div
                          className="font-extrabold flex items-center gap-1.5"
                          style={{ color: v?.color === "#FFFFFF" ? "#23302B" : (v?.color || "#1F5C46") }}
                        >
                          <span
                            className="w-3 h-3 rounded-full inline-block border border-c-D6DED6"
                            style={{ backgroundColor: v?.color || "#1F5C46" }}
                          />
                          {v?.name || "차량"}
                        </div>
                        <div className="text-sm text-c-54615A text-right">
                          {fmtDate(b.date)}{b.endDate && b.endDate !== b.date ? `~${fmtDate(b.endDate)}` : ""} · {b.start}–{b.end}
                        </div>
                      </div>
                      <div className="text-sm text-c-54615A mb-2">
                        운전자: {b.userName} · {b.purpose} → {b.destination}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-c-EDF1EC rounded-lg p-2">
                          <div className="text-xs text-c-7C877F mb-0.5">운행전</div>
                          {b.pre ? (
                            <div className="text-c-23302B">{b.pre.km || "-"}km · 연료 {b.pre.fuel || "-"}%</div>
                          ) : (
                            <div className="text-c-A9B2AA">미입력</div>
                          )}
                        </div>
                        <div className="bg-c-EDF1EC rounded-lg p-2">
                          <div className="text-xs text-c-7C877F mb-0.5">운행후</div>
                          {b.post ? (
                            <div className="text-c-23302B">
                              {b.post.km || "-"}km · 연료 {b.post.fuel || "-"}%
                              {b.post.refuel && <span className="ml-1 text-c-2A5C8A font-bold">(주유)</span>}
                            </div>
                          ) : (
                            <div className="text-c-A9B2AA">미입력</div>
                          )}
                        </div>
                      </div>

                      {hasMemo && (
                        <div className="mt-2 text-sm text-c-B5443C bg-c-FBF4E4 rounded-lg p-2 font-semibold">
                          📝 특이사항: {b.post.memo}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {adminTab === "vehicles" && (
            <div className="space-y-3">
              {vehicles.length === 0 && (
                <div className="bg-white rounded-xl p-6 text-center text-sm text-c-7C877F">
                  등록된 차량이 없습니다. 아래에서 추가해 주세요.
                </div>
              )}
              {vehicles.map((v) => (
                <div key={v.id} className="bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full inline-block border border-c-D6DED6"
                        style={{ backgroundColor: v.color || "#1F5C46" }}
                      />
                      <div>
                        <div className="font-bold text-sm">{v.name}</div>
                        <div className="text-xs text-c-7C877F">{v.plate} · {v.capacity}인승</div>
                      </div>
                    </div>
                    <Btn small kind="danger" onClick={() => setModal({ type: "confirmDeleteVehicle", payload: v })}>
                      삭제
                    </Btn>
                  </div>
                  <div className="flex gap-1.5">
                    <Btn small kind="soft" onClick={() => setModal({ type: "colorPicker", payload: v })}>
                      🎨 색상 변경
                    </Btn>
                    <Btn small kind="amber" onClick={() => setModal({ type: "editVehicle", payload: v })}>
                      ✏️ 정보 수정
                    </Btn>
                  </div>
                </div>
              ))}

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-bold mb-3 text-c-23302B">차량 추가</h3>
                <Field label="차량 이름">
                  <input className={inputCls} value={vName} onChange={(e) => setVName(e.target.value)} placeholder="4호차 쏠라티" />
                </Field>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Field label="차량번호">
                      <input className={inputCls} value={vPlate} onChange={(e) => setVPlate(e.target.value)} placeholder="78라 9012" />
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field label="인승">
                      <input type="number" className={inputCls} value={vCap} onChange={(e) => setVCap(e.target.value)} placeholder="15" />
                    </Field>
                  </div>
                </div>
                <Btn full onClick={addVehicle}>차량 추가</Btn>
              </div>
            </div>
          )}

          {adminTab === "users" && (
            <div className="space-y-2">
              {users.length === 0 && (
                <div className="bg-white rounded-xl p-6 text-center text-sm text-c-7C877F">가입한 사용자가 없습니다.</div>
              )}
              {users.map((u) => {
                const isRecipient = (settings.smsRecipients || []).includes(u.id);
                return (
                  <div key={u.id} className="bg-white rounded-xl p-3 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-bold text-sm flex items-center gap-1.5">
                          {u.name}
                          {u.isAdmin && (
                            <span className="text-[10px] font-bold bg-c-C88A2D text-white px-1.5 py-0.5 rounded-full">관리자</span>
                          )}
                          {u.id === user.id && <span className="text-[10px] text-c-7C877F">(나)</span>}
                        </div>
                        <div className="text-xs text-c-7C877F">{u.id}</div>
                        {u.isAdmin && (
                          <div className="text-xs text-c-7C877F">문자 수신 번호: {u.phone || "미등록"}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <a href={`tel:${u.id}`} className="px-2.5 py-1.5 rounded-lg bg-c-1F5C46 text-white text-xs font-bold">전화</a>
                      <a href={`sms:${u.id}`} className="px-2.5 py-1.5 rounded-lg bg-c-C88A2D text-white text-xs font-bold">문자</a>
                      <Btn small kind="soft" onClick={() => setModal({ type: "editUser", payload: u })}>수정</Btn>
                      {u.id !== user.id && (
                        <Btn small kind={u.isAdmin ? "danger" : "ghost"} onClick={() => toggleAdminRole(u)}>
                          {u.isAdmin ? "관리자 해제" : "관리자 지정"}
                        </Btn>
                      )}
                      <Btn small kind="danger" onClick={() => setModal({ type: "confirmDeleteUser", payload: u })}>삭제</Btn>
                    </div>
                    {u.isAdmin && (
                      <label className="flex items-center gap-2 mt-2 text-xs text-c-54615A">
                        <input
                          type="checkbox"
                          checked={isRecipient}
                          onChange={async () => {
                            if (!isRecipient && !u.phone) {
                              showToast("먼저 '수정'에서 문자 수신 번호를 등록해 주세요.");
                              return;
                            }
                            const cur = settings.smsRecipients || [];
                            const next = isRecipient ? cur.filter((id) => id !== u.id) : [...cur, u.id];
                            await persist({ ...data, settings: { ...settings, smsRecipients: next } });
                          }}
                          className="w-4 h-4 accent-c-1F5C46"
                        />
                        🔔 새 배차 신청 문자 받기
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {adminTab === "settings" && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-bold mb-1 text-c-23302B">관리자 계정 설정</h3>
              <p className="text-xs text-c-7C877F mb-3">현재 아이디: <span className="font-bold">{user.id}</span></p>
              <Field label="현재 비밀번호 확인">
                <input type="password" className={inputCls} value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="현재 비밀번호" />
              </Field>
              <Field label="새 아이디">
                <input className={inputCls} value={newId} onChange={(e) => setNewId(e.target.value)} />
              </Field>
              <Field label="새 비밀번호 (변경 시에만 입력)">
                <input type="password" className={inputCls} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="4자 이상" />
              </Field>
              <Field label="새 비밀번호 확인">
                <input type="password" className={inputCls} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
              </Field>
              <Btn full onClick={saveAdminAccount}>저장하기</Btn>
              <p className="text-xs text-c-7C877F mt-3">
                운전자에게 관리자 권한을 주려면 "운전자 관리" 탭에서 해당 사람의 "관리자 지정" 버튼을 눌러주세요.
              </p>
            </div>
          )}

          {adminTab === "settings" && (
            <div className="bg-white rounded-2xl p-4 shadow-sm mt-3">
              <h3 className="font-bold mb-3 text-c-23302B">차량국장 연락처</h3>
              <Field label="이름/직책">
                <input className={inputCls} value={mgrName} onChange={(e) => setMgrName(e.target.value)} placeholder="차량국장" />
              </Field>
              <Field label="전화번호">
                <input className={inputCls} value={mgrPhone} onChange={(e) => setMgrPhone(e.target.value)} placeholder="010-0000-0000" />
              </Field>
              <p className="text-xs text-c-7C877F mb-3">운행신청 화면 안내문구에 표시되는 연락처입니다.</p>
              <Btn full onClick={saveManagerContact}>저장하기</Btn>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ── 모달들 ── */
  const ModalHost = () => {
    if (!modal) return null;
    const b = modal.payload;

    if (modal.type === "saved") {
      const cnt = modal.payload?.count || 1;
      const isApproved = user.isAdmin;
      const goBack = () => { setModal(null); setEditBooking(null); setView(user.isAdmin ? "admin" : "main"); };
      return (
        <Modal onClose={goBack}>
          <div className="text-center py-2">
            <div className="text-4xl mb-2">{isApproved ? "✅" : "⏳"}</div>
            <div className="font-extrabold text-lg text-c-23302B mb-1">
              {isApproved ? "저장되었습니다" : "신청이 접수되었습니다"}
            </div>
            <p className="text-sm text-c-7C877F mb-4">
              {isApproved
                ? cnt > 1
                  ? `매주 반복으로 총 ${cnt}건이 등록되었습니다. 신청현황에서 확인·수정할 수 있습니다.`
                  : "신청현황에서 언제든 확인·수정할 수 있습니다."
                : `관리자 승인 후 배차가 확정됩니다. ${cnt > 1 ? `총 ${cnt}건이 ` : ""}신청현황에서 승인 상태를 확인할 수 있습니다.`}
            </p>
            <Btn full onClick={goBack}>확인</Btn>
          </div>
        </Modal>
      );
    }

    if (modal.type === "confirmDelete")
      return (
        <Modal onClose={() => setModal(null)}>
          <div className="font-extrabold text-lg text-c-23302B mb-2">신청을 삭제할까요?</div>
          <p className="text-sm text-c-54615A mb-4">
            {b.userName}님의 {b.date} {b.start}–{b.end} 운행신청이 삭제되며 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-2">
            <Btn full kind="soft" onClick={() => setModal(null)}>취소</Btn>
            <Btn full kind="danger" onClick={async () => {
              await persist({ ...data, bookings: bookings.filter((x) => x.id !== b.id) });
              setModal(null); showToast("삭제되었습니다.");
            }}>삭제</Btn>
          </div>
        </Modal>
      );

    if (modal.type === "confirmDeleteVehicle")
      return (
        <Modal onClose={() => setModal(null)}>
          <div className="font-extrabold text-lg mb-2">차량을 삭제할까요?</div>
          <p className="text-sm text-c-54615A mb-4">{b.name}을(를) 삭제합니다. 이 차량의 기존 신청 기록은 유지됩니다.</p>
          <div className="flex gap-2">
            <Btn full kind="soft" onClick={() => setModal(null)}>취소</Btn>
            <Btn full kind="danger" onClick={async () => {
              await persist({ ...data, vehicles: vehicles.filter((x) => x.id !== b.id) });
              setModal(null); showToast("차량이 삭제되었습니다.");
            }}>삭제</Btn>
          </div>
        </Modal>
      );

    if (modal.type === "colorPicker")
      return (
        <Modal onClose={() => setModal(null)}>
          <div className="font-extrabold text-lg mb-1 text-c-23302B">{b.name} 색상 선택</div>
          <p className="text-sm text-c-7C877F mb-4">원하는 색상을 눌러주세요.</p>
          <div className="grid grid-cols-5 gap-3 mb-2">
            {VEHICLE_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={async () => {
                  await changeVehicleColor(b.id, c.hex);
                  setModal(null);
                }}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className="w-11 h-11 rounded-full border-2 flex items-center justify-center"
                  style={{
                    backgroundColor: c.hex,
                    borderColor: b.color === c.hex ? "#1F5C46" : "#D6DED6",
                  }}
                >
                  {b.color === c.hex && (
                    <span style={{ color: c.hex === "#FFFFFF" || c.hex === "#FACC15" ? "#23302B" : "#FFFFFF" }} className="font-bold text-lg">
                      ✓
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-c-54615A">{c.name}</span>
              </button>
            ))}
          </div>
          <Btn full kind="soft" onClick={() => setModal(null)}>닫기</Btn>
        </Modal>
      );

    if (modal.type === "confirmDeleteUser") {
      const isSelf = b.id === user.id;
      const isLastAdmin = b.isAdmin && users.filter((x) => x.isAdmin).length <= 1;
      const blocked = isSelf || isLastAdmin;
      return (
        <Modal onClose={() => setModal(null)}>
          <div className="font-extrabold text-lg mb-2">
            {blocked ? "삭제할 수 없습니다" : "사용자를 삭제할까요?"}
          </div>
          <p className="text-sm text-c-54615A mb-4">
            {isSelf
              ? "로그인 중인 본인 계정은 삭제할 수 없습니다."
              : isLastAdmin
              ? "마지막 남은 관리자 계정은 삭제할 수 없습니다. 먼저 다른 사용자에게 관리자 권한을 부여해 주세요."
              : `${b.name}(${b.id}) 계정을 삭제합니다.`}
          </p>
          <div className="flex gap-2">
            <Btn full kind="soft" onClick={() => setModal(null)}>{blocked ? "확인" : "취소"}</Btn>
            {!blocked && (
              <Btn full kind="danger" onClick={async () => {
                await persist({ ...data, users: users.filter((x) => x.id !== b.id) });
                setModal(null); showToast("삭제되었습니다.");
              }}>삭제</Btn>
            )}
          </div>
        </Modal>
      );
    }

    if (modal.type === "editUser") {
      return <EditUserModal u={b} />;
    }

    if (modal.type === "editVehicle") {
      return <EditVehicleModal v={b} />;
    }

    if (modal.type === "confirmReject") {
      return <RejectModal b={b} />;
    }

    if (modal.type === "pre" || modal.type === "post") {
      return <TripInfoModal b={b} kind={modal.type} />;
    }
    return null;
  };

  const RejectModal = ({ b }) => {
    const [note, setNote] = useState("");
    const v = vehicles.find((x) => x.id === b.vehicleId);
    return (
      <Modal onClose={() => setModal(null)}>
        <div className="font-extrabold text-lg text-c-23302B mb-2">신청을 반려할까요?</div>
        <p className="text-sm text-c-54615A mb-3">
          {v?.name || "차량"} · {b.date} {b.start}–{b.end} · 신청자 {b.userName}
        </p>
        <Field label="반려 사유 (선택, 신청자에게 표시됩니다)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 같은 시간 다른 일정과 겹침" />
        </Field>
        <div className="flex gap-2">
          <Btn full kind="soft" onClick={() => setModal(null)}>취소</Btn>
          <Btn
            full
            kind="danger"
            onClick={async () => {
              await rejectBooking(b, note.trim());
              setModal(null);
            }}
          >
            반려하기
          </Btn>
        </div>
      </Modal>
    );
  };

  const EditUserModal = ({ u }) => {
    const [name, setName] = useState(u.name);
    const [phone, setPhone] = useState(u.isAdmin ? (u.phone || "") : u.id);
    return (
      <Modal onClose={() => setModal(null)}>
        <div className="font-extrabold text-lg mb-3">{u.isAdmin ? "관리자 정보 수정" : "운전자 정보 수정"}</div>
        <Field label="이름">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={u.isAdmin ? "문자 수신 번호 (로그인 아이디는 계정 설정에서 변경)" : "핸드폰번호"}>
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" />
        </Field>
        <div className="flex gap-2">
          <Btn full kind="soft" onClick={() => setModal(null)}>취소</Btn>
          <Btn full onClick={async () => {
            const p = phone.replace(/[^0-9]/g, "");
            if (u.isAdmin) {
              // 관리자는 로그인 아이디는 그대로 두고, 이름과 문자 수신 번호만 수정합니다.
              const nextUsers = users.map((x) => (x.id === u.id ? { ...x, name: name.trim(), phone: p } : x));
              await persist({ ...data, users: nextUsers });
            } else {
              const nextUsers = users.map((x) => (x.id === u.id ? { ...x, name: name.trim(), id: p, phone: p } : x));
              const nextBookings = bookings.map((bk) => (bk.userId === u.id ? { ...bk, userId: p, userName: name.trim(), phone: p } : bk));
              await persist({ ...data, users: nextUsers, bookings: nextBookings });
            }
            setModal(null); showToast("수정되었습니다.");
          }}>저장</Btn>
        </div>
      </Modal>
    );
  };

  const EditVehicleModal = ({ v }) => {
    const [name, setName] = useState(v.name);
    const [plate, setPlate] = useState(v.plate);
    const [capacity, setCapacity] = useState(v.capacity);
    return (
      <Modal onClose={() => setModal(null)}>
        <div className="font-extrabold text-lg mb-3 text-c-23302B">차량 정보 수정</div>
        <Field label="차량 이름">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="1호차 스타렉스" />
        </Field>
        <Field label="차량번호">
          <input className={inputCls} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="12가 3456" />
        </Field>
        <Field label="인승">
          <input type="number" className={inputCls} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="12" />
        </Field>
        <div className="flex gap-2">
          <Btn full kind="soft" onClick={() => setModal(null)}>취소</Btn>
          <Btn
            full
            onClick={async () => {
              if (!name.trim()) return showToast("차량 이름을 입력해 주세요.");
              await updateVehicleInfo(v.id, { name: name.trim(), plate: plate.trim(), capacity: Number(capacity) || 0 });
              setModal(null);
            }}
          >
            저장
          </Btn>
        </div>
      </Modal>
    );
  };

  const TripInfoModal = ({ b, kind }) => {
    const init = kind === "pre" ? b.pre : b.post;
    const [km, setKm] = useState(init?.km ?? "");
    const [fuel, setFuel] = useState(init?.fuel ?? "");
    const [refuel, setRefuel] = useState(init?.refuel ?? false);
    const [memo, setMemo] = useState(init?.memo ?? "");

    const save = async () => {
      const info = kind === "pre" ? { km, fuel } : { km, fuel, refuel, memo };
      const nextBookings = bookings.map((x) => (x.id === b.id ? { ...x, [kind]: info } : x));
      await persist({ ...data, bookings: nextBookings });
      setModal(null);
      showToast("저장되었습니다.");
    };

    return (
      <Modal onClose={() => setModal(null)}>
        <div className="font-extrabold text-lg mb-1">{kind === "pre" ? "운행전 정보" : "운행후 정보"}</div>
        <p className="text-xs text-c-7C877F mb-3">{b.date} · {vehicles.find((v) => v.id === b.vehicleId)?.name}</p>
        <Field label="키로수 (km)">
          <input type="number" className={inputCls} value={km} onChange={(e) => setKm(e.target.value)} placeholder="123456" />
        </Field>
        <Field label="연료 (%)">
          <input type="number" min="0" max="100" className={inputCls} value={fuel} onChange={(e) => setFuel(e.target.value)} placeholder="80" />
        </Field>
        {kind === "post" && (
          <>
            <label className="flex items-center gap-2 mb-3 text-sm text-c-54615A">
              <input type="checkbox" checked={refuel} onChange={(e) => setRefuel(e.target.checked)} className="w-4 h-4 accent-c-1F5C46" />
              운행 중 주유했습니다
            </label>
            <Field label="운행 중 특이사항">
              <textarea className={`${inputCls} h-24 resize-none`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 타이어 공기압 경고등 점등" />
            </Field>
          </>
        )}
        <div className="flex gap-2">
          <Btn full kind="soft" onClick={() => setModal(null)}>취소</Btn>
          <Btn full onClick={save}>저장</Btn>
        </div>
      </Modal>
    );
  };

  return (
    <div style={{ fontFamily: "'Pretendard', 'Noto Sans KR', system-ui, sans-serif" }}>
      <style>{`.accent-c-1F5C46 { accent-color: #1F5C46 !important; }
.bg-c-17482F { background-color: #17482F !important; }
.bg-c-1F5C46 { background-color: #1F5C46 !important; }
.bg-c-23302B { background-color: #23302B !important; }
.bg-c-C88A2D { background-color: #C88A2D !important; }
.bg-c-E9EFE9 { background-color: #E9EFE9 !important; }
.bg-c-EDF1EC { background-color: #EDF1EC !important; }
.bg-c-EFEFEA { background-color: #EFEFEA !important; }
.bg-c-F4F6F2 { background-color: #F4F6F2 !important; }
.bg-c-FBF4E4 { background-color: #FBF4E4 !important; }
.border-c-1F5C46 { border-color: #1F5C46 !important; }
.border-c-B5443C { border-color: #B5443C !important; }
.border-c-D6DED6 { border-color: #D6DED6 !important; }
.border-c-EAD9AE { border-color: #EAD9AE !important; }
.border-c-F0F3EF { border-color: #F0F3EF !important; }
.text-c-1F5C46 { color: #1F5C46 !important; }
.text-c-23302B { color: #23302B !important; }
.text-c-2A5C8A { color: #2A5C8A !important; }
.text-c-54615A { color: #54615A !important; }
.text-c-6B5A2E { color: #6B5A2E !important; }
.text-c-7C877F { color: #7C877F !important; }
.text-c-A9B2AA { color: #A9B2AA !important; }
.text-c-B5443C { color: #B5443C !important; }
.text-c-C88A2D { color: #C88A2D !important; }
.text-c-CFE3D6 { color: #CFE3D6 !important; }
.text-c-F0D9A8 { color: #F0D9A8 !important; }`}</style>
      
      {view === "login" && <LoginPage />}
      {view === "signup" && <SignupPage />}
      {view === "main" && user && <MainPage />}
      {view === "request" && user && <RequestPage />}
      {view === "myList" && user && <MyListPage />}
      {view === "admin" && user?.isAdmin && <AdminPage />}
      <ModalHost />
      <Toast msg={toast} />

      {reminderBanner && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-sm mx-auto bg-c-C88A2D text-white rounded-2xl shadow-xl p-4">
          <div className="font-extrabold mb-1">🔔 곧 운행이 시작됩니다</div>
          <div className="text-sm mb-3">
            {reminderBanner.start}에 {vehicles.find((v) => v.id === reminderBanner.vehicleId)?.name || "차량"} 운행 예정입니다. 운행전 정보를 입력해 주세요.
          </div>
          <div className="flex gap-2">
            <Btn small kind="soft" onClick={() => setReminderBanner(null)}>나중에</Btn>
            <Btn
              small
              onClick={() => {
                setModal({ type: "pre", payload: reminderBanner });
                setReminderBanner(null);
              }}
            >
              지금 입력하기
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
