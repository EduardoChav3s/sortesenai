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
