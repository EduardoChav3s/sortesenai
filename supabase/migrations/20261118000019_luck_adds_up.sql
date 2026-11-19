-- SorteSenai: luck effects add up, they never multiply each other.
-- Before: active potions were multiplied together (two 5x = 25x) and then multiplied by the pull streak,
-- and the roll computed luck on its own. Now one function adds everything, and every place uses it:
--   potions = sum of the active potions' multipliers (1x when there is none)
--   luck    = potions + the streak's extra (a 1.5x streak adds 0.5), capped by settings.luck_cap
-- An effect that ends (time or roll count) simply stops being summed; the others stay.

create or replace function app.luck_value(p_potions numeric, p_streak numeric) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select least((app.settings()->>'luck_cap')::numeric, p_potions + greatest(p_streak, 1) - 1)
$$;

create or replace function app.luck_state(p_user uuid)
returns table (potions numeric, streak numeric, effective numeric, cap numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s jsonb := app.settings();
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user;
  select coalesce(sum(e.multiplier), 1) into potions
  from public.active_effects e
  where e.user_id = p_user
    and (e.expires_at is null or e.expires_at > now())
    and (e.pulls_left is null or e.pulls_left > 0);
  streak := case
    when v_profile.last_pull_at is not null
     and now() - v_profile.last_pull_at <= make_interval(secs => (s->>'streak_window_seconds')::int)
    then v_profile.streak else 1 end;
  cap := (s->>'luck_cap')::numeric;
  effective := app.luck_value(potions, streak);
  return next;
end $$;

-- The roll, as before, with its luck from app.luck_value (the streak counts this roll).
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
  v_luck := app.luck_value(v_potions, v_streak);

  v_card := app.draw_card(v_luck, true);

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

revoke all on function app.luck_value(numeric, numeric), app.luck_state(uuid) from public, anon, authenticated;
