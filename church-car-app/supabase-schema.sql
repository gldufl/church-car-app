-- 초청교회 배차 신청 앱: 데이터 저장용 테이블
-- 기존 앱의 데이터 구조(users, vehicles, bookings, settings)를
-- key-value 형태로 하나의 JSON에 통째로 저장합니다.
-- (Claude 아티팩트의 window.storage 와 동일한 방식)

create table if not exists app_storage (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- anon key로 읽기/쓰기를 허용합니다.
-- 이 앱은 자체 로그인(회원가입/관리자) 로직을 코드 안에서 처리하므로
-- Supabase 단에서는 별도 인증 없이 anon key로 테이블 접근을 허용해도 됩니다.
alter table app_storage enable row level security;

create policy "allow anon read" on app_storage
  for select using (true);

create policy "allow anon write" on app_storage
  for insert with check (true);

create policy "allow anon update" on app_storage
  for update using (true);
