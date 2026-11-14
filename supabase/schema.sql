-- Recall: one row of saved progress per account.
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run. It is safe to run again.

create table if not exists public.progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row-level security: each signed-in person can only see and change their own row.
alter table public.progress enable row level security;

drop policy if exists "read own progress" on public.progress;
drop policy if exists "insert own progress" on public.progress;
drop policy if exists "update own progress" on public.progress;
drop policy if exists "delete own progress" on public.progress;

create policy "read own progress" on public.progress for select to authenticated using (auth.uid() = user_id);
create policy "insert own progress" on public.progress for insert to authenticated with check (auth.uid() = user_id);
create policy "update own progress" on public.progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own progress" on public.progress for delete to authenticated using (auth.uid() = user_id);

-- Recall AI: a per-person daily counter for the "ai" Edge Function (supabase/functions/ai).
-- Nobody can read or edit the counter directly; it only goes up through use_ai, one call per AI request.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create or replace function public.use_ai(daily_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  if auth.uid() is null then return false; end if;
  insert into ai_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count into used;
  -- The limit is capped here too, so calling this directly can never raise it.
  return used <= least(daily_limit, 1000);
end $$;
revoke all on function public.use_ai(integer) from public, anon;
grant execute on function public.use_ai(integer) to authenticated;
