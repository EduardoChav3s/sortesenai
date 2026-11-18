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
