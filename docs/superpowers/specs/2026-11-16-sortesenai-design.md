# SorteSenai — Design

Data: 2026-11-16
Status: aprovado

## 1. Intenção

SorteSenai é um site de **coleção de cartas por sorte (RNG)** feito como projeto do SENAI para ser **jogado com os amigos da turma**. As cartas são **piadas internas** da turma, cada uma com uma raridade de "1 em N" (de 1/10 até 1/10.000.000.000). Os jogadores ganham **moedas fictícias** em minijogos, gastam em tiragens, itens de sorte e cosméticos, e competem em ranking e num mural de tiragens raras.

O porquê: diversão entre amigos + um projeto apresentável no SENAI. Por isso:
- o **lado social** (mural, ranking, perfis) pesa mais que escala;
- o **visual precisa parecer desenhado por gente**, não "cara de IA / vibecoding";
- a **trapaça precisa ser difícil**, porque colegas vão tentar pelo DevTools.

## 2. Objetivos

- Login só com conta Google.
- Tiragem de cartas com raridades de 1/10 a 1/10 bilhões, sorteada **no servidor**.
- Raridades do topo **alcançáveis com esforço** (semanas de jogo dedicado, não séculos) através de multiplicadores de sorte.
- Economia de moedas fictícias: recompensa diária, 4 minijogos, loja.
- Coleção, perfil customizável, ranking, mural.
- Amigos sugerem piadas; admin aprova e define raridade.
- Painel admin para cartas, sugestões, economia, cosméticos/títulos e jogadores.
- Banco de dados completo (Postgres no Supabase) com regras de segurança.

## 3. Não-objetivos (v1)

- Troca de cartas entre jogadores (fica para v2).
- Upload livre de banner.
- App mobile nativo (o site deve funcionar bem no celular, mas é web).
- Escala para milhares de usuários.

## 4. Anti-objetivos (seria fracasso mesmo funcionando)

- Visual genérico de template/IA: gradiente roxo-azul, glassmorphism sem motivo, cards arredondados idênticos, emojis como ícones, fonte Inter em tudo, hero com "Bem-vindo ao futuro".
- Qualquer envolvimento com dinheiro real (comprar moedas, prêmios reais). Moedas são 100% fictícias.
- Lógica de sorte, moedas ou recompensas no navegador (trapaça trivial).
- Raridade alta que na prática ninguém nunca tira.
- Conteúdo constrangedor entrando sem filtro (por isso sugestões passam pelo admin).

## 5. Restrições

- **Stack escolhida: React + Supabase.**
- Projeto pessoal/escolar: custo zero (planos gratuitos).
- Interface em **português (pt-BR)**.
- O dono precisa criar um projeto no Google Cloud com credencial OAuth e um projeto no Supabase (o builder documenta o passo a passo).
- Cartas podem ter fotos de colegas: as pessoas retratadas devem concordar (responsabilidade do admin; o site não precisa verificar).
- Plano gratuito do Supabase pausa o projeto após ~1 semana sem uso — documentar.

## 5.1 Acesso e sigilo (decididos pelo dono)

- **Acesso fechado por lista de convidados:** só entram contas Google cujo e-mail está numa tabela `allowed_emails`, gerenciada pelo admin (nova tela Admin > Convidados). Quem não está na lista vê uma tela "acesso restrito" e nenhum dado é lido. Todas as políticas RLS de leitura exigem usuário autenticado **e** na lista (e não banido); nada é legível por `anon`.
- **Cartas não tiradas são secretas de verdade:** título, texto e imagem de uma carta só chegam ao navegador de quem a possui. Para quem não possui, a API devolve apenas id e raridade (via view/RPC; a tabela `cards` não é lida diretamente). Imagens ficam em bucket **privado** servido por URL assinada apenas para donos. Exceções que revelam conteúdo de propósito: mural (a carta tirada aparece para todos — revelar é o evento) e perfil/vitrine/avatar-carta de outro jogador. "Quem já tem" mostra nomes de jogadores, nunca o conteúdo para quem não tem.

## 5.2 Ordem de construção (decidida pelo dono)

1. **Frontend primeiro**, começando pela direção visual (hallmark), com uma **camada de dados mock** que imita exatamente as chamadas/formatos do Supabase (mesmas funções e tipos); sorteio e jogos simulados no navegador só para validar telas e animações.
2. **Backend depois:** Supabase (schema, RLS, RPCs, storage, auth Google, lista de convidados) e troca da camada mock pela real num único ponto.

## 6. Abordagens consideradas

| Abordagem | Prós | Contras |
|---|---|---|
| A. Next.js + Postgres (Prisma) + Auth.js na Vercel | um código, TypeScript ponta a ponta, lógica sensível em rotas do servidor | menos separação front/back visível; mais código de backend |
| **B. React + Supabase (escolhida)** | login Google, banco, storage e permissões prontos; pouquíssimo backend | lógica sensível vive em funções SQL/RLS — mais difícil de depurar; erro de permissão = trapaça liberada |
| C. React + API separada (Node/Spring/C#) + MySQL/Postgres | arquitetura clássica, ótima de apresentar | dois projetos, dois deploys, muito mais código |

O dono escolheu **B**. Consequência de design: **toda mutação de moedas, inventário, sorte e jogos acontece em funções Postgres (`SECURITY DEFINER`, chamadas via RPC)**. O cliente nunca escreve diretamente nessas tabelas; RLS bloqueia `INSERT/UPDATE/DELETE` nelas para o papel `authenticated`.

## 7. Arquitetura

- **Frontend:** React + Vite + TypeScript, React Router, `@supabase/supabase-js`, TanStack Query para dados. Hospedagem estática gratuita (Vercel ou Netlify).
- **Backend:** Supabase
  - Auth: provedor Google.
  - Postgres: tabelas + funções RPC com a lógica de jogo (transações atômicas, então moedas nunca ficam inconsistentes).
  - Storage: bucket **privado** `cards` (imagens de cartas, URL assinada só para quem pode ver — ver 5.1), `avatars` e `cosmetics` (leitura só para usuários autenticados e convidados), bucket privado `suggestions` (imagens de sugestões pendentes).
  - Edge Functions só se alguma lógica ficar inviável em SQL (decisão do builder).
- **Aleatoriedade:** usar fonte criptográfica (`gen_random_bytes` do pgcrypto), nunca `random()`.
- **Tempo real:** mural via Supabase Realtime (assinatura na tabela de eventos do mural).

## 8. Mecânica de sorte

- Cada carta tem `odds_n` (o "N" de 1/N), `bigint`, de 10 a 10.000.000.000.
- **Algoritmo da tiragem:** percorre as cartas ativas da **mais rara para a mais comum**; para cada uma, sucesso com probabilidade `min(1, sorte / N)`; a primeira que passar é a carta tirada. Se nenhuma passar, sai a carta mais comum. (Esse modelo faz o "1 em N" exibido ser fiel e o multiplicador de sorte agir de forma intuitiva.)
- **Sorte efetiva** = 1 × multiplicadores ativos (poções) × bônus de sequência, limitado por um **teto** configurável.
- **Bônus de sequência:** tiragens seguidas (cada uma dentro de uma janela curta de tempo após a anterior) aumentam um pequeno bônus de sorte, com teto próprio; a sequência zera quando a janela expira. Janela, incremento e teto ficam em `settings`. *(Chamada do designer.)*
- **Poções:** compradas na Loja; cada uma tem multiplicador e duração (por tempo ou por número de tiragens). Deve existir pelo menos um item raro/caro de multiplicador enorme e uso único para tornar o topo alcançável.
- **Meta de balanceamento:** um jogador dedicado alcança uma carta ≥ 1/1 bilhão em **algumas semanas**. Os números exatos (preços, multiplicadores, teto, recompensas) são do builder, ajustáveis na tela Economia do admin, e o builder deve validá-los com um script de simulação.
- **Repetidas:** ficam no inventário com quantidade; o jogador pode **reciclar** em moedas (valor cresce com a raridade).
- **Mural:** tiragens com N ≥ limite configurável (padrão 1.000.000) geram evento público: "fulano tirou X (1/N) com sorte Y×".
- **Custo:** cada tiragem custa moedas (valor configurável).
- **Mudança de raridade / desativação de carta** *(chamada do designer)*: o `odds_n` vigente é **gravado no momento da tiragem** (em `pulls` e `feed_events`). Ranking de "maior raridade tirada", mural e títulos já conquistados usam esse valor gravado e nunca mudam retroativamente. Reciclagem usa o `odds_n` atual da carta. Cartas desativadas saem do sorteio e do total da coleção (%), mas continuam no inventário de quem já tem e podem ser recicladas.

## 9. Economia

Moeda única: **moedas**.
- **Entrada:** recompensa diária, minijogos (com limite diário por jogo), reciclagem de repetidas, ajuste manual do admin.
- **Saída:** tiragens, poções (Loja > Sorte), cosméticos (Loja > Cosméticos).
- Todo movimento de saldo é registrado numa tabela de transações (auditoria e histórico).

## 10. Minijogos (todos validados no servidor)

Cada partida começa com uma RPC que cria uma **sessão de jogo** no servidor e termina com outra RPC que valida e paga. Limite diário de moedas por jogo, configurável.

1. **Caça-níquel:** servidor sorteia o resultado na hora da aposta; o front só anima até ele.
2. **Jogo da memória:** servidor embaralha e guarda o tabuleiro; cada clique é uma RPC que revela só aquela posição. Prêmio depende do número de jogadas.
3. **Reflexo:** servidor registra o início e um atraso aleatório; tempos de reação abaixo de ~120 ms são rejeitados.
4. **Clicar rápido:** servidor registra início/fim; rejeita rodada mais curta que a duração e cliques/segundo acima do humanamente possível (~15).

## 11. Páginas

**Público**
- Login (botão "Entrar com Google").

**Jogador**
- Início: saldo, sorte ativa, botão de tirar carta, recompensa diária, mural recente.
- Tirar carta: animação da tiragem; revelação proporcional à raridade.
- Coleção: todas as cartas (bloqueadas mostram só a raridade), quantidade, % completo, filtros.
- Detalhe da carta: piada, imagem, raridade, quem já tem.
- Loja: abas **Sorte** e **Cosméticos**.
- Jogos: hub + 4 jogos.
- Ranking: por moedas, % da coleção, maior raridade tirada.
- Perfil (próprio e dos amigos): banner, avatar com moldura, apelido, título, bio, vitrine de 3 cartas, estatísticas.
- Editar perfil: apelido (único), bio, avatar (foto do Google / upload / uma carta que possui), vitrine, título equipado, cosméticos equipados (banner, moldura, cor/fundo, efeito do nome no mural).
- Sugerir piada: texto + imagem opcional; lista das próprias sugestões e status.

**Admin** (usuários com `role = 'admin'`; o primeiro admin é definido manualmente no banco)
- Cartas: criar/editar/desativar, imagem, texto, `odds_n`.
- Sugestões: aprovar (vira carta, admin define raridade) / recusar.
- Economia: preços, recompensas, limites diários, multiplicadores, teto de sorte, limite do mural.
- Cosméticos e títulos: cadastrar itens, preço, imagem; títulos e suas condições de desbloqueio.
- Jogadores: ver saldo/inventário, ajustar moedas, banir.
- Convidados: adicionar/remover e-mails da lista de acesso.

## 12. Customização de perfil

- **Títulos** são conquistados, não comprados (ex.: "Primeira 1/1 milhão", "Colecionador 50%"). *(Chamada do designer:)* existe um **conjunto fixo de tipos de condição** com parâmetros que o admin preenche — por exemplo "tirou carta com N ≥ X", "coleção ≥ X%", "fez X tiragens", "ganhou X moedas no jogo Y", "concedido manualmente". Sem motor de regras arbitrárias. A checagem roda no servidor após cada evento relevante.
- **Banner:** comprado na Loja ou desbloqueado por conquista (ex.: banner exclusivo para quem tirou carta ≥ 1/1 bilhão). Sem upload livre.
- **Avatar:** foto do Google por padrão; upload próprio permitido; ou uma carta que o jogador possui.
- Moldura, cor/fundo e efeito do nome no mural: cosméticos comprados.

## 13. Modelo de dados (esboço — o builder refina)

- `profiles` (id = auth.users.id, apelido único, bio, avatar_url, avatar_card_id, role, banned, coins, created_at)
- `cards` (id, título, texto da piada, image_path, odds_n bigint, active, created_by, created_at)
- `inventory` (user_id, card_id, quantity, first_pulled_at)
- `pulls` (id, user_id, card_id, luck_used, created_at)
- `coin_transactions` (id, user_id, amount, reason, ref, created_at)
- `items` (id, type: potion|banner|frame|color|name_effect, nome, preço, multiplicador, duração, image_path, active)
- `user_items` (user_id, item_id, quantity) e `active_effects` (user_id, item_id, multiplicador, expira_em / tiragens_restantes)
- `titles`, `user_titles`; `profile_equipment` (banner, moldura, cor, efeito, título, vitrine[3])
- `suggestions` (id, user_id, texto, image_path, status, admin_note, card_id)
- `game_sessions` (id, user_id, game, state jsonb, started_at, finished_at, reward)
- `daily_limits` (user_id, game, dia, ganho)
- `feed_events` (id, user_id, card_id, luck, created_at)
- `settings` (chave/valor jsonb da economia)
- `allowed_emails` (email, added_by, created_at)
- `pulls` e `feed_events` guardam também `odds_n_at_pull`

## 14. Direção visual

Decidida numa **etapa de design própria, antes de construir as telas**, usando o skill **hallmark**. Pontos já definidos:
- Tema "arquivo da turma": cartas como registros/fichas/figurinhas de álbum, não cartas de fantasia genéricas.
- Sistema visual de raridade forte e próprio (moldura, cor, efeito e animação de revelação escalam com a raridade).
- Funcionar bem no celular (amigos vão jogar no telefone).
- Evitar tudo da lista de anti-objetivos visuais.

## 15. Deixado para o builder

- Valores numéricos da economia (dentro da meta de balanceamento, com simulação).
- Estrutura de pastas, bibliotecas de UI/estilo (alinhadas com a direção visual), animações.
- Detalhes de cada jogo (tamanho do tabuleiro, duração das rodadas, tabela de prêmios).
- Testes: obrigatórios para o sorteio (distribuição estatística), RPCs de moedas/jogos e regras de RLS.
- Passo a passo de configuração (Google Cloud OAuth, Supabase, deploy) em README.
