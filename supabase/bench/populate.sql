-- Bench data: a busy class. :players players, each with :pulls rolls, games, coins history,
-- a full chat (60 messages, some offers with bids) and a long mural.
create schema if not exists bench;
create table bench.users (n int primary key, id uuid not null, email text not null);
insert into bench.users select g, ('00000000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, 'p' || g || '@turma.test'
from generate_series(1, :players) g;

insert into public.allowed_emails (email) select email from bench.users on conflict do nothing;
insert into public.profiles (id, email, nickname, coins)
select id, email, 'jogador_' || n, 1000000 from bench.users;

-- rolls, spread over the last days
insert into public.pulls (user_id, card_id, odds_n_at_pull, luck_used, created_at)
select u.id, c.id, c.odds_n, 1, now() - (random() * interval '7 days')
from bench.users u, generate_series(1, :pulls) g,
lateral (select id, odds_n from public.cards where active order by random() + g * 0 + (u.n * 0) limit 1) c;

insert into public.inventory (user_id, card_id, quantity)
select user_id, card_id, count(*) from public.pulls group by 1, 2;

insert into public.coin_transactions (user_id, amount, reason)
select u.id, -10, case when g % 5 = 0 then 'jogo:slots aposta' else 'roletada' end
from bench.users u, generate_series(1, :pulls) g;

insert into public.game_sessions (user_id, game, finished_at, reward)
select u.id, 'memory', now(), 10 from bench.users u, generate_series(1, :pulls / 10) g;

insert into public.daily_claims (user_id, day, amount)
select u.id, current_date - g, 100 from bench.users u, generate_series(1, 7) g;

insert into public.feed_events (user_id, card_id, odds_n_at_pull, luck, created_at)
select user_id, card_id, odds_n_at_pull, 1, created_at from public.pulls where odds_n_at_pull >= 1000 limit 2000;

insert into public.chat_messages (user_id, kind, body, created_at)
select u.id, 'text', 'mensagem ' || g, now() - g * interval '1 minute'
from generate_series(1, 200) g, lateral (select id from bench.users where n = 1 + (g % :players)) u;
-- a few offers with bids from other players
with o as (
  insert into public.chat_messages (user_id, kind, card_id, price, status)
  select u.id, 'offer', (select id from public.cards where active order by odds_n limit 1), 50, 'open'
  from bench.users u where u.n <= 10 returning id, user_id)
insert into public.chat_bids (message_id, user_id, coins)
select o.id, b.id, 20 from o, bench.users b where b.n between 11 and 15;

analyze;
