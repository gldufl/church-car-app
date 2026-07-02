import React, { useState, useEffect, useMemo } from "react";
import { storage } from "./storage";

/* ─────────────────────────────────────────────
   초청교회 배차 신청
   디자인 토큰
   bg #F4F6F2 / surface #FFFFFF / ink #23302B
   primary(pine) #1F5C46 / accent(amber) #C88A2D
   danger #B5443C / muted #7C877F
────────────────────────────────────────────── */

const STORAGE_KEY = "choChung-carBooking-v1";

const SEED = {
  users: [{ id: "admin", name: "관리자", pw: "0000", isAdmin: true }],
  vehicles: [
    { id: "v1", name: "1호차 스타렉스", plate: "12가 3456", capacity: 12 },
    { id: "v2", name: "2호차 카니발", plate: "34나 5678", capacity: 9 },
    { id: "v3", name: "3호차 카운티", plate: "56다 7890", capacity: 25 },
  ],
  bookings: [],
  settings: { managerName: "차량국장", managerPhone: "010-8641-2350" },
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

  const countByDate = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      let cur = new Date(`${b.date}T00:00:00`);
      const end = new Date(`${b.endDate || b.date}T00:00:00`);
      let guard = 0;
      while (cur <= end && guard < 60) {
        const key = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
        map[key] = (map[key] || 0) + 1;
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    });
    return map;
  }, [bookings]);

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
          const cnt = countByDate[dateStr] || 0;
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
              {cnt > 0 && (
                <span
                  className={`text-[10px] leading-none mt-0.5 font-bold ${
                    isSel ? "text-c-F0D9A8" : "text-c-C88A2D"
                  }`}
                >
                  {cnt}건
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
function DayTimeline({ date, bookings, vehicles, showContact }) {
  const dayBookings = bookings.filter((b) => dateInBookingRange(date, b));
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
            <div className="font-bold text-sm text-c-23302B mb-1.5">{v.name}</div>
            {/* 24시간 타임라인 바 */}
            <div className="relative h-4 rounded-full bg-c-EDF1EC overflow-hidden mb-2">
              {vb.map((b) => {
                const { dispStart, dispEnd } = displayRange(b);
                const l = (toMin(dispStart) / 1440) * 100;
                const w = ((toMin(dispEnd === "24:00" ? "23:59" : dispEnd) + (dispEnd === "24:00" ? 1 : 0) - toMin(dispStart)) / 1440) * 100;
                return (
                  <div
                    key={b.id}
                    className="absolute top-0 h-full bg-c-1F5C46"
                    style={{ left: `${l}%`, width: `${Math.max(w, 2)}%` }}
                  />
                );
              })}
            </div>
            {vb.map((b) => {
              const { dispStart, dispEnd, multiDay } = displayRange(b);
              return (
                <div key={b.id} className="flex items-center justify-between text-sm py-1 border-t border-c-F0F3EF">
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
                  </div>
                  {showContact && b.phone && (
                    <div className="flex gap-1.5 shrink-0 ml-2">
                      <a href={`tel:${b.phone}`} className="px-2 py-1 rounded-lg bg-c-1F5C46 text-white text-xs font-bold">
                        전화
                      </a>
                      <a href={`sms:${b.phone}`} className="px-2 py-1 rounded-lg bg-c-C88A2D text-white text-xs font-bold">
                        문자
                      </a>
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
  const [editBooking, setEditBooking] = useState(null);

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

  const persist = async (next) => {
    setData(next);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      showToast("저장 중 오류가 발생했습니다.");
    }
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
    const [adminMode, setAdminMode] = useState(false);

    const login = () => {
      const u = users.find((x) => x.id === id.trim() && x.pw === pw);
      if (!u) return showToast("아이디 또는 비밀번호가 맞지 않습니다.");
      setUser(u);
      setView(u.isAdmin ? "admin" : "main");
    };

    return (
      <div className="min-h-screen bg-c-F4F6F2 flex flex-col items-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-4xl mb-2">⛪</div>
            <h1 className="text-2xl font-extrabold text-c-1F5C46 tracking-tight">초청교회 배차 신청</h1>
            <p className="text-sm text-c-7C877F mt-1">
              {adminMode ? "관리자 모드로 로그인합니다" : "차량 운행을 신청하고 확인하세요"}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <Field label={adminMode ? "관리자 아이디" : "아이디 (핸드폰번호)"}>
              <input className={inputCls} value={id} onChange={(e) => setId(e.target.value)} placeholder={adminMode ? "admin" : "01012345678"} />
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
            <div className="flex gap-2 mt-3">
              {!adminMode && (
                <Btn full kind="ghost" onClick={() => setView("signup")}>
                  회원가입
                </Btn>
              )}
              <Btn full kind="soft" onClick={() => setAdminMode((v) => !v)}>
                {adminMode ? "일반 로그인" : "관리자 모드"}
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
      const nu = { id: p, name: name.trim(), pw, isAdmin: false };
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
        <button
          className="underline opacity-90"
          onClick={() => {
            setUser(null);
            setView("login");
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
      .filter((b) => dateInBookingRange(todayStr(), b))
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
                    <div key={b.id} className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center">
                      <div>
                        <div className="font-bold text-sm text-c-1F5C46">{v?.name || "차량"}</div>
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
            rangeOverlap(occ.date, start, occ.endDate, end, b.date, b.start, b.endDate, b.end)
        )
      );
      if (conflictDate)
        return showToast(`${fmtDate(conflictDate.date)}에 이미 겹치는 배차가 있습니다. 날짜나 차량을 확인해 주세요.`);

      const seriesId = recurring && occurrences.length > 1 ? uid() : null;
      const baseRec = {
        vehicleId,
        start, end,
        purpose: purpose.trim(),
        destination: destination.trim(),
        passengers: Number(passengers),
        userId: user.id, userName: user.name, phone: user.isAdmin ? "" : user.id,
        pre: null, post: null,
        createdAt: Date.now(),
        seriesId,
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
                    <div className="font-bold">{v.name}</div>
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
            <Btn full kind="soft" onClick={() => setView(e ? "myList" : "main")}>
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
                {b.seriesId && (
                  <div className="text-[10px] font-bold text-c-2A5C8A mb-1">매주 반복 신청</div>
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
    const [tab, setTab] = useState("calendar"); // calendar | vehicles | users | settings
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
      const nv = { id: uid(), name: vName.trim(), plate: vPlate.trim(), capacity: Number(vCap) || 0 };
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
          <div className="flex gap-2 mb-4">
            {[["calendar", "배차 현황"], ["vehicles", "차량 관리"], ["users", "운전자 관리"], ["settings", "계정 설정"]].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  tab === k ? "bg-c-1F5C46 text-white" : "bg-white text-c-54615A"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "calendar" && (
            <div className="space-y-4">
              <MonthCalendar bookings={bookings} vehicles={vehicles} selected={selDate} onSelectDate={setSelDate} />
              <div>
                <h3 className="font-bold text-c-23302B mb-2 px-1">{fmtDate(selDate)} 시간대별 현황</h3>
                <DayTimeline date={selDate} bookings={bookings} vehicles={vehicles} showContact={true} />
              </div>
            </div>
          )}

          {tab === "vehicles" && (
            <div className="space-y-3">
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
              {vehicles.map((v) => (
                <div key={v.id} className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">{v.name}</div>
                    <div className="text-xs text-c-7C877F">{v.plate} · {v.capacity}인승</div>
                  </div>
                  <Btn small kind="danger" onClick={() => setModal({ type: "confirmDeleteVehicle", payload: v })}>
                    삭제
                  </Btn>
                </div>
              ))}
            </div>
          )}

          {tab === "users" && (
            <div className="space-y-2">
              {users.length === 0 && (
                <div className="bg-white rounded-xl p-6 text-center text-sm text-c-7C877F">가입한 사용자가 없습니다.</div>
              )}
              {users.map((u) => (
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
                </div>
              ))}
            </div>
          )}

          {tab === "settings" && (
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

          {tab === "settings" && (
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
      return (
        <Modal onClose={() => { setModal(null); setEditBooking(null); setView("main"); }}>
          <div className="text-center py-2">
            <div className="text-4xl mb-2">✅</div>
            <div className="font-extrabold text-lg text-c-23302B mb-1">저장되었습니다</div>
            <p className="text-sm text-c-7C877F mb-4">
              {cnt > 1
                ? `매주 반복으로 총 ${cnt}건이 등록되었습니다. 신청현황에서 확인·수정할 수 있습니다.`
                : "신청현황에서 언제든 확인·수정할 수 있습니다."}
            </p>
            <Btn full onClick={() => { setModal(null); setEditBooking(null); setView("main"); }}>확인</Btn>
          </div>
        </Modal>
      );
    }

    if (modal.type === "confirmDelete")
      return (
        <Modal onClose={() => setModal(null)}>
          <div className="font-extrabold text-lg text-c-23302B mb-2">신청을 삭제할까요?</div>
          <p className="text-sm text-c-54615A mb-4">
            {b.date} {b.start}–{b.end} 운행신청이 삭제되며 되돌릴 수 없습니다.
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

    if (modal.type === "pre" || modal.type === "post") {
      return <TripInfoModal b={b} kind={modal.type} />;
    }
    return null;
  };

  const EditUserModal = ({ u }) => {
    const [name, setName] = useState(u.name);
    const [phone, setPhone] = useState(u.id);
    return (
      <Modal onClose={() => setModal(null)}>
        <div className="font-extrabold text-lg mb-3">운전자 정보 수정</div>
        <Field label="이름">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="핸드폰번호">
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Btn full kind="soft" onClick={() => setModal(null)}>취소</Btn>
          <Btn full onClick={async () => {
            const p = phone.replace(/[^0-9]/g, "");
            const nextUsers = users.map((x) => (x.id === u.id ? { ...x, name: name.trim(), id: p } : x));
            const nextBookings = bookings.map((bk) => (bk.userId === u.id ? { ...bk, userId: p, userName: name.trim(), phone: p } : bk));
            await persist({ ...data, users: nextUsers, bookings: nextBookings });
            setModal(null); showToast("수정되었습니다.");
          }}>저장</Btn>
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
    </div>
  );
}
