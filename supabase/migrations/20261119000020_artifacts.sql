-- SorteSenai: artifacts. Spare cards become fragments (when the player wants), fragments forge artifacts,
-- and active artifacts give luck, XP and coin multipliers that potions amplify for a while.
--
-- One rule for the three attributes (luck, xp, money), computed from what is active right now, never stored:
--   base  = sum of the active artifacts' multipliers for that attribute (1x when none gives it)
--   amp   = sum of the extra of each active potion of that attribute (a 2x potion adds 1, a 3x adds 2)
--   value = base x (1 + amp)
-- Luck then adds the pull streak's extra (as before) and stays under settings.luck_cap.

-- ---------------------------------------------------------------- potions get an attribute
alter table public.items add column if not exists attribute text not null default 'luck';
alter table public.active_effects add column if not exists attribute text not null default 'luck';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_attribute_check') then
    alter table public.items add constraint items_attribute_check check (attribute in ('luck', 'xp', 'money'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'active_effects_attribute_check') then
    alter table public.active_effects add constraint active_effects_attribute_check check (attribute in ('luck', 'xp', 'money'));
  end if;
end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.fragment_types (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique check (length(name) between 1 and 30),
  color  text not null default '#8a8a8a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  sort   int not null default 0
);
-- Which fragment (and how many) one spare copy of each rarity gives. A null fragment_type gives nothing.
create table if not exists public.fragment_rules (
  tier          text primary key check (tier in ('comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico')),
  fragment_type uuid references public.fragment_types (id) on delete set null,
  amount        int not null default 1 check (amount >= 0)
);
alter table public.cards add column if not exists fragments_allowed boolean not null default true;
alter table public.profiles add column if not exists xp_bonus bigint not null default 0;

create table if not exists public.user_fragments (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  fragment_type uuid not null references public.fragment_types (id) on delete cascade,
  quantity      bigint not null default 0 check (quantity >= 0),
  primary key (user_id, fragment_type)
);

create table if not exists public.artifacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 40),
  description text not null default '' check (length(description) <= 160),
  image_url   text check (image_url is null or (image_url ~ '^https://[^\s]+$' and length(image_url) <= 500)),
  image_path  text,
  rarity      text not null default 'comum' check (rarity in ('comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico')),
  luck_mult   numeric not null default 1 check (luck_mult >= 1 and luck_mult <= 1000),
  xp_mult     numeric not null default 1 check (xp_mult >= 1 and xp_mult <= 1000),
  money_mult  numeric not null default 1 check (money_mult >= 1 and money_mult <= 1000),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists public.artifact_recipe (
  artifact_id   uuid not null references public.artifacts (id) on delete cascade,
  fragment_type uuid not null references public.fragment_types (id) on delete restrict,
  amount        int not null check (amount > 0),
  primary key (artifact_id, fragment_type)
);
create table if not exists public.user_artifacts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists user_artifacts_user_idx on public.user_artifacts (user_id);
-- A craft request id is used once: the same click sent twice forges one artifact.
create table if not exists public.craft_requests (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  request_id       uuid not null,
  user_artifact_id bigint references public.user_artifacts (id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- starting fragment types and rules (the admin changes them later)
insert into public.fragment_types (name, color, sort)
select * from (values ('Comum', '#9aa0a6', 1), ('Raro', '#3d8bfd', 2), ('Épico', '#9b59d0', 3), ('Lendário', '#e0a100', 4)) v(n, c, s)
where not exists (select 1 from public.fragment_types);
insert into public.fragment_rules (tier, fragment_type, amount)
select r.tier, (select id from public.fragment_types where name = r.frag), r.amount
from (values ('comum', 'Comum', 1), ('incomum', 'Comum', 2), ('raro', 'Raro', 1), ('epico', 'Épico', 1), ('lendario', 'Lendário', 1), ('mitico', 'Lendário', 3)) r(tier, frag, amount)
on conflict (tier) do nothing;
update public.settings set value = value || '{"artifact_slots": 3}' where id and not (value ? 'artifact_slots');

-- players read through functions only
alter table public.fragment_types enable row level security;
alter table public.fragment_rules enable row level security;
alter table public.user_fragments enable row level security;
alter table public.artifacts enable row level security;
alter table public.artifact_recipe enable row level security;
alter table public.user_artifacts enable row level security;
alter table public.craft_requests enable row level security;
revoke all on table public.fragment_types, public.fragment_rules, public.user_fragments, public.artifacts, public.artifact_recipe,
  public.user_artifacts, public.craft_requests from anon, authenticated;

-- ---------------------------------------------------------------- the one place that computes attributes
create or replace function app.tier_of(p_odds bigint) returns text
language sql immutable as $$
  select case when p_odds < 100 then 'comum' when p_odds < 10000 then 'incomum' when p_odds < 1000000 then 'raro'
              when p_odds < 100000000 then 'epico' when p_odds < 1000000000 then 'lendario' else 'mitico' end
$$;

create or replace function app.attr_parts(p_user uuid, p_attr text)
returns table (base numeric, amp numeric, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  select coalesce(sum(m), 1) into base from (
    select case p_attr when 'luck' then a.luck_mult when 'xp' then a.xp_mult else a.money_mult end as m
    from public.user_artifacts ua join public.artifacts a on a.id = ua.artifact_id
    where ua.user_id = p_user and ua.active and a.active) x
  where m > 1;
  select coalesce(sum(e.multiplier - 1), 0) into amp
  from public.active_effects e
  where e.user_id = p_user and e.attribute = p_attr
    and (e.expires_at is null or e.expires_at > now())
    and (e.pulls_left is null or e.pulls_left > 0);
  value := base * (1 + amp);
  return next;
end $$;

-- Luck for the screen and the roll: potions/artifacts value, plus the streak (app.luck_value adds and caps).
create or replace function app.luck_state(p_user uuid)
returns table (potions numeric, streak numeric, effective numeric, cap numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s jsonb := app.settings();
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user;
  select p.value into potions from app.attr_parts(p_user, 'luck') p;
  streak := case
    when v_profile.last_pull_at is not null
     and now() - v_profile.last_pull_at <= make_interval(secs => (s->>'streak_window_seconds')::int)
    then v_profile.streak else 1 end;
  cap := (s->>'luck_cap')::numeric;
  effective := app.luck_value(potions, streak);
  return next;
end $$;

create or replace function public.get_luck() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); l record;
begin
  select * into l from app.luck_state(v_uid);
  return jsonb_build_object('potions', l.potions, 'streak', l.streak, 'effective', l.effective, 'cap', l.cap,
    'effects', coalesce((select jsonb_agg(jsonb_build_object('item_id', e.item_id, 'name', i.name, 'multiplier', e.multiplier, 'attribute', e.attribute,
                                                              'expires_at', e.expires_at, 'pulls_left', e.pulls_left))
                         from public.active_effects e join public.items i on i.id = e.item_id
                         where e.user_id = v_uid and (e.expires_at is null or e.expires_at > now())
                           and (e.pulls_left is null or e.pulls_left > 0)), '[]'));
end $$;

-- Luck, XP and coins at once, for the screen.
create or replace function public.get_attributes() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return (select jsonb_object_agg(a, jsonb_build_object('base', p.base, 'amp', p.amp, 'value', case when a = 'luck' then l.effective else p.value end))
          from unnest(array['luck', 'xp', 'money']) a cross join lateral app.attr_parts(v_uid, a) p cross join app.luck_state(v_uid) l);
end $$;

-- Coins: earned coins (daily bonus, games, missions, level rewards) grow with the money multiplier.
-- Coins from other players, sales, refunds and admin changes never do.
create or replace function app.move_coins(p_user uuid, p_amount bigint, p_reason text, p_ref text default null)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_coins bigint; v_amount bigint := p_amount;
begin
  if p_amount > 0 and (p_reason = 'bonus diario' or p_reason like 'missao %' or p_reason like 'nivel %'
                       or (p_reason like 'jogo:%' and p_reason not in ('jogo:slots aposta', 'jogo:slots devolucao'))) then
    v_amount := floor(p_amount * (select p.value from app.attr_parts(p_user, 'money') p))::bigint;
  end if;
  select coins into v_coins from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if v_coins + v_amount < 0 then raise exception 'insufficient_coins'; end if;
  update public.profiles set coins = coins + v_amount where id = p_user returning coins into v_coins;
  insert into public.coin_transactions (user_id, amount, reason, ref) values (p_user, v_amount, p_reason, p_ref);
  return v_coins;
end $$;

-- XP: activity counts as before, plus the extra earned with an XP multiplier (stored when earned).
create or replace function app.xp(p_user uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.pulls where user_id = p_user) * 10
       + (select count(*) from public.inventory where user_id = p_user) * 25
       + (select count(*) from public.game_sessions where user_id = p_user and finished_at is not null) * 15
       + (select count(*) from public.coin_transactions where user_id = p_user and reason = 'jogo:slots aposta') * 5
       + (select count(*) from public.daily_claims where user_id = p_user) * 20
       + (select count(*) from public.mission_claims where user_id = p_user) * 30
       + coalesce((select xp_bonus from public.profiles where id = p_user), 0)
$$;

create or replace function app.add_xp_bonus(p_user uuid, p_base int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_extra bigint := round(p_base * ((select p.value from app.attr_parts(p_user, 'xp') p) - 1));
begin
  if v_extra > 0 then update public.profiles set xp_bonus = xp_bonus + v_extra where id = p_user; end if;
end $$;

create or replace function app.xp_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'pulls' then perform app.add_xp_bonus(new.user_id, 10);
  elsif tg_table_name = 'inventory' then perform app.add_xp_bonus(new.user_id, 25);
  elsif tg_table_name = 'daily_claims' then perform app.add_xp_bonus(new.user_id, 20);
  elsif tg_table_name = 'mission_claims' then perform app.add_xp_bonus(new.user_id, 30);
  elsif tg_table_name = 'coin_transactions' then
    if new.reason = 'jogo:slots aposta' then perform app.add_xp_bonus(new.user_id, 5); end if;
  elsif tg_table_name = 'game_sessions' then
    if old.finished_at is null and new.finished_at is not null then perform app.add_xp_bonus(new.user_id, 15); end if;
  end if;
  return null;
end $$;
drop trigger if exists xp_bonus_pulls on public.pulls;
create trigger xp_bonus_pulls after insert on public.pulls for each row execute function app.xp_trigger();
drop trigger if exists xp_bonus_inventory on public.inventory;
create trigger xp_bonus_inventory after insert on public.inventory for each row execute function app.xp_trigger();
drop trigger if exists xp_bonus_daily on public.daily_claims;
create trigger xp_bonus_daily after insert on public.daily_claims for each row execute function app.xp_trigger();
drop trigger if exists xp_bonus_missions on public.mission_claims;
create trigger xp_bonus_missions after insert on public.mission_claims for each row execute function app.xp_trigger();
drop trigger if exists xp_bonus_slots on public.coin_transactions;
create trigger xp_bonus_slots after insert on public.coin_transactions for each row execute function app.xp_trigger();
drop trigger if exists xp_bonus_games on public.game_sessions;
create trigger xp_bonus_games after update on public.game_sessions for each row execute function app.xp_trigger();

-- A potion keeps the attribute of its item, each in its own row with its own end.
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
  insert into public.active_effects (user_id, item_id, multiplier, attribute, expires_at, pulls_left)
  values (v_uid, p_item, v_item.multiplier, v_item.attribute,
          case when v_item.duration_minutes is not null then now() + make_interval(mins => v_item.duration_minutes) end,
          v_item.duration_pulls)
  returning * into v_effect;
  return jsonb_build_object('item_id', p_item, 'name', v_item.name, 'multiplier', v_effect.multiplier, 'attribute', v_effect.attribute,
                            'expires_at', v_effect.expires_at, 'pulls_left', v_effect.pulls_left);
end $$;

-- p: { id?, name, description, price, multiplier, attribute, duration_minutes | duration_pulls, active, image_url?, image_path? }
create or replace function public.admin_upsert_item(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.items;
begin
  perform app.require_admin();
  begin
    insert into public.items (id, name, description, price, multiplier, attribute, duration_minutes, duration_pulls, active, image_url, image_path)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'name', coalesce(p->>'description', ''), (p->>'price')::bigint,
            (p->>'multiplier')::numeric, coalesce(p->>'attribute', 'luck'), (p->>'duration_minutes')::int, (p->>'duration_pulls')::int,
            coalesce((p->>'active')::boolean, true),
            nullif(p->>'image_url', ''), case when nullif(p->>'image_url', '') is null then null else nullif(p->>'image_path', '') end)
    on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price,
      multiplier = excluded.multiplier, attribute = excluded.attribute, duration_minutes = excluded.duration_minutes,
      duration_pulls = excluded.duration_pulls, active = excluded.active, image_url = excluded.image_url, image_path = excluded.image_path
    returning * into v_item;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid';
  end;
  return to_jsonb(v_item);
end $$;

-- ---------------------------------------------------------------- fragments
create or replace function public.get_fragments() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'color', f.color,
                                                       'quantity', coalesce(u.quantity, 0)) order by f.sort, f.name)
                   from public.fragment_types f left join public.user_fragments u on u.fragment_type = f.id and u.user_id = v_uid
                   where f.active or coalesce(u.quantity, 0) > 0), '[]');
end $$;

-- What each spare copy of a card would give (for the album button). Null when it gives nothing.
create or replace function app.card_fragments(p_card public.cards) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_card.fragments_allowed and r.amount > 0 and f.active
              then jsonb_build_object('fragment_type', f.id, 'name', f.name, 'color', f.color, 'amount', r.amount) end
  from public.fragment_rules r join public.fragment_types f on f.id = r.fragment_type
  where r.tier = app.tier_of(p_card.odds_n)
$$;

-- Spare copies the player owns, and what they would turn into.
create or replace function public.get_spare_fragments() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('card', app.card_full(c), 'spares', i.quantity - 1, 'gives', app.card_fragments(c)) order by c.odds_n desc)
                   from public.inventory i join public.cards c on c.id = i.card_id
                   where i.user_id = v_uid and i.quantity >= 2), '[]');
end $$;

-- Turns spare copies into fragments. The last copy always stays in the album.
create or replace function public.convert_duplicates(p_card uuid, p_quantity int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_card public.cards;
  v_qty int;
  v_gives jsonb;
  v_gain bigint;
begin
  if coalesce(p_quantity, 0) < 1 then raise exception 'invalid'; end if;
  select * into v_card from public.cards where id = p_card;
  if not found then raise exception 'not_found'; end if;
  v_gives := app.card_fragments(v_card);
  if v_gives is null then raise exception 'invalid'; end if;
  select quantity into v_qty from public.inventory where user_id = v_uid and card_id = p_card for update;
  if coalesce(v_qty, 0) - p_quantity < 1 then raise exception 'invalid'; end if;
  update public.inventory set quantity = quantity - p_quantity where user_id = v_uid and card_id = p_card;
  v_gain := p_quantity * (v_gives->>'amount')::int;
  insert into public.user_fragments (user_id, fragment_type, quantity) values (v_uid, (v_gives->>'fragment_type')::uuid, v_gain)
  on conflict (user_id, fragment_type) do update set quantity = public.user_fragments.quantity + excluded.quantity;
  return jsonb_build_object('card', v_card.title, 'copies', p_quantity, 'fragment', v_gives->>'name', 'color', v_gives->>'color', 'gained', v_gain);
end $$;

-- Every spare at once; returns one line per card for the notice.
create or replace function public.convert_all_duplicates() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); r record; v_out jsonb := '[]';
begin
  for r in select i.card_id, i.quantity - 1 as spares from public.inventory i join public.cards c on c.id = i.card_id
           where i.user_id = v_uid and i.quantity >= 2 and app.card_fragments(c) is not null loop
    v_out := v_out || jsonb_build_array(public.convert_duplicates(r.card_id, r.spares));
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- artifacts for players
create or replace function app.artifact_view(a public.artifacts, p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'description', a.description, 'image_url', a.image_url, 'rarity', a.rarity,
    'luck_mult', a.luck_mult, 'xp_mult', a.xp_mult, 'money_mult', a.money_mult, 'active', a.active,
    'recipe', coalesce((select jsonb_agg(jsonb_build_object('fragment_type', f.id, 'name', f.name, 'color', f.color, 'amount', r.amount,
                                                            'have', coalesce((select quantity from public.user_fragments u where u.user_id = p_user and u.fragment_type = f.id), 0))
                                         order by f.sort, f.name)
                        from public.artifact_recipe r join public.fragment_types f on f.id = r.fragment_type where r.artifact_id = a.id), '[]'))
$$;

create or replace function public.get_forge() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return coalesce((
    select jsonb_agg(v || jsonb_build_object('can_craft', not exists (select 1 from jsonb_array_elements(v->'recipe') r where (r->>'have')::bigint < (r->>'amount')::bigint),
                                             'owned', (select count(*) from public.user_artifacts ua where ua.user_id = v_uid and ua.artifact_id = a.id))
                     order by a.created_at)
    from public.artifacts a cross join lateral app.artifact_view(a, v_uid) v
    where a.active), '[]');
end $$;

-- Forges one artifact. The same request id twice gives back the first result (no double charge).
create or replace function public.craft_artifact(p_artifact uuid, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_done bigint;
  r record;
  v_new bigint;
begin
  if p_request is null then raise exception 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('craft:' || v_uid::text));
  select user_artifact_id into v_done from public.craft_requests where user_id = v_uid and request_id = p_request;
  if found then return jsonb_build_object('id', v_done, 'repeated', true); end if;
  if not exists (select 1 from public.artifacts where id = p_artifact and active) then raise exception 'not_found'; end if;
  if not exists (select 1 from public.artifact_recipe where artifact_id = p_artifact) then raise exception 'invalid'; end if;
  for r in select ar.fragment_type, ar.amount from public.artifact_recipe ar where ar.artifact_id = p_artifact loop
    perform 1 from public.user_fragments where user_id = v_uid and fragment_type = r.fragment_type for update;
    if coalesce((select quantity from public.user_fragments where user_id = v_uid and fragment_type = r.fragment_type), 0) < r.amount then
      raise exception 'missing_materials';
    end if;
    update public.user_fragments set quantity = quantity - r.amount where user_id = v_uid and fragment_type = r.fragment_type;
  end loop;
  insert into public.user_artifacts (user_id, artifact_id, active)
  values (v_uid, p_artifact, (select count(*) from public.user_artifacts where user_id = v_uid and active) < coalesce((app.settings()->>'artifact_slots')::int, 3))
  returning id into v_new;
  insert into public.craft_requests (user_id, request_id, user_artifact_id) values (v_uid, p_request, v_new);
  return jsonb_build_object('id', v_new, 'repeated', false);
end $$;

create or replace function public.get_my_artifacts() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return jsonb_build_object('slots', coalesce((app.settings()->>'artifact_slots')::int, 3), 'items', coalesce((
    select jsonb_agg(app.artifact_view(a, v_uid) || jsonb_build_object('user_artifact_id', ua.id, 'equipped', ua.active, 'crafted_at', ua.created_at)
                     order by ua.active desc, ua.created_at)
    from public.user_artifacts ua join public.artifacts a on a.id = ua.artifact_id where ua.user_id = v_uid), '[]'));
end $$;

create or replace function public.set_artifact_active(p_id bigint, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  perform pg_advisory_xact_lock(hashtext('artifact-slots:' || v_uid::text));
  if not exists (select 1 from public.user_artifacts where id = p_id and user_id = v_uid) then raise exception 'not_found'; end if;
  if p_active and (select count(*) from public.user_artifacts where user_id = v_uid and active and id <> p_id)
                  >= coalesce((app.settings()->>'artifact_slots')::int, 3) then
    raise exception 'invalid';
  end if;
  update public.user_artifacts set active = p_active where id = p_id;
  return jsonb_build_object('id', p_id, 'active', p_active);
end $$;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_artifact_config() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return jsonb_build_object(
    'artifacts', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('recipe', coalesce((
        select jsonb_agg(jsonb_build_object('fragment_type', r.fragment_type, 'amount', r.amount)) from public.artifact_recipe r where r.artifact_id = a.id), '[]'),
        'owners', (select count(distinct user_id) from public.user_artifacts ua where ua.artifact_id = a.id)) order by a.active desc, a.created_at)
      from public.artifacts a), '[]'),
    'fragment_types', coalesce((select jsonb_agg(to_jsonb(f) order by f.sort, f.name) from public.fragment_types f), '[]'),
    'rules', coalesce((select jsonb_agg(to_jsonb(r)) from public.fragment_rules r), '[]'),
    'blocked_cards', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'number', c.number, 'odds_n', c.odds_n) order by c.number)
                               from public.cards c where not c.fragments_allowed), '[]'),
    'slots', coalesce((app.settings()->>'artifact_slots')::int, 3));
end $$;

-- p: { id?, name, description, image_url, image_path, rarity, luck_mult, xp_mult, money_mult, active, recipe: [{ fragment_type, amount }] }
create or replace function public.admin_upsert_artifact(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_a public.artifacts; r jsonb;
begin
  perform app.require_admin();
  if jsonb_typeof(p->'recipe') is distinct from 'array' or jsonb_array_length(p->'recipe') = 0 then raise exception 'invalid'; end if;
  begin
    insert into public.artifacts (id, name, description, image_url, image_path, rarity, luck_mult, xp_mult, money_mult, active)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), btrim(p->>'name'), coalesce(btrim(p->>'description'), ''),
            nullif(p->>'image_url', ''), case when nullif(p->>'image_url', '') is null then null else nullif(p->>'image_path', '') end,
            coalesce(p->>'rarity', 'comum'), coalesce((p->>'luck_mult')::numeric, 1), coalesce((p->>'xp_mult')::numeric, 1),
            coalesce((p->>'money_mult')::numeric, 1), coalesce((p->>'active')::boolean, true))
    on conflict (id) do update set name = excluded.name, description = excluded.description, image_url = excluded.image_url,
      image_path = excluded.image_path, rarity = excluded.rarity, luck_mult = excluded.luck_mult, xp_mult = excluded.xp_mult,
      money_mult = excluded.money_mult, active = excluded.active
    returning * into v_a;
    delete from public.artifact_recipe where artifact_id = v_a.id;
    for r in select * from jsonb_array_elements(p->'recipe') loop
      insert into public.artifact_recipe (artifact_id, fragment_type, amount) values (v_a.id, (r->>'fragment_type')::uuid, (r->>'amount')::int);
    end loop;
  exception when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation or unique_violation then
    raise exception 'invalid';
  end;
  return to_jsonb(v_a);
end $$;

-- Deleting takes the artifact away from every player too; returns the picture path so the site removes the file.
create or replace function public.admin_delete_artifact(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_path text; v_owners int;
begin
  perform app.require_admin();
  select count(distinct user_id) into v_owners from public.user_artifacts where artifact_id = p_id;
  delete from public.artifacts where id = p_id returning image_path into v_path;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('image_path', v_path, 'owners', v_owners);
end $$;

-- p: { id?, name, color, active }
create or replace function public.admin_upsert_fragment_type(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f public.fragment_types;
begin
  perform app.require_admin();
  begin
    insert into public.fragment_types (id, name, color, active, sort)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), btrim(p->>'name'), coalesce(p->>'color', '#8a8a8a'), coalesce((p->>'active')::boolean, true),
            coalesce((p->>'sort')::int, (select coalesce(max(sort), 0) + 1 from public.fragment_types)))
    on conflict (id) do update set name = excluded.name, color = excluded.color, active = excluded.active
    returning * into v_f;
  exception when check_violation or not_null_violation or unique_violation or invalid_text_representation then raise exception 'invalid';
  end;
  return to_jsonb(v_f);
end $$;

create or replace function public.admin_set_fragment_rule(p_tier text, p_fragment uuid, p_amount int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  begin
    insert into public.fragment_rules (tier, fragment_type, amount) values (p_tier, p_fragment, coalesce(p_amount, 0))
    on conflict (tier) do update set fragment_type = excluded.fragment_type, amount = excluded.amount;
  exception when check_violation or foreign_key_violation then raise exception 'invalid';
  end;
  return jsonb_build_object('tier', p_tier, 'fragment_type', p_fragment, 'amount', p_amount);
end $$;

create or replace function public.admin_set_card_fragments(p_card uuid, p_allowed boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  update public.cards set fragments_allowed = coalesce(p_allowed, true) where id = p_card;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', p_card, 'fragments_allowed', p_allowed);
end $$;

create or replace function public.admin_set_artifact_slots(p_slots int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_slots is null or p_slots < 1 or p_slots > 20 then raise exception 'invalid'; end if;
  update public.settings set value = value || jsonb_build_object('artifact_slots', p_slots) where id;
  return jsonb_build_object('slots', p_slots);
end $$;

-- ---------------------------------------------------------------- the global reset also clears fragments, artifacts and bonus XP
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
  delete from public.user_fragments where true;
  delete from public.craft_requests where true;
  delete from public.user_artifacts where true;
  update public.profiles set coins = 0, streak = 1, last_pull_at = null, showcase = '{}', avatar_card_id = null,
    title_id = null, level_claimed = 1, xp_bonus = 0 where true;

  v_details := jsonb_build_object('players', v_players, 'cards_removed', v_cards, 'coins_removed', v_coins);
  insert into public.admin_history (kind, actor, details) values ('reset_global', v_uid, v_details);
  return v_details;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function app.tier_of(bigint), app.attr_parts(uuid, text), app.add_xp_bonus(uuid, int), app.xp_trigger(),
  app.card_fragments(public.cards), app.artifact_view(public.artifacts, uuid) from public, anon, authenticated;
revoke all on function public.get_attributes(), public.get_fragments(), public.get_spare_fragments(), public.convert_duplicates(uuid, int),
  public.convert_all_duplicates(), public.get_forge(), public.craft_artifact(uuid, uuid), public.get_my_artifacts(), public.set_artifact_active(bigint, boolean),
  public.admin_artifact_config(), public.admin_upsert_artifact(jsonb), public.admin_delete_artifact(uuid), public.admin_upsert_fragment_type(jsonb),
  public.admin_set_fragment_rule(text, uuid, int), public.admin_set_card_fragments(uuid, boolean), public.admin_set_artifact_slots(int) from public, anon;
grant execute on function public.get_attributes(), public.get_fragments(), public.get_spare_fragments(), public.convert_duplicates(uuid, int),
  public.convert_all_duplicates(), public.get_forge(), public.craft_artifact(uuid, uuid), public.get_my_artifacts(), public.set_artifact_active(bigint, boolean),
  public.admin_artifact_config(), public.admin_upsert_artifact(jsonb), public.admin_delete_artifact(uuid), public.admin_upsert_fragment_type(jsonb),
  public.admin_set_fragment_rule(text, uuid, int), public.admin_set_card_fragments(uuid, boolean), public.admin_set_artifact_slots(int) to authenticated;

-- Storage (Supabase only): 'artifacts' is public (pictures are not secret); only admins write.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('artifacts', 'artifacts', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'artifacts_admin_write') then
      execute $p$create policy artifacts_admin_write on storage.objects for all to authenticated
        using (bucket_id = 'artifacts' and app.is_admin()) with check (bucket_id = 'artifacts' and app.is_admin())$p$;
    end if;
  end if;
end $$;
