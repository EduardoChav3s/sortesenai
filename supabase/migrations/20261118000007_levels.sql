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
