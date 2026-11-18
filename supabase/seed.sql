-- SorteSenai: sample content for development. Jokes marked [exemplo] are placeholders
-- for the class's real inside jokes. No real e-mails here: add guests with
--   insert into public.allowed_emails (email) values ('voce@gmail.com');
-- and make the first admin after their first login with
--   update public.profiles set role = 'admin' where email = 'voce@gmail.com';

insert into public.cards (title, joke, odds_n) values
  ('O café da cantina',      '[exemplo] Ninguém sabe se é café ou chá.', 12),
  ('A cadeira que balança',  '[exemplo] Sempre sobra pra quem chega atrasado.', 18),
  ('Bom dia, grupo',         '[exemplo] Mandado às 5h47 por alguém.', 25),
  ('Fila do micro-ondas',    '[exemplo] Doze marmitas, um micro-ondas.', 35),
  ('O ar-condicionado',      '[exemplo] Ou Ártico, ou Saara.', 60),
  ('Wi-Fi do bloco B',       '[exemplo] Conecta, mas só na janela.', 450),
  ('O projetor',             '[exemplo] Liga no terceiro tapa.', 1200),
  ('A senha do Wi-Fi',       '[exemplo] Mudou de novo e ninguém avisou.', 3000),
  ('O apelido do Léo',       '[exemplo] Ninguém lembra de onde veio.', 9000),
  ('O pendrive perdido',     '[exemplo] Tinha o TCC de três pessoas.', 25000),
  ('A chamada oral',         '[exemplo] Todo mundo olhando pro chão.', 80000),
  ('O intervalo de 2 minutos','[exemplo] Ninguém volta a tempo.', 150000),
  ('A prova surpresa',       '[exemplo] Surpresa para o professor também.', 3000000),
  ('O dia sem aula',         '[exemplo] Ninguém sabia, só o professor.', 40000000),
  ('O grampeador',           '[exemplo] Ele sabe o que fez.', 400000000),
  ('O alarme na prova',      '[exemplo] Tocou bem na última questão.', 2000000000),
  ('A lenda do bloco C',     '[exemplo] Dizem que a aula acabou mais cedo.', 10000000000);

insert into public.items (name, description, price, multiplier, duration_minutes, duration_pulls) values
  ('Gota de sorte',      'Sorte 2× por 10 minutos.',        150,    2,       10,   null),
  ('Frasco azul',        'Sorte 5× por 20 roletadas.',      600,    5,       null, 20),
  ('Garrafa do sábado',  'Sorte 25× por 30 minutos.',       4000,   25,      30,   null),
  ('Lenda engarrafada',  'Sorte 1.000.000× por 1 roletada.', 250000, 1000000, null, 1);

insert into public.titles (name, description, condition, price) values
  ('Primeira roletada', 'Tirou a primeira carta.',              '{"type":"pull_count","count":1}',            null),
  ('100 roletadas',     'Roletou cem vezes.',                   '{"type":"pull_count","count":100}',          null),
  ('Primeira 1/1 mi',   'Tirou uma carta de 1 em 1 milhão.',    '{"type":"pulled_at_least","odds_n":1000000}', null),
  ('Colecionador 30%',  'Tem 30% da coleção.',                  '{"type":"collection_pct","pct":30}',         null),
  ('Viciado no caça-níquel', 'Ganhou 5.000 moedas no caça-níquel.', '{"type":"game_coins","game":"slots","coins":5000}', null),
  ('Mão de ouro',       'Para quem jura que não é sorte.',      '{"type":"manual"}',                          2000),
  ('Rei do caça-níquel','Aparece no ranking e no mural.',       '{"type":"manual"}',                          3500),
  ('Lenda da turma',    'O título mais caro da loja.',          '{"type":"manual"}',                          20000);
