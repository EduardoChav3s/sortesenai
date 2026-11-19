-- SorteSenai: the bell (notifications written by the database when something happens to a player)
-- and the daily chest (the daily bonus now draws a prize: coins, fragments or a potion).

-- ---------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  body       text not null,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated; -- only to hear new ones live
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());

create or replace function app.notify(p_user uuid, p_kind text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, body, link) values (p_user, p_kind, left(p_body, 200), p_link);
  delete from public.notifications where user_id = p_user and created_at < now() - interval '30 days';
end $$;

create or replace function app.nick(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$ select nickname from public.profiles where id = p_user $$;
create or replace function app.card_title(p_card uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$ select title from public.cards where id = p_card $$;

-- Every event that concerns another player leaves them a note.
create or replace function app.notify_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_offer public.chat_messages;
begin
  if tg_table_name = 'chat_messages' then
    if tg_op = 'INSERT' and new.kind = 'coins' then
      perform app.notify(new.to_user, 'coins', format('%s te mandou %s moedas%s', app.nick(new.user_id), new.amount,
        case when new.body is not null then ': "' || new.body || '"' else '' end), '/chat');
    elsif tg_op = 'UPDATE' and new.kind = 'offer' and old.status = 'open' and new.status = 'done' then
      if exists (select 1 from public.chat_bids b where b.message_id = new.id and b.status = 'accepted') then
        perform app.notify(new.buyer, 'bid_accepted', format('%s aceitou sua proposta por %s', app.nick(new.user_id), app.card_title(new.card_id)), '/chat');
      else
        perform app.notify(new.user_id, 'sold', format('%s comprou sua oferta %s por %s moedas', app.nick(new.buyer), app.card_title(new.card_id), new.price), '/chat');
      end if;
    end if;
  elsif tg_table_name = 'chat_bids' then
    select * into v_offer from public.chat_messages where id = new.message_id;
    perform app.notify(v_offer.user_id, 'bid', format('%s fez uma proposta por %s', app.nick(new.user_id), app.card_title(v_offer.card_id)), '/chat');
  elsif tg_table_name = 'card_gifts' then
    perform app.notify(new.to_user, 'gift', format('%s te deu a carta %s', app.nick(new.from_user), app.card_title(new.card_id)), '/colecao');
  elsif tg_table_name = 'trades' then
    if tg_op = 'INSERT' then
      perform app.notify(new.to_user, 'trade', format('%s quer trocar %s com você', app.nick(new.from_user), app.card_title(new.give_card)), '/amigos');
    elsif old.status = 'pending' and new.status = 'accepted' then
      perform app.notify(new.from_user, 'trade_accepted', format('%s aceitou sua troca', app.nick(new.to_user)), '/colecao');
    end if;
  elsif tg_table_name = 'challenges' then
    if tg_op = 'INSERT' then
      perform app.notify(new.to_user, 'duel', format('%s te desafiou valendo %s moedas', app.nick(new.from_user), new.bet), '/amigos');
    elsif old.status = 'pending' and new.status = 'done' then
      perform app.notify(new.from_user, 'duel_done', format('Seu duelo com %s acabou: %s', app.nick(new.to_user),
        case when new.winner = new.from_user then 'você ganhou!' when new.winner is null then 'empate' else 'você perdeu' end), '/amigos');
    end if;
  elsif tg_table_name = 'friendships' then
    if tg_op = 'INSERT' and new.status = 'pending' then
      perform app.notify(new.addressee, 'friend', format('%s quer ser seu amigo', app.nick(new.requester)), '/amigos');
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
      perform app.notify(new.requester, 'friend_accepted', format('%s aceitou sua amizade', app.nick(new.addressee)), '/amigos');
    end if;
  end if;
  return null;
end $$;

drop trigger if exists notify_chat on public.chat_messages;
create trigger notify_chat after insert or update on public.chat_messages for each row execute function app.notify_trigger();
drop trigger if exists notify_bids on public.chat_bids;
create trigger notify_bids after insert on public.chat_bids for each row execute function app.notify_trigger();
drop trigger if exists notify_gifts on public.card_gifts;
create trigger notify_gifts after insert on public.card_gifts for each row execute function app.notify_trigger();
drop trigger if exists notify_trades on public.trades;
create trigger notify_trades after insert or update on public.trades for each row execute function app.notify_trigger();
drop trigger if exists notify_duels on public.challenges;
create trigger notify_duels after insert or update on public.challenges for each row execute function app.notify_trigger();
drop trigger if exists notify_friends on public.friendships;
create trigger notify_friends after insert or update on public.friendships for each row execute function app.notify_trigger();

create or replace function public.get_notifications() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return jsonb_build_object(
    'unread', (select count(*) from public.notifications where user_id = v_uid and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'link', n.link,
                                                           'read', n.read_at is not null, 'created_at', n.created_at) order by n.created_at desc)
                       from (select * from public.notifications where user_id = v_uid order by created_at desc limit 30) n), '[]'));
end $$;

-- p_ids null marks everything as read.
create or replace function public.mark_notifications_read(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member(); v_n int;
begin
  update public.notifications set read_at = now()
  where user_id = v_uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return jsonb_build_object('marked', v_n);
end $$;

-- ---------------------------------------------------------------- the daily chest
create table if not exists public.chest_prizes (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('coins', 'fragments', 'potion')),
  amount        int not null check (amount > 0),
  fragment_type uuid references public.fragment_types (id) on delete cascade,
  item_id       uuid references public.items (id) on delete cascade,
  weight        int not null check (weight > 0),
  active        boolean not null default true,
  sort          int not null default 0,
  constraint chest_prizes_target check ((kind = 'fragments') = (fragment_type is not null) and (kind = 'potion') = (item_id is not null))
);
alter table public.chest_prizes enable row level security;
revoke all on table public.chest_prizes from anon, authenticated;

-- starting prizes (the admin changes them later)
insert into public.chest_prizes (kind, amount, fragment_type, item_id, weight, sort)
select v.kind, v.amount, v.frag, v.item, v.weight, v.sort from (values
  ('coins', 100, null::uuid, null::uuid, 30, 1),
  ('coins', 200, null, null, 30, 2),
  ('coins', 500, null, null, 15, 3),
  ('coins', 1500, null, null, 4, 4),
  ('fragments', 5, (select id from public.fragment_types where name = 'Comum'), null, 12, 5),
  ('fragments', 2, (select id from public.fragment_types where name = 'Raro'), null, 5, 6),
  ('potion', 1, null, (select id from public.items where active order by price limit 1), 4, 7)) v(kind, amount, frag, item, weight, sort)
where not exists (select 1 from public.chest_prizes)
  and (v.kind <> 'fragments' or v.frag is not null) and (v.kind <> 'potion' or v.item is not null);

create or replace function app.chest_label(p public.chest_prizes) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case p.kind
    when 'coins' then p.amount || ' moedas'
    when 'fragments' then p.amount || ' fragmento' || case when p.amount > 1 then 's ' else ' ' end || (select name from public.fragment_types where id = p.fragment_type)
    else p.amount || 'x ' || (select name from public.items where id = p.item_id) end
$$;

create or replace function app.chest_table() returns table (id uuid, chance double precision)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, (p.weight::double precision / sum(p.weight) over ()) from public.chest_prizes p where p.active
$$;

-- One random number against the weights; same fair method as the card roll.
create or replace function app.chest_draw() returns public.chest_prizes
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_u double precision := app.rand(); v_id uuid; v_p public.chest_prizes;
begin
  select t.id into v_id from (select c.id, sum(c.chance) over (order by c.chance, c.id) as upto from app.chest_table() c) t
  where t.upto > v_u order by t.upto limit 1;
  if v_id is null then select c.id into v_id from app.chest_table() c order by c.chance desc, c.id desc limit 1; end if;
  select * into v_p from public.chest_prizes where id = v_id;
  return v_p;
end $$;

create or replace function public.get_chest() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_member();
begin
  return jsonb_build_object(
    'claimed_today', exists (select 1 from public.daily_claims where user_id = v_uid and day = app.today()),
    'next_at', ((app.today() + 1)::timestamp at time zone 'America/Sao_Paulo'),
    'prizes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'amount', p.amount, 'label', app.chest_label(p), 'chance', c.chance)
                                         order by p.sort, p.weight desc)
                        from public.chest_prizes p join app.chest_table() c on c.id = p.id), '[]'));
end $$;

-- The daily bonus: opens the chest once a day. Coins still count as the daily bonus (money multiplier, XP, missions).
create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := app.require_member();
  v_p public.chest_prizes;
  v_coins bigint;
  v_before bigint;
  v_label text;
begin
  select coins into v_before from public.profiles where id = v_uid;
  insert into public.daily_claims (user_id, day, amount) values (v_uid, app.today(), 0) on conflict do nothing;
  if not found then raise exception 'already_claimed'; end if;
  if exists (select 1 from public.chest_prizes where active) then
    v_p := app.chest_draw();
  else -- no prize set up: the old fixed coins
    v_p := row(null, 'coins', (app.settings()->>'daily_reward')::int, null, null, 1, true, 0)::public.chest_prizes;
  end if;
  v_label := coalesce(app.chest_label(v_p), v_p.amount || ' moedas');
  if v_p.kind = 'coins' then
    v_coins := app.move_coins(v_uid, v_p.amount, 'bonus diario');
    update public.daily_claims set amount = v_coins - v_before where user_id = v_uid and day = app.today();
  elsif v_p.kind = 'fragments' then
    insert into public.user_fragments (user_id, fragment_type, quantity) values (v_uid, v_p.fragment_type, v_p.amount)
    on conflict (user_id, fragment_type) do update set quantity = public.user_fragments.quantity + excluded.quantity;
  else
    insert into public.user_items (user_id, item_id, quantity) values (v_uid, v_p.item_id, v_p.amount)
    on conflict (user_id, item_id) do update set quantity = public.user_items.quantity + excluded.quantity;
  end if;
  return jsonb_build_object('prize', jsonb_build_object('id', v_p.id, 'kind', v_p.kind, 'amount', v_p.amount, 'label', v_label,
                                                       'coins_given', case when v_p.kind = 'coins' then v_coins - v_before end),
                            'coins_after', (select coins from public.profiles where id = v_uid),
                            'titles_unlocked', app.check_titles(v_uid));
end $$;

-- admin
create or replace function public.admin_list_chest_prizes() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('label', app.chest_label(p),
                    'chance', (select c.chance from app.chest_table() c where c.id = p.id)) order by p.active desc, p.sort, p.weight desc)
                   from public.chest_prizes p), '[]');
end $$;

-- p: { id?, kind, amount, fragment_type?, item_id?, weight, active }
create or replace function public.admin_upsert_chest_prize(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.chest_prizes;
begin
  perform app.require_admin();
  begin
    insert into public.chest_prizes (id, kind, amount, fragment_type, item_id, weight, active, sort)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'kind', (p->>'amount')::int,
            case when p->>'kind' = 'fragments' then (p->>'fragment_type')::uuid end, case when p->>'kind' = 'potion' then (p->>'item_id')::uuid end,
            (p->>'weight')::int, coalesce((p->>'active')::boolean, true), coalesce((p->>'sort')::int, (select coalesce(max(sort), 0) + 1 from public.chest_prizes)))
    on conflict (id) do update set kind = excluded.kind, amount = excluded.amount, fragment_type = excluded.fragment_type,
      item_id = excluded.item_id, weight = excluded.weight, active = excluded.active
    returning * into v;
  exception when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then raise exception 'invalid';
  end;
  return to_jsonb(v);
end $$;

create or replace function public.admin_delete_chest_prize(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  delete from public.chest_prizes where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', p_id);
end $$;

-- ---------------------------------------------------------------- grants and live
revoke all on function app.notify(uuid, text, text, text), app.nick(uuid), app.card_title(uuid), app.notify_trigger(),
  app.chest_label(public.chest_prizes), app.chest_table(), app.chest_draw() from public, anon, authenticated;
revoke all on function public.get_notifications(), public.mark_notifications_read(bigint[]), public.get_chest(), public.claim_daily(),
  public.admin_list_chest_prizes(), public.admin_upsert_chest_prize(jsonb), public.admin_delete_chest_prize(uuid) from public, anon;
grant execute on function public.get_notifications(), public.mark_notifications_read(bigint[]), public.get_chest(), public.claim_daily(),
  public.admin_list_chest_prizes(), public.admin_upsert_chest_prize(jsonb), public.admin_delete_chest_prize(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
