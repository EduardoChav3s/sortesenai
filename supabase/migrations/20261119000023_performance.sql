-- Speed for many players at once. Same rules, same numbers, much less work per request.
--
-- 1. XP was counted from scratch on every request: app.xp() read all of a player's rolls, cards, games,
--    slot bets, daily claims and missions. Every name on the chat, the mural, the ranking and the friends
--    list shows a level, so one chat refresh ran hundreds of those counts. Now the counts are kept in
--    app.xp_counts, updated by triggers when rows come and go, and app.xp() reads one row.
--    The XP formula and the numbers are exactly the same (the database tests compare both ways).
-- 2. Index for "best card a player ever rolled" (ranking 'rarest' and the title check).
-- 3. The title check reads the roll count from app.xp_counts instead of counting rolls on every roll.
--
-- Runs as one transaction: creating the triggers locks the tables against writes until the backfill is done,
-- so no row is counted twice or missed.
begin;

create table if not exists app.xp_counts (
  user_id  uuid primary key,
  pulls    bigint not null default 0,
  cards    bigint not null default 0, -- rows in inventory (as app.xp always counted them)
  games    bigint not null default 0, -- finished game sessions
  slots    bigint not null default 0, -- 'jogo:slots aposta' coin rows
  daily    bigint not null default 0,
  missions bigint not null default 0
);
revoke all on table app.xp_counts from public, anon, authenticated;

-- Insert and delete: one statement may touch many rows (the global reset deletes them all), so these run once
-- per statement and add up the rows per player. Arguments: the counter column and the filter on the rows.
create or replace function app.xp_count_stmt() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_col text := tg_argv[0];
  v_filter text := coalesce(tg_argv[1], 'true');
begin
  if tg_op = 'INSERT' then
    execute format('insert into app.xp_counts as x (user_id, %1$I) select user_id, count(*) from xp_new where %2$s group by user_id
                    on conflict (user_id) do update set %1$I = x.%1$I + excluded.%1$I', v_col, v_filter);
  elsif tg_op = 'DELETE' then
    execute format('insert into app.xp_counts as x (user_id, %1$I) select user_id, -count(*) from xp_old where %2$s group by user_id
                    on conflict (user_id) do update set %1$I = x.%1$I + excluded.%1$I', v_col, v_filter);
  end if;
  return null;
end $$;

-- Update: only fires (see the WHEN clauses) when a row changes owner or starts/stops counting.
create or replace function app.xp_count_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_col text;
  v_was boolean := true;
  v_now boolean := true;
begin
  if tg_table_name = 'game_sessions' then
    v_col := 'games'; v_was := old.finished_at is not null; v_now := new.finished_at is not null;
  elsif tg_table_name = 'coin_transactions' then
    v_col := 'slots'; v_was := old.reason = 'jogo:slots aposta'; v_now := new.reason = 'jogo:slots aposta';
  else
    v_col := case tg_table_name when 'pulls' then 'pulls' when 'inventory' then 'cards'
                                when 'daily_claims' then 'daily' when 'mission_claims' then 'missions' end;
  end if;
  if v_was and (not v_now or old.user_id is distinct from new.user_id) then
    execute format('insert into app.xp_counts as x (user_id, %1$I) values ($1, -1) on conflict (user_id) do update set %1$I = x.%1$I - 1', v_col) using old.user_id;
  end if;
  if v_now and (not v_was or old.user_id is distinct from new.user_id) then
    execute format('insert into app.xp_counts as x (user_id, %1$I) values ($1, 1) on conflict (user_id) do update set %1$I = x.%1$I + 1', v_col) using new.user_id;
  end if;
  return null;
end $$;
revoke all on function app.xp_count_stmt(), app.xp_count_row() from public, anon, authenticated;

drop trigger if exists xp_count_ins on public.pulls;
create trigger xp_count_ins after insert on public.pulls referencing new table as xp_new for each statement execute function app.xp_count_stmt('pulls');
drop trigger if exists xp_count_del on public.pulls;
create trigger xp_count_del after delete on public.pulls referencing old table as xp_old for each statement execute function app.xp_count_stmt('pulls');
drop trigger if exists xp_count_upd on public.pulls;
create trigger xp_count_upd after update on public.pulls for each row when (old.user_id is distinct from new.user_id) execute function app.xp_count_row();

drop trigger if exists xp_count_ins on public.inventory;
create trigger xp_count_ins after insert on public.inventory referencing new table as xp_new for each statement execute function app.xp_count_stmt('cards');
drop trigger if exists xp_count_del on public.inventory;
create trigger xp_count_del after delete on public.inventory referencing old table as xp_old for each statement execute function app.xp_count_stmt('cards');
drop trigger if exists xp_count_upd on public.inventory;
create trigger xp_count_upd after update on public.inventory for each row when (old.user_id is distinct from new.user_id) execute function app.xp_count_row();

drop trigger if exists xp_count_ins on public.game_sessions;
create trigger xp_count_ins after insert on public.game_sessions referencing new table as xp_new for each statement execute function app.xp_count_stmt('games', 'finished_at is not null');
drop trigger if exists xp_count_del on public.game_sessions;
create trigger xp_count_del after delete on public.game_sessions referencing old table as xp_old for each statement execute function app.xp_count_stmt('games', 'finished_at is not null');
drop trigger if exists xp_count_upd on public.game_sessions;
create trigger xp_count_upd after update on public.game_sessions for each row when (old.user_id is distinct from new.user_id or (old.finished_at is null) <> (new.finished_at is null)) execute function app.xp_count_row();

drop trigger if exists xp_count_ins on public.coin_transactions;
create trigger xp_count_ins after insert on public.coin_transactions referencing new table as xp_new for each statement execute function app.xp_count_stmt('slots', 'reason = ''jogo:slots aposta''');
drop trigger if exists xp_count_del on public.coin_transactions;
create trigger xp_count_del after delete on public.coin_transactions referencing old table as xp_old for each statement execute function app.xp_count_stmt('slots', 'reason = ''jogo:slots aposta''');
drop trigger if exists xp_count_upd on public.coin_transactions;
create trigger xp_count_upd after update on public.coin_transactions for each row when (old.user_id is distinct from new.user_id or old.reason is distinct from new.reason) execute function app.xp_count_row();

drop trigger if exists xp_count_ins on public.daily_claims;
create trigger xp_count_ins after insert on public.daily_claims referencing new table as xp_new for each statement execute function app.xp_count_stmt('daily');
drop trigger if exists xp_count_del on public.daily_claims;
create trigger xp_count_del after delete on public.daily_claims referencing old table as xp_old for each statement execute function app.xp_count_stmt('daily');
drop trigger if exists xp_count_upd on public.daily_claims;
create trigger xp_count_upd after update on public.daily_claims for each row when (old.user_id is distinct from new.user_id) execute function app.xp_count_row();

drop trigger if exists xp_count_ins on public.mission_claims;
create trigger xp_count_ins after insert on public.mission_claims referencing new table as xp_new for each statement execute function app.xp_count_stmt('missions');
drop trigger if exists xp_count_del on public.mission_claims;
create trigger xp_count_del after delete on public.mission_claims referencing old table as xp_old for each statement execute function app.xp_count_stmt('missions');
drop trigger if exists xp_count_upd on public.mission_claims;
create trigger xp_count_upd after update on public.mission_claims for each row when (old.user_id is distinct from new.user_id) execute function app.xp_count_row();

-- Backfill from the rows already there (the triggers above hold off other writers until commit).
delete from app.xp_counts;
insert into app.xp_counts (user_id, pulls, cards, games, slots, daily, missions)
select p.id,
  (select count(*) from public.pulls where user_id = p.id),
  (select count(*) from public.inventory where user_id = p.id),
  (select count(*) from public.game_sessions where user_id = p.id and finished_at is not null),
  (select count(*) from public.coin_transactions where user_id = p.id and reason = 'jogo:slots aposta'),
  (select count(*) from public.daily_claims where user_id = p.id),
  (select count(*) from public.mission_claims where user_id = p.id)
from public.profiles p;

-- Same formula as before, read from the counters.
create or replace function app.xp(p_user uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select x.pulls * 10 + x.cards * 25 + x.games * 15 + x.slots * 5 + x.daily * 20 + x.missions * 30
                   from app.xp_counts x where x.user_id = p_user), 0)
       + coalesce((select xp_bonus from public.profiles where id = p_user), 0)
$$;
revoke all on function app.xp(uuid) from public, anon, authenticated;

-- "Best card ever rolled" (ranking 'rarest', title 'pulled_at_least'): one index lookup instead of reading every roll.
create index if not exists pulls_user_odds_idx on public.pulls (user_id, odds_n_at_pull desc);

-- Title check: same rules; the roll count comes from the counters.
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
        when 'pull_count' then coalesce((select x.pulls from app.xp_counts x where x.user_id = p_user), 0) >= (t.condition->>'count')::int
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
revoke all on function app.check_titles(uuid) from public, anon, authenticated;

commit;
