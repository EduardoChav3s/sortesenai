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
