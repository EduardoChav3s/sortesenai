-- SorteSenai database tests. Run with supabase/tests/run.sh (throwaway local Postgres).
-- Each check raises on failure, so the run stops at the first broken rule.
\set ON_ERROR_STOP on
\set QUIET on

create schema t;
create function t.as_user(p_uid uuid, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'email', p_email)::text, false);
end $$;
create function t.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_what; end if;
  raise notice 'ok  %', p_what;
end $$;
create function t.err(p_sql text, p_code text, p_what text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
    v_msg := '(no error)';
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg not like p_code || '%' then raise exception 'FAIL: % (expected %, got %)', p_what, p_code, v_msg; end if;
  raise notice 'ok  %', p_what;
end $$;
grant usage on schema t to authenticated;
grant execute on all functions in schema t to authenticated;

\set duda '''00000000-0000-0000-0000-00000000000d'''
\set ana  '''00000000-0000-0000-0000-00000000000a'''

-- ------------------------------------------------------------ access
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
-- no guest list: any signed-in Google or e-mail account plays
select t.ok(public.my_session()->>'access' = 'ok', 'qualquer conta logada entra, sem convite');
select t.ok((select coins from public.profiles) = 500, 'perfil criado com 500 moedas');
select t.ok((select nickname from public.profiles) = 'duda', 'apelido sai do e-mail');

-- ------------------------------------------------------------ the browser cannot touch tables
select t.ok((select count(*) from public.cards) = 0, 'jogador nao le a tabela de cartas (texto secreto)');
select t.err($$insert into public.cards (title, joke, odds_n) values ('x', 'y', 10)$$, 'permission denied', 'jogador nao cria carta');
select t.err($$update public.profiles set coins = 999999$$, 'permission denied', 'jogador nao muda o proprio saldo');
select t.err('select count(*) from public.game_sessions', 'permission denied', 'jogador nao le segredos dos jogos');
select t.ok(not exists (
  select 1 from jsonb_array_elements(public.get_collection()) e
  where not (e->>'owned')::boolean and (e->'card') ?| array['title', 'joke', 'image_path']), 'carta bloqueada nao revela piada');
select t.ok(jsonb_array_length(public.get_collection()) = 17, 'colecao lista as 17 cartas');

-- ------------------------------------------------------------ the roll
do $$
declare r jsonb := public.pull();
begin
  perform t.ok((r->>'coins_after')::int = 490, 'roletar custa 10');
  perform t.ok((r->>'is_new')::boolean, 'primeira carta e nova');
  perform t.ok(r->'titles_unlocked'->0->>'name' = 'Primeira roletada', 'titulo da primeira roletada liberado');
  perform t.ok(r->'card' ? 'joke', 'carta tirada mostra a piada');
end $$;
select t.ok(jsonb_array_length(public.pull()->'titles_unlocked') = 0, 'titulo nao se repete');
reset role;
update public.profiles set coins = 5 where email = 'duda@turma.test';
set role authenticated;
select t.err('select public.pull()', 'insufficient_coins', 'sem moedas nao roleta');
select t.ok((select coins from public.profiles) = 5, 'saldo intacto depois do erro');

-- ------------------------------------------------------------ daily reward
reset role;
update public.chest_prizes set active = false where true;
set role authenticated;
select t.ok((public.claim_daily()->>'coins_after')::int = 205, 'bau sem premios ligados: o bonus volta a ser 200 moedas');
reset role;
update public.chest_prizes set active = true where true;
set role authenticated;
select t.err('select public.claim_daily()', 'already_claimed', 'bonus so uma vez por dia');

-- ------------------------------------------------------------ shop and luck
select t.err($$select public.buy_item((select id from public.items where name = 'Lenda engarrafada'))$$, 'insufficient_coins', 'pocao cara sem saldo');
reset role;
update public.profiles set coins = 300000 where email = 'duda@turma.test';
set role authenticated;
select public.buy_item((select id from public.items where name = 'Lenda engarrafada'));
select public.use_potion((select id from public.items where name = 'Lenda engarrafada'));
select t.ok((public.get_luck()->>'effective')::numeric = 1000000, 'lenda engarrafada leva a sorte ao teto');
do $$
declare r jsonb := public.pull();
begin
  perform t.ok((r->>'luck_used')::numeric = 1000000, 'roletada usa a sorte da pocao');
  perform t.ok((r->>'odds_n_at_pull')::bigint >= 150000, 'com sorte 1.000.000x sai carta rara');
end $$;
select t.ok(jsonb_array_length(public.get_luck()->'effects') = 0, 'pocao de 1 roletada acaba');
select t.err($$select public.use_potion((select id from public.items where name = 'Lenda engarrafada'))$$, 'invalid', 'nao usa pocao que nao tem');

select public.buy_title((select id from public.titles where name = 'Mão de ouro'));
select t.err($$select public.buy_title((select id from public.titles where name = 'Mão de ouro'))$$, 'invalid', 'titulo comprado so uma vez');
select t.err($$select public.buy_title((select id from public.titles where name = 'Primeira 1/1 mi'))$$, 'not_found', 'titulo conquistavel nao esta a venda');

-- ------------------------------------------------------------ recycle and profile
reset role;
insert into public.inventory (user_id, card_id, quantity)
  select :duda, id, 2 from public.cards where odds_n = 1200
  on conflict (user_id, card_id) do update set quantity = 2;
set role authenticated;
select t.ok((public.recycle((select (e->'card'->>'id')::uuid from jsonb_array_elements(public.get_collection()) e where (e->'card'->>'odds_n')::bigint = 1200), 1)->>'gained')::int = 21,
            'reciclar 1/1.200 rende 21');
select t.err($$select public.recycle((select (e->'card'->>'id')::uuid from jsonb_array_elements(public.get_collection()) e where (e->'card'->>'odds_n')::bigint = 1200), 5)$$,
             'invalid', 'nao recicla mais do que tem');
select t.err($$select public.update_profile('{"nickname":"ab"}')$$, 'invalid', 'apelido curto recusado');
select t.err($$select public.update_profile(jsonb_build_object('avatar_card_id', (select (e->'card'->>'id') from jsonb_array_elements(public.get_collection()) e where not (e->>'owned')::boolean limit 1)))$$,
             'invalid', 'avatar so com carta que tem');
select t.ok(public.update_profile('{"bio":"oi turma","banner_url":"profile/x/banner.webp"}')->>'banner_url' = 'profile/x/banner.webp', 'banner enviado pelo jogador');

-- ------------------------------------------------------------ games
select t.err('select public.play_slots(7)', 'invalid', 'aposta fora da lista recusada');
select t.ok(jsonb_array_length(public.play_slots(10)->'reels') = 3, 'caca-niquel devolve 3 rolos');

do $$
declare
  s uuid := (public.start_memory()->>'session_id')::uuid;
  board jsonb;
  r jsonb;
  i int; j int;
  done boolean := false;
begin
  -- the test reads the board as the database owner to drive a perfect game
  reset role;
  select state->'board' into board from public.game_sessions where id = s;
  set role authenticated;
  for i in 0..14 loop
    for j in i + 1..15 loop
      if board->>i = board->>j then
        begin
          perform public.flip_memory(s, i);
          r := public.flip_memory(s, j);
          done := (r->>'finished')::boolean;
        exception when others then null; -- i was already matched as part of an earlier pair
        end;
        exit;
      end if;
    end loop;
    exit when done;
  end loop;
  perform t.ok(done and (r->>'payout')::int = 120, 'memoria perfeita em 8 jogadas paga 120 ' || coalesce(r::text, 'null') || ' ' || coalesce(board::text,'nb'));
end $$;

select t.ok(not (public.finish_reflex((public.start_reflex()->>'session_id')::uuid)->>'valid')::boolean, 'reflexo antes do sinal nao vale');
select t.ok(not (public.finish_clicker((public.start_clicker()->>'session_id')::uuid, 100)->>'valid')::boolean, 'clique rapido antes de 10 s nao vale');
do $$
declare s uuid := (public.start_clicker()->>'session_id')::uuid; r jsonb;
begin
  reset role;
  update public.game_sessions set started_at = clock_timestamp() - interval '11 seconds' where id = s;
  insert into public.daily_game_earnings (user_id, game, day, earned)
    select id, 'clicker', app.today(), 180 from public.profiles where email = 'duda@turma.test'
    on conflict (user_id, game, day) do update set earned = 180;
  set role authenticated;
  r := public.finish_clicker(s, 100);
  perform t.ok((r->>'valid')::boolean and (r->>'payout')::int = 20 and (r->>'capped')::boolean, 'limite diario corta o premio (20 de 100)');
end $$;
select t.ok((public.get_game_limits()->'clicker'->>'earned_today')::int = 200, 'limite do dia atingido');
select t.err('select public.flip_memory(gen_random_uuid(), 0)', 'session_expired', 'sessao inexistente recusada');

-- ------------------------------------------------------------ feed, ranking, other players
reset role;
update public.settings set value = jsonb_set(value, '{feed_min_odds}', '10');
set role authenticated;
select t.ok((public.pull()->>'feed_posted')::boolean, 'tiragem acima do limite vai pro mural');
reset role;
update public.settings set value = jsonb_set(value, '{feed_min_odds}', '1000000');
select t.as_user(:ana, 'ana@turma.test');
set role authenticated;
select public.my_session();
select t.ok(jsonb_array_length(public.get_feed(10)) >= 1, 'outro jogador ve o mural');
select t.ok(public.get_profile(:duda)->'profile'->>'nickname' = 'duda', 'outro jogador ve o perfil publico');
select t.ok(not (public.get_profile(:duda)->'profile' ? 'email'), 'perfil publico nao mostra e-mail');
select t.ok((select count(*) from public.profiles) = 1, 'jogador so le o proprio perfil cru');
select t.ok(public.get_ranking('coins')->0->'player'->>'nickname' = 'duda', 'ranking de moedas');
select t.ok(jsonb_array_length(public.get_ranking('rarest')) = 1, 'ranking de raridade so com quem roletou');
select t.ok((public.create_suggestion('O dia em que a luz acabou na prova')->>'status') = 'pending', 'sugestao criada');
select t.err($$select public.create_suggestion('curta')$$, 'invalid', 'sugestao curta recusada');

-- ------------------------------------------------------------ admin
select t.err('select public.admin_list_players()', 'forbidden', 'jogador comum nao acessa o admin');
reset role;
update public.profiles set role = 'admin' where email = 'duda@turma.test';
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok(jsonb_array_length(public.admin_list_players()) = 2, 'admin lista jogadores');
select t.err($$select public.admin_upsert_card('{"title":"x","joke":"y","odds_n":5}')$$, 'invalid', 'raridade abaixo de 1/10 recusada');
select t.err($$select public.admin_upsert_card('{"title":"x","joke":"y","odds_n":20000000000}')$$, 'invalid', 'raridade acima de 1/10 bi recusada');
select t.ok((public.admin_upsert_card('{"title":"Nova","joke":"[exemplo] nova","odds_n":77}')->>'odds_n')::bigint = 77, 'admin cria carta');
select t.ok((public.admin_approve_suggestion((select id from public.suggestions limit 1), 'A luz', '[exemplo] Acabou na prova.', 5000)->>'odds_n')::bigint = 5000,
            'sugestao aprovada vira carta');
select t.err($$select public.admin_update_settings('{"pull_cost":0}')$$, 'invalid', 'custo zero recusado');
select t.ok((public.admin_update_settings('{"pull_cost":15}')->>'pull_cost')::int = 15, 'admin muda o custo da roletada');
select t.err($$select public.admin_add_allowed_email('xx')$$, 'invalid', 'e-mail invalido recusado');
select public.admin_add_allowed_email('  Novo@Turma.TEST ');
select t.ok((select count(*) from public.allowed_emails where email = 'novo@turma.test') = 1, 'e-mail guardado em minusculas');
select t.err(format('select public.admin_set_banned(%L, true)', :duda), 'invalid', 'admin nao se bane');
select t.err($$select public.admin_adjust_coins((select id from public.profiles where email = 'duda@turma.test'), 5, '')$$, 'invalid', 'ajuste exige motivo');
select public.admin_set_banned(:ana, true);
reset role;
select t.as_user(:ana, 'ana@turma.test');
set role authenticated;
select t.ok(public.my_session()->>'access' = 'banned', 'banido ve acesso suspenso');
select t.err('select public.pull()', 'banned', 'banido nao roleta');
reset role;

-- ------------------------------------------------------------ account level
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select (public.get_level()->>'xp') as got_xp \gset
reset role;
select t.ok(:got_xp::bigint =
  (select count(*) from public.pulls where user_id = :duda) * 10
  + (select count(*) from public.inventory where user_id = :duda) * 25
  + (select count(*) from public.game_sessions where user_id = :duda and finished_at is not null) * 15
  + (select count(*) from public.coin_transactions where user_id = :duda and reason = 'jogo:slots aposta') * 5
  + (select count(*) from public.daily_claims where user_id = :duda) * 20
  and :got_xp::bigint > 0,
  'xp soma roletadas, cartas, jogos e bonus');
set role authenticated;
reset role;
select t.ok(app.level_of(0) = 1 and app.level_of(99) = 1 and app.level_of(100) = 2 and app.level_of(300) = 3 and app.level_of(600) = 4, 'curva de nivel 100/300/600');
set role authenticated;
select t.ok((public.get_level()->>'level')::int >= 2, 'duda ja subiu de nivel com o que jogou');
select t.ok((public.get_level()->>'reward')::bigint > 0, 'tem premio de nivel para pegar');
select t.ok((public.claim_level_reward()->>'gained')::bigint = (select sum(50 * l) from generate_series(2, (public.get_level()->>'level')::int) l), 'premio paga 50 x nivel de cada nivel novo');
select t.ok((public.get_level()->>'reward')::bigint = 0, 'premio zera depois de pego');
select t.err('select public.claim_level_reward()', 'already_claimed', 'nao pega premio duas vezes');
reset role;

-- ------------------------------------------------------------ friends, other players' cards, level ranking
\set bia '''00000000-0000-0000-0000-0000000000b1'''
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select public.my_session();
select t.ok(jsonb_array_length(public.search_players('dud')) = 1, 'busca acha jogador pelo apelido');
select t.ok(public.search_players('dud')->0->>'friend' = 'none', 'busca mostra que ainda nao e amigo');
select t.ok(not exists (select 1 from jsonb_array_elements(public.search_players('')) e where e->>'id' = :bia), 'busca nao mostra voce mesmo');
select t.ok(not exists (select 1 from jsonb_array_elements(public.search_players('')) e where e->>'id' = :ana), 'busca esconde banido');
select t.err(format('select public.send_friend_request(%L)', :bia), 'invalid', 'nao manda pedido para si');
select t.err(format('select public.send_friend_request(%L)', :ana), 'not_found', 'nao manda pedido para banido');
select t.ok(public.send_friend_request(:duda)->>'status' = 'outgoing', 'pedido de amizade enviado');
select t.ok(public.send_friend_request(:duda)->>'status' = 'outgoing', 'pedido repetido nao duplica');
select t.ok(jsonb_array_length(public.get_friends()->'outgoing') = 1, 'pedido aparece em enviados');
select t.ok(public.get_profile(:duda)->>'friend' = 'outgoing', 'perfil mostra pedido enviado');
select t.ok(jsonb_array_length(public.get_player_collection(:duda)) >= 1, 've as cartas de outro jogador');
select t.ok(not exists (select 1 from jsonb_array_elements(public.get_player_collection(:duda)) e where e->'card' ? 'joke'),
            'carta que voce nao tem fica sem piada');
select t.err('select count(*) from public.friendships', 'permission denied', 'jogador nao le a tabela de amizades');
select t.err('select app.xp(auth.uid())', 'permission denied', 'jogador nao chama as funcoes internas de nivel');
reset role;

select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok(jsonb_array_length(public.get_friends()->'incoming') = 1, 'pedido chega para o outro jogador');
select t.ok(public.get_player_collection(:duda)->0->'card' ? 'joke', 'na propria colecao ve a piada');
select t.ok(public.respond_friend_request(:bia, true)->>'status' = 'friends', 'pedido aceito');
select t.ok(jsonb_array_length(public.get_friends()->'friends') = 1, 'amigo aparece na lista');
select t.ok(public.get_profile(:bia)->>'friend' = 'friends', 'perfil mostra que sao amigos');
select t.err(format('select public.respond_friend_request(%L, true)', :bia), 'not_found', 'nao aceita pedido que nao existe');
select t.ok(public.remove_friend(:bia)->>'status' = 'none', 'desfaz a amizade');
select t.ok(public.send_friend_request(:bia)->>'status' = 'outgoing', 'manda pedido de volta');
reset role;

select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(jsonb_array_length(public.get_friends()->'friends') = 0, 'amizade desfeita some dos dois lados');
select t.ok(public.respond_friend_request(:duda, false)->>'status' = 'none', 'pedido recusado');
select t.ok(jsonb_array_length(public.get_friends()->'incoming') = 0, 'pedido recusado sai da lista');
select t.ok(public.send_friend_request(:duda)->>'status' = 'outgoing', 'novo pedido depois de recusar');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok(public.send_friend_request(:bia)->>'status' = 'friends', 'pedido cruzado vira amizade');
select t.ok(public.get_ranking('level')->0->'player'->>'id' = :duda, 'ranking por nivel poe quem tem mais xp em cima');
select t.ok((public.get_ranking('level')->0->'player'->>'level')::int >= 2, 'ranking mostra o nivel do jogador');
select t.ok((public.get_ranking('coins')->0->'player') ? 'level', 'todo ranking traz o nivel');
select t.ok((public.get_profile(:bia)->'profile'->>'level')::int = 1, 'perfil mostra o nivel');
reset role;

-- ------------------------------------------------------------ admin: edit and delete cards, set coins
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err($$select public.admin_delete_card((public.get_collection()->0->'card'->>'id')::uuid)$$, 'forbidden', 'jogador comum nao apaga carta');
select t.err(format('select public.admin_set_coins(%L, 999, %L)', :bia, 'eu'), 'forbidden', 'jogador comum nao mexe em saldo');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select (public.admin_list_cards()->0->>'id') as edit_id \gset
select t.ok(public.admin_upsert_card(jsonb_build_object('id', :'edit_id', 'title', 'Editada', 'joke', 'Piada nova', 'odds_n', 1234))->>'title' = 'Editada', 'admin edita titulo, piada e raridade');
select t.ok(exists (select 1 from jsonb_array_elements(public.admin_list_cards()) c where c->>'id' = :'edit_id' and c->>'joke' = 'Piada nova' and (c->>'odds_n')::bigint = 1234), 'edicao fica salva');
select (select e -> 'card' ->> 'id' from jsonb_array_elements(public.get_collection()) e where (e ->> 'owned')::boolean limit 1) as owned_id \gset
select t.ok((public.admin_delete_card(:'owned_id')->>'owners')::int >= 1, 'apagar carta conta quem tinha');
select t.ok(not exists (select 1 from jsonb_array_elements(public.admin_list_cards()) c where c->>'id' = :'owned_id'), 'carta apagada some da lista');
select t.ok(not exists (select 1 from jsonb_array_elements(public.get_collection()) e where e->'card'->>'id' = :'owned_id'), 'carta apagada some da colecao de quem tinha');
select t.err(format('select public.admin_delete_card(%L)', :'owned_id'), 'not_found', 'nao apaga carta que nao existe');
select t.ok((public.admin_set_coins(:bia, 1234, 'premio do teste')->>'coins_after')::bigint = 1234, 'admin define o saldo exato');
select t.ok(exists (select 1 from jsonb_array_elements(public.admin_list_players()) p where p->>'id' = :bia and (p->>'coins')::bigint = 1234), 'saldo novo aparece na lista');
select t.ok((public.admin_set_coins(:bia, 0, 'zerar')->>'coins_after')::bigint = 0, 'admin pode zerar o saldo');
select t.err(format('select public.admin_set_coins(%L, -5, %L)', :bia, 'x'), 'invalid', 'saldo negativo recusado');
select t.err(format('select public.admin_set_coins(%L, 10, %L)', :bia, ''), 'invalid', 'definir saldo exige motivo');
select t.err(format('select public.admin_set_coins(%L, 10, %L)', '00000000-0000-0000-0000-000000000999', 'x'), 'not_found', 'jogador que nao existe');
reset role;
select t.ok((select count(*) from public.coin_transactions where user_id = :bia and reason = 'admin: premio do teste') = 1, 'mudanca de saldo fica no historico');

-- ------------------------------------------------------------ gifts, trades, challenges, missions, weekly event
reset role;
select id as c_a from public.cards where active order by odds_n asc limit 1 \gset
select id as c_b from public.cards where active order by odds_n desc limit 1 \gset
delete from public.inventory where (user_id = :bia and card_id = :'c_a') or (user_id = :duda and card_id = :'c_b');
insert into public.inventory (user_id, card_id, quantity) values (:duda, :'c_a', 3), (:bia, :'c_b', 2)
  on conflict (user_id, card_id) do update set quantity = excluded.quantity;
update public.profiles set coins = 1000 where id in (:duda, :bia);
-- the admin tests deleted a card (and its rolls); give duda today's rolls back for the mission tests
insert into public.pulls (user_id, card_id, odds_n_at_pull, luck_used) select :duda, :'c_a', 10, 1 from generate_series(1, 5);

select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.err(format('select public.gift_card(%L, %L)', :ana, :'c_a'), 'forbidden', 'so presenteia amigo');
select t.ok((public.gift_card(:bia, :'c_a')->>'quantity_left')::int = 2, 'presente tira uma copia de quem deu');
select t.err(format('select public.gift_card(%L, %L)', :bia, :'c_b'), 'invalid', 'nao presenteia carta que nao tem repetida');
select (public.propose_trade(:bia, :'c_a', :'c_b')->>'id') as trade1 \gset
select t.ok(:'trade1' is not null, 'proposta de troca criada');
select t.err(format('select public.propose_trade(%L, %L, %L)', :bia, :'c_b', :'c_a'), 'invalid', 'nao oferece carta que nao tem repetida');
select t.ok(jsonb_array_length(public.get_trades()->'outgoing') = 1, 'troca aparece em enviadas');
reset role;

select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(exists (select 1 from jsonb_array_elements(public.get_collection()) e where e->'card'->>'id' = :'c_a' and (e->>'quantity')::int = 1), 'presente chega na colecao do amigo');
select t.ok(jsonb_array_length(public.get_gifts()) = 1, 'amigo ve o presente recebido');
select t.ok(jsonb_array_length(public.get_trades()->'incoming') = 1, 'troca chega para o amigo');
select t.ok(public.respond_trade(:'trade1', true)->>'status' = 'accepted', 'troca aceita');
select t.ok(exists (select 1 from jsonb_array_elements(public.get_collection()) e where e->'card'->>'id' = :'c_a' and (e->>'quantity')::int = 2)
        and exists (select 1 from jsonb_array_elements(public.get_collection()) e where e->'card'->>'id' = :'c_b' and (e->>'quantity')::int = 1), 'cartas trocam de dono');
select t.err(format('select public.respond_trade(%L, true)', :'trade1'), 'not_found', 'troca nao e aceita duas vezes');
select (public.propose_trade(:duda, :'c_a', :'c_b')->>'id') as trade2 \gset
reset role;

select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok(exists (select 1 from jsonb_array_elements(public.get_collection()) e where e->'card'->>'id' = :'c_b' and (e->>'quantity')::int = 1), 'quem propos recebe a carta pedida');
select t.err(format('select public.respond_trade(%L, true)', :'trade2'), 'invalid', 'nao troca a ultima copia');
select t.ok(public.respond_trade(:'trade2', false)->>'status' = 'declined', 'troca recusada');
select t.err(format('select public.gift_card(%L, %L)', :bia, :'c_a'), 'invalid', 'nao presenteia a ultima copia');
select t.err(format('select public.create_challenge(%L, 5)', :bia), 'invalid', 'aposta minima de 10');
select t.err(format('select public.create_challenge(%L, 5000)', :bia), 'insufficient_coins', 'nao aposta mais do que tem');
select t.err(format('select public.create_challenge(%L, 50)', :ana), 'forbidden', 'so desafia amigo');
select (public.create_challenge(:bia, 100)->>'id') as ch1 \gset
select t.ok((select coins from public.profiles) = 900, 'aposta sai na hora de desafiar');
select (public.create_challenge(:bia, 50)->>'id') as ch2 \gset
select t.ok(public.cancel_challenge(:'ch2')->>'status' = 'cancelled', 'desafio cancelado');
select t.ok((select coins from public.profiles) = 900, 'cancelar devolve a aposta');
select (public.create_challenge(:bia, 30)->>'id') as ch3 \gset
reset role;

select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(jsonb_array_length(public.get_challenges()->'incoming') = 2, 'desafios chegam para o amigo');
select public.respond_challenge(:'ch3', false);
select public.respond_challenge(:'ch1', true) as duel \gset
select t.ok((:'duel'::jsonb)->>'status' = 'done', 'desafio aceito roda na hora');
select t.ok(jsonb_array_length((:'duel'::jsonb)->'draws_from') = 5 and jsonb_array_length((:'duel'::jsonb)->'draws_to') = 5, 'cada um faz 5 tiragens');
select t.err(format('select public.respond_challenge(%L, true)', :'ch1'), 'not_found', 'desafio nao roda duas vezes');
reset role;
select t.ok((select sum(coins) from public.profiles where id in (:duda, :bia)) = 2000, 'moedas do desafio nao somem nem aparecem');
select t.ok((select count(*) from public.coin_transactions where user_id = :duda and reason = 'desafio devolvido') = 2, 'cancelar e recusar devolvem a aposta de quem desafiou');

-- missions: the admin may pin today's missions; otherwise 3 come from the day
update public.settings set value = jsonb_set(value, '{missions}', '["daily_bonus", "roll_5", "gift_1"]');
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok(jsonb_array_length(public.get_missions()) = 3, 'tres missoes por dia');
select t.ok((select bool_and((m->>'progress')::int >= (m->>'goal')::int) from jsonb_array_elements(public.get_missions()) m), 'progresso vem do que o jogador fez hoje');
select (public.get_level()->>'xp')::bigint as xp_before \gset
select t.ok((public.claim_mission('daily_bonus')->>'coins_after')::bigint > 0, 'missao completa paga');
select t.ok((public.get_level()->>'xp')::bigint = :xp_before + 30, 'missao da 30 de xp');
select t.err($$select public.claim_mission('daily_bonus')$$, 'already_claimed', 'missao nao paga duas vezes');
select t.err($$select public.claim_mission('reflex_win')$$, 'invalid', 'missao de outro dia nao paga');
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err($$select public.claim_mission('roll_5')$$, 'invalid', 'missao incompleta nao paga');
reset role;
update public.settings set value = value - 'missions';
select t.ok((select count(distinct m) from (select jsonb_array_elements_text(app.missions_for(app.today())) m) x) = 3, 'sem fixar, o dia escolhe 3 missoes diferentes');

-- weekly event: one card gets double chance
select t.ok(exists (select 1 from public.cards where id = app.event_card() and active and odds_n >= 100), 'evento escolhe uma carta ativa nao comum');
update public.settings set value = jsonb_set(value, '{event_card}', to_jsonb(:'c_b'::text));
select t.ok(app.event_card() = :'c_b', 'admin pode fixar a carta do evento');
select t.ok(app.card_chance(:'c_b', 1000, 1) = 2 * app.card_chance(:'c_a', 1000, 1), 'carta do evento tem chance dobrada');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(public.get_event()->'card'->>'id' = :'c_b' and (public.get_event()->>'multiplier')::int = 2, 'jogador ve o evento da semana');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok((public.get_event()->'card') ? 'joke', 'evento mostra a piada para quem tem a carta');
reset role;
update public.settings set value = value - 'event_card';

-- ------------------------------------------------------------ music
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err($$select public.admin_add_track('Tema', 'a.mp3', 'login')$$, 'forbidden', 'so o admin cadastra musica');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.err($$select public.admin_add_track('Tema', 'a.mp3', 'festa')$$, 'invalid', 'lugar de musica invalido recusado');
select t.err($$select public.admin_add_track('  ', 'a.mp3', 'login')$$, 'invalid', 'musica sem nome recusada');
select (public.admin_add_track('Tema da turma', 'login/tema.mp3', 'login')->>'id') as track1 \gset
select public.admin_add_track('Hino lendario', 'lendario/hino.mp3', 'lendario');
select public.admin_add_track('Grito mitico', 'mitico/grito.mp3', 'mitico');
select t.ok(jsonb_array_length(public.admin_list_tracks()) = 3, 'admin lista as musicas');
select t.ok(jsonb_array_length(public.get_rare_music()->'lendario') = 1 and jsonb_array_length(public.get_rare_music()->'mitico') = 1,
            'jogador recebe as musicas das cartas raras');
reset role;
set role anon;
select public.get_login_music() as login_music \gset
do $$
begin
  perform public.get_rare_music();
  raise exception 'FAIL: quem nao entrou leu as musicas raras';
exception when insufficient_privilege then
  raise notice 'ok  quem nao entrou nao le as outras musicas';
end $$;
reset role;
select t.ok((:'login_music'::jsonb)->0->>'path' = 'login/tema.mp3', 'tela de login le as musicas sem estar logado');
select t.ok(jsonb_array_length(:'login_music'::jsonb) = 1, 'tela de login so recebe musicas de login');
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok(public.admin_delete_track(:'track1')->>'path' = 'login/tema.mp3', 'apagar musica devolve o arquivo para remover');
select t.err(format('select public.admin_delete_track(%L)', :'track1'), 'not_found', 'nao apaga musica que nao existe');
reset role;

-- ------------------------------------------------------------ admin: game settings, shop, event and missions
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err('select public.admin_list_items()', 'forbidden', 'jogador comum nao ve a loja do admin');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.err($$select public.admin_update_settings('{"missions": ["roll_5", "nao_existe"]}')$$, 'invalid', 'missao desconhecida recusada');
select t.err($$select public.admin_update_settings('{"event_card": "00000000-0000-0000-0000-000000000999"}')$$, 'invalid', 'carta do evento que nao existe recusada');
select t.err($$select public.admin_update_settings('{"game_daily_limits": {"slots": -1, "memory": 10, "reflex": 10, "clicker": 10}}')$$, 'invalid', 'limite de jogo negativo recusado');
select t.ok(public.admin_update_settings('{"missions": ["roll_5", "gift_1", "new_card"]}')->'missions' = '["roll_5", "gift_1", "new_card"]', 'admin fixa as missoes');
select t.ok(not (public.admin_update_settings('{"missions": null}') ? 'missions'), 'admin volta as missoes para o sorteio');
select t.ok(jsonb_array_length(public.get_missions()) = 3, 'missoes continuam funcionando depois de desfixar');
select t.ok(not (public.admin_update_settings('{"event_card": null}') ? 'event_card'), 'admin volta o evento para o sorteio');
select t.ok(jsonb_array_length(public.admin_mission_defs()) = 8, 'admin ve todas as missoes possiveis');
select (public.admin_upsert_item('{"name": "Poção escondida", "price": 99, "multiplier": 3, "duration_pulls": 5, "active": false}')->>'id') as hidden_item \gset
select t.ok(exists (select 1 from jsonb_array_elements(public.admin_list_items()) i where i->>'id' = :'hidden_item' and not (i->>'active')::boolean), 'admin ve item desativado');
select t.err($$select public.admin_upsert_item('{"name": "Ruim", "price": 10, "multiplier": 1, "duration_pulls": 5}')$$, 'invalid', 'pocao sem efeito recusada');
select (public.admin_upsert_title('{"name": "Título escondido", "price": 500, "active": false}')->>'id') as hidden_title \gset
select t.ok(exists (select 1 from jsonb_array_elements(public.admin_list_titles()) x where x->>'id' = :'hidden_title'), 'admin ve titulo desativado');
reset role;

-- ------------------------------------------------------------ admin: give and take the admin role
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err(format('select public.admin_set_role(%L, %L)', :bia, 'admin'), 'forbidden', 'jogador comum nao se torna admin sozinho');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.err(format('select public.admin_set_role(%L, %L)', :duda, 'player'), 'invalid', 'admin nao muda o proprio cargo');
select t.err(format('select public.admin_set_role(%L, %L)', :bia, 'dono'), 'invalid', 'cargo desconhecido recusado');
select t.err(format('select public.admin_set_role(%L, %L)', '00000000-0000-0000-0000-000000000999', 'admin'), 'not_found', 'jogador que nao existe');
select t.err(format('select public.admin_set_role(%L, %L)', :ana, 'admin'), 'invalid', 'conta suspensa nao vira admin');
select t.ok(public.admin_set_role(:bia, 'admin')->>'role' = 'admin', 'admin da admin para outra pessoa');
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(jsonb_array_length(public.admin_list_players()) >= 2, 'novo admin entra no painel');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok(public.admin_set_role(:bia, 'player')->>'role' = 'player', 'admin tira o admin de outra pessoa');
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err('select public.admin_list_players()', 'forbidden', 'quem perdeu o admin sai do painel');
reset role;

-- ------------------------------------------------------------ admin screen live: change notes for admins
reset role;
insert into public.admin_events (kind, created_at) values ('old', now() - interval '2 hours');
select count(*) as pull_events_before from public.admin_events where kind = 'profiles' \gset
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_upsert_card(jsonb_build_object('title', 'Ao vivo', 'joke', '[exemplo] aparece na hora', 'odds_n', 40));
select public.pull();
select t.ok((select count(*) from public.admin_events where kind = 'cards' and actor = auth.uid()) >= 1, 'mudar carta avisa os admins e diz quem mudou');
reset role;
select t.ok((select count(*) from public.admin_events where kind = 'profiles') = :pull_events_before, 'roletar nao gera aviso de admin');
select t.ok(not exists (select 1 from public.admin_events where kind = 'old'), 'avisos com mais de uma hora sao apagados');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((select count(*) from public.admin_events) = 0, 'jogador comum nao le os avisos de admin');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_set_role(:bia, 'admin');
reset role;
select t.ok(exists (select 1 from public.admin_events where kind = 'profiles'), 'mudar cargo avisa os admins');
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_set_role(:bia, 'player');
reset role;

-- ------------------------------------------------------------ the reel shows every active card in full
reset role;
update public.cards set active = false where title = 'Ao vivo';
select count(*) as active_cards from public.cards where active \gset
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(jsonb_array_length(public.get_reel_cards()) = :active_cards, 'roleta recebe todas as cartas ativas');
select t.ok((select bool_and(c ? 'joke' and c ? 'title') from jsonb_array_elements(public.get_reel_cards()) c), 'na roleta as cartas vem completas, mesmo sem ter');
select t.ok(not exists (select 1 from jsonb_array_elements(public.get_reel_cards()) c where c->>'title' = 'Ao vivo'), 'carta desativada nao entra na roleta');
select t.ok(not exists (select 1 from jsonb_array_elements(public.get_collection()) e where not (e->>'owned')::boolean and e->'card' ? 'joke'), 'o album continua escondendo as cartas que faltam');
reset role;
set role anon;
do $$
begin
  perform public.get_reel_cards();
  raise exception 'FAIL: quem nao entrou leu as cartas da roleta';
exception when insufficient_privilege then
  raise notice 'ok  quem nao entrou nao le as cartas da roleta';
end $$;
reset role;

-- ------------------------------------------------------------ card photos: who may read which file
-- The storage rule runs as the player, and players cannot read the cards table (card text stays secret).
reset role;
update public.cards set image_path = 'fotos/' || id || '.webp';
insert into storage.objects (bucket_id, name) select 'cards', image_path from public.cards;
select count(*) as fotos from storage.objects where bucket_id = 'cards' \gset
delete from public.feed_events where card_id = (select id from public.cards where title = 'Ao vivo');
select c.image_path as foto_ativa from public.cards c
  where c.active and not exists (select 1 from public.inventory i where i.card_id = c.id and i.user_id = :bia and i.quantity > 0)
  limit 1 \gset
select image_path as foto_desligada, id as carta_desligada from public.cards where title = 'Ao vivo' \gset
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((select count(*) from storage.objects where bucket_id = 'cards' and name = :'foto_ativa') = 1, 'jogador ve a foto de carta ativa que ainda nao tem (a roleta mostra)');
select t.ok((select count(*) from storage.objects where bucket_id = 'cards' and name = :'foto_desligada') = 0, 'jogador nao ve a foto de carta desligada que nao tem');
reset role;
insert into public.feed_events (user_id, card_id, odds_n_at_pull, luck) values (:duda, :'carta_desligada', 40, 1);
set role authenticated;
select t.ok((select count(*) from storage.objects where bucket_id = 'cards' and name = :'foto_desligada') = 1, 'jogador ve a foto de carta desligada que saiu no mural');
reset role;
delete from public.feed_events where card_id = :'carta_desligada';
insert into public.inventory (user_id, card_id, quantity) values (:bia, :'carta_desligada', 1);
set role authenticated;
select t.ok((select count(*) from storage.objects where bucket_id = 'cards' and name = :'foto_desligada') = 1, 'jogador ve a foto de carta desligada que tem');
reset role;
select t.as_user(:ana, 'ana@turma.test');
set role authenticated;
select t.ok((select count(*) from storage.objects where bucket_id = 'cards') = 0, 'conta suspensa nao ve fotos de cartas');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok((select count(*) from storage.objects where bucket_id = 'cards') = :fotos, 'admin ve todas as fotos de cartas');
reset role;
set role anon;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'cards') <> 0 then raise exception 'FAIL: quem nao entrou viu fotos de cartas'; end if;
  raise notice 'ok  quem nao entrou nao ve fotos de cartas';
end $$;
reset role;

-- ------------------------------------------------------------ the draw: one roll, exact chances, ties shared fairly
-- Reported bug: two commonest cards with the same chance, one came out almost every time.
reset role;
begin;
update public.cards set active = false where true;
insert into public.cards (title, joke, odds_n) values ('Igual A', '[exemplo] a', 50), ('Igual B', '[exemplo] b', 50), ('Rara', '[exemplo] r', 1000);
update public.profiles set coins = 100000 where id = :bia;
select t.ok(abs((select sum(chance) from app.roll_table(1, false)) - 1) < 1e-9, 'as chances de uma roletada somam 100%');
select t.ok((select count(distinct chance) from app.roll_table(1, false) r join public.cards c on c.id = r.card_id where c.title like 'Igual%') = 1,
            'cartas com a mesma raridade tem exatamente a mesma chance');
select t.ok((select chance from app.roll_table(1, false) r join public.cards c on c.id = r.card_id where c.title = 'Rara') = 1.0 / 1000, 'carta 1 em 1000 sai 1 vez em 1000');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
do $$ begin for i in 1 .. 400 loop perform public.pull(); end loop; end $$;
reset role;
select t.ok((select count(*) from public.pulls p join public.cards c on c.id = p.card_id where p.user_id = :bia and c.title = 'Igual A') between 140 and 260
        and (select count(*) from public.pulls p join public.cards c on c.id = p.card_id where p.user_id = :bia and c.title = 'Igual B') between 140 and 260,
            '400 roletadas: as duas cartas iguais saem metade cada');
-- thousands of draws against the configured chances (seed deck back), with normal luck and with luck 10x
rollback;
create table t.draws (luck numeric, card_id uuid);
insert into t.draws select 1, (app.draw_card(1, false)).id from generate_series(1, 20000);
insert into t.draws select 10, (app.draw_card(10, false)).id from generate_series(1, 20000);
select t.ok(not exists (
  select 1 from (values (1::numeric), (10::numeric)) l(luck)
  cross join lateral app.roll_table(l.luck, false) r
  where abs((select count(*) from t.draws d where d.luck = l.luck and d.card_id = r.card_id) - 20000 * r.chance)
        > 5 * sqrt(20000 * r.chance * (1 - r.chance)) + 3), '20 mil roletadas por sorte: cada carta sai na frequencia configurada (sorte 1x e 10x)');
select t.ok((select count(*) from t.draws d join public.cards c on c.id = d.card_id where d.luck = 10 and c.odds_n >= 1000)
          > (select count(*) from t.draws d join public.cards c on c.id = d.card_id where d.luck = 1 and c.odds_n >= 1000),
            'sorte maior faz cartas raras sairem mais');
select t.ok((select sum(r.chance) from app.roll_table(1000000, false) r join public.cards c on c.id = r.card_id where c.odds_n >= 150000) > 0.99,
            'com sorte maxima, a sobra vai para as cartas mais raras');
drop table t.draws;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err('select app.draw_card(1, false)', 'permission denied', 'o sorteio so roda no servidor, jogador nao chama direto');
reset role;

-- ------------------------------------------------------------ shop items: pictures
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select (public.admin_upsert_item(jsonb_build_object('name', 'Poção com foto', 'price', 100, 'multiplier', 2, 'duration_minutes', 5,
  'image_url', 'https://exemplo.test/pocao.png')))->>'id' as item_foto \gset
select t.ok((select image_url from public.items where id = :'item_foto') = 'https://exemplo.test/pocao.png', 'admin poe imagem por link no item');
select t.ok((select image_path from public.items where id = :'item_foto') is null, 'imagem por link nao tem arquivo guardado');
select public.admin_upsert_item(jsonb_build_object('id', :'item_foto', 'name', 'Poção com foto', 'price', 100, 'multiplier', 2, 'duration_minutes', 5,
  'image_url', 'https://projeto.test/storage/v1/object/public/shop/abc.webp', 'image_path', 'abc.webp'));
select t.ok((select image_path from public.items where id = :'item_foto') = 'abc.webp', 'admin troca a imagem por um arquivo enviado');
select t.err($$select public.admin_upsert_item(jsonb_build_object('name', 'Ruim', 'price', 1, 'multiplier', 2, 'duration_minutes', 5, 'image_url', 'javascript:alert(1)'))$$,
             'invalid', 'link de imagem precisa ser https');
select public.admin_upsert_item(jsonb_build_object('id', :'item_foto', 'name', 'Poção com foto', 'price', 100, 'multiplier', 2, 'duration_minutes', 5));
select t.ok((select image_url is null and image_path is null from public.items where id = :'item_foto'), 'admin remove a imagem do item');
select public.admin_upsert_item(jsonb_build_object('id', :'item_foto', 'name', 'Poção com foto', 'price', 100, 'multiplier', 2, 'duration_minutes', 5,
  'image_url', 'https://exemplo.test/pocao.png'));
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((select image_url from public.items where id = :'item_foto') = 'https://exemplo.test/pocao.png', 'jogador ve a imagem do item na loja');
reset role;
select t.ok((select public from storage.buckets where id = 'shop'), 'pasta de imagens da loja existe e e publica');
select t.ok(exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'shop_admin_write'), 'so admin envia imagens da loja');

-- ------------------------------------------------------------ global reset: only the server owner
reset role;
-- the owner is matched by the fingerprint of their e-mail; here it points at duda
update app.server_owner set email_sha256 = encode(extensions.digest('duda@turma.test', 'sha256'), 'hex') where true;
select count(*) as contas from public.profiles \gset
select count(*) as cartas from public.cards \gset
select count(*) as amizades from public.friendships \gset
select value::text as regras from public.settings where id \gset
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_set_role(:bia, 'admin');
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(not (public.server_owner_status()->>'owner')::boolean, 'outro admin nao ve o reset global');
select t.err($$select public.admin_global_reset('RESETAR SERVIDOR')$$, 'forbidden', 'outro admin nao reseta o servidor');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_set_role(:bia, 'player');
select t.ok((public.server_owner_status()->>'owner')::boolean, 'dono do servidor ve o reset global');
select t.err($$select public.admin_global_reset('resetar')$$, 'invalid', 'reset exige a frase RESETAR SERVIDOR');
select t.ok((select count(*) from public.inventory) > 0 and (select sum(coins) from public.profiles) > 0, 'antes do reset ha cartas e moedas');
select t.ok((public.admin_global_reset('RESETAR SERVIDOR')->>'players')::int = :contas, 'reset atinge todos os jogadores');
reset role;
select t.ok((select count(*) from public.inventory) = 0, 'reset tira todas as cartas de todos');
select t.ok((select count(*) from public.profiles where coins <> 0) = 0, 'reset zera as moedas de todos');
select t.ok((select count(*) from public.pulls) + (select count(*) from public.coin_transactions) + (select count(*) from public.user_items)
          + (select count(*) from public.active_effects) + (select count(*) from public.user_titles) + (select count(*) from public.daily_claims)
          + (select count(*) from public.game_sessions) + (select count(*) from public.daily_game_earnings) + (select count(*) from public.feed_events)
          + (select count(*) from public.card_gifts) + (select count(*) from public.trades) + (select count(*) from public.challenges)
          + (select count(*) from public.mission_claims) = 0, 'reset limpa roletadas, extrato, pocoes, titulos, bonus, jogos, mural, presentes, trocas, duelos e missoes');
select t.ok((select count(*) from public.profiles where showcase <> '{}' or title_id is not null or avatar_card_id is not null or level_claimed <> 1 or streak <> 1) = 0,
            'reset limpa vitrine, titulo em uso e nivel');
select t.ok((select count(*) from public.profiles) = :contas, 'reset nao apaga nenhuma conta');
select t.ok((select role from public.profiles where id = :duda) = 'admin' and (select banned from public.profiles where id = :ana), 'reset mantem cargos e suspensoes');
select t.ok((select count(*) from public.cards) = :cartas and (select count(*) from public.friendships) = :amizades
        and (select value::text from public.settings where id) = :'regras', 'reset mantem cartas, amizades e regras do jogo');
select t.ok(exists (select 1 from public.admin_history where kind = 'reset_global' and actor = :duda), 'reset fica no historico de admin');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((select count(*) from public.admin_history) = 0, 'jogador comum nao le o historico de admin');
reset role;
set role anon;
do $$
begin
  perform public.admin_global_reset('RESETAR SERVIDOR');
  raise exception 'FAIL: quem nao entrou chamou o reset';
exception when insufficient_privilege then
  raise notice 'ok  quem nao entrou nao chama o reset';
end $$;
reset role;

-- ------------------------------------------------------------ live chat: messages, pictures, coins and card offers
reset role;
update public.profiles set coins = 1000 where id in (:duda, :bia);
select id as carta_x from public.cards where active order by odds_n limit 1 \gset
select id as carta_y from public.cards where active order by odds_n offset 1 limit 1 \gset
select id as carta_z from public.cards where active order by odds_n offset 2 limit 1 \gset
insert into public.inventory (user_id, card_id, quantity) values (:bia, :'carta_x', 2), (:bia, :'carta_z', 2), (:duda, :'carta_y', 2), (:bia, :'carta_y', 1)
  on conflict (user_id, card_id) do update set quantity = excluded.quantity;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select (public.chat_send('oi turma', null)->>'id') as msg_bia \gset
select t.ok(exists (select 1 from jsonb_array_elements(public.get_chat(null)) m where m->>'body' = 'oi turma' and m->'author'->>'nickname' = 'bia'), 'mensagem aparece no chat com quem mandou');
select t.err($$select public.chat_send('   ', null)$$, 'invalid', 'mensagem vazia recusada');
select t.err(format('select public.chat_send(%L, null)', repeat('a', 301)), 'invalid', 'mensagem com mais de 300 letras recusada');
select t.err($$select public.chat_send(null, 'outra-pessoa/foto.webp')$$, 'invalid', 'imagem so da propria pasta');
select t.ok(public.chat_send('olha', '00000000-0000-0000-0000-0000000000b1/foto.webp')->>'kind' = 'image', 'jogador manda imagem com legenda');
do $$
begin
  for i in 1 .. 6 loop perform public.chat_send('spam ' || i, null); end loop;
  perform public.chat_send('spam demais', null);
  raise exception 'FAIL: 9 mensagens em 10 segundos passaram';
exception when others then
  if sqlerrm <> 'slow_down' then raise; end if;
  raise notice 'ok  muitas mensagens seguidas: pede para ir com calma';
end $$;
reset role;
delete from public.chat_messages where user_id = :bia and created_at > now() - interval '1 minute' and body like 'spam%';
update public.chat_messages set created_at = now() - interval '1 minute' where user_id = :bia;
-- coins
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(public.chat_send_coins(:duda, 100, 'valeu')->>'kind' = 'coins', 'jogador envia moedas pelo chat');
reset role;
select t.ok((select coins from public.profiles where id = :bia) = 900 and (select coins from public.profiles where id = :duda) = 1100, 'moedas saem de um e entram no outro');
select t.ok(exists (select 1 from public.coin_transactions where user_id = :bia and amount = -100) and exists (select 1 from public.coin_transactions where user_id = :duda and amount = 100), 'envio de moedas fica no extrato dos dois');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err(format('select public.chat_send_coins(%L, 10, null)', :bia), 'invalid', 'nao envia moedas para si');
select t.err(format('select public.chat_send_coins(%L, 0, null)', :duda), 'invalid', 'quantia precisa ser maior que zero');
select t.err(format('select public.chat_send_coins(%L, 999999, null)', :duda), 'insufficient_coins', 'nao envia mais do que tem');
select t.err(format('select public.chat_send_coins(%L, 10, null)', :ana), 'invalid', 'nao envia para conta suspensa');
-- offers: buy at the price
select t.err(format('select public.chat_offer(%L, 200, null)', :'carta_y'), 'invalid', 'so oferece carta repetida');
select (public.chat_offer(:'carta_x', 200, 'vendo barato')->>'id') as oferta \gset
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select t.ok((select (m->>'available')::boolean and m->'card' ? 'title' from jsonb_array_elements(public.get_chat(null)) m where (m->>'id')::bigint = :oferta), 'oferta mostra a carta inteira e que esta disponivel');
select t.ok(public.chat_buy(:oferta)->>'status' = 'done', 'outro jogador compra a carta pelo preco');
select t.err(format('select public.chat_buy(%s)', :oferta), 'invalid', 'oferta vendida nao vende de novo');
reset role;
select t.ok((select quantity from public.inventory where user_id = :duda and card_id = :'carta_x') = 1
        and (select quantity from public.inventory where user_id = :bia and card_id = :'carta_x') = 1, 'carta passa de quem vendeu para quem comprou');
select t.ok((select coins from public.profiles where id = :duda) = 900 and (select coins from public.profiles where id = :bia) = 1100, 'preco passa de quem comprou para quem vendeu');
-- offers: proposals (a card and/or coins), the seller accepts one
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select (public.chat_offer(:'carta_z', null, 'aceito propostas')->>'id') as oferta2 \gset
select t.err(format('select public.chat_buy(%s)', :oferta2), 'invalid', 'oferta sem preco nao tem compra direta');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select (public.chat_bid(:oferta2, :'carta_y', 50)->>'id') as proposta \gset
select t.err(format('select public.chat_accept_bid(%s)', :proposta), 'forbidden', 'so quem ofereceu aceita a proposta');
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err(format('select public.chat_bid(%s, null, 10)', :oferta2), 'invalid', 'nao faz proposta na propria oferta');
select t.ok(public.chat_accept_bid(:proposta)->>'status' = 'done', 'quem ofereceu aceita a proposta');
reset role;
select t.ok((select quantity from public.inventory where user_id = :duda and card_id = :'carta_z') = 1
        and (select quantity from public.inventory where user_id = :bia and card_id = :'carta_y') = 2
        and (select coins from public.profiles where id = :bia) = 1150, 'troca aceita: cartas trocam de dono e as moedas da proposta passam');
-- cancel, moderation, who may read
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select (public.chat_offer(:'carta_y', 30, null)->>'id') as oferta3 \gset
select t.ok(public.chat_cancel_offer(:oferta3)->>'status' = 'cancelled', 'quem ofereceu cancela a oferta');
select t.err(format('select public.admin_delete_chat_message(%s)', :msg_bia), 'forbidden', 'jogador comum nao apaga mensagens');
select t.ok((select count(*) from public.chat_messages) > 0, 'jogador le as mensagens (para o chat ao vivo)');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_delete_chat_message(:msg_bia);
select t.ok(not exists (select 1 from jsonb_array_elements(public.get_chat(null)) m where (m->>'id')::bigint = :msg_bia), 'admin apaga mensagem do chat');
reset role;
select t.as_user(:ana, 'ana@turma.test');
set role authenticated;
select t.err($$select public.chat_send('oi', null)$$, 'banned', 'conta suspensa nao manda mensagem');
reset role;
set role anon;
do $$
begin
  perform public.get_chat(null);
  raise exception 'FAIL: quem nao entrou leu o chat';
exception when insufficient_privilege then
  raise notice 'ok  quem nao entrou nao le o chat';
end $$;
reset role;
select t.ok((select not public from storage.buckets where id = 'chat'), 'pasta de imagens do chat existe e e privada');

-- ------------------------------------------------------------ luck: effects add up, never multiply
reset role;
update public.profiles set streak = 1, last_pull_at = null, coins = 1000 where id = :bia;
create function t.luck_with(p_mults numeric[]) returns numeric language plpgsql as $$
declare v numeric;
begin
  delete from public.active_effects where user_id = '00000000-0000-0000-0000-0000000000b1';
  insert into public.active_effects (user_id, item_id, multiplier, expires_at)
  select '00000000-0000-0000-0000-0000000000b1', (select id from public.items limit 1), m, now() + interval '10 minutes' from unnest(p_mults) m;
  select effective into v from app.luck_state('00000000-0000-0000-0000-0000000000b1');
  return v;
end $$;
select t.ok(t.luck_with(array[5]) = 5, '1 pocao de 5x = 5x');
select t.ok(t.luck_with(array[5, 5]) = 9, '2 pocoes de 5x sem artefato = 9x: 1 x (1+4+4), nunca 25x');
select t.ok(t.luck_with(array[5, 5, 5]) = 13, '3 pocoes de 5x sem artefato = 13x');
select t.ok(t.luck_with(array[5, 5, 5, 5]) = 17, '4 pocoes de 5x sem artefato = 17x');
select t.ok(t.luck_with(array[5, 10]) = 14, '1 pocao de 5x + 1 de 10x sem artefato = 14x');
select t.ok(t.luck_with(array[10, 10, 5]) = 23, '2 pocoes de 10x + 1 de 5x sem artefato = 23x');
select t.ok(t.luck_with(array[]::numeric[]) = 1, 'sem pocao a sorte e 1x');
-- one effect ends: only its bonus goes
select t.luck_with(array[5, 10]);
update public.active_effects set expires_at = now() - interval '1 second' where user_id = :bia and multiplier = 10;
select t.ok((select effective from app.luck_state(:bia)) = 5, 'quando uma pocao acaba, so o bonus dela sai');
insert into public.active_effects (user_id, item_id, multiplier, pulls_left) values (:bia, (select id from public.items limit 1), 5, 0);
select t.ok((select effective from app.luck_state(:bia)) = 5, 'pocao por roletadas sem roletadas restantes nao conta');
-- what the screen shows is what the roll uses, and reading it again never adds anything
select t.luck_with(array[5, 5]);
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((public.get_luck()->>'effective')::numeric = 9 and (public.get_luck()->>'effective')::numeric = 9, 'a sorte mostrada e a mesma ao ler de novo (atualizar a pagina)');
select t.ok((public.pull()->>'luck_used')::numeric = 9, 'a roletada usa a mesma sorte mostrada na tela');
reset role;
-- the pull streak adds its bonus too
update public.profiles set streak = 1.5, last_pull_at = now() where id = :bia;
select t.luck_with(array[5]);
select t.ok((select effective from app.luck_state(:bia)) = 5.5, 'bonus de sequencia soma (5x + 0,5x = 5,5x), nao multiplica');
delete from public.active_effects where user_id = :bia;
drop function t.luck_with(numeric[]);

-- ------------------------------------------------------------ artifacts: fragments, forge, bonuses
reset role;
update public.profiles set coins = 5000, streak = 1, last_pull_at = null where id in (:duda, :bia);
delete from public.active_effects where user_id = :bia;
select id as frag_comum from public.fragment_types where name = 'Comum' \gset
select id as comum_card from public.cards where active and odds_n < 100 order by odds_n limit 1 \gset
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_set_fragment_rule('comum', :'frag_comum', 3);
select (public.admin_upsert_artifact(jsonb_build_object('name', 'Trevo de teste', 'description', 'sorte', 'rarity', 'raro', 'luck_mult', 5,
  'recipe', jsonb_build_array(jsonb_build_object('fragment_type', :'frag_comum', 'amount', 6))))->>'id') as art_sorte \gset
select (public.admin_upsert_artifact(jsonb_build_object('name', 'Ampulheta de teste', 'rarity', 'epico', 'xp_mult', 2, 'money_mult', 3,
  'recipe', jsonb_build_array(jsonb_build_object('fragment_type', :'frag_comum', 'amount', 3))))->>'id') as art_xp \gset
select t.err($$select public.admin_upsert_artifact('{"name":"x"}')$$, 'invalid', 'artefato precisa de receita');
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err($$select public.admin_upsert_artifact('{"name":"x","recipe":[]}')$$, 'forbidden', 'jogador comum nao cria artefato');
reset role;
-- fragments: the player turns spare copies into fragments when they want
insert into public.inventory (user_id, card_id, quantity) values (:bia, :'comum_card', 3) on conflict (user_id, card_id) do update set quantity = 3;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((public.convert_duplicates(:'comum_card', 1)->>'gained')::int = 3, 'segunda copia vira fragmentos, na quantidade que o admin configurou');
select t.ok((public.convert_duplicates(:'comum_card', 1)->>'gained')::int = 3, 'terceira copia vira fragmentos de novo');
select t.err(format('select public.convert_duplicates(%L, 1)', :'comum_card'), 'invalid', 'a ultima copia nunca vira fragmento');
select t.ok((select quantity from public.inventory where user_id = auth.uid() and card_id = :'comum_card') = 1, 'a primeira copia continua na colecao');
select t.ok(exists (select 1 from jsonb_array_elements(public.get_fragments()) f where f->>'name' = 'Comum' and (f->>'quantity')::int = 6), 'fragmentos ficam guardados');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_set_card_fragments(:'comum_card', false);
reset role;
update public.inventory set quantity = 2 where user_id = :bia and card_id = :'comum_card';
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err(format('select public.convert_duplicates(%L, 1)', :'comum_card'), 'invalid', 'carta que o admin bloqueou nao vira fragmento');
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_set_card_fragments(:'comum_card', true);
reset role;
-- forge
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((select (a->>'can_craft')::boolean from jsonb_array_elements(public.get_forge()) a where a->>'name' = 'Trevo de teste'), 'forja mostra que da para fabricar');
select t.ok(public.craft_artifact(:'art_sorte', '11111111-1111-1111-1111-111111111111') ? 'id', 'fabrica com materiais suficientes');
select t.ok(public.craft_artifact(:'art_sorte', '11111111-1111-1111-1111-111111111111') ? 'id', 'o mesmo pedido de novo nao fabrica outra vez');
select t.ok(jsonb_array_length(public.get_my_artifacts()->'items') = 1, 'so um artefato fabricado com o pedido repetido');
select t.ok(not exists (select 1 from jsonb_array_elements(public.get_fragments()) f where (f->>'quantity')::int > 0), 'fragmentos descontados certinho');
select t.err(format('select public.craft_artifact(%L, %L)', :'art_sorte', '22222222-2222-2222-2222-222222222222'), 'missing_materials', 'sem materiais nao fabrica');
select t.ok(jsonb_array_length(public.get_my_artifacts()->'items') = 1 and jsonb_array_length(public.get_my_artifacts()->'items') = 1, 'artefato continua na colecao ao abrir de novo');
reset role;
-- bonuses: artifacts add up, potions amplify the artifacts' sum (1 + extras), each attribute apart
create function t.luck_with(p_arts numeric[], p_pots numeric[], p_attr text default 'luck') returns numeric language plpgsql as $$
declare b uuid := '00000000-0000-0000-0000-0000000000b1'; m numeric; a uuid;
begin
  delete from public.user_artifacts where user_id = b;
  delete from public.active_effects where user_id = b;
  update public.profiles set streak = 1, last_pull_at = null where id = b;
  foreach m in array p_arts loop
    insert into public.artifacts (name, rarity, luck_mult) values ('t ' || m, 'raro', m) returning id into a;
    insert into public.user_artifacts (user_id, artifact_id, active) values (b, a, true);
  end loop;
  foreach m in array p_pots loop
    insert into public.active_effects (user_id, item_id, multiplier, attribute, expires_at) values (b, (select id from public.items limit 1), m, p_attr, now() + interval '10 minutes');
  end loop;
  return (select effective from app.luck_state(b));
end $$;
select t.ok(t.luck_with(array[5, 5], array[]::numeric[]) = 10, 'dois artefatos de 5x = 10x');
select t.ok(t.luck_with(array[5], array[2]) = 10, 'artefato de 5x com pocao de 2x = 10x');
select t.ok(t.luck_with(array[5], array[3]) = 15, 'artefato de 5x com pocao de 3x = 15x');
select t.ok(t.luck_with(array[5], array[2, 2]) = 15, 'artefato de 5x com duas pocoes de 2x = 15x');
select t.ok(t.luck_with(array[5, 5], array[2]) = 20, 'dois artefatos de 5x com pocao de 2x = 20x');
select t.ok(t.luck_with(array[5, 5], array[3]) = 30, 'dois artefatos de 5x com pocao de 3x = 30x');
select t.ok(t.luck_with(array[]::numeric[], array[5]) = 5, 'sem artefato, pocao de 5x = 5x (base 1x)');
select t.ok(t.luck_with(array[]::numeric[], array[5, 5]) = 9, 'sem artefato, duas pocoes de 5x = 9x (1 x (1+4+4))');
select t.ok(t.luck_with(array[5], array[2], 'xp') = 5, 'pocao de XP nao mexe na sorte');
select t.luck_with(array[5], array[2, 2]);
update public.active_effects set expires_at = now() - interval '1 second' where user_id = :bia and ctid = (select ctid from public.active_effects where user_id = :bia limit 1);
select t.ok((select effective from app.luck_state(:bia)) = 10, 'uma pocao expira e a outra continua (15x vira 10x)');
update public.active_effects set expires_at = now() - interval '1 second' where user_id = :bia;
select t.ok((select effective from app.luck_state(:bia)) = 5, 'sem pocoes o artefato volta para a base (5x)');
update public.user_artifacts set active = false where user_id = :bia;
select t.ok((select effective from app.luck_state(:bia)) = 1, 'artefato desativado nao da bonus');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((public.get_luck()->>'effective')::numeric = (public.get_luck()->>'effective')::numeric, 'ler a sorte de novo nao muda nada');
reset role;
drop function t.luck_with(numeric[], numeric[], text);
-- slots
delete from public.user_artifacts where user_id = :bia;
insert into public.user_artifacts (user_id, artifact_id, active) select :bia, :'art_sorte', false from generate_series(1, 4);
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
do $$
declare r record; n int := 0;
begin
  for r in select (x->>'user_artifact_id')::bigint as id from jsonb_array_elements(public.get_my_artifacts()->'items') x order by 1 loop
    n := n + 1;
    begin
      perform public.set_artifact_active(r.id, true);
      if n = 4 then raise exception 'FAIL: quarto artefato ativado com 3 espacos'; end if;
    exception when others then
      if n < 4 or sqlerrm <> 'invalid' then raise; end if;
      raise notice 'ok  so 3 artefatos ativos ao mesmo tempo';
    end;
  end loop;
end $$;
reset role;
-- XP and money multipliers count from now on, only on what is earned
delete from public.user_artifacts where user_id = :bia;
insert into public.user_artifacts (user_id, artifact_id, active) values (:bia, :'art_xp', true);
select coins as antes from public.profiles where id = :bia \gset
select app.move_coins(:bia, 100, 'bonus diario');
select t.ok((select coins from public.profiles where id = :bia) = :antes + 300, 'artefato de moedas 3x: bonus diario de 100 vira 300');
select app.move_coins(:bia, 100, 'chat:recebeu');
select t.ok((select coins from public.profiles where id = :bia) = :antes + 400, 'moedas recebidas de outro jogador nao sao multiplicadas');
select app.xp(:bia) as xp_antes \gset
insert into public.pulls (user_id, card_id, odds_n_at_pull, luck_used) values (:bia, :'comum_card', 12, 1);
select t.ok(app.xp(:bia) = :xp_antes + 20, 'artefato de XP 2x: roletada vale 20 XP em vez de 10');
-- the global reset also clears fragments, artifacts and bonus XP
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.admin_global_reset('RESETAR SERVIDOR');
reset role;
select t.ok((select count(*) from public.user_fragments) + (select count(*) from public.user_artifacts) = 0
        and (select count(*) from public.profiles where xp_bonus <> 0) = 0, 'reset global tambem limpa fragmentos, artefatos e XP extra');
select t.ok((select count(*) from public.artifacts where name = 'Trevo de teste') = 1, 'reset mantem os artefatos que o admin criou');

-- ------------------------------------------------------------ notifications: the bell
reset role;
update public.profiles set coins = 5000 where id in (:duda, :bia);
delete from public.notifications where true;
select id as nt_card from public.cards where active order by odds_n limit 1 \gset
insert into public.inventory (user_id, card_id, quantity) values (:bia, :'nt_card', 3), (:duda, :'nt_card', 3)
  on conflict (user_id, card_id) do update set quantity = 3;
update public.chat_messages set created_at = now() - interval '1 minute' where true;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select public.chat_send_coins(:duda, 100, 'valeu');
reset role;
select t.ok(exists (select 1 from public.notifications where user_id = :duda and kind = 'coins' and body like '%bia%100 moedas%'), 'aviso: um jogador te mandou moedas');
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select (public.chat_offer(:'nt_card', null, null)->>'id') as nt_offer \gset
reset role;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select (public.chat_bid(:nt_offer, null, 50)->>'id') as nt_bid \gset
reset role;
select t.ok(exists (select 1 from public.notifications where user_id = :duda and kind = 'bid'), 'aviso: chegou uma proposta na sua oferta');
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.chat_accept_bid(:nt_bid);
reset role;
select t.ok(exists (select 1 from public.notifications where user_id = :bia and kind = 'bid_accepted'), 'aviso: aceitaram sua proposta');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select (public.chat_offer(:'nt_card', 200, null)->>'id') as nt_sale \gset
reset role;
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.chat_buy(:nt_sale);
reset role;
select t.ok(exists (select 1 from public.notifications where user_id = :bia and kind = 'sold' and body like '%duda%200 moedas%'), 'aviso: alguem comprou sua oferta');
insert into public.card_gifts (from_user, to_user, card_id) values (:duda, :bia, :'nt_card');
select t.ok(exists (select 1 from public.notifications where user_id = :bia and kind = 'gift'), 'aviso: alguem te deu uma carta');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok((public.get_notifications()->>'unread')::int >= 3, 'sininho conta os avisos nao lidos');
select t.ok((select count(*) from public.notifications where user_id = :duda) = 0, 'ninguem le os avisos dos outros');
select public.mark_notifications_read(null);
select t.ok((public.get_notifications()->>'unread')::int = 0, 'marcar como lido zera o sininho');
reset role;

-- ------------------------------------------------------------ chat mentions
reset role;
delete from public.notifications where true;
update public.chat_messages set created_at = now() - interval '1 minute' where true;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select public.chat_send('oi @duda, olha isso! @duda @ninguemaqui @bia', null);
reset role;
select t.ok((select count(*) from public.notifications where user_id = :duda and kind = 'mention' and body like '%bia%mencionou%') = 1, 'mencao avisa a pessoa (uma vez so)');
select t.ok(not exists (select 1 from public.notifications where user_id = :bia), 'quem menciona a si mesmo nao recebe aviso');
select t.as_user(:duda, 'duda@turma.test');
set role authenticated;
select public.chat_send('valeu @BIA', null);
reset role;
select t.ok(exists (select 1 from public.notifications where user_id = :bia and kind = 'mention'), 'mencao funciona com maiusculas ou minusculas');
select t.ok(exists (select 1 from public.notifications where user_id = :bia and kind = 'mention' and link = '/chat'), 'aviso de mencao leva para o chat');

-- ------------------------------------------------------------ daily chest
reset role;
select t.ok((select count(*) from public.chest_prizes where active) >= 3, 'o bau ja vem com premios');
select t.ok(abs((select sum(chance) from app.chest_table()) - 1) < 1e-9, 'as chances do bau somam 100%');
create table t.chest (prize uuid);
insert into t.chest select (app.chest_draw()).id from generate_series(1, 20000);
select t.ok(not exists (
  select 1 from app.chest_table() c
  where abs((select count(*) from t.chest x where x.prize = c.id) - 20000 * c.chance) > 5 * sqrt(20000 * c.chance * (1 - c.chance)) + 3),
  '20 mil baus: cada premio sai na chance do peso');
drop table t.chest;
-- each kind of prize really arrives
update public.chest_prizes set active = false where true;
insert into public.chest_prizes (kind, amount, fragment_type, weight) values ('fragments', 7, (select id from public.fragment_types where name = 'Raro'), 1);
delete from public.daily_claims where user_id = :bia;
delete from public.user_fragments where user_id = :bia;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.ok(public.claim_daily()->'prize'->>'kind' = 'fragments', 'bau entrega o premio sorteado');
select t.err('select public.claim_daily()', 'already_claimed', 'bau so abre uma vez por dia');
reset role;
select t.ok((select quantity from public.user_fragments where user_id = :bia) = 7, 'premio de fragmentos chega na conta');
update public.chest_prizes set active = false where true;
insert into public.chest_prizes (kind, amount, item_id, weight) values ('potion', 2, (select id from public.items order by price limit 1), 1);
delete from public.daily_claims where user_id = :bia;
delete from public.user_items where user_id = :bia;
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select public.claim_daily();
reset role;
select t.ok((select quantity from public.user_items where user_id = :bia) = 2, 'premio de pocao chega na mochila');
update public.chest_prizes set active = false where true;
insert into public.chest_prizes (kind, amount, weight) values ('coins', 300, 1);
delete from public.daily_claims where user_id = :bia;
select coins as bau_antes from public.profiles where id = :bia \gset
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select public.claim_daily();
reset role;
select t.ok((select coins from public.profiles where id = :bia) = :bau_antes + 300, 'premio de moedas chega no saldo');
select t.ok(exists (select 1 from public.daily_claims where user_id = :bia and day = app.today()), 'abrir o bau conta como bonus do dia (XP e missoes)');
select t.as_user(:bia, 'bia@turma.test');
set role authenticated;
select t.err($$select public.admin_upsert_chest_prize('{"kind":"coins","amount":1,"weight":1}')$$, 'forbidden', 'jogador comum nao mexe no bau');
select t.ok(jsonb_array_length(public.get_chest()->'prizes') = 1, 'jogador ve os premios do bau e as chances');
reset role;

-- ------------------------------------------------------------ randomness
select t.ok((select min(x) >= 0 and max(x) < 1 and abs(avg(x) - 0.5) < 0.02 from (select app.rand() x from generate_series(1, 20000)) r),
            'app.rand uniforme em [0,1)');
\echo 'ALL DATABASE TESTS PASSED'
