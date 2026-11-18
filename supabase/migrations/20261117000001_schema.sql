-- SorteSenai: tables.
-- Rule of the whole database: the browser never writes to these tables.
-- Every change goes through a SECURITY DEFINER function (see later migrations).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;

-- ---------------------------------------------------------------- access
create table public.allowed_emails (
  email      text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  added_by   uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- cards
create table public.cards (
  id          uuid primary key default gen_random_uuid(),
  number      integer generated always as identity unique, -- album number shown on the sticker
  title       text not null check (length(title) between 1 and 60),
  joke        text not null check (length(joke) between 1 and 280),
  image_path  text,
  odds_n      bigint not null check (odds_n between 10 and 10000000000),
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index cards_active_odds_idx on public.cards (odds_n desc) where active;

-- ---------------------------------------------------------------- titles (earned or bought)
create table public.titles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(name) between 1 and 40),
  description text not null default '',
  -- {"type":"pulled_at_least","odds_n":1000000} | {"type":"collection_pct","pct":50}
  -- {"type":"pull_count","count":100} | {"type":"game_coins","game":"slots","coins":5000} | {"type":"manual"}
  condition   jsonb not null default '{"type":"manual"}',
  price       bigint check (price is null or price > 0), -- null = not for sale
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint titles_condition_type check (condition->>'type' in ('pulled_at_least','collection_pct','pull_count','game_coins','manual'))
);

-- ---------------------------------------------------------------- players
create table public.profiles (
  id             uuid primary key, -- = auth.users.id
  email          text not null unique,
  nickname       text not null unique check (nickname ~ '^[A-Za-z0-9_]{3,20}$'),
  bio            text not null default '' check (length(bio) <= 160),
  avatar_url     text,
  avatar_card_id uuid references public.cards (id) on delete set null,
  banner_url     text, -- uploaded by the player, never sold
  title_id       uuid references public.titles (id) on delete set null,
  showcase       uuid[] not null default '{}' check (cardinality(showcase) <= 3),
  role           text not null default 'player' check (role in ('player','admin')),
  banned         boolean not null default false,
  coins          bigint not null default 500 check (coins >= 0),
  streak         numeric(6,3) not null default 1 check (streak >= 1),
  last_pull_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table public.inventory (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  card_id         uuid not null references public.cards (id) on delete cascade,
  quantity        integer not null check (quantity >= 0),
  first_pulled_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index inventory_card_idx on public.inventory (card_id) where quantity > 0;

create table public.pulls (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  card_id        uuid not null references public.cards (id) on delete cascade,
  odds_n_at_pull bigint not null, -- frozen: later rarity edits never rewrite history
  luck_used      numeric not null,
  created_at     timestamptz not null default now()
);
create index pulls_user_idx on public.pulls (user_id, created_at desc);

create table public.coin_transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     bigint not null,
  reason     text not null,
  ref        text,
  created_at timestamptz not null default now()
);
create index coin_tx_user_idx on public.coin_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------- shop
create table public.items (
  id               uuid primary key default gen_random_uuid(),
  type             text not null default 'potion' check (type in ('potion')), -- more types later
  name             text not null check (length(name) between 1 and 40),
  description      text not null default '',
  price            bigint not null check (price > 0),
  multiplier       numeric not null check (multiplier > 1),
  duration_minutes integer check (duration_minutes > 0),
  duration_pulls   integer check (duration_pulls > 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint items_one_duration check ((duration_minutes is null) <> (duration_pulls is null))
);

create table public.user_items (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  item_id  uuid not null references public.items (id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  primary key (user_id, item_id)
);

create table public.active_effects (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  multiplier numeric not null,
  expires_at timestamptz,
  pulls_left integer,
  created_at timestamptz not null default now()
);
create index active_effects_user_idx on public.active_effects (user_id);

create table public.user_titles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title_id    uuid not null references public.titles (id) on delete cascade,
  source      text not null check (source in ('earned','bought','granted')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

-- ---------------------------------------------------------------- social
create table public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (length(text) between 10 and 280),
  image_path text,
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  card_id    uuid references public.cards (id) on delete set null,
  created_at timestamptz not null default now()
);
create index suggestions_status_idx on public.suggestions (status, created_at desc);

create table public.feed_events (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  card_id        uuid not null references public.cards (id) on delete cascade,
  odds_n_at_pull bigint not null,
  luck           numeric not null,
  created_at     timestamptz not null default now()
);
create index feed_events_created_idx on public.feed_events (created_at desc);

-- ---------------------------------------------------------------- economy and games
create table public.settings (
  id    boolean primary key default true check (id), -- single row
  value jsonb not null
);

create table public.daily_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  amount  bigint not null,
  primary key (user_id, day)
);

create table public.game_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game        text not null check (game in ('slots','memory','reflex','clicker')),
  state       jsonb not null default '{}', -- server-only secrets (memory board, reflex delay)
  started_at  timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  reward      bigint
);
create index game_sessions_open_idx on public.game_sessions (user_id) where finished_at is null;

create table public.daily_game_earnings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game    text not null,
  day     date not null,
  earned  bigint not null default 0,
  primary key (user_id, game, day)
);
