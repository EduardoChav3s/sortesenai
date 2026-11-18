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
