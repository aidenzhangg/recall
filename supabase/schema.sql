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
