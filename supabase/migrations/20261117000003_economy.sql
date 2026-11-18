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
