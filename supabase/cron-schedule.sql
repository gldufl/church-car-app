-- 5분 전 알림용 스케줄러 설정
-- Supabase SQL Editor에서 실행하세요.
-- YOUR-PROJECT-REF와 YOUR-ANON-KEY는 실제 값으로 바꿔주세요.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'reminder-check-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/reminder-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-ANON-KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 스케줄 확인: select * from cron.job;
-- 스케줄 삭제(필요시): select cron.unschedule('reminder-check-every-minute');
