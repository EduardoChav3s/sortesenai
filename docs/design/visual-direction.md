# SorteSenai — Direção visual

Hallmark em modo **custom**, escopo de app, pedido do dono: "frutiger aero, mas nem tanto, só um gostinho de algo mais moderno, com efeito de glass e cor azul". (A primeira proposta, o tema Paste-up de mural de xerox, foi recusada.) Tokens em `src/styles/tokens.css`, regras-base em `src/styles/base.css`, carimbo em `src/styles/global.css`.

## Ideia

**A sorte num céu de vidro.** O fundo é um céu claro de manhã (azul no topo, quase branco no horizonte) com duas bolhas de luz bem suaves, uma verde-água e uma verde-folha. Sobre ele, tudo que é interativo é **vidro fosco**: translúcido, com desfoque do que está atrás, borda branca de luz e um reflexo brilhante na metade de cima. Cada carta é uma **lâmina de vidro tingida pela raridade**, e quanto mais rara, mais ela acende.

É Aero **dosado**: sem bolhas de sabão espalhadas, sem peixinhos, sem grama em 3D, sem gradiente arco-íris no fundo. Só céu, vidro, brilho e azul.

## Tipo

**Mukta** (sans humanista, parente da Frutiger) em uma família só: 800 para cabeçalhos de tela e números grandes (saldo, raridade, prêmios), 600 para títulos, botões e rótulos, 400 para texto. Rótulos em caixa normal, sem espaçamento extra, sem mono.

## Cor

- **Fundo:** céu `--color-sky-top` → `--color-sky-low` → `--color-paper`, com as bolhas `--color-orb-aqua` e `--color-orb-leaf`.
- **Tinta:** azul-marinho `--color-ink` (nunca preto puro), `--color-muted` para o secundário.
- **Acento:** azul-celeste brilhante (`--color-accent-hi` → `--color-accent`), só no botão primário, na seleção atual e no foco.
- **Moeda:** dourado `--color-coin`. **Positivo:** verde-folha `--color-leaf`.

## Assinatura: a carta de vidro

| Tier | N (1 em N) | Vidro | Brilho |
|---|---|---|---|
| Comum | < 100 | vidro prata-claro | nenhum |
| Incomum | < 10 mil | vidro verde-folha | nenhum |
| Raro | < 1 mi | vidro azul-água | halo azul suave |
| Épico | < 100 mi | vidro rosa-magenta | halo rosa |
| Lendário | < 1 bi | vidro dourado | halo dourado forte |
| Mítico | ≥ 1 bi | vidro azul-noite, borda iridescente (água → folha → ouro → rosa) | halo ciano + reflexo iridescente correndo pela carta sem parar |

Anatomia (retrato 5:7, raio 18px): no topo, "1/N" em Mukta 800 e uma pílula de vidro com o nome do tier; poço da foto com raio 12px e reflexo interno; título em Mukta 600; piada em Mukta 400; no pé, "Carta 001" e a quantidade. **Carta bloqueada:** vidro fosco claro sem tinta, uma faixa fina com a cor do tier no topo, "1/N", a pílula "Bloqueada" e um "?" grande em branco. Nenhum conteúdo.

## Revelação ("sobe da bolha")

A carta sobe e cresce de 78% até o tamanho real com uma mola (`--ease-spring`), e uma faixa de luz atravessa o vidro. A duração e o número de passadas de luz escalam: comum 450 ms (1), incomum 600 (1), raro 900 (1), épico 1,3 s (2), lendário 1,9 s (2), mítico 2,8 s (3), e no mítico o reflexo iridescente continua correndo depois. Botão "pular" após 1 s. Com `prefers-reduced-motion`, a carta aparece pronta e parada.

## Superfícies e controles

- **Vidro** (`.glass`) só onde há algo atrás para desfocar: cartas, barra superior, barra de abas, painéis. Nunca vidro sobre vidro. Sem `backdrop-filter`, ele cai para um branco mais opaco.
- **Botão primário:** cápsula azul brilhante com reflexo na metade de cima, texto branco. **Secundário:** cápsula de vidro com texto marinho. Ao passar o mouse sobe 1px, ao clicar desce 1px. Foco: contorno azul de 3px. Alvo mínimo de 44px.
- **Raios:** carta e painel 18px, poço 12px, controles em cápsula.
- **Movimento:** só `transform` e `opacity`, em `--dur-micro`/`--dur-short`. As exceções são a revelação e o reflexo do mítico.
- **Shell:** barra de vidro no topo no desktop, barra de abas de vidro embaixo no celular (abaixo de 40rem). Saldo e sorte sempre visíveis.
- **Estados:** toda região com dados tem carregando (esqueleto de vidro no formato da carta), vazio, erro e cheio.

## Não fazer

Gradiente roxo → azul, fundo arco-íris, bolhas e peixinhos decorativos, vidro empilhado em vidro, texto branco sobre vidro claro, emoji como ícone, palavra colorida em cabeçalho, rótulo em caixa alta espaçada, "eyebrow" acima de título, preto puro.
