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
