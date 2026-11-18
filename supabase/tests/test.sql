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
select t.ok((public.claim_daily()->>'coins_after')::int = 205, 'bonus diario da 200');
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

-- ------------------------------------------------------------ randomness
select t.ok((select min(x) >= 0 and max(x) < 1 and abs(avg(x) - 0.5) < 0.02 from (select app.rand() x from generate_series(1, 20000)) r),
            'app.rand uniforme em [0,1)');
\echo 'ALL DATABASE TESTS PASSED'
