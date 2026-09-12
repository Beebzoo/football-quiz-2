-- The shared record book for BALL.
--
-- RUN THIS ONCE, by hand, in the Supabase dashboard: project BALL, SQL Editor,
-- paste, Run. It cannot be done from the app: the anon key the app carries is
-- allowed to read and write rows, not to create tables, which is exactly the
-- way round it should be.
--
-- Until this exists, The Table quietly stays local to each phone. Nothing
-- breaks, the sync just never returns anything.

create table if not exists public.matches (
  id      text primary key,          -- the match id every phone in the room shares
  crew    text not null,             -- the word the three of you typed on each phone
  ts      bigint not null,
  mode    text,
  ref     text,
  target  int,
  rounds  int,
  players jsonb not null,
  winner  text,
  losers  jsonb,
  filed   timestamptz not null default now()
);

create index if not exists matches_crew_ts on public.matches (crew, ts);

alter table public.matches enable row level security;

-- Anyone with the anon key can read and add matches. That is the deal here:
-- this is a quiz between three people, the key is public by design, and
-- nothing personal goes in a row beyond the names you typed into the game.
-- A crew name is a shared secret in the same way a room code is: guessable if
-- someone tries, worth nothing if they do.
drop policy if exists "read matches" on public.matches;
create policy "read matches" on public.matches for select using (true);

drop policy if exists "add matches" on public.matches;
create policy "add matches" on public.matches for insert with check (true);

-- Deliberately NO update or delete policy. A filed match is a filed match, and
-- nobody can quietly rewrite the night they lost 47-3.
