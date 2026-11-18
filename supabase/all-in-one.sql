-- SorteSenai: todas as migracoes + dados de exemplo, em ordem. Cole no SQL Editor do Supabase e clique Run.

-- ===== migrations/20261117000001_schema.sql =====
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

-- ===== migrations/20261117000002_security.sql =====
-- SorteSenai: access helpers and row level security.
-- Errors are raised as exceptions whose MESSAGE is a stable code the frontend maps
-- to ApiError: not_authenticated, not_invited, banned, forbidden, invalid, not_found,
-- insufficient_coins, already_claimed, nickname_taken, session_expired.

-- ---------------------------------------------------------------- helpers
-- A member is a signed-in player whose e-mail is still on the guest list and who is not banned.
create or replace function app.is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    join public.allowed_emails a on a.email = p.email
    where p.id = auth.uid() and not p.banned
  )
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_member() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function app.require_member() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or not exists (select 1 from public.allowed_emails where email = v_profile.email) then
    raise exception 'not_invited';
  end if;
  if v_profile.banned then raise exception 'banned'; end if;
  return v_uid;
end $$;

create or replace function app.require_admin() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'admin') then
    raise exception 'forbidden';
  end if;
  return v_uid;
end $$;

-- Cryptographic uniform double in [0, 1). Never random().
create or replace function app.rand() returns double precision
language sql volatile set search_path = public, extensions, pg_temp as $$
  select ('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint / 72057594037927936.0::double precision
$$;

create or replace function app.settings() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select value from public.settings where id
$$;

create or replace function app.today() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Moves coins and writes the ledger in one place. The UPDATE locks the profile row,
-- so two simultaneous calls for the same player run one after the other.
create or replace function app.move_coins(p_user uuid, p_amount bigint, p_reason text, p_ref text default null)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_coins bigint;
begin
  select coins into v_coins from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if v_coins + p_amount < 0 then raise exception 'insufficient_coins'; end if;
  update public.profiles set coins = coins + p_amount where id = p_user returning coins into v_coins;
  insert into public.coin_transactions (user_id, amount, reason, ref) values (p_user, p_amount, p_reason, p_ref);
  return v_coins;
end $$;

-- ---------------------------------------------------------------- session / first login
-- Called by the app right after Google sign-in. Creates the profile the first time an invited e-mail logs in.
create or replace function public.my_session() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_profile public.profiles;
  v_base text;
  v_nick text;
  v_try int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.allowed_emails where email = v_email) then
    return jsonb_build_object('user_id', v_uid, 'email', v_email, 'access', 'not_invited');
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    v_base := left(regexp_replace(split_part(v_email, '@', 1), '[^A-Za-z0-9_]', '', 'g'), 14);
    if length(v_base) < 3 then v_base := 'jogador'; end if;
    v_nick := v_base;
    while exists (select 1 from public.profiles where nickname = v_nick) loop
      v_try := v_try + 1;
      v_nick := v_base || v_try::text;
    end loop;
    insert into public.profiles (id, email, nickname, avatar_url)
    values (v_uid, v_email, v_nick, auth.jwt() -> 'user_metadata' ->> 'avatar_url')
    returning * into v_profile;
    insert into public.coin_transactions (user_id, amount, reason) values (v_uid, v_profile.coins, 'boas-vindas');
  end if;

  return jsonb_build_object(
    'user_id', v_uid, 'email', v_email,
    'access', case when v_profile.banned then 'banned' else 'ok' end
  );
end $$;

-- ---------------------------------------------------------------- row level security
alter table public.allowed_emails      enable row level security;
alter table public.cards               enable row level security;
alter table public.titles              enable row level security;
alter table public.profiles            enable row level security;
alter table public.inventory           enable row level security;
alter table public.pulls               enable row level security;
alter table public.coin_transactions   enable row level security;
alter table public.items               enable row level security;
alter table public.user_items          enable row level security;
alter table public.active_effects      enable row level security;
alter table public.user_titles         enable row level security;
alter table public.suggestions         enable row level security;
alter table public.feed_events         enable row level security;
alter table public.settings            enable row level security;
alter table public.daily_claims        enable row level security;
alter table public.game_sessions       enable row level security;
alter table public.daily_game_earnings enable row level security;

-- Nobody writes from the client. Reads are limited to what each policy allows.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, public;
revoke all on all functions in schema app from anon, authenticated, public;
grant usage on schema public to authenticated;
grant usage on schema app to authenticated; -- policies call app.is_member()
grant execute on function app.is_member(), app.is_admin() to authenticated;

grant select on
  public.profiles, public.inventory, public.pulls, public.coin_transactions,
  public.items, public.user_items, public.active_effects, public.titles, public.user_titles,
  public.suggestions, public.feed_events, public.settings, public.daily_claims,
  public.daily_game_earnings, public.allowed_emails, public.cards
to authenticated;

-- own rows
create policy own_profile         on public.profiles            for select to authenticated using (id = auth.uid());
create policy own_inventory       on public.inventory           for select to authenticated using (user_id = auth.uid() and app.is_member());
create policy own_pulls           on public.pulls               for select to authenticated using (user_id = auth.uid() and app.is_member());
create policy own_coins           on public.coin_transactions   for select to authenticated using (user_id = auth.uid() and app.is_member());
create policy own_items           on public.user_items          for select to authenticated using (user_id = auth.uid() and app.is_member());
create policy own_effects         on public.active_effects      for select to authenticated using (user_id = auth.uid() and app.is_member());
create policy own_daily           on public.daily_claims        for select to authenticated using (user_id = auth.uid() and app.is_member());
create policy own_game_earnings   on public.daily_game_earnings for select to authenticated using (user_id = auth.uid() and app.is_member());
create policy own_or_admin_sugg   on public.suggestions         for select to authenticated using ((user_id = auth.uid() and app.is_member()) or app.is_admin());

-- shared with every member
create policy member_items        on public.items       for select to authenticated using (active and app.is_member());
create policy member_titles       on public.titles      for select to authenticated using (active and app.is_member());
create policy member_user_titles  on public.user_titles for select to authenticated using (app.is_member());
create policy member_feed         on public.feed_events for select to authenticated using (app.is_member());
create policy member_settings     on public.settings    for select to authenticated using (app.is_member());

-- admin only (card text stays secret: members read cards only through RPCs that check ownership)
create policy admin_cards         on public.cards          for select to authenticated using (app.is_admin());
create policy admin_allowed       on public.allowed_emails for select to authenticated using (app.is_admin());
-- game_sessions has no policy at all: its state holds the memory board and reflex delay.

grant execute on function public.my_session() to authenticated;

-- ===== migrations/20261117000003_economy.sql =====
-- SorteSenai: cards, the roll, coins, shop, titles, profile and social reads.
-- Every function: SECURITY DEFINER, fixed search_path, membership checked first.

-- ---------------------------------------------------------------- json shapes
create or replace function app.card_full(c public.cards) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', c.id, 'number', c.number, 'odds_n', c.odds_n, 'active', c.active,
                            'title', c.title, 'joke', c.joke, 'image_path', c.image_path)
$$;

-- What a player sees of a card they do not own: never the title, joke or image.
create or replace function app.card_locked(c public.cards) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', c.id, 'number', c.number, 'odds_n', c.odds_n, 'active', c.active)
$$;

create or replace function app.player_summary(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar_url', p.avatar_url,
                            'title_name', t.name, 'avatar_card', (select app.card_full(c) from public.cards c where c.id = p.avatar_card_id))
  from public.profiles p left join public.titles t on t.id = p.title_id
  where p.id = p_user
$$;

-- ---------------------------------------------------------------- luck
create or replace function app.luck_state(p_user uuid)
returns table (potions numeric, streak numeric, effective numeric, cap numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s jsonb := app.settings();
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user;
  select coalesce(exp(sum(ln(e.multiplier))), 1) into potions
  from public.active_effects e
  where e.user_id = p_user
    and (e.expires_at is null or e.expires_at > now())
    and (e.pulls_left is null or e.pulls_left > 0);
  streak := case
    when v_profile.last_pull_at is not null
     and now() - v_profile.last_pull_at <= make_interval(secs => (s->>'streak_window_seconds')::int)
    then v_profile.streak else 1 end;
  cap := (s->>'luck_cap')::numeric;
  effective := least(cap, potions * streak);
  return next;
end $$;

create or replace function public.get_luck() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); l record;
begin
  select * into l from app.luck_state(v_uid);
  return jsonb_build_object('potions', l.potions, 'streak', l.streak, 'effective', l.effective, 'cap', l.cap,
    'effects', coalesce((select jsonb_agg(jsonb_build_object('item_id', e.item_id, 'name', i.name, 'multiplier', e.multiplier,
                                                              'expires_at', e.expires_at, 'pulls_left', e.pulls_left))
                         from public.active_effects e join public.items i on i.id = e.item_id
                         where e.user_id = v_uid and (e.expires_at is null or e.expires_at > now())
                           and (e.pulls_left is null or e.pulls_left > 0)), '[]'));
end $$;

-- ---------------------------------------------------------------- titles
-- Unlocks every earned title whose condition now holds. Returns the newly unlocked ones.
create or replace function app.check_titles(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.titles;
  ok boolean;
  v_new jsonb := '[]';
  v_total int;
  v_owned int;
begin
  for t in select * from public.titles
           where active and condition->>'type' <> 'manual'
             and id not in (select title_id from public.user_titles where user_id = p_user)
  loop
    if t.condition->>'type' = 'collection_pct' then
      select count(*) into v_total from public.cards where active;
      select count(*) into v_owned from public.inventory i join public.cards c on c.id = i.card_id
       where i.user_id = p_user and i.quantity > 0 and c.active;
      ok := v_total > 0 and v_owned * 100.0 / v_total >= (t.condition->>'pct')::numeric;
    else
      ok := case t.condition->>'type'
        when 'pulled_at_least' then exists (select 1 from public.pulls where user_id = p_user and odds_n_at_pull >= (t.condition->>'odds_n')::bigint)
        when 'pull_count' then (select count(*) from public.pulls where user_id = p_user) >= (t.condition->>'count')::int
        when 'game_coins' then (select coalesce(sum(earned), 0) from public.daily_game_earnings where user_id = p_user and game = t.condition->>'game') >= (t.condition->>'coins')::bigint
        else false end;
    end if;
    if ok then
      insert into public.user_titles (user_id, title_id, source) values (p_user, t.id, 'earned');
      v_new := v_new || jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description);
    end if;
  end loop;
  return v_new;
end $$;

-- ---------------------------------------------------------------- the roll
create or replace function public.pull() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  s jsonb := app.settings();
  v_profile public.profiles;
  v_streak numeric;
  v_potions numeric;
  v_luck numeric;
  v_card public.cards;
  c public.cards;
  v_coins bigint;
  v_qty int;
  v_is_new boolean;
  v_feed boolean;
begin
  -- lock the player: simultaneous rolls run one after the other
  select * into v_profile from public.profiles where id = v_uid for update;
  v_coins := app.move_coins(v_uid, -(s->>'pull_cost')::bigint, 'roletada');

  -- streak: rolls in quick succession build a small bonus
  if v_profile.last_pull_at is not null
     and now() - v_profile.last_pull_at <= make_interval(secs => (s->>'streak_window_seconds')::int) then
    v_streak := least((s->>'streak_cap')::numeric, v_profile.streak + (s->>'streak_step')::numeric);
  else
    v_streak := 1;
  end if;
  select l.potions into v_potions from app.luck_state(v_uid) l;
  v_luck := least((s->>'luck_cap')::numeric, v_potions * v_streak);

  -- rarest first; each card hits with min(1, luck / N); fallback to the most common
  for c in select * from public.cards where active order by odds_n desc loop
    if app.rand() < least(1, v_luck / c.odds_n) then
      v_card := c;
      exit;
    end if;
  end loop;
  if v_card.id is null then
    select * into v_card from public.cards where active order by odds_n asc limit 1;
    if not found then raise exception 'invalid'; end if;
  end if;

  update public.profiles set streak = v_streak, last_pull_at = now() where id = v_uid;

  -- potions that last N rolls lose one; spent and expired effects go away
  update public.active_effects set pulls_left = pulls_left - 1 where user_id = v_uid and pulls_left > 0;
  delete from public.active_effects where user_id = v_uid and (pulls_left = 0 or expires_at <= now());

  v_is_new := not exists (select 1 from public.inventory where user_id = v_uid and card_id = v_card.id and quantity > 0);
  insert into public.inventory (user_id, card_id, quantity) values (v_uid, v_card.id, 1)
  on conflict (user_id, card_id) do update set quantity = public.inventory.quantity + 1
  returning quantity into v_qty;

  insert into public.pulls (user_id, card_id, odds_n_at_pull, luck_used) values (v_uid, v_card.id, v_card.odds_n, v_luck);

  v_feed := v_card.odds_n >= (s->>'feed_min_odds')::bigint;
  if v_feed then
    insert into public.feed_events (user_id, card_id, odds_n_at_pull, luck) values (v_uid, v_card.id, v_card.odds_n, v_luck);
  end if;

  return jsonb_build_object('card', app.card_full(v_card), 'odds_n_at_pull', v_card.odds_n, 'luck_used', v_luck,
    'is_new', v_is_new, 'quantity', v_qty, 'coins_after', v_coins, 'feed_posted', v_feed,
    'titles_unlocked', app.check_titles(v_uid));
end $$;

-- ---------------------------------------------------------------- collection
create or replace function public.get_collection() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return coalesce((
    select jsonb_agg(case when coalesce(i.quantity, 0) > 0
             then jsonb_build_object('owned', true, 'quantity', i.quantity, 'card', app.card_full(c))
             else jsonb_build_object('owned', false, 'quantity', 0, 'card', app.card_locked(c)) end
           order by c.odds_n, c.number)
    from public.cards c
    left join public.inventory i on i.card_id = c.id and i.user_id = v_uid
    where c.active or coalesce(i.quantity, 0) > 0
  ), '[]');
end $$;

create or replace function public.get_card_detail(p_card uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_card public.cards;
  v_qty int;
begin
  select * into v_card from public.cards where id = p_card;
  if not found then raise exception 'not_found'; end if;
  select quantity into v_qty from public.inventory where user_id = v_uid and card_id = p_card;
  if coalesce(v_qty, 0) = 0 and not v_card.active then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'entry', case when coalesce(v_qty, 0) > 0
      then jsonb_build_object('owned', true, 'quantity', v_qty, 'card', app.card_full(v_card))
      else jsonb_build_object('owned', false, 'quantity', 0, 'card', app.card_locked(v_card)) end,
    'owners', coalesce((select jsonb_agg(app.player_summary(i.user_id))
                        from public.inventory i where i.card_id = p_card and i.quantity > 0), '[]'));
end $$;

create or replace function public.recycle(p_card uuid, p_quantity int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  s jsonb := app.settings();
  v_have int;
  v_odds bigint;
  v_gain bigint;
begin
  if p_quantity is null or p_quantity < 1 then raise exception 'invalid'; end if;
  select i.quantity, c.odds_n into v_have, v_odds
  from public.inventory i join public.cards c on c.id = i.card_id
  where i.user_id = v_uid and i.card_id = p_card for update of i;
  if not found or v_have < p_quantity then raise exception 'invalid'; end if;
  v_gain := round((s->>'recycle_base')::numeric * power(2::numeric, log(10, v_odds::numeric) - 1)) * p_quantity;
  update public.inventory set quantity = quantity - p_quantity where user_id = v_uid and card_id = p_card;
  return jsonb_build_object('gained', v_gain, 'coins_after', app.move_coins(v_uid, v_gain, 'reciclagem', p_card::text));
end $$;

-- ---------------------------------------------------------------- daily reward
create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_amount bigint := (app.settings()->>'daily_reward')::bigint;
begin
  insert into public.daily_claims (user_id, day, amount) values (v_uid, app.today(), v_amount)
  on conflict do nothing;
  if not found then raise exception 'already_claimed'; end if;
  return jsonb_build_object('coins_after', app.move_coins(v_uid, v_amount, 'bonus diario'),
                            'titles_unlocked', app.check_titles(v_uid));
end $$;

create or replace function public.get_daily_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return jsonb_build_object(
    'claimed_today', exists (select 1 from public.daily_claims where user_id = v_uid and day = app.today()),
    'next_at', ((app.today() + 1)::timestamp at time zone 'America/Sao_Paulo'));
end $$;

-- ---------------------------------------------------------------- shop
create or replace function public.buy_item(p_item uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_item public.items;
  v_coins bigint;
begin
  select * into v_item from public.items where id = p_item and active;
  if not found then raise exception 'not_found'; end if;
  v_coins := app.move_coins(v_uid, -v_item.price, 'loja', p_item::text);
  insert into public.user_items (user_id, item_id, quantity) values (v_uid, p_item, 1)
  on conflict (user_id, item_id) do update set quantity = public.user_items.quantity + 1;
  return jsonb_build_object('coins_after', v_coins);
end $$;

create or replace function public.use_potion(p_item uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_item public.items;
  v_have int;
  v_effect public.active_effects;
begin
  select * into v_item from public.items where id = p_item and type = 'potion';
  if not found then raise exception 'not_found'; end if;
  select quantity into v_have from public.user_items where user_id = v_uid and item_id = p_item for update;
  if coalesce(v_have, 0) < 1 then raise exception 'invalid'; end if;
  update public.user_items set quantity = quantity - 1 where user_id = v_uid and item_id = p_item;
  insert into public.active_effects (user_id, item_id, multiplier, expires_at, pulls_left)
  values (v_uid, p_item, v_item.multiplier,
          case when v_item.duration_minutes is not null then now() + make_interval(mins => v_item.duration_minutes) end,
          v_item.duration_pulls)
  returning * into v_effect;
  return jsonb_build_object('item_id', p_item, 'name', v_item.name, 'multiplier', v_effect.multiplier,
                            'expires_at', v_effect.expires_at, 'pulls_left', v_effect.pulls_left);
end $$;

create or replace function public.buy_title(p_title uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_title public.titles;
  v_coins bigint;
begin
  select * into v_title from public.titles where id = p_title and active and price is not null;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.user_titles where user_id = v_uid and title_id = p_title) then raise exception 'invalid'; end if;
  v_coins := app.move_coins(v_uid, -v_title.price, 'titulo', p_title::text);
  insert into public.user_titles (user_id, title_id, source) values (v_uid, p_title, 'bought');
  return jsonb_build_object('coins_after', v_coins);
end $$;

-- ---------------------------------------------------------------- profile
-- p: { nickname?, bio?, avatar_url?, banner_url?, avatar_card_id?, title_id?, showcase? }
create or replace function public.update_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_showcase uuid[];
  v_card uuid;
begin
  if p ? 'avatar_card_id' and p->>'avatar_card_id' is not null and not exists (
       select 1 from public.inventory where user_id = v_uid and card_id = (p->>'avatar_card_id')::uuid and quantity > 0) then
    raise exception 'invalid';
  end if;
  if p ? 'title_id' and p->>'title_id' is not null and not exists (
       select 1 from public.user_titles where user_id = v_uid and title_id = (p->>'title_id')::uuid) then
    raise exception 'invalid';
  end if;
  if p ? 'showcase' then
    select coalesce(array_agg(x::uuid), '{}') into v_showcase from jsonb_array_elements_text(p->'showcase') x;
    foreach v_card in array v_showcase loop
      if not exists (select 1 from public.inventory where user_id = v_uid and card_id = v_card and quantity > 0) then
        raise exception 'invalid';
      end if;
    end loop;
  end if;
  if (p ? 'avatar_url' and length(p->>'avatar_url') > 500) or (p ? 'banner_url' and length(p->>'banner_url') > 500) then
    raise exception 'invalid';
  end if;

  begin
    update public.profiles set
      nickname       = coalesce(p->>'nickname', nickname),
      bio            = coalesce(p->>'bio', bio),
      avatar_url     = case when p ? 'avatar_url' then p->>'avatar_url' else avatar_url end,
      banner_url     = case when p ? 'banner_url' then p->>'banner_url' else banner_url end,
      avatar_card_id = case when p ? 'avatar_card_id' then (p->>'avatar_card_id')::uuid else avatar_card_id end,
      title_id       = case when p ? 'title_id' then (p->>'title_id')::uuid else title_id end,
      showcase       = coalesce(v_showcase, showcase)
    where id = v_uid;
  exception
    when unique_violation then raise exception 'nickname_taken';
    when check_violation then raise exception 'invalid';
  end;
  return (select to_jsonb(pr) - 'email' from public.profiles pr where id = v_uid);
end $$;

create or replace function public.is_nickname_available(p_nick text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.require_member() is not null
     and p_nick ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(nickname) = lower(p_nick) and id <> auth.uid())
$$;

create or replace function public.get_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_viewer uuid := app.require_member();
  v_p public.profiles;
  v_total int;
begin
  select * into v_p from public.profiles where id = p_user and not banned;
  if not found then raise exception 'not_found'; end if;
  select count(*) into v_total from public.cards where active;
  return jsonb_build_object(
    'profile', app.player_summary(p_user) || jsonb_build_object(
      'bio', v_p.bio, 'banner_url', v_p.banner_url,
      'showcase', coalesce((select jsonb_agg(app.card_full(c) order by array_position(v_p.showcase, c.id))
                            from public.cards c where c.id = any (v_p.showcase)), '[]')),
    'stats', jsonb_build_object(
      'pulls', (select count(*) from public.pulls where user_id = p_user),
      'collection_pct', case when v_total = 0 then 0 else round((select count(*) from public.inventory i join public.cards c on c.id = i.card_id
                                                                where i.user_id = p_user and i.quantity > 0 and c.active) * 100.0 / v_total, 1) end,
      'rarest_odds', (select max(odds_n_at_pull) from public.pulls where user_id = p_user)),
    'titles', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'unlocked_at', ut.unlocked_at))
                        from public.user_titles ut join public.titles t on t.id = ut.title_id where ut.user_id = p_user), '[]'),
    'is_me', p_user = v_viewer);
end $$;

-- ---------------------------------------------------------------- social
create or replace function public.get_feed(p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_member();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'player', app.player_summary(f.user_id), 'card', app.card_full(c),
                                        'odds_n_at_pull', f.odds_n_at_pull, 'luck', f.luck, 'created_at', f.created_at)
                     order by f.created_at desc)
    from (select * from public.feed_events order by created_at desc limit least(greatest(p_limit, 1), 100)) f
    join public.cards c on c.id = f.card_id), '[]');
end $$;

create or replace function public.get_ranking(p_kind text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_total int;
begin
  perform app.require_member();
  if p_kind not in ('coins', 'collection', 'rarest') then raise exception 'invalid'; end if;
  select count(*) into v_total from public.cards where active;
  return coalesce((
    select jsonb_agg(jsonb_build_object('position', r.pos, 'player', app.player_summary(r.id), 'value', r.value) order by r.pos)
    from (
      select x.id, x.value, row_number() over (order by x.value desc, x.nickname) as pos
      from (
        select p.id, p.nickname,
          case p_kind
            when 'coins' then p.coins::numeric
            when 'collection' then case when v_total = 0 then 0 else round((select count(*) from public.inventory i join public.cards c on c.id = i.card_id
                                                                          where i.user_id = p.id and i.quantity > 0 and c.active) * 100.0 / v_total, 1) end
            else (select max(odds_n_at_pull) from public.pulls where user_id = p.id)::numeric end as value
        from public.profiles p join public.allowed_emails a on a.email = p.email
        where not p.banned
      ) x where x.value is not null
      limit 100
    ) r), '[]');
end $$;

create or replace function public.create_suggestion(p_text text, p_image_path text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_row public.suggestions;
begin
  begin
    insert into public.suggestions (user_id, text, image_path) values (v_uid, trim(p_text), p_image_path) returning * into v_row;
  exception when check_violation then raise exception 'invalid';
  end;
  return to_jsonb(v_row);
end $$;

grant execute on function
  public.get_luck(), public.pull(), public.get_collection(), public.get_card_detail(uuid),
  public.recycle(uuid, int), public.claim_daily(), public.get_daily_status(),
  public.buy_item(uuid), public.use_potion(uuid), public.buy_title(uuid),
  public.update_profile(jsonb), public.is_nickname_available(text), public.get_profile(uuid),
  public.get_feed(int), public.get_ranking(text), public.create_suggestion(text, text)
to authenticated;

-- ===== migrations/20261117000004_games.sql =====
-- SorteSenai: minigames. The server keeps every secret (reels, memory board, reflex delay)
-- and its own clock. A daily coin cap per game limits what any trick can earn.

-- Credits a game prize up to what is left of today's cap. Never errors when the cap is reached.
create or replace function app.pay_game(p_user uuid, p_game text, p_amount bigint, out paid bigint, out capped boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit bigint := (app.settings()->'game_daily_limits'->>p_game)::bigint;
  v_earned bigint;
begin
  insert into public.daily_game_earnings (user_id, game, day, earned) values (p_user, p_game, app.today(), 0)
  on conflict do nothing;
  select earned into v_earned from public.daily_game_earnings
   where user_id = p_user and game = p_game and day = app.today() for update;
  paid := greatest(0, least(p_amount, v_limit - v_earned));
  capped := paid < greatest(p_amount, 0);
  if paid > 0 then
    update public.daily_game_earnings set earned = earned + paid where user_id = p_user and game = p_game and day = app.today();
    perform app.move_coins(p_user, paid, 'jogo:' || p_game);
  end if;
end $$;

create or replace function app.open_session(p_user uuid, p_id uuid, p_game text) returns public.game_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.game_sessions;
begin
  select * into v_s from public.game_sessions where id = p_id and user_id = p_user and game = p_game for update;
  if not found or v_s.finished_at is not null or clock_timestamp() - v_s.started_at > interval '10 minutes' then
    raise exception 'session_expired';
  end if;
  return v_s;
end $$;

create or replace function public.get_game_limits() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); s jsonb := app.settings();
begin
  return (select jsonb_object_agg(g, jsonb_build_object(
            'limit', (s->'game_daily_limits'->>g)::bigint,
            'earned_today', coalesce((select earned from public.daily_game_earnings where user_id = v_uid and game = g and day = app.today()), 0)))
          from unnest(array['slots','memory','reflex','clicker']) g);
end $$;

-- ---------------------------------------------------------------- slots
create or replace function public.play_slots(p_bet bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  s jsonb := app.settings();
  v_symbols text[] := array['grampeador','cafe','pendrive','cracha','apostila','estrela'];
  r text[];
  v_prize bigint := 0;
  v_pay record;
begin
  if not (s->'slots_bets') @> to_jsonb(p_bet) then raise exception 'invalid'; end if;
  perform app.move_coins(v_uid, -p_bet, 'jogo:slots aposta');
  r := array[v_symbols[1 + floor(app.rand() * 6)::int], v_symbols[1 + floor(app.rand() * 6)::int], v_symbols[1 + floor(app.rand() * 6)::int]];
  if r[1] = r[2] and r[2] = r[3] then
    v_prize := p_bet * case when r[1] = 'estrela' then 50 else 10 end;
  elsif r[1] = r[2] or r[2] = r[3] or r[1] = r[3] then
    v_prize := p_bet * 2;
  end if;
  -- the bet always comes back with a win; the daily cap only limits the profit
  if v_prize > 0 then
    perform app.move_coins(v_uid, p_bet, 'jogo:slots devolucao');
    select * into v_pay from app.pay_game(v_uid, 'slots', v_prize - p_bet);
  else
    select 0::bigint as paid, false as capped into v_pay;
  end if;
  return jsonb_build_object('reels', to_jsonb(r), 'payout', case when v_prize > 0 then p_bet + v_pay.paid else 0 end,
    'capped', v_pay.capped, 'coins_after', (select coins from public.profiles where id = v_uid));
end $$;

-- ---------------------------------------------------------------- memory
create or replace function public.start_memory() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_board jsonb; v_id uuid;
begin
  select jsonb_agg(sym order by app.rand()) into v_board
  from (select unnest(array['a','b','c','d','e','f','g','h']) sym union all select unnest(array['a','b','c','d','e','f','g','h'])) x;
  insert into public.game_sessions (user_id, game, state)
  values (v_uid, 'memory', jsonb_build_object('board', v_board, 'matched', '[]'::jsonb, 'pending', null, 'moves', 0))
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'size', 16);
end $$;

create or replace function public.flip_memory(p_session uuid, p_index int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_s public.game_sessions := app.open_session(v_uid, p_session, 'memory');
  st jsonb := v_s.state;
  v_sym text;
  v_pending int := (st->>'pending')::int;
  v_matched jsonb := null;
  v_moves int := (st->>'moves')::int;
  v_done boolean := false;
  v_pay record;
  v_paid bigint;
begin
  if p_index is null or p_index < 0 or p_index > 15 or (st->'matched') @> to_jsonb(p_index) or v_pending = p_index then
    raise exception 'invalid';
  end if;
  v_sym := st->'board'->>p_index;
  if v_pending is null then
    st := jsonb_set(st, '{pending}', to_jsonb(p_index));
  else
    v_moves := v_moves + 1;
    st := jsonb_set(jsonb_set(st, '{moves}', to_jsonb(v_moves)), '{pending}', 'null');
    if st->'board'->>v_pending = v_sym then
      v_matched := jsonb_build_array(v_pending, p_index);
      st := jsonb_set(st, '{matched}', (st->'matched') || v_matched);
      v_done := jsonb_array_length(st->'matched') = 16;
    end if;
  end if;
  update public.game_sessions set state = st, finished_at = case when v_done then clock_timestamp() end where id = p_session;
  if v_done then
    select * into v_pay from app.pay_game(v_uid, 'memory', greatest(10, 120 - 5 * (v_moves - 8)));
    v_paid := v_pay.paid;
    update public.game_sessions set reward = v_paid where id = p_session;
    perform app.check_titles(v_uid);
  end if;
  return jsonb_build_object('index', p_index, 'symbol', v_sym, 'matched', v_matched, 'finished', v_done, 'moves', v_moves,
    'payout', v_paid,
    'coins_after', case when v_done then (select coins from public.profiles where id = v_uid) end);
end $$;

-- ---------------------------------------------------------------- reflex
create or replace function public.start_reflex() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_delay int := 1500 + floor(app.rand() * 3500)::int; v_id uuid;
begin
  insert into public.game_sessions (user_id, game, state) values (v_uid, 'reflex', jsonb_build_object('delay_ms', v_delay))
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'delay_ms', v_delay);
end $$;

-- The reaction time is measured by the server clock, not sent by the browser.
create or replace function public.finish_reflex(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_s public.game_sessions := app.open_session(v_uid, p_session, 'reflex');
  v_ms int := (extract(epoch from clock_timestamp() - v_s.started_at) * 1000)::int - (v_s.state->>'delay_ms')::int;
  v_valid boolean := v_ms >= 120 and v_ms <= 5000;
  v_pay record;
begin
  if v_valid then
    select * into v_pay from app.pay_game(v_uid, 'reflex', greatest(5, round(60 - v_ms / 10.0))::bigint);
  else
    select 0::bigint as paid, false as capped into v_pay;
  end if;
  update public.game_sessions set finished_at = clock_timestamp(), reward = v_pay.paid where id = p_session;
  return jsonb_build_object('valid', v_valid, 'reaction_ms', v_ms, 'payout', v_pay.paid, 'capped', v_pay.capped,
    'coins_after', (select coins from public.profiles where id = v_uid));
end $$;

-- ---------------------------------------------------------------- quick clicks
create or replace function public.start_clicker() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_id uuid;
begin
  insert into public.game_sessions (user_id, game) values (v_uid, 'clicker') returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'duration_ms', 10000);
end $$;

create or replace function public.finish_clicker(p_session uuid, p_clicks int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_s public.game_sessions := app.open_session(v_uid, p_session, 'clicker');
  v_ms int := (extract(epoch from clock_timestamp() - v_s.started_at) * 1000)::int;
  v_valid boolean := v_ms >= 10000 and v_ms <= 60000 and p_clicks between 0 and 150;
  v_pay record;
begin
  if v_valid then
    select * into v_pay from app.pay_game(v_uid, 'clicker', p_clicks);
  else
    select 0::bigint as paid, false as capped into v_pay;
  end if;
  update public.game_sessions set finished_at = clock_timestamp(), reward = v_pay.paid where id = p_session;
  return jsonb_build_object('valid', v_valid, 'clicks', p_clicks, 'payout', v_pay.paid, 'capped', v_pay.capped,
    'coins_after', (select coins from public.profiles where id = v_uid));
end $$;

grant execute on function
  public.get_game_limits(), public.play_slots(bigint), public.start_memory(), public.flip_memory(uuid, int),
  public.start_reflex(), public.finish_reflex(uuid), public.start_clicker(), public.finish_clicker(uuid, int)
to authenticated;

-- ===== migrations/20261117000005_admin.sql =====
-- SorteSenai: admin panel functions, default settings and storage rules.

insert into public.settings (id, value) values (true, jsonb_build_object(
  'pull_cost', 10, 'daily_reward', 200, 'luck_cap', 1000000,
  'streak_window_seconds', 8, 'streak_step', 0.05, 'streak_cap', 2,
  'feed_min_odds', 1000000, 'recycle_base', 5,
  'game_daily_limits', jsonb_build_object('slots', 500, 'memory', 300, 'reflex', 200, 'clicker', 200),
  'slots_bets', jsonb_build_array(10, 25, 50)
)) on conflict (id) do nothing;

-- ---------------------------------------------------------------- cards and suggestions
create or replace function public.admin_list_cards() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(app.card_full(c) order by c.number) from public.cards c), '[]');
end $$;

-- p: { id?, title, joke, odds_n, image_path? }
create or replace function public.admin_upsert_card(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_admin(); v_card public.cards;
begin
  begin
    if p->>'id' is null then
      insert into public.cards (title, joke, odds_n, image_path, created_by)
      values (trim(p->>'title'), trim(p->>'joke'), (p->>'odds_n')::bigint, p->>'image_path', v_uid)
      returning * into v_card;
    else
      update public.cards set title = trim(p->>'title'), joke = trim(p->>'joke'), odds_n = (p->>'odds_n')::bigint,
        image_path = case when p ? 'image_path' then p->>'image_path' else image_path end
      where id = (p->>'id')::uuid returning * into v_card;
      if not found then raise exception 'not_found'; end if;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid';
  end;
  return app.card_full(v_card);
end $$;

create or replace function public.admin_set_card_active(p_card uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  update public.cards set active = p_active where id = p_card;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_list_suggestions(p_status text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('author', app.player_summary(s.user_id)) order by s.created_at desc)
                   from public.suggestions s where s.status = p_status), '[]');
end $$;

create or replace function public.admin_approve_suggestion(p_id uuid, p_title text, p_joke text, p_odds_n bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.suggestions; v_card jsonb;
begin
  perform app.require_admin();
  select * into v_s from public.suggestions where id = p_id and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  v_card := public.admin_upsert_card(jsonb_build_object('title', p_title, 'joke', p_joke, 'odds_n', p_odds_n, 'image_path', v_s.image_path));
  update public.suggestions set status = 'approved', card_id = (v_card->>'id')::uuid where id = p_id;
  return v_card;
end $$;

create or replace function public.admin_reject_suggestion(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  update public.suggestions set status = 'rejected', admin_note = nullif(trim(p_note), '') where id = p_id and status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------- economy
create or replace function public.admin_update_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_new jsonb; k text;
begin
  perform app.require_admin();
  v_new := app.settings() || p_patch;
  foreach k in array array['pull_cost','daily_reward','luck_cap','streak_window_seconds','streak_cap','feed_min_odds','recycle_base'] loop
    if jsonb_typeof(v_new->k) is distinct from 'number' or (v_new->>k)::numeric <= 0 then raise exception 'invalid'; end if;
  end loop;
  if (v_new->>'streak_step')::numeric < 0 or (v_new->>'streak_cap')::numeric < 1 then raise exception 'invalid'; end if;
  if jsonb_typeof(v_new->'slots_bets') is distinct from 'array' or jsonb_array_length(v_new->'slots_bets') = 0 then raise exception 'invalid'; end if;
  update public.settings set value = v_new where id;
  return v_new;
end $$;

-- p: { id?, name, description, price, multiplier, duration_minutes | duration_pulls, active }
create or replace function public.admin_upsert_item(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.items;
begin
  perform app.require_admin();
  begin
    insert into public.items (id, name, description, price, multiplier, duration_minutes, duration_pulls, active)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'name', coalesce(p->>'description', ''), (p->>'price')::bigint,
            (p->>'multiplier')::numeric, (p->>'duration_minutes')::int, (p->>'duration_pulls')::int, coalesce((p->>'active')::boolean, true))
    on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price,
      multiplier = excluded.multiplier, duration_minutes = excluded.duration_minutes, duration_pulls = excluded.duration_pulls,
      active = excluded.active
    returning * into v_item;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid';
  end;
  return to_jsonb(v_item);
end $$;

-- p: { id?, name, description, condition, price (null = not for sale), active }
create or replace function public.admin_upsert_title(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.titles;
begin
  perform app.require_admin();
  begin
    insert into public.titles (id, name, description, condition, price, active)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'name', coalesce(p->>'description', ''),
            coalesce(p->'condition', '{"type":"manual"}'), (p->>'price')::bigint, coalesce((p->>'active')::boolean, true))
    on conflict (id) do update set name = excluded.name, description = excluded.description, condition = excluded.condition,
      price = excluded.price, active = excluded.active
    returning * into v_t;
  exception when check_violation or not_null_violation or unique_violation or invalid_text_representation then raise exception 'invalid';
  end;
  return to_jsonb(v_t);
end $$;

create or replace function public.admin_grant_title(p_user uuid, p_title uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  insert into public.user_titles (user_id, title_id, source) values (p_user, p_title, 'granted') on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- players and guests
create or replace function public.admin_list_players() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
            'cards_owned', (select count(*) from public.inventory i where i.user_id = p.id and i.quantity > 0)) order by p.nickname)
          from public.profiles p), '[]');
end $$;

create or replace function public.admin_adjust_coins(p_user uuid, p_amount bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_amount = 0 or coalesce(trim(p_reason), '') = '' then raise exception 'invalid'; end if;
  begin
    return jsonb_build_object('coins_after', app.move_coins(p_user, p_amount, 'admin: ' || trim(p_reason)));
  exception when raise_exception then
    if sqlerrm = 'insufficient_coins' then raise exception 'invalid'; end if;
    raise;
  end;
end $$;

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := app.require_admin();
begin
  if p_user = v_me then raise exception 'invalid'; end if; -- an admin cannot lock themself out
  update public.profiles set banned = p_banned where id = p_user;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_add_allowed_email(p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_admin();
begin
  begin
    insert into public.allowed_emails (email, added_by) values (lower(trim(p_email)), v_uid) on conflict do nothing;
  exception when check_violation then raise exception 'invalid';
  end;
end $$;

create or replace function public.admin_remove_allowed_email(p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  delete from public.allowed_emails where email = lower(trim(p_email));
end $$;

grant execute on function
  public.admin_list_cards(), public.admin_upsert_card(jsonb), public.admin_set_card_active(uuid, boolean),
  public.admin_list_suggestions(text), public.admin_approve_suggestion(uuid, text, text, bigint), public.admin_reject_suggestion(uuid, text),
  public.admin_update_settings(jsonb), public.admin_upsert_item(jsonb), public.admin_upsert_title(jsonb), public.admin_grant_title(uuid, uuid),
  public.admin_list_players(), public.admin_adjust_coins(uuid, bigint, text), public.admin_set_banned(uuid, boolean),
  public.admin_add_allowed_email(text), public.admin_remove_allowed_email(text)
to authenticated;

-- ---------------------------------------------------------------- storage (Supabase only)
-- Buckets: cards (private; a player may read a card image only if they own that card or it hit the mural),
-- profile (avatars and banners; each player writes only inside their own folder <uid>/),
-- suggestions (private; author and admins read).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('cards', 'cards', false, 2097152, array['image/jpeg','image/png','image/webp']),
      ('profile', 'profile', false, 2097152, array['image/jpeg','image/png','image/webp']),
      ('suggestions', 'suggestions', false, 2097152, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy cards_read on storage.objects for select to authenticated using (
      bucket_id = 'cards' and (app.is_admin() or exists (
        select 1 from public.cards c join public.inventory i on i.card_id = c.id
        where c.image_path = storage.objects.name and i.user_id = auth.uid() and i.quantity > 0)
      or (app.is_member() and exists (select 1 from public.feed_events f join public.cards c on c.id = f.card_id where c.image_path = storage.objects.name))))$p$;
    execute $p$create policy cards_admin_write on storage.objects for all to authenticated
      using (bucket_id = 'cards' and app.is_admin()) with check (bucket_id = 'cards' and app.is_admin())$p$;
    execute $p$create policy profile_read on storage.objects for select to authenticated using (bucket_id = 'profile' and app.is_member())$p$;
    execute $p$create policy profile_write on storage.objects for all to authenticated
      using (bucket_id = 'profile' and app.is_member() and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'profile' and app.is_member() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy suggestions_read on storage.objects for select to authenticated using (
      bucket_id = 'suggestions' and (app.is_admin() or (storage.foldername(name))[1] = auth.uid()::text))$p$;
    execute $p$create policy suggestions_write on storage.objects for insert to authenticated
      with check (bucket_id = 'suggestions' and app.is_member() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- Realtime: the mural listens to new feed_events (Supabase only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feed_events;
  end if;
end $$;

-- ===== seed.sql =====
-- SorteSenai: sample content for development. Jokes marked [exemplo] are placeholders
-- for the class's real inside jokes. No real e-mails here: add guests with
--   insert into public.allowed_emails (email) values ('voce@gmail.com');
-- and make the first admin after their first login with
--   update public.profiles set role = 'admin' where email = 'voce@gmail.com';

insert into public.cards (title, joke, odds_n) values
  ('O café da cantina',      '[exemplo] Ninguém sabe se é café ou chá.', 12),
  ('A cadeira que balança',  '[exemplo] Sempre sobra pra quem chega atrasado.', 18),
  ('Bom dia, grupo',         '[exemplo] Mandado às 5h47 por alguém.', 25),
  ('Fila do micro-ondas',    '[exemplo] Doze marmitas, um micro-ondas.', 35),
  ('O ar-condicionado',      '[exemplo] Ou Ártico, ou Saara.', 60),
  ('Wi-Fi do bloco B',       '[exemplo] Conecta, mas só na janela.', 450),
  ('O projetor',             '[exemplo] Liga no terceiro tapa.', 1200),
  ('A senha do Wi-Fi',       '[exemplo] Mudou de novo e ninguém avisou.', 3000),
  ('O apelido do Léo',       '[exemplo] Ninguém lembra de onde veio.', 9000),
  ('O pendrive perdido',     '[exemplo] Tinha o TCC de três pessoas.', 25000),
  ('A chamada oral',         '[exemplo] Todo mundo olhando pro chão.', 80000),
  ('O intervalo de 2 minutos','[exemplo] Ninguém volta a tempo.', 150000),
  ('A prova surpresa',       '[exemplo] Surpresa para o professor também.', 3000000),
  ('O dia sem aula',         '[exemplo] Ninguém sabia, só o professor.', 40000000),
  ('O grampeador',           '[exemplo] Ele sabe o que fez.', 400000000),
  ('O alarme na prova',      '[exemplo] Tocou bem na última questão.', 2000000000),
  ('A lenda do bloco C',     '[exemplo] Dizem que a aula acabou mais cedo.', 10000000000);

insert into public.items (name, description, price, multiplier, duration_minutes, duration_pulls) values
  ('Gota de sorte',      'Sorte 2× por 10 minutos.',        150,    2,       10,   null),
  ('Frasco azul',        'Sorte 5× por 20 roletadas.',      600,    5,       null, 20),
  ('Garrafa do sábado',  'Sorte 25× por 30 minutos.',       4000,   25,      30,   null),
  ('Lenda engarrafada',  'Sorte 1.000.000× por 1 roletada.', 250000, 1000000, null, 1);

insert into public.titles (name, description, condition, price) values
  ('Primeira roletada', 'Tirou a primeira carta.',              '{"type":"pull_count","count":1}',            null),
  ('100 roletadas',     'Roletou cem vezes.',                   '{"type":"pull_count","count":100}',          null),
  ('Primeira 1/1 mi',   'Tirou uma carta de 1 em 1 milhão.',    '{"type":"pulled_at_least","odds_n":1000000}', null),
  ('Colecionador 30%',  'Tem 30% da coleção.',                  '{"type":"collection_pct","pct":30}',         null),
  ('Viciado no caça-níquel', 'Ganhou 5.000 moedas no caça-níquel.', '{"type":"game_coins","game":"slots","coins":5000}', null),
  ('Mão de ouro',       'Para quem jura que não é sorte.',      '{"type":"manual"}',                          2000),
  ('Rei do caça-níquel','Aparece no ranking e no mural.',       '{"type":"manual"}',                          3500),
  ('Lenda da turma',    'O título mais caro da loja.',          '{"type":"manual"}',                          20000);

-- ===== migrations/20261118000006_open_access.sql =====
-- SorteSenai: no more guest list. Any signed-in account (Google or e-mail) plays.
-- Only a ban keeps someone out. The allowed_emails table stays, unused, so nothing breaks.

create or replace function app.is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and not p.banned)
$$;

create or replace function app.require_member() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'not_authenticated'; end if;
  if v_profile.banned then raise exception 'banned'; end if;
  return v_uid;
end $$;

-- First login of any account creates the profile.
create or replace function public.my_session() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_profile public.profiles;
  v_base text;
  v_nick text;
  v_try int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    v_base := left(regexp_replace(split_part(v_email, '@', 1), '[^A-Za-z0-9_]', '', 'g'), 14);
    if length(v_base) < 3 then v_base := 'jogador'; end if;
    v_nick := v_base;
    while exists (select 1 from public.profiles where nickname = v_nick) loop
      v_try := v_try + 1;
      v_nick := v_base || v_try::text;
    end loop;
    insert into public.profiles (id, email, nickname, avatar_url)
    values (v_uid, v_email, v_nick, auth.jwt() -> 'user_metadata' ->> 'avatar_url')
    returning * into v_profile;
    insert into public.coin_transactions (user_id, amount, reason) values (v_uid, v_profile.coins, 'boas-vindas');
  end if;

  return jsonb_build_object('user_id', v_uid, 'email', v_email,
    'access', case when v_profile.banned then 'banned' else 'ok' end);
end $$;

-- Ranking: every player who is not banned.
create or replace function public.get_ranking(p_kind text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_total int;
begin
  perform app.require_member();
  if p_kind not in ('coins', 'collection', 'rarest') then raise exception 'invalid'; end if;
  select count(*) into v_total from public.cards where active;
  return coalesce((
    select jsonb_agg(jsonb_build_object('position', r.pos, 'player', app.player_summary(r.id), 'value', r.value) order by r.pos)
    from (
      select x.id, x.value, row_number() over (order by x.value desc, x.nickname) as pos
      from (
        select p.id, p.nickname,
          case p_kind
            when 'coins' then p.coins::numeric
            when 'collection' then case when v_total = 0 then 0 else round((select count(*) from public.inventory i join public.cards c on c.id = i.card_id
                                                                          where i.user_id = p.id and i.quantity > 0 and c.active) * 100.0 / v_total, 1) end
            else (select max(odds_n_at_pull) from public.pulls where user_id = p.id)::numeric end as value
        from public.profiles p
        where not p.banned
      ) x where x.value is not null
      limit 100
    ) r), '[]');
end $$;

-- ===== migrations/20261118000007_levels.sql =====
-- SorteSenai: account level. XP comes from what the player already did, so nothing
-- else has to change: pulls, cards found, games finished, slot spins and daily bonuses.
-- Reaching level L pays 50 x L coins, claimed on the profile page.

alter table public.profiles add column if not exists level_claimed int not null default 1;

-- XP needed to reach level L: 50 * L * (L - 1)  ->  L2 = 100, L3 = 300, L4 = 600, L5 = 1000 ...
create or replace function app.level_xp(p_level int) returns bigint
language sql immutable as $$ select 50::bigint * p_level * (p_level - 1) $$;

create or replace function app.level_of(p_xp bigint) returns int
language sql immutable as $$
  select greatest(1, floor((1 + sqrt(1 + 8 * greatest(p_xp, 0) / 100.0)) / 2)::int)
$$;

create or replace function app.xp(p_user uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.pulls where user_id = p_user) * 10
       + (select count(*) from public.inventory where user_id = p_user) * 25
       + (select count(*) from public.game_sessions where user_id = p_user and finished_at is not null) * 15
       + (select count(*) from public.coin_transactions where user_id = p_user and reason = 'jogo:slots aposta') * 5
       + (select count(*) from public.daily_claims where user_id = p_user) * 20
$$;

-- Coins waiting for the levels between what was claimed and the current level.
create or replace function app.level_reward(p_from int, p_to int) returns bigint
language sql immutable as $$
  select coalesce(sum(50::bigint * l), 0) from generate_series(p_from + 1, p_to) l
$$;

create or replace function public.get_level() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_xp bigint := app.xp(v_uid);
  v_level int := app.level_of(v_xp);
  v_claimed int;
begin
  select level_claimed into v_claimed from public.profiles where id = v_uid;
  return jsonb_build_object(
    'xp', v_xp, 'level', v_level,
    'level_start', app.level_xp(v_level), 'next_at', app.level_xp(v_level + 1),
    'reward', app.level_reward(v_claimed, v_level));
end $$;

create or replace function public.claim_level_reward() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_claimed int;
  v_level int;
  v_gain bigint;
begin
  select level_claimed into v_claimed from public.profiles where id = v_uid for update;
  v_level := app.level_of(app.xp(v_uid));
  if v_level <= v_claimed then raise exception 'already_claimed'; end if;
  v_gain := app.level_reward(v_claimed, v_level);
  update public.profiles set level_claimed = v_level where id = v_uid;
  return jsonb_build_object('gained', v_gain, 'level', v_level,
    'coins_after', app.move_coins(v_uid, v_gain, 'nivel ' || v_level));
end $$;

grant execute on function public.get_level(), public.claim_level_reward() to authenticated;

-- ===== migrations/20261118000008_friends.sql =====
-- SorteSenai: friends, other players' collections and the account level everywhere.

-- ---------------------------------------------------------------- friendships
-- One row per pair. 'pending' while the other player has not answered.
create table if not exists public.friendships (
  requester  uuid not null references public.profiles (id) on delete cascade,
  addressee  uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security; -- no policies: only the functions below touch it
revoke all on table public.friendships from anon, authenticated;

-- 'me' | 'friends' | 'outgoing' (I asked) | 'incoming' (they asked) | 'none'
create or replace function app.friend_status(p_me uuid, p_other uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_me = p_other then 'me' else coalesce((
    select case when f.status = 'accepted' then 'friends' when f.requester = p_me then 'outgoing' else 'incoming' end
    from public.friendships f
    where (f.requester = p_me and f.addressee = p_other) or (f.requester = p_other and f.addressee = p_me)
    limit 1), 'none') end
$$;

-- ---------------------------------------------------------------- the level travels with the player
create or replace function app.player_summary(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar_url', p.avatar_url,
                            'title_name', t.name, 'level', app.level_of(app.xp(p.id)),
                            'avatar_card', (select app.card_full(c) from public.cards c where c.id = p.avatar_card_id))
  from public.profiles p left join public.titles t on t.id = p.title_id
  where p.id = p_user
$$;

-- ---------------------------------------------------------------- finding players
-- Empty query lists everyone (the class is small). Never the viewer, never banned players.
create or replace function public.search_players(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_q text := replace(replace(replace(coalesce(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_');
begin
  return coalesce((
    select jsonb_agg(app.player_summary(p.id) || jsonb_build_object('friend', app.friend_status(v_uid, p.id)) order by p.nickname)
    from (select id, nickname from public.profiles
          where not banned and id <> v_uid and (v_q = '' or nickname ilike '%' || v_q || '%')
          order by nickname limit 30) p), '[]');
end $$;

create or replace function public.send_friend_request(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  if p_user is null or p_user = v_uid then raise exception 'invalid'; end if;
  if not exists (select 1 from public.profiles where id = p_user and not banned) then raise exception 'not_found'; end if;
  -- they already asked me: asking back means yes
  update public.friendships set status = 'accepted' where requester = p_user and addressee = v_uid and status = 'pending';
  if not found then
    insert into public.friendships (requester, addressee) values (v_uid, p_user) on conflict do nothing;
  end if;
  return jsonb_build_object('status', app.friend_status(v_uid, p_user));
end $$;

create or replace function public.respond_friend_request(p_user uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  if p_accept then
    update public.friendships set status = 'accepted' where requester = p_user and addressee = v_uid and status = 'pending';
  else
    delete from public.friendships where requester = p_user and addressee = v_uid and status = 'pending';
  end if;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('status', app.friend_status(v_uid, p_user));
end $$;

-- Unfriend, or cancel a request I sent.
create or replace function public.remove_friend(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  delete from public.friendships
  where (requester = v_uid and addressee = p_user) or (requester = p_user and addressee = v_uid);
  return jsonb_build_object('status', app.friend_status(v_uid, p_user));
end $$;

create or replace function public.get_friends() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return jsonb_build_object(
    'friends', coalesce((select jsonb_agg(app.player_summary(o.id) order by o.nickname)
      from public.friendships f
      join public.profiles o on o.id = case when f.requester = v_uid then f.addressee else f.requester end
      where f.status = 'accepted' and v_uid in (f.requester, f.addressee) and not o.banned), '[]'),
    'incoming', coalesce((select jsonb_agg(app.player_summary(f.requester) order by f.created_at desc)
      from public.friendships f join public.profiles o on o.id = f.requester
      where f.addressee = v_uid and f.status = 'pending' and not o.banned), '[]'),
    'outgoing', coalesce((select jsonb_agg(app.player_summary(f.addressee) order by f.created_at desc)
      from public.friendships f join public.profiles o on o.id = f.addressee
      where f.requester = v_uid and f.status = 'pending' and not o.banned), '[]'));
end $$;

-- ---------------------------------------------------------------- what another player has
-- Their owned cards. A card's title, joke and image only show if the viewer owns it too.
create or replace function public.get_player_collection(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_viewer uuid := app.require_member();
begin
  if not exists (select 1 from public.profiles where id = p_user and not banned) then raise exception 'not_found'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('quantity', i.quantity, 'card',
             case when p_user = v_viewer or exists (select 1 from public.inventory v where v.user_id = v_viewer and v.card_id = c.id and v.quantity > 0)
                  then app.card_full(c) else app.card_locked(c) end) order by c.odds_n desc)
    from public.inventory i join public.cards c on c.id = i.card_id
    where i.user_id = p_user and i.quantity > 0), '[]');
end $$;

-- ---------------------------------------------------------------- profile: + level (via summary) + friend status
create or replace function public.get_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_viewer uuid := app.require_member();
  v_p public.profiles;
  v_total int;
begin
  select * into v_p from public.profiles where id = p_user and not banned;
  if not found then raise exception 'not_found'; end if;
  select count(*) into v_total from public.cards where active;
  return jsonb_build_object(
    'profile', app.player_summary(p_user) || jsonb_build_object(
      'bio', v_p.bio, 'banner_url', v_p.banner_url,
      'showcase', coalesce((select jsonb_agg(app.card_full(c) order by array_position(v_p.showcase, c.id))
                            from public.cards c where c.id = any (v_p.showcase)), '[]')),
    'stats', jsonb_build_object(
      'pulls', (select count(*) from public.pulls where user_id = p_user),
      'collection_pct', case when v_total = 0 then 0 else round((select count(*) from public.inventory i join public.cards c on c.id = i.card_id
                                                                where i.user_id = p_user and i.quantity > 0 and c.active) * 100.0 / v_total, 1) end,
      'rarest_odds', (select max(odds_n_at_pull) from public.pulls where user_id = p_user)),
    'titles', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'unlocked_at', ut.unlocked_at))
                        from public.user_titles ut join public.titles t on t.id = ut.title_id where ut.user_id = p_user), '[]'),
    'is_me', p_user = v_viewer,
    'friend', app.friend_status(v_viewer, p_user));
end $$;

-- ---------------------------------------------------------------- ranking: + 'level' (ordered by XP)
create or replace function public.get_ranking(p_kind text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_total int;
begin
  perform app.require_member();
  if p_kind not in ('coins', 'collection', 'rarest', 'level') then raise exception 'invalid'; end if;
  select count(*) into v_total from public.cards where active;
  return coalesce((
    select jsonb_agg(jsonb_build_object('position', r.pos, 'player', app.player_summary(r.id), 'value', r.value) order by r.pos)
    from (
      select x.id, x.value, row_number() over (order by x.value desc, x.nickname) as pos
      from (
        select p.id, p.nickname,
          case p_kind
            when 'coins' then p.coins::numeric
            when 'level' then app.xp(p.id)::numeric
            when 'collection' then case when v_total = 0 then 0 else round((select count(*) from public.inventory i join public.cards c on c.id = i.card_id
                                                                          where i.user_id = p.id and i.quantity > 0 and c.active) * 100.0 / v_total, 1) end
            else (select max(odds_n_at_pull) from public.pulls where user_id = p.id)::numeric end as value
        from public.profiles p
        where not p.banned
      ) x where x.value is not null
      limit 100
    ) r), '[]');
end $$;

-- ---------------------------------------------------------------- who may call what
-- Internal helpers stay internal (players cannot read another player's XP directly).
revoke all on function app.xp(uuid), app.level_of(bigint), app.level_xp(int), app.level_reward(int, int),
                       app.friend_status(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_level(), public.claim_level_reward(), public.search_players(text),
                       public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
                       public.remove_friend(uuid), public.get_friends(), public.get_player_collection(uuid)
  from public, anon;
grant execute on function public.get_level(), public.claim_level_reward(), public.search_players(text),
                          public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
                          public.remove_friend(uuid), public.get_friends(), public.get_player_collection(uuid)
  to authenticated;

-- ===== migrations/20261118000009_admin_cards_coins.sql =====
-- SorteSenai: admin deletes cards and sets a player's exact balance.

-- Removes a card for good. Every copy players own, its rolls and mural posts go with it
-- (foreign keys cascade). Returns the image path so the app can remove the file too.
create or replace function public.admin_delete_card(p_card uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owners int;
  v_image text;
begin
  perform app.require_admin();
  select count(*) into v_owners from public.inventory where card_id = p_card and quantity > 0;
  delete from public.cards where id = p_card returning image_path into v_image;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('owners', v_owners, 'image_path', v_image);
end $$;

-- Sets the balance to an exact amount. The difference goes to the coin history like any other move.
create or replace function public.admin_set_coins(p_user uuid, p_coins bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now bigint;
begin
  perform app.require_admin();
  if p_coins is null or p_coins < 0 or p_coins > 1000000000000 or coalesce(trim(p_reason), '') = '' then
    raise exception 'invalid';
  end if;
  select coins into v_now from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if p_coins = v_now then return jsonb_build_object('coins_after', v_now); end if;
  return jsonb_build_object('coins_after', app.move_coins(p_user, p_coins - v_now, 'admin: ' || trim(p_reason)));
end $$;

revoke all on function public.admin_delete_card(uuid), public.admin_set_coins(uuid, bigint, text) from public, anon;
grant execute on function public.admin_delete_card(uuid), public.admin_set_coins(uuid, bigint, text) to authenticated;

-- ===== migrations/20261118000010_social_missions_event.sql =====
-- SorteSenai: gifts, trades and challenges between friends, daily missions and the weekly event card.

-- ---------------------------------------------------------------- shared helpers
create or replace function app.are_friends(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.friendships
                 where status = 'accepted' and ((requester = p_a and addressee = p_b) or (requester = p_b and addressee = p_a)))
$$;

-- A card as one player may see it: full if they own a copy, else only number and rarity.
create or replace function app.card_for(p_viewer uuid, p_card uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when exists (select 1 from public.inventory where user_id = p_viewer and card_id = c.id and quantity > 0)
              then app.card_full(c) else app.card_locked(c) end
  from public.cards c where c.id = p_card
$$;

-- Moves one copy from a player who keeps at least one (only spares move).
create or replace function app.give_copy(p_from uuid, p_to uuid, p_card uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_qty int;
begin
  select quantity into v_qty from public.inventory where user_id = p_from and card_id = p_card for update;
  if not found or v_qty < 2 then raise exception 'invalid'; end if;
  update public.inventory set quantity = quantity - 1 where user_id = p_from and card_id = p_card;
  insert into public.inventory (user_id, card_id, quantity) values (p_to, p_card, 1)
  on conflict (user_id, card_id) do update set quantity = public.inventory.quantity + 1;
  return v_qty - 1;
end $$;

-- ---------------------------------------------------------------- gifts
create table if not exists public.card_gifts (
  id         bigint generated always as identity primary key,
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  card_id    uuid not null references public.cards (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists card_gifts_to_idx on public.card_gifts (to_user, created_at desc);

create or replace function public.gift_card(p_to uuid, p_card uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_left int;
begin
  if not app.are_friends(v_uid, p_to) then raise exception 'forbidden'; end if;
  v_left := app.give_copy(v_uid, p_to, p_card);
  insert into public.card_gifts (from_user, to_user, card_id) values (v_uid, p_to, p_card);
  return jsonb_build_object('quantity_left', v_left);
end $$;

create or replace function public.get_gifts() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'from', app.player_summary(g.from_user),
                                                       'card', app.card_for(v_uid, g.card_id), 'created_at', g.created_at) order by g.created_at desc)
                   from (select * from public.card_gifts where to_user = v_uid and created_at > now() - interval '30 days'
                         order by created_at desc limit 20) g), '[]');
end $$;

-- ---------------------------------------------------------------- trades
create table if not exists public.trades (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  give_card  uuid not null references public.cards (id) on delete cascade,
  want_card  uuid not null references public.cards (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (give_card <> want_card)
);
create index if not exists trades_to_idx on public.trades (to_user, status);
create index if not exists trades_from_idx on public.trades (from_user, status);

create or replace function app.trade_view(t public.trades, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', t.id, 'status', t.status, 'created_at', t.created_at,
    'from', app.player_summary(t.from_user), 'to', app.player_summary(t.to_user),
    'give', app.card_for(p_viewer, t.give_card), 'want', app.card_for(p_viewer, t.want_card))
$$;

-- I offer a spare of p_give and ask for p_want from a friend.
create or replace function public.propose_trade(p_to uuid, p_give uuid, p_want uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_id uuid;
begin
  if not app.are_friends(v_uid, p_to) then raise exception 'forbidden'; end if;
  if p_give = p_want then raise exception 'invalid'; end if;
  if not exists (select 1 from public.inventory where user_id = v_uid and card_id = p_give and quantity >= 2) then raise exception 'invalid'; end if;
  if not exists (select 1 from public.cards where id = p_want) then raise exception 'not_found'; end if;
  insert into public.trades (from_user, to_user, give_card, want_card) values (v_uid, p_to, p_give, p_want) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end $$;

-- Both sides must still have a spare when the friend says yes; otherwise nothing moves.
create or replace function public.respond_trade(p_trade uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_t public.trades;
begin
  select * into v_t from public.trades where id = p_trade and to_user = v_uid and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if p_accept then
    perform app.give_copy(v_t.from_user, v_t.to_user, v_t.give_card);
    perform app.give_copy(v_t.to_user, v_t.from_user, v_t.want_card);
  end if;
  update public.trades set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now() where id = p_trade;
  return jsonb_build_object('id', p_trade, 'status', case when p_accept then 'accepted' else 'declined' end);
end $$;

create or replace function public.cancel_trade(p_trade uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  update public.trades set status = 'cancelled', decided_at = now() where id = p_trade and from_user = v_uid and status = 'pending';
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', p_trade, 'status', 'cancelled');
end $$;

create or replace function public.get_trades() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(app.trade_view(t, v_uid) order by t.created_at desc) from public.trades t
                          where t.to_user = v_uid and t.status = 'pending'), '[]'),
    'outgoing', coalesce((select jsonb_agg(app.trade_view(t, v_uid) order by t.created_at desc) from public.trades t
                          where t.from_user = v_uid and t.status = 'pending'), '[]'));
end $$;

-- ---------------------------------------------------------------- challenges
-- Each side bets the same amount. On yes, each gets 5 duel draws at plain luck (never added to the album);
-- the rarest draw takes both bets, a tie gives each bet back.
create table if not exists public.challenges (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  bet        bigint not null check (bet between 10 and 100000),
  status     text not null default 'pending' check (status in ('pending', 'done', 'declined', 'cancelled')),
  draws_from jsonb,
  draws_to   jsonb,
  winner     uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists challenges_to_idx on public.challenges (to_user, status);
create index if not exists challenges_from_idx on public.challenges (from_user, status);

create or replace function app.duel_draws(p_n int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out jsonb := '[]';
  v_pick public.cards;
  c public.cards;
begin
  for i in 1 .. p_n loop
    v_pick := null;
    for c in select * from public.cards where active order by odds_n desc loop
      if app.rand() < least(1, 1.0 / c.odds_n) then v_pick := c; exit; end if;
    end loop;
    if v_pick.id is null then
      select * into v_pick from public.cards where active order by odds_n asc limit 1;
    end if;
    v_out := v_out || to_jsonb(v_pick.id::text);
  end loop;
  return v_out;
end $$;

create or replace function app.best_draw(p_draws jsonb) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(max(c.odds_n), 0) from jsonb_array_elements_text(p_draws) d join public.cards c on c.id = d::uuid
$$;

create or replace function app.challenge_view(ch public.challenges, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', ch.id, 'status', ch.status, 'bet', ch.bet, 'created_at', ch.created_at, 'decided_at', ch.decided_at,
    'from', app.player_summary(ch.from_user), 'to', app.player_summary(ch.to_user), 'winner', ch.winner,
    'draws_from', coalesce((select jsonb_agg(app.card_for(p_viewer, d::uuid) order by o) from jsonb_array_elements_text(ch.draws_from) with ordinality x(d, o)), '[]'),
    'draws_to', coalesce((select jsonb_agg(app.card_for(p_viewer, d::uuid) order by o) from jsonb_array_elements_text(ch.draws_to) with ordinality x(d, o)), '[]'))
$$;

create or replace function public.create_challenge(p_to uuid, p_bet bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_id uuid;
begin
  if not app.are_friends(v_uid, p_to) then raise exception 'forbidden'; end if;
  if p_bet is null or p_bet < 10 or p_bet > 100000 then raise exception 'invalid'; end if;
  perform app.move_coins(v_uid, -p_bet, 'desafio aposta');
  insert into public.challenges (from_user, to_user, bet) values (v_uid, p_to, p_bet) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end $$;

create or replace function public.respond_challenge(p_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_ch public.challenges;
  v_from jsonb;
  v_to jsonb;
  v_best_from bigint;
  v_best_to bigint;
  v_winner uuid;
begin
  select * into v_ch from public.challenges where id = p_id and to_user = v_uid and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if not p_accept then
    perform app.move_coins(v_ch.from_user, v_ch.bet, 'desafio devolvido', p_id::text);
    update public.challenges set status = 'declined', decided_at = now() where id = p_id returning * into v_ch;
    return app.challenge_view(v_ch, v_uid);
  end if;
  perform app.move_coins(v_uid, -v_ch.bet, 'desafio aposta', p_id::text);
  v_from := app.duel_draws(5);
  v_to := app.duel_draws(5);
  v_best_from := app.best_draw(v_from);
  v_best_to := app.best_draw(v_to);
  v_winner := case when v_best_from > v_best_to then v_ch.from_user when v_best_to > v_best_from then v_ch.to_user end;
  if v_winner is null then
    perform app.move_coins(v_ch.from_user, v_ch.bet, 'desafio empate', p_id::text);
    perform app.move_coins(v_ch.to_user, v_ch.bet, 'desafio empate', p_id::text);
  else
    perform app.move_coins(v_winner, v_ch.bet * 2, 'desafio ganho', p_id::text);
  end if;
  update public.challenges set status = 'done', draws_from = v_from, draws_to = v_to, winner = v_winner, decided_at = now()
  where id = p_id returning * into v_ch;
  return app.challenge_view(v_ch, v_uid);
end $$;

create or replace function public.cancel_challenge(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_ch public.challenges;
begin
  update public.challenges set status = 'cancelled', decided_at = now()
  where id = p_id and from_user = v_uid and status = 'pending' returning * into v_ch;
  if not found then raise exception 'not_found'; end if;
  perform app.move_coins(v_uid, v_ch.bet, 'desafio devolvido', p_id::text);
  return jsonb_build_object('id', p_id, 'status', 'cancelled');
end $$;

create or replace function public.get_challenges() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(app.challenge_view(c, v_uid) order by c.created_at desc) from public.challenges c
                          where c.to_user = v_uid and c.status = 'pending'), '[]'),
    'outgoing', coalesce((select jsonb_agg(app.challenge_view(c, v_uid) order by c.created_at desc) from public.challenges c
                          where c.from_user = v_uid and c.status = 'pending'), '[]'),
    'recent', coalesce((select jsonb_agg(app.challenge_view(c, v_uid) order by c.decided_at desc)
                        from (select * from public.challenges where status = 'done' and v_uid in (from_user, to_user)
                              order by decided_at desc limit 10) c), '[]'));
end $$;

-- ---------------------------------------------------------------- daily missions
create table if not exists public.mission_claims (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  mission    text not null,
  coins      bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, mission)
);

create or replace function app.mission_defs() returns table (id text, title text, goal int, coins int)
language sql immutable as $$
  values ('roll_5', 'Roletar 5 vezes', 5, 40),
         ('roll_20', 'Roletar 20 vezes', 20, 120),
         ('new_card', 'Tirar uma carta nova', 1, 60),
         ('daily_bonus', 'Pegar o bônus diário', 1, 30),
         ('play_3', 'Jogar 3 partidas', 3, 60),
         ('reflex_win', 'Ganhar moedas no reflexo', 1, 50),
         ('gift_1', 'Dar um presente a um amigo', 1, 50),
         ('recycle_1', 'Trocar repetidas por moedas', 1, 40)
$$;

-- Today's 3 missions, the same for everyone. The admin may pin them in settings.missions.
create or replace function app.missions_for(p_day date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.settings()->'missions',
                  (select jsonb_agg(id) from (select id from app.mission_defs() order by md5(id || p_day::text) limit 3) x))
$$;

create or replace function app.mission_progress(p_user uuid, p_id text, p_day date) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_id
    when 'roll_5' then (select count(*) from public.pulls where user_id = p_user and (created_at at time zone 'America/Sao_Paulo')::date = p_day)
    when 'roll_20' then (select count(*) from public.pulls where user_id = p_user and (created_at at time zone 'America/Sao_Paulo')::date = p_day)
    when 'new_card' then (select count(*) from public.inventory where user_id = p_user and (first_pulled_at at time zone 'America/Sao_Paulo')::date = p_day)
    when 'daily_bonus' then (select count(*) from public.daily_claims where user_id = p_user and day = p_day)
    when 'play_3' then (select count(*) from public.game_sessions where user_id = p_user and finished_at is not null and (finished_at at time zone 'America/Sao_Paulo')::date = p_day)
                     + (select count(*) from public.coin_transactions where user_id = p_user and reason = 'jogo:slots aposta' and (created_at at time zone 'America/Sao_Paulo')::date = p_day)
    when 'reflex_win' then (select count(*) from public.game_sessions where user_id = p_user and game = 'reflex' and reward > 0 and (finished_at at time zone 'America/Sao_Paulo')::date = p_day)
    when 'gift_1' then (select count(*) from public.card_gifts where from_user = p_user and (created_at at time zone 'America/Sao_Paulo')::date = p_day)
    when 'recycle_1' then (select count(*) from public.coin_transactions where user_id = p_user and reason = 'reciclagem' and (created_at at time zone 'America/Sao_Paulo')::date = p_day)
    else 0 end::int
$$;

create or replace function public.get_missions() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_day date := app.today();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'goal', d.goal, 'coins', d.coins, 'xp', 30,
             'progress', least(app.mission_progress(v_uid, d.id, v_day), d.goal),
             'claimed', exists (select 1 from public.mission_claims m where m.user_id = v_uid and m.day = v_day and m.mission = d.id))
           order by x.o)
    from jsonb_array_elements_text(app.missions_for(v_day)) with ordinality x(id, o)
    join app.mission_defs() d on d.id = x.id), '[]');
end $$;

create or replace function public.claim_mission(p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_day date := app.today();
  v_def record;
begin
  if not (app.missions_for(v_day) ? p_id) then raise exception 'invalid'; end if;
  select * into v_def from app.mission_defs() d where d.id = p_id;
  if not found then raise exception 'invalid'; end if;
  if exists (select 1 from public.mission_claims where user_id = v_uid and day = v_day and mission = p_id) then raise exception 'already_claimed'; end if;
  if app.mission_progress(v_uid, p_id, v_day) < v_def.goal then raise exception 'invalid'; end if;
  insert into public.mission_claims (user_id, day, mission, coins) values (v_uid, v_day, p_id, v_def.coins)
  on conflict do nothing;
  if not found then raise exception 'already_claimed'; end if;
  return jsonb_build_object('coins_after', app.move_coins(v_uid, v_def.coins, 'missao ' || p_id), 'coins', v_def.coins, 'xp', 30);
end $$;

-- Missions now give XP too (30 each).
create or replace function app.xp(p_user uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.pulls where user_id = p_user) * 10
       + (select count(*) from public.inventory where user_id = p_user) * 25
       + (select count(*) from public.game_sessions where user_id = p_user and finished_at is not null) * 15
       + (select count(*) from public.coin_transactions where user_id = p_user and reason = 'jogo:slots aposta') * 5
       + (select count(*) from public.daily_claims where user_id = p_user) * 20
       + (select count(*) from public.mission_claims where user_id = p_user) * 30
$$;

-- ---------------------------------------------------------------- weekly event
create or replace function app.event_week_start() returns date
language sql stable as $$ select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date $$;

-- The admin may pin a card in settings.event_card; otherwise the week picks a non-common active card.
create or replace function app.event_card() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select c.id from public.cards c where c.active and c.id::text = app.settings()->>'event_card'),
    (select c.id from public.cards c where c.active and c.odds_n >= 100 order by md5(c.id::text || app.event_week_start()::text) limit 1))
$$;

create or replace function app.card_chance(p_card uuid, p_odds bigint, p_luck numeric) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select least(1, p_luck * (case when p_card = app.event_card() then 2 else 1 end) / p_odds)
$$;

create or replace function public.get_event() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_card uuid := app.event_card();
begin
  if v_card is null then return null; end if;
  return jsonb_build_object('card', app.card_for(v_uid, v_card), 'multiplier', 2,
    'starts_at', (app.event_week_start()::timestamp at time zone 'America/Sao_Paulo'),
    'ends_at', ((app.event_week_start() + 7)::timestamp at time zone 'America/Sao_Paulo'));
end $$;

-- The roll, as before, but each card's chance goes through app.card_chance (the event card counts double).
create or replace function public.pull() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  s jsonb := app.settings();
  v_profile public.profiles;
  v_streak numeric;
  v_potions numeric;
  v_luck numeric;
  v_card public.cards;
  c public.cards;
  v_coins bigint;
  v_qty int;
  v_is_new boolean;
  v_feed boolean;
begin
  select * into v_profile from public.profiles where id = v_uid for update;
  v_coins := app.move_coins(v_uid, -(s->>'pull_cost')::bigint, 'roletada');

  if v_profile.last_pull_at is not null
     and now() - v_profile.last_pull_at <= make_interval(secs => (s->>'streak_window_seconds')::int) then
    v_streak := least((s->>'streak_cap')::numeric, v_profile.streak + (s->>'streak_step')::numeric);
  else
    v_streak := 1;
  end if;
  select l.potions into v_potions from app.luck_state(v_uid) l;
  v_luck := least((s->>'luck_cap')::numeric, v_potions * v_streak);

  for c in select * from public.cards where active order by odds_n desc loop
    if app.rand() < app.card_chance(c.id, c.odds_n, v_luck) then
      v_card := c;
      exit;
    end if;
  end loop;
  if v_card.id is null then
    select * into v_card from public.cards where active order by odds_n asc limit 1;
    if not found then raise exception 'invalid'; end if;
  end if;

  update public.profiles set streak = v_streak, last_pull_at = now() where id = v_uid;

  update public.active_effects set pulls_left = pulls_left - 1 where user_id = v_uid and pulls_left > 0;
  delete from public.active_effects where user_id = v_uid and (pulls_left = 0 or expires_at <= now());

  v_is_new := not exists (select 1 from public.inventory where user_id = v_uid and card_id = v_card.id and quantity > 0);
  insert into public.inventory (user_id, card_id, quantity) values (v_uid, v_card.id, 1)
  on conflict (user_id, card_id) do update set quantity = public.inventory.quantity + 1
  returning quantity into v_qty;

  insert into public.pulls (user_id, card_id, odds_n_at_pull, luck_used) values (v_uid, v_card.id, v_card.odds_n, v_luck);

  v_feed := v_card.odds_n >= (s->>'feed_min_odds')::bigint;
  if v_feed then
    insert into public.feed_events (user_id, card_id, odds_n_at_pull, luck) values (v_uid, v_card.id, v_card.odds_n, v_luck);
  end if;

  return jsonb_build_object('card', app.card_full(v_card), 'odds_n_at_pull', v_card.odds_n, 'luck_used', v_luck,
    'is_new', v_is_new, 'quantity', v_qty, 'coins_after', v_coins, 'feed_posted', v_feed,
    'titles_unlocked', app.check_titles(v_uid));
end $$;

-- ---------------------------------------------------------------- who may touch what
alter table public.card_gifts enable row level security;
alter table public.trades enable row level security;
alter table public.challenges enable row level security;
alter table public.mission_claims enable row level security;
revoke all on table public.card_gifts, public.trades, public.challenges, public.mission_claims from anon, authenticated;

revoke all on function app.are_friends(uuid, uuid), app.card_for(uuid, uuid), app.give_copy(uuid, uuid, uuid),
                       app.trade_view(public.trades, uuid), app.duel_draws(int), app.best_draw(jsonb),
                       app.challenge_view(public.challenges, uuid), app.mission_defs(), app.missions_for(date),
                       app.mission_progress(uuid, text, date), app.event_week_start(), app.event_card(),
                       app.card_chance(uuid, bigint, numeric)
  from public, anon, authenticated;
revoke all on function public.gift_card(uuid, uuid), public.get_gifts(), public.propose_trade(uuid, uuid, uuid),
                       public.respond_trade(uuid, boolean), public.cancel_trade(uuid), public.get_trades(),
                       public.create_challenge(uuid, bigint), public.respond_challenge(uuid, boolean),
                       public.cancel_challenge(uuid), public.get_challenges(), public.get_missions(),
                       public.claim_mission(text), public.get_event()
  from public, anon;
grant execute on function public.gift_card(uuid, uuid), public.get_gifts(), public.propose_trade(uuid, uuid, uuid),
                          public.respond_trade(uuid, boolean), public.cancel_trade(uuid), public.get_trades(),
                          public.create_challenge(uuid, bigint), public.respond_challenge(uuid, boolean),
                          public.cancel_challenge(uuid), public.get_challenges(), public.get_missions(),
                          public.claim_mission(text), public.get_event()
  to authenticated;

-- ===== migrations/20261118000011_music.sql =====
-- SorteSenai: music the admin uploads. 'login' tracks play on the sign-in page (before anyone signs in),
-- 'lendario' and 'mitico' tracks play when a player pulls a card of that rarity.

create table if not exists public.music_tracks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(trim(title)) between 1 and 80),
  path       text not null,
  slot       text not null check (slot in ('login', 'lendario', 'mitico')),
  created_at timestamptz not null default now()
);
alter table public.music_tracks enable row level security;
revoke all on table public.music_tracks from anon, authenticated;

create or replace function app.track_json(m public.music_tracks) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', m.id, 'title', m.title, 'path', m.path, 'slot', m.slot, 'created_at', m.created_at)
$$;

-- The sign-in page has no session yet, so this one is open to anon too. It only returns file paths of login music.
create or replace function public.get_login_music() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(app.track_json(m) order by m.created_at), '[]') from public.music_tracks m where m.slot = 'login'
$$;

create or replace function public.get_rare_music() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_member();
  return jsonb_build_object(
    'lendario', coalesce((select jsonb_agg(app.track_json(m) order by m.created_at) from public.music_tracks m where m.slot = 'lendario'), '[]'),
    'mitico', coalesce((select jsonb_agg(app.track_json(m) order by m.created_at) from public.music_tracks m where m.slot = 'mitico'), '[]'));
end $$;

create or replace function public.admin_list_tracks() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(app.track_json(m) order by m.slot, m.created_at) from public.music_tracks m), '[]');
end $$;

create or replace function public.admin_add_track(p_title text, p_path text, p_slot text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.music_tracks;
begin
  perform app.require_admin();
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_path), '') = '' or p_slot not in ('login', 'lendario', 'mitico') then
    raise exception 'invalid';
  end if;
  insert into public.music_tracks (title, path, slot) values (left(trim(p_title), 80), trim(p_path), p_slot) returning * into v_m;
  return app.track_json(v_m);
end $$;

-- Returns the file path so the app can remove the file from storage too.
create or replace function public.admin_delete_track(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_path text;
begin
  perform app.require_admin();
  delete from public.music_tracks where id = p_id returning path into v_path;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('path', v_path);
end $$;

revoke all on function app.track_json(public.music_tracks) from public, anon, authenticated;
revoke all on function public.get_login_music(), public.get_rare_music(), public.admin_list_tracks(),
                       public.admin_add_track(text, text, text), public.admin_delete_track(uuid)
  from public, anon;
grant execute on function public.get_login_music() to anon, authenticated;
grant execute on function public.get_rare_music(), public.admin_list_tracks(),
                          public.admin_add_track(text, text, text), public.admin_delete_track(uuid)
  to authenticated;

-- ---------------------------------------------------------------- storage (Supabase only)
-- 'music' is a public bucket: the sign-in page must play it before anyone signs in. Only the admin writes.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('music', 'music', true, 15728640, array['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'music_admin_write') then
      execute $p$create policy music_admin_write on storage.objects for all to authenticated
        using (bucket_id = 'music' and app.is_admin()) with check (bucket_id = 'music' and app.is_admin())$p$;
    end if;
  end if;
end $$;

-- ===== migrations/20261118000012_admin_game_shop.sql =====
-- SorteSenai: admin screens for game settings, the shop, the weekly event and pinned missions.

-- Settings: a null in the patch removes that key (unpin missions / event card). Everything is checked.
create or replace function public.admin_update_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_new jsonb; k text; v jsonb;
begin
  perform app.require_admin();
  v_new := jsonb_strip_nulls(app.settings() || coalesce(p_patch, '{}'));
  foreach k in array array['pull_cost','daily_reward','luck_cap','streak_window_seconds','streak_cap','feed_min_odds','recycle_base'] loop
    if jsonb_typeof(v_new->k) is distinct from 'number' or (v_new->>k)::numeric <= 0 then raise exception 'invalid'; end if;
  end loop;
  if (v_new->>'streak_step')::numeric < 0 or (v_new->>'streak_cap')::numeric < 1 then raise exception 'invalid'; end if;

  if jsonb_typeof(v_new->'slots_bets') is distinct from 'array' or jsonb_array_length(v_new->'slots_bets') = 0 then raise exception 'invalid'; end if;
  for v in select * from jsonb_array_elements(v_new->'slots_bets') loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <= 0 then raise exception 'invalid'; end if;
  end loop;

  if jsonb_typeof(v_new->'game_daily_limits') is distinct from 'object' then raise exception 'invalid'; end if;
  foreach k in array array['slots','memory','reflex','clicker'] loop
    if jsonb_typeof(v_new->'game_daily_limits'->k) is distinct from 'number' or (v_new->'game_daily_limits'->>k)::numeric < 0 then
      raise exception 'invalid';
    end if;
  end loop;

  if v_new ? 'missions' then
    if jsonb_typeof(v_new->'missions') <> 'array' or jsonb_array_length(v_new->'missions') not between 1 and 5
       or (select count(distinct m) from jsonb_array_elements_text(v_new->'missions') m) <> jsonb_array_length(v_new->'missions')
       or exists (select 1 from jsonb_array_elements_text(v_new->'missions') m where m not in (select id from app.mission_defs())) then
      raise exception 'invalid';
    end if;
  end if;

  if v_new ? 'event_card' then
    if jsonb_typeof(v_new->'event_card') <> 'string'
       or not exists (select 1 from public.cards where active and id::text = v_new->>'event_card') then
      raise exception 'invalid';
    end if;
  end if;

  update public.settings set value = v_new where id;
  return v_new;
end $$;

-- Only a real list of missions pins the day; anything else means "pick them by the day".
create or replace function app.missions_for(p_day date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when jsonb_typeof(app.settings()->'missions') = 'array' then app.settings()->'missions'
              else (select jsonb_agg(id) from (select id from app.mission_defs() order by md5(id || p_day::text) limit 3) x) end
$$;

create or replace function public.admin_mission_defs() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return (select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'goal', goal, 'coins', coins)) from app.mission_defs());
end $$;

-- The players only see active items and titles; the admin sees all of them to edit or reactivate.
create or replace function public.admin_list_items() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(i) order by i.active desc, i.price) from public.items i), '[]');
end $$;

create or replace function public.admin_list_titles() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.active desc, t.price nulls last, t.name) from public.titles t), '[]');
end $$;

revoke all on function public.admin_mission_defs(), public.admin_list_items(), public.admin_list_titles() from public, anon;
grant execute on function public.admin_mission_defs(), public.admin_list_items(), public.admin_list_titles() to authenticated;

-- ===== migrations/20261118000013_admin_roles.sql =====
-- SorteSenai: an admin can make another player admin, or take it back.
-- Nobody changes their own role, so the admin doing this always stays admin (the site never ends up with none).

create or replace function public.admin_set_role(p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := app.require_admin();
  v_banned boolean;
begin
  if p_user = v_me or p_role is null or p_role not in ('player', 'admin') then raise exception 'invalid'; end if;
  select banned into v_banned from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if v_banned and p_role = 'admin' then raise exception 'invalid'; end if;
  update public.profiles set role = p_role where id = p_user;
  return jsonb_build_object('id', p_user, 'role', p_role);
end $$;

revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
