# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
O dono do projeto e os amigos da turma do SENAI. Jogam no celular na maior parte do tempo, em intervalos e em casa. O projeto também é apresentado no SENAI.

## Product Purpose
Site de coleção de cartas por sorte (RNG). As cartas são piadas internas da turma, com raridade de 1/10 até 1/10.000.000.000. O centro da experiência é um **botão de roletar**: o jogador clica, a roleta gira e uma carta sai. Moedas fictícias pagam as roletadas; minijogos dão mais moedas. Sucesso = os amigos voltam para roletar, comparar coleções e comemorar tiragens raras.

## Positioning
Não é um gacha genérico: o conteúdo é a própria turma. A raridade de cada piada é a graça, e tirar a piada lendária vira assunto no grupo.

## Operating Context
- Login só com conta Google, acesso fechado por lista de convidados.
- Páginas: Início, Roletar, Coleção, Detalhe da carta, Loja (Sorte e Cosméticos), Jogos (caça-níquel, memória, reflexo, clique rápido), Ranking, Perfil, Editar perfil, Sugerir piada, e Admin (cartas, sugestões, economia, cosméticos, jogadores, convidados).
- Mural ao vivo com tiragens ≥ 1/1 milhão.

## Capabilities and Constraints
- Stack: React + Vite + TypeScript, backend Supabase (depois). Frontend primeiro com dados de mentira.
- Fase atual: **só design**, sem funcionalidade.
- Interface em pt-BR. Moedas 100% fictícias, nunca dinheiro real.
- Cartas não tiradas são secretas: só raridade aparece.
- Seis raridades: comum, incomum, raro, épico, lendário, mítico.
- Loja vende só poções de sorte e títulos (mais itens a definir). O banner do perfil é enviado pelo próprio jogador, não é vendido. (dono, 2026-11-17)
- Perfil não fica na lista da sidebar; abre ao clicar no nome/foto. (dono, 2026-11-17)

## Brand Commitments
- Nome: SorteSenai.
- Pedido explícito do dono (2026-11-17, substitui o Aero): "não use tanto azul", "tire os efeitos do botão", "não quero algo como o Frutiger Aero", "algo simples e que gere entretenimento", "bem moderno e bonito, com estilizações nos botões". Sem cara de IA ou "vibecoded".
- Direção escolhida pelo dono: álbum de figurinhas.
- Precisa de uma sidebar com as páginas do site. O dono gostou do layout atual (sidebar + fita de roletar) e quer mantê-lo.

## Evidence on Hand
Nenhuma foto, piada real ou dado real ainda. Conteúdo de exemplo marcado como `[exemplo]`. Não inventar números, depoimentos ou logos.

## Product Principles
1. Roletar é o momento principal; tudo leva até o botão.
2. Raridade se sente, não só se lê.
3. Social antes de escala: mural, ranking e perfis dos amigos.
4. Justo: sorte decidida no servidor, nada de trapaça fácil.
