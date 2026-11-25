-- =====================================================================
-- COC Ewe Hymnal: daily "Hymn of the Day" reminders (part 1 of 2)
--
-- What this file does, in plain words:
--   * A list of phones that asked for a daily reminder: where to send it
--     (a push address the phone's browser gives us), what time, which time
--     zone and which language. No names, emails or accounts.
--   * A private place for the reminder sender's own keys (it makes them
--     itself the first time it runs). Nobody can read them through the app.
--   * A timer inside the database that wakes the sender every 15 minutes.
--   * Three safe actions the app may call: turn a reminder on or change
--     it, turn it off, and get the sender's PUBLIC key.
--
-- Run it ONCE in Supabase, AFTER creating the "send-reminders" function:
-- SQL Editor -> New query -> paste -> Run. Nothing existing is changed.
-- Safe to run again: anything already there is kept.
-- =====================================================================

create table if not exists public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  endpoint       text unique not null,
  p256dh         text not null,
  auth           text not null,
  reminder_time  time not null default '06:00',
  time_zone      text not null default 'UTC',
  lang           text not null default 'ee' check (lang in ('ee', 'en', 'both')),
  last_sent      date,
  failures       int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.push_keys (
  id           int primary key default 1 check (id = 1),
  public_key   text,            -- shared with phones (made by the sender)
  private_jwk  jsonb,           -- never leaves the database / sender
  cron_token   text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at   timestamptz not null default now()
);
insert into public.push_keys (id) values (1) on conflict (id) do nothing;

-- Locked: only the reminder sender (service role) can read these tables.
alter table public.push_subscriptions enable row level security;
alter table public.push_keys enable row level security;
revoke all on public.push_subscriptions, public.push_keys from anon, authenticated;

-- Turn a reminder on, or change its time / language.
create or replace function public.save_reminder(
  p_endpoint text, p_p256dh text, p_auth text, p_time text, p_tz text, p_lang text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz text := p_tz;
begin
  -- Only real browser push services are accepted.
  if p_endpoint is null or length(p_endpoint) > 1000 or p_endpoint !~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/' then
    raise exception 'This browser''s notification address is not supported.';
  end if;
  if length(coalesce(p_p256dh, '')) not between 40 and 200 or length(coalesce(p_auth, '')) not between 10 and 60 then
    raise exception 'Notification keys look wrong.';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, reminder_time, time_zone, lang)
  values (p_endpoint, p_p256dh, p_auth, coalesce(nullif(p_time, '')::time, '06:00'), v_tz,
          case when p_lang in ('ee', 'en', 'both') then p_lang else 'ee' end)
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth, reminder_time = excluded.reminder_time,
    time_zone = excluded.time_zone, lang = excluded.lang, failures = 0, updated_at = now(),
    -- choosing a later time today still gets today's reminder
    last_sent = case when excluded.reminder_time > (now() at time zone excluded.time_zone)::time
                     then null else public.push_subscriptions.last_sent end;
end;
$$;

-- Turn a reminder off.
create or replace function public.delete_reminder(p_endpoint text)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- The sender's public key (safe to share; phones need it to subscribe).
create or replace function public.reminder_public_key()
returns text
language sql stable security definer
set search_path = ''
as $$
  select public_key from public.push_keys where id = 1;
$$;

-- For the sender only: reminders due now, with each phone's local date.
create or replace function public.due_reminders()
returns table (id uuid, endpoint text, p256dh text, auth text, lang text, local_date date)
language sql stable security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, s.lang, (now() at time zone s.time_zone)::date
  from public.push_subscriptions s
  where (now() at time zone s.time_zone)::time >= s.reminder_time
    and (s.last_sent is null or s.last_sent < (now() at time zone s.time_zone)::date)
  limit 5000;
$$;

-- For the sender only: record what happened to each reminder.
--   p = [{"id": "...", "date": "2026-11-25", "result": "sent" | "gone" | "failed"}]
create or replace function public.record_reminders(p jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.push_subscriptions s
  using jsonb_to_recordset(p) as r(id uuid, date date, result text)
  where s.id = r.id and (r.result = 'gone' or (r.result = 'failed' and s.failures >= 20));

  update public.push_subscriptions s set
    failures  = case when r.result = 'sent' then 0 else s.failures + 1 end,
    -- after 3 failed tries in a row, give up for today
    last_sent = case when r.result = 'sent' or s.failures >= 2 then r.date else s.last_sent end
  from jsonb_to_recordset(p) as r(id uuid, date date, result text)
  where s.id = r.id and r.result in ('sent', 'failed');
$$;

revoke execute on function public.save_reminder(text, text, text, text, text, text),
                          public.delete_reminder(text),
                          public.reminder_public_key(),
                          public.due_reminders(),
                          public.record_reminders(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_reminder(text, text, text, text, text, text),
                          public.delete_reminder(text),
                          public.reminder_public_key()
  to anon, authenticated;
grant execute on function public.due_reminders(), public.record_reminders(jsonb) to service_role;
grant select, insert, update, delete on public.push_subscriptions, public.push_keys to service_role;

-- ---------------------------------------------------------------------
-- The timer: every 15 minutes, wake the "send-reminders" function.
-- The web address below is your project's (not a secret). The token is a
-- random password made above, so only this timer can wake the sender.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'hymn-of-the-day-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://brbyybcjhtyakddkjuva.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-reminder-token', (select cron_token from public.push_keys where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

-- Wake it once now, so it makes its keys straight away.
select net.http_post(
  url := 'https://brbyybcjhtyakddkjuva.supabase.co/functions/v1/send-reminders',
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'x-reminder-token', (select cron_token from public.push_keys where id = 1)),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
);
