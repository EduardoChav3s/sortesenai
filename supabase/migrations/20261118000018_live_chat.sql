-- SorteSenai: the live chat (messages, pictures, coins and card offers) and a fix to the draw with very high luck.

-- ---------------------------------------------------------------- the draw, high luck
-- With huge luck many cards reach a 100% chance at once. The leftover must go to the rarest of them first,
-- as luck promises; only cards with the same odds (and the same boost) share a slice equally.
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
    select b.ch, b.odds_n, count(*) as n, sum(b.ch) as total from base b group by b.ch, b.odds_n
  ), filled as (
    select g.ch, g.odds_n, g.n, greatest(0::numeric, least(g.total,
             1 - coalesce(sum(g.total) over (order by g.ch, g.odds_n desc rows between unbounded preceding and 1 preceding), 0))) as mass
    from grp g
  ), common as (
    select min(odds_n) as odds, count(*) filter (where odds_n = (select min(odds_n) from base)) as n from base
  )
  select b.id,
         (f.mass / f.n + case when b.odds_n = (select odds from common)
                              then greatest(0::numeric, 1 - (select sum(mass) from filled)) / (select n from common) else 0 end)::double precision
  from base b join filled f on f.ch = b.ch and f.odds_n = b.odds_n;
end $$;
revoke all on function app.roll_table(numeric, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- chat
create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('text', 'image', 'offer', 'coins', 'system')),
  body       text check (body is null or length(body) between 1 and 300),
  image_path text,
  card_id    uuid references public.cards (id) on delete cascade,
  price      bigint check (price is null or price > 0),
  to_user    uuid references public.profiles (id) on delete cascade,
  amount     bigint check (amount is null or amount > 0),
  status     text check (status is null or status in ('open', 'done', 'cancelled')),
  buyer      uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at desc);

-- A proposal on an offer: one of the bidder's spare cards and/or coins.
create table if not exists public.chat_bids (
  id         bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  card_id    uuid references public.cards (id) on delete cascade,
  coins      bigint not null default 0 check (coins >= 0),
  status     text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  constraint chat_bids_something check (card_id is not null or coins > 0)
);
create index if not exists chat_bids_message_idx on public.chat_bids (message_id);

-- Members read rows only so the browser can hear new ones live; everything goes through the functions below.
alter table public.chat_messages enable row level security;
alter table public.chat_bids enable row level security;
revoke all on table public.chat_messages, public.chat_bids from anon, authenticated;
grant select on table public.chat_messages, public.chat_bids to authenticated;
drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select to authenticated using (app.is_member());
drop policy if exists chat_bids_read on public.chat_bids;
create policy chat_bids_read on public.chat_bids for select to authenticated using (app.is_member());

-- At most 8 messages in 10 seconds per player.
create or replace function app.chat_guard(p_uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.chat_messages where user_id = p_uid and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'slow_down';
  end if;
end $$;

create or replace function app.chat_view(m public.chat_messages) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'body', m.body, 'image_path', m.image_path, 'created_at', m.created_at,
    'author', app.player_summary(m.user_id),
    'card', (select app.card_full(c) from public.cards c where c.id = m.card_id),
    'price', m.price, 'to', case when m.to_user is null then null else app.player_summary(m.to_user) end, 'amount', m.amount,
    'status', m.status, 'buyer', case when m.buyer is null then null else app.player_summary(m.buyer) end,
    'available', m.kind = 'offer' and m.status = 'open'
                 and exists (select 1 from public.inventory i where i.user_id = m.user_id and i.card_id = m.card_id and i.quantity >= 2),
    'bids', case when m.kind = 'offer' then coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'coins', b.coins, 'created_at', b.created_at,
                                          'bidder', app.player_summary(b.user_id),
                                          'card', (select app.card_full(c) from public.cards c where c.id = b.card_id)) order by b.created_at)
      from public.chat_bids b where b.message_id = m.id), '[]') end)
$$;

-- The latest 60 messages, oldest first; p_before pages back.
create or replace function public.get_chat(p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_member();
  return coalesce((
    select jsonb_agg(app.chat_view(m) order by m.id)
    from (select * from public.chat_messages where p_before is null or id < p_before order by id desc limit 60) m), '[]');
end $$;

-- Text, or a picture (with an optional caption). The picture is a file the player sent to their own folder.
create or replace function public.chat_send(p_text text, p_image text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_image text := nullif(btrim(coalesce(p_image, '')), '');
  m public.chat_messages;
begin
  if v_text is null and v_image is null then raise exception 'invalid'; end if;
  if length(v_text) > 300 then raise exception 'invalid'; end if;
  if v_image is not null and (split_part(v_image, '/', 1) <> v_uid::text or v_image !~ '^[0-9a-f-]+/[A-Za-z0-9_.-]+$') then raise exception 'invalid'; end if;
  perform app.chat_guard(v_uid);
  insert into public.chat_messages (user_id, kind, body, image_path)
  values (v_uid, case when v_image is null then 'text' else 'image' end, v_text, v_image) returning * into m;
  return app.chat_view(m);
end $$;

create or replace function public.chat_send_coins(p_to uuid, p_amount bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  m public.chat_messages;
begin
  if p_to is null or p_to = v_uid or coalesce(p_amount, 0) <= 0 or length(v_note) > 60 then raise exception 'invalid'; end if;
  if not exists (select 1 from public.profiles where id = p_to and not banned) then raise exception 'invalid'; end if;
  perform app.chat_guard(v_uid);
  perform app.move_coins(v_uid, -p_amount, 'chat:enviou', p_to::text);
  perform app.move_coins(p_to, p_amount, 'chat:recebeu', v_uid::text);
  insert into public.chat_messages (user_id, kind, body, to_user, amount) values (v_uid, 'coins', v_note, p_to, p_amount) returning * into m;
  return app.chat_view(m);
end $$;

-- Only a spare copy can be offered (the player keeps one), like gifts and trades.
create or replace function public.chat_offer(p_card uuid, p_price bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  m public.chat_messages;
begin
  if length(v_note) > 60 or (p_price is not null and p_price <= 0) then raise exception 'invalid'; end if;
  if not exists (select 1 from public.inventory where user_id = v_uid and card_id = p_card and quantity >= 2) then raise exception 'invalid'; end if;
  if (select count(*) from public.chat_messages where user_id = v_uid and kind = 'offer' and status = 'open') >= 5 then raise exception 'invalid'; end if;
  perform app.chat_guard(v_uid);
  insert into public.chat_messages (user_id, kind, body, card_id, price, status) values (v_uid, 'offer', v_note, p_card, p_price, 'open') returning * into m;
  return app.chat_view(m);
end $$;

create or replace function app.chat_close(p_offer bigint, p_buyer uuid, p_text text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.chat_messages set status = 'done', buyer = p_buyer where id = p_offer;
  update public.chat_bids set status = 'rejected' where message_id = p_offer and status = 'open';
  insert into public.chat_messages (user_id, kind, body) values (p_buyer, 'system', p_text);
end $$;

-- Buy at the asked price: the coins and the card move together, or nothing moves.
create or replace function public.chat_buy(p_offer bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  m public.chat_messages;
begin
  select * into m from public.chat_messages where id = p_offer and kind = 'offer' for update;
  if not found then raise exception 'not_found'; end if;
  if m.status <> 'open' or m.price is null or m.user_id = v_uid then raise exception 'invalid'; end if;
  perform app.move_coins(v_uid, -m.price, 'chat:compra', m.id::text);
  perform app.move_coins(m.user_id, m.price, 'chat:venda', m.id::text);
  perform app.give_copy(m.user_id, v_uid, m.card_id);
  perform app.chat_close(m.id, v_uid, format('%s comprou %s de %s por %s moedas',
    (select nickname from public.profiles where id = v_uid), (select title from public.cards where id = m.card_id),
    (select nickname from public.profiles where id = m.user_id), m.price));
  select * into m from public.chat_messages where id = p_offer;
  return app.chat_view(m);
end $$;

-- A proposal: a spare card and/or coins. A new proposal from the same player replaces the old one.
create or replace function public.chat_bid(p_offer bigint, p_card uuid, p_coins bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  m public.chat_messages;
  b public.chat_bids;
begin
  select * into m from public.chat_messages where id = p_offer and kind = 'offer';
  if not found then raise exception 'not_found'; end if;
  if m.status <> 'open' or m.user_id = v_uid or coalesce(p_coins, 0) < 0 or (p_card is null and coalesce(p_coins, 0) = 0) then raise exception 'invalid'; end if;
  if p_card is not null and not exists (select 1 from public.inventory where user_id = v_uid and card_id = p_card and quantity >= 2) then raise exception 'invalid'; end if;
  if coalesce(p_coins, 0) > (select coins from public.profiles where id = v_uid) then raise exception 'insufficient_coins'; end if;
  perform app.chat_guard(v_uid);
  delete from public.chat_bids where message_id = p_offer and user_id = v_uid and status = 'open';
  insert into public.chat_bids (message_id, user_id, card_id, coins) values (p_offer, v_uid, p_card, coalesce(p_coins, 0)) returning * into b;
  return jsonb_build_object('id', b.id, 'status', b.status);
end $$;

create or replace function public.chat_accept_bid(p_bid bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  b public.chat_bids;
  m public.chat_messages;
begin
  select * into b from public.chat_bids where id = p_bid for update;
  if not found then raise exception 'not_found'; end if;
  select * into m from public.chat_messages where id = b.message_id for update;
  if m.user_id <> v_uid then raise exception 'forbidden'; end if;
  if m.status <> 'open' or b.status <> 'open' then raise exception 'invalid'; end if;
  if b.coins > 0 then
    perform app.move_coins(b.user_id, -b.coins, 'chat:compra', m.id::text);
    perform app.move_coins(v_uid, b.coins, 'chat:venda', m.id::text);
  end if;
  perform app.give_copy(v_uid, b.user_id, m.card_id);
  if b.card_id is not null then perform app.give_copy(b.user_id, v_uid, b.card_id); end if;
  update public.chat_bids set status = 'accepted' where id = b.id;
  perform app.chat_close(m.id, b.user_id, format('%s trocou %s com %s',
    (select nickname from public.profiles where id = v_uid), (select title from public.cards where id = m.card_id),
    (select nickname from public.profiles where id = b.user_id)));
  select * into m from public.chat_messages where id = m.id;
  return app.chat_view(m);
end $$;

create or replace function public.chat_cancel_offer(p_offer bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  m public.chat_messages;
begin
  select * into m from public.chat_messages where id = p_offer and kind = 'offer' for update;
  if not found then raise exception 'not_found'; end if;
  if m.user_id <> v_uid then raise exception 'forbidden'; end if;
  if m.status <> 'open' then raise exception 'invalid'; end if;
  update public.chat_messages set status = 'cancelled' where id = p_offer returning * into m;
  update public.chat_bids set status = 'rejected' where message_id = p_offer and status = 'open';
  return app.chat_view(m);
end $$;

-- Moderation: an admin removes a message (its proposals go with it). Returns the picture path so the site deletes the file.
create or replace function public.admin_delete_chat_message(p_msg bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_path text;
begin
  perform app.require_admin();
  delete from public.chat_messages where id = p_msg returning image_path into v_path;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('image_path', v_path);
end $$;

revoke all on function app.chat_guard(uuid), app.chat_view(public.chat_messages), app.chat_close(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.get_chat(bigint), public.chat_send(text, text), public.chat_send_coins(uuid, bigint, text),
  public.chat_offer(uuid, bigint, text), public.chat_buy(bigint), public.chat_bid(bigint, uuid, bigint), public.chat_accept_bid(bigint),
  public.chat_cancel_offer(bigint), public.admin_delete_chat_message(bigint) from public, anon;
grant execute on function public.get_chat(bigint), public.chat_send(text, text), public.chat_send_coins(uuid, bigint, text),
  public.chat_offer(uuid, bigint, text), public.chat_buy(bigint), public.chat_bid(bigint, uuid, bigint), public.chat_accept_bid(bigint),
  public.chat_cancel_offer(bigint), public.admin_delete_chat_message(bigint) to authenticated;

-- Live: the browser hears new and changed messages and proposals (Supabase only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
      alter publication supabase_realtime add table public.chat_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_bids') then
      alter publication supabase_realtime add table public.chat_bids;
    end if;
  end if;
end $$;

-- Storage (Supabase only): 'chat' is private; members read every picture, each player writes only in their own folder.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat', 'chat', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    drop policy if exists chat_read on storage.objects;
    execute $p$create policy chat_read on storage.objects for select to authenticated using (bucket_id = 'chat' and app.is_member())$p$;
    drop policy if exists chat_write on storage.objects;
    execute $p$create policy chat_write on storage.objects for insert to authenticated
      with check (bucket_id = 'chat' and app.is_member() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    drop policy if exists chat_admin_delete on storage.objects;
    execute $p$create policy chat_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'chat' and app.is_admin())$p$;
  end if;
end $$;
