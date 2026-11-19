-- SorteSenai: a fair draw, the global reset (server owner only) and pictures on shop items.

-- ---------------------------------------------------------------- 1. the draw
-- Before: each card was tested one after the other, and when no card hit, the roll always gave the same
-- single commonest card. Two cards with the same chance came out very unequally.
-- Now: one random number per roll, against a table of chances that adds up to exactly 100%.
--  * each card gets exactly min(1, luck x event / odds), filled from the rarest up;
--  * cards with the same chance always share the same slice (ties are split equally);
--  * what is left goes to the commonest cards, split equally.

create or replace function app.roll_table(p_luck numeric, p_event boolean default true)
returns table (card_id uuid, chance double precision)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_event uuid := case when p_event then app.event_card() end;
begin
  return query
  with base as (
    select c.id, c.odds_n, least(1::numeric, p_luck * (case when c.id = v_event then 2 else 1 end) / c.odds_n) as ch
    from public.cards c where c.active
  ), grp as (
    select b.ch, count(*) as n, sum(b.ch) as total from base b group by b.ch
  ), filled as (
    select g.ch, g.n, greatest(0::numeric, least(g.total,
             1 - coalesce(sum(g.total) over (order by g.ch rows between unbounded preceding and 1 preceding), 0))) as mass
    from grp g
  ), common as (
    select min(odds_n) as odds, count(*) filter (where odds_n = (select min(odds_n) from base)) as n from base
  )
  select b.id,
         (f.mass / f.n + case when b.odds_n = (select odds from common)
                              then greatest(0::numeric, 1 - (select sum(mass) from filled)) / (select n from common) else 0 end)::double precision
  from base b join filled f on f.ch = b.ch;
end $$;

create or replace function app.draw_card(p_luck numeric, p_event boolean default true) returns public.cards
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_u double precision := app.rand();
  v_id uuid;
  v_card public.cards;
begin
  select t.card_id into v_id from (
    select r.card_id, sum(r.chance) over (order by r.chance, r.card_id) as upto from app.roll_table(p_luck, p_event) r
  ) t where t.upto > v_u order by t.upto limit 1;
  if v_id is null then -- rounding at the very top of the scale: the commonest card
    select r.card_id into v_id from app.roll_table(p_luck, p_event) r order by r.chance desc, r.card_id desc limit 1;
  end if;
  if v_id is null then raise exception 'invalid'; end if;
  select * into v_card from public.cards where id = v_id;
  return v_card;
end $$;

revoke all on function app.roll_table(numeric, boolean), app.draw_card(numeric, boolean) from public, anon, authenticated;

-- The roll, as before, with the card picked by app.draw_card.
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
  v_luck := least((s->>'luck_cap')::numeric, v_potions * v_streak);

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

-- Duels draw with the same fair table (normal luck, no event).
create or replace function app.duel_draws(p_n int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_out jsonb := '[]';
begin
  for i in 1 .. p_n loop
    v_out := v_out || to_jsonb((app.draw_card(1, false)).id::text);
  end loop;
  return v_out;
end $$;
revoke all on function app.duel_draws(int) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. pictures on shop items
-- image_url is what the shop shows: a link the admin pasted, or the public link of a file sent to the
-- 'shop' bucket (then image_path names that file, so it can be removed when replaced).
alter table public.items add column if not exists image_url text;
alter table public.items add column if not exists image_path text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_image_url_https') then
    alter table public.items add constraint items_image_url_https check (image_url is null or (image_url ~ '^https://[^\s]+$' and length(image_url) <= 500));
  end if;
end $$;

-- p: { id?, name, description, price, multiplier, duration_minutes | duration_pulls, active, image_url?, image_path? }
create or replace function public.admin_upsert_item(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.items;
begin
  perform app.require_admin();
  begin
    insert into public.items (id, name, description, price, multiplier, duration_minutes, duration_pulls, active, image_url, image_path)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'name', coalesce(p->>'description', ''), (p->>'price')::bigint,
            (p->>'multiplier')::numeric, (p->>'duration_minutes')::int, (p->>'duration_pulls')::int, coalesce((p->>'active')::boolean, true),
            nullif(p->>'image_url', ''), case when nullif(p->>'image_url', '') is null then null else nullif(p->>'image_path', '') end)
    on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price,
      multiplier = excluded.multiplier, duration_minutes = excluded.duration_minutes, duration_pulls = excluded.duration_pulls,
      active = excluded.active, image_url = excluded.image_url, image_path = excluded.image_path
    returning * into v_item;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid';
  end;
  return to_jsonb(v_item);
end $$;
revoke all on function public.admin_upsert_item(jsonb) from public, anon;
grant execute on function public.admin_upsert_item(jsonb) to authenticated;

-- Storage (Supabase only): 'shop' is public (item pictures are not secret); only admins write.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('shop', 'shop', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'shop_admin_write') then
      execute $p$create policy shop_admin_write on storage.objects for all to authenticated
        using (bucket_id = 'shop' and app.is_admin()) with check (bucket_id = 'shop' and app.is_admin())$p$;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- 3. global reset (server owner only)
-- The owner is matched by the SHA-256 of their sign-in e-mail, so the e-mail itself is not stored here.
create table if not exists app.server_owner (email_sha256 text not null);
insert into app.server_owner (email_sha256)
select '74479c859b96f0eab9e662a9111b17ff13959509d25a24cb136437bf35b97a30'
where not exists (select 1 from app.server_owner);

create or replace function app.is_server_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_admin() and exists (
    select 1 from public.profiles p, app.server_owner o
    where p.id = auth.uid() and encode(extensions.digest(lower(p.email), 'sha256'), 'hex') = o.email_sha256)
$$;
revoke all on function app.is_server_owner() from public, anon, authenticated;

-- What admins did that must be remembered (kept for good, unlike the one-hour live notes).
create table if not exists public.admin_history (
  id         bigint generated always as identity primary key,
  kind       text not null,
  actor      uuid references public.profiles (id) on delete set null,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.admin_history enable row level security;
revoke all on table public.admin_history from anon, authenticated;
grant select on table public.admin_history to authenticated;
drop policy if exists admin_history_read on public.admin_history;
create policy admin_history_read on public.admin_history for select to authenticated using (app.is_admin());

-- Whether the reset option shows, and the last reset.
create or replace function public.server_owner_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_member();
  if not app.is_server_owner() then return jsonb_build_object('owner', false); end if;
  return jsonb_build_object('owner', true, 'last_reset', (
    select jsonb_build_object('at', h.created_at, 'by', p.nickname, 'details', h.details)
    from public.admin_history h left join public.profiles p on p.id = h.actor
    where h.kind = 'reset_global' order by h.created_at desc limit 1));
end $$;

-- Wipes every player's progress in one transaction. Accounts, roles, bans, cards, shop, settings,
-- friendships and ideas stay. `where true` keeps Supabase's safe-update guard happy.
create or replace function public.admin_global_reset(p_phrase text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_admin();
  v_players int;
  v_cards bigint;
  v_coins bigint;
  v_details jsonb;
begin
  if not app.is_server_owner() then raise exception 'forbidden'; end if;
  if p_phrase is distinct from 'RESETAR SERVIDOR' then raise exception 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('sortesenai:reset_global'));
  lock table public.profiles, public.inventory in exclusive mode;

  select count(*), coalesce(sum(coins), 0) into v_players, v_coins from public.profiles;
  select coalesce(sum(quantity), 0) into v_cards from public.inventory;

  delete from public.card_gifts where true;
  delete from public.trades where true;
  delete from public.challenges where true;
  delete from public.mission_claims where true;
  delete from public.feed_events where true;
  delete from public.inventory where true;
  delete from public.pulls where true;
  delete from public.coin_transactions where true;
  delete from public.user_items where true;
  delete from public.active_effects where true;
  delete from public.user_titles where true;
  delete from public.daily_claims where true;
  delete from public.game_sessions where true;
  delete from public.daily_game_earnings where true;
  update public.profiles set coins = 0, streak = 1, last_pull_at = null, showcase = '{}', avatar_card_id = null,
    title_id = null, level_claimed = 1 where true;

  v_details := jsonb_build_object('players', v_players, 'cards_removed', v_cards, 'coins_removed', v_coins);
  insert into public.admin_history (kind, actor, details) values ('reset_global', v_uid, v_details);
  return v_details;
end $$;

revoke all on function public.server_owner_status(), public.admin_global_reset(text) from public, anon;
grant execute on function public.server_owner_status(), public.admin_global_reset(text) to authenticated;
