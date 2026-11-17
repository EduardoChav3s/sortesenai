# SorteSenai — Frontend (com dados mock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir todo o frontend do SorteSenai (todas as páginas de jogador e admin) rodando sobre uma camada de dados mock que imita o contrato que o Supabase vai implementar depois.

**Architecture:** SPA React + Vite + TypeScript. As páginas só falam com hooks do TanStack Query (`src/data/hooks.ts`), que só falam com a interface `SorteApi` (`src/data/api.ts`). Nesta fase a implementação é `createMockApi()` (estado em memória persistido em `localStorage`); o plano do backend adiciona `createSupabaseApi()` e troca a escolha em `src/data/index.ts` — único ponto de troca. Lógica pura de sorte/raridade fica em `src/lib/` e será espelhada em SQL no backend. As suítes de contrato em `src/data/contract/` são reaproveitadas contra o Supabase.

**Tech Stack:** Node 22, npm, Vite 5, React 18, TypeScript 5 (strict), React Router 6, @tanstack/react-query 5, Vitest + @testing-library/react + jsdom, CSS Modules + CSS custom properties, `motion` (Framer Motion) para animações.

**Spec:** `docs/superpowers/specs/2026-11-16-sortesenai-design.md`

## Global Constraints

- Toda a interface em **pt-BR**; números formatados com `Intl.NumberFormat('pt-BR')`.
- Raridade é sempre "1 em N", com N inteiro de **10 a 10.000.000.000** (`odds_n: number`).
- Moedas são 100% fictícias; nada de dinheiro real em nenhuma tela ou texto.
- Páginas **nunca** importam `src/data/mock/*` nem `src/data/api.ts` diretamente — só `src/data/hooks.ts`.
- Conteúdo (título, piada, imagem) de carta não possuída **nunca** chega ao componente: o tipo `CardLocked` não tem esses campos.
- Anti-objetivos visuais (spec §4): sem gradiente roxo-azul, sem glassmorphism gratuito, sem cards arredondados idênticos genéricos, sem emojis como ícones, sem Inter em tudo, sem hero "Bem-vindo ao futuro".
- Sem Tailwind e sem kit de UI pronto (MUI/Chakra/shadcn): identidade visual própria via tokens.
- Layout funcional a partir de **360 px** de largura, sem scroll horizontal.
- Admin = `profile.role === 'admin'`.
- Limite do mural padrão: `feed_min_odds = 1_000_000`.

## Review Focus

1. **Saldo insuficiente** (tirar carta, comprar item, apostar no caça-níquel): botão desabilitado com motivo visível; se a chamada falhar com `insufficient_coins`, o saldo exibido não muda e aparece aviso. → testes nas Tasks 5, 9, 11, 12.
2. **Clique duplo / repetido** em ações que gastam moedas: nunca duas chamadas simultâneas; botão desabilitado enquanto a mutação está pendente. → testes nas Tasks 5, 9, 11.
3. **Vazamento de carta bloqueada**: abrir `/carta/:id` de carta não possuída, escolher avatar-carta ou vitrine — só cartas possuídas aparecem; nenhum texto da piada no DOM. → testes nas Tasks 4, 5, 10, 15.
4. **Limite diário de jogo atingido**: hub e jogo mostram "limite atingido" antes de começar; partida ainda jogável, pagamento 0, sem erro. → testes nas Tasks 7 e 12.
5. **Números enormes em tela estreita**: `1/10.000.000.000`, sorte `1.000.000×` e saldos de 9+ dígitos cabem em 360 px (formato compacto "10 bi" quando necessário). → testes na Task 2, checagem visual na Task 17.

---

## File Structure

```
src/
  main.tsx, app/{App.tsx, router.tsx, providers.tsx, Layout.tsx}
  auth/{AuthProvider.tsx, RequireAuth.tsx, RequireAdmin.tsx}
  styles/{tokens.css, global.css}
  lib/{rarity.ts, luck.ts, format.ts, economy.ts}          # lógica pura
  data/
    types.ts            # todos os tipos de domínio
    errors.ts           # ApiError
    api.ts              # interface SorteApi
    index.ts            # export const api = createMockApi() (ponto de troca)
    hooks.ts            # ApiProvider + hooks TanStack Query
    contract/*.contract.ts  # suítes de contrato reutilizáveis
    mock/{store.ts, seed.ts, mockApi.ts, games.ts, admin.ts, social.ts}
  ui/                   # primitivas visuais
  features/
    login/, restricted/, home/, pull/, social/, collection/, card/, shop/,
    games/{hub, slots, memory, reflex, clicker}/, ranking/, profile/,
    profile-edit/, suggest/, admin/{cards, suggestions, economy, cosmetics, players, guests}/,
    style-guide/        # rota /_estilo (só em dev) para revisão visual
  test/{setup.ts, renderWithApp.tsx, memoryStorage.ts}
docs/design/visual-direction.md
```

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/test/setup.ts`, `.gitignore`, `src/app/App.test.tsx`

**Interfaces — Produces:** scripts `npm run dev`, `npm test` (`vitest run`), `npm run build`, `npm run typecheck` (`tsc --noEmit`); alias `@/` → `src/`.

- [ ] **Step 1:** `git init` na raiz `SenaiRNG` (o design já existente em `docs/` entra no primeiro commit); criar o projeto com `npm create vite@latest . -- --template react-ts`; instalar `react-router-dom@6 @tanstack/react-query@5 motion` e, como dev, `vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`.
- [ ] **Step 2:** Configurar Vitest (`environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']` importando `@testing-library/jest-dom`), alias `@/`, `strict: true`. `index.html` com `<html lang="pt-BR">` e `<title>SorteSenai</title>`.
- [ ] **Step 3: Write the test** `App.test.tsx`: `render(<App />)` não lança e `document.title === 'SorteSenai'`.
- [ ] **Step 4:** Run `npm test` → PASS; `npm run typecheck` e `npm run build` sem erros.
- [ ] **Step 5: Commit** `chore: scaffold vite react ts`

---

### Task 2: Tipos de domínio e lógica pura

**Files:**
- Create: `src/data/types.ts`, `src/data/errors.ts`, `src/lib/rarity.ts`, `src/lib/format.ts`, `src/lib/luck.ts`, `src/lib/economy.ts`
- Test: `src/lib/rarity.test.ts`, `format.test.ts`, `luck.test.ts`, `economy.test.ts`

**Interfaces — Produces:**

```ts
// types.ts
export type RarityTier = 'comum' | 'incomum' | 'raro' | 'epico' | 'lendario' | 'mitico';
export type GameId = 'slots' | 'memory' | 'reflex' | 'clicker';
export type ItemType = 'potion' | 'banner' | 'frame' | 'color' | 'name_effect';
export interface CardLocked { id: string; odds_n: number; active: boolean }
export interface CardContent extends CardLocked { title: string; joke: string; image_url: string | null }
export type CollectionEntry =
  | { owned: true; card: CardContent; quantity: number }
  | { owned: false; card: CardLocked; quantity: 0 };
export interface Equipment { banner_item_id: string | null; frame_item_id: string | null; color_item_id: string | null; name_effect_item_id: string | null; title_id: string | null; showcase: [string | null, string | null, string | null] }
export interface Profile { id: string; email: string; nickname: string; bio: string; avatar_url: string | null; avatar_card_id: string | null; role: 'player' | 'admin'; banned: boolean; coins: number; equipment: Equipment; created_at: string }
export interface PlayerSummary { id: string; nickname: string; avatar_url: string | null; avatar_card: CardContent | null; title_name: string | null; frame_item_id: string | null; name_effect_item_id: string | null }
export interface PublicProfile extends PlayerSummary { bio: string; banner_item_id: string | null; color_item_id: string | null; showcase: (CardContent | null)[] }
export interface Item { id: string; type: ItemType; name: string; description: string; price: number; multiplier: number | null; duration_minutes: number | null; duration_pulls: number | null; image_url: string | null; active: boolean }
export interface ActiveEffect { item_id: string; name: string; multiplier: number; expires_at: string | null; pulls_left: number | null }
export interface LuckState { potions: number; streak: number; effective: number; cap: number; streak_expires_at: string | null }
export type TitleCondition =
  | { type: 'pulled_at_least'; odds_n: number } | { type: 'collection_pct'; pct: number }
  | { type: 'pull_count'; count: number } | { type: 'game_coins'; game: GameId; coins: number } | { type: 'manual' };
export interface Title { id: string; name: string; description: string; condition: TitleCondition }
export interface PullResult { card: CardContent; odds_n_at_pull: number; luck_used: number; is_new: boolean; quantity: number; coins_after: number; feed_posted: boolean; titles_unlocked: Title[] }
export interface FeedEvent { id: string; player: PlayerSummary; card: CardContent; odds_n_at_pull: number; luck: number; created_at: string }
export type RankingKind = 'coins' | 'collection' | 'rarest';
export interface RankingEntry { position: number; player: PlayerSummary; value: number }
export interface Suggestion { id: string; user_id: string; text: string; image_url: string | null; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; card_id: string | null; created_at: string }
export interface CoinTransaction { id: string; amount: number; reason: string; created_at: string }
export interface Settings { pull_cost: number; daily_reward: number; luck_cap: number; streak_window_seconds: number; streak_step: number; streak_cap: number; feed_min_odds: number; recycle_base: number; game_daily_limits: Record<GameId, number>; slots_bets: number[] }
export interface Session { user_id: string; email: string; access: 'ok' | 'not_invited' | 'banned' }

// errors.ts
export type ApiErrorCode = 'insufficient_coins' | 'not_found' | 'forbidden' | 'not_invited' | 'banned' | 'invalid' | 'nickname_taken' | 'already_claimed' | 'session_expired';
export class ApiError extends Error { constructor(public code: ApiErrorCode, message: string) }

// rarity.ts
export function rarityTier(odds_n: number): RarityTier;
// format.ts
export function formatOdds(odds_n: number, opts?: { compact?: boolean }): string;
export function formatCoins(n: number, opts?: { compact?: boolean }): string;
export function formatLuck(mult: number): string;
// luck.ts
export function rollCard(cards: CardLocked[], luck: number, rand: () => number): string; // id da carta
export function effectiveLuck(potionMultipliers: number[], streak: number, cap: number): number;
// economy.ts
export function recycleValue(odds_n: number, recycle_base: number): number;
```

Valores fixados (chamadas do plano):
- `rarityTier`: N < 100 comum; < 10.000 incomum; < 1.000.000 raro; < 100.000.000 épico; < 1.000.000.000 lendário; ≥ 1.000.000.000 mítico.
- `rollCard`: só cartas `active`; ordena por `odds_n` decrescente; para cada uma, sucesso se `rand() < Math.min(1, luck / odds_n)`; a primeira que passar vence; se nenhuma, a de menor `odds_n`. Lista sem cartas ativas → `ApiError('invalid')`.
- `effectiveLuck` = `min(cap, produto(potionMultipliers) × streak)`, com `streak ≥ 1`.
- `recycleValue` = `Math.round(recycle_base × 2^(log10(odds_n) − 1))`.
- Formatos: `formatOdds(10_000_000_000)` = `"1/10.000.000.000"`; compacto `"1/10 bi"`; `formatOdds(1_000_000,{compact:true})` = `"1/1 mi"`; `formatOdds(10_000,{compact:true})` = `"1/10 mil"`; `formatOdds(500,{compact:true})` = `"1/500"`. `formatLuck(1_000_000)` = `"1.000.000×"`; `formatLuck(1.5)` = `"1,5×"`. `formatCoins(1_234_567,{compact:true})` = `"1,2 mi"`.

- [ ] **Step 1: Write the failing tests**
  - `rarityTier`: `10→'comum'`, `99→'comum'`, `100→'incomum'`, `1_000_000→'epico'`, `999_999_999→'lendario'`, `10_000_000_000→'mitico'`.
  - Formatos: todos os valores exatos acima.
  - `rollCard`: `rand = () => 0` → carta mais rara; `rand = () => 0.999999` → a mais comum; ignora `active:false`; sem ativas → `ApiError` com `code 'invalid'`; 200.000 rolagens com `Math.random`, cartas [1/10, 1/100], sorte 1 → frequência da 1/100 entre 0,008 e 0,012; com sorte 10 → entre 0,08 e 0,12.
  - `effectiveLuck([2,5], 1.5, 1_000_000) === 15`; `effectiveLuck([1_000_000, 2], 1, 1_000_000) === 1_000_000`; `effectiveLuck([], 1, 1000) === 1`.
  - `recycleValue(10, 5) === 5`; `recycleValue(1000, 5) === 20`.
- [ ] **Step 2:** Run `npm test src/lib` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar tipos e funções.
- [ ] **Step 4:** Run `npm test src/lib` → PASS.
- [ ] **Step 5: Commit** `feat: domain types and pure luck/rarity logic`

---

### Task 3: Direção visual (hallmark)

**Files:**
- Create: `docs/design/visual-direction.md`, `src/styles/tokens.css`, `src/styles/global.css`, `src/features/style-guide/StyleGuidePage.tsx`
- Modify: `src/main.tsx` (importa CSS), `src/app/App.tsx` (rota temporária `/_estilo`)

**Interfaces — Produces** (nomes de tokens usados por todas as tasks seguintes; valores decididos aqui):
`--color-bg, --color-surface, --color-surface-2, --color-ink, --color-ink-muted, --color-line, --color-accent, --color-accent-ink, --color-coin, --color-danger, --color-success`;
`--tier-comum, --tier-incomum, --tier-raro, --tier-epico, --tier-lendario, --tier-mitico` (e `--tier-<nome>-ink`);
`--font-display, --font-body, --font-mono`; `--step--1 … --step-5`; `--space-1 … --space-8`; `--radius-s, --radius-m`; `--shadow-1, --shadow-2`; `--ease-out, --dur-fast, --dur-slow`.

- [ ] **Step 1:** Invocar o skill **hallmark** com o briefing: site de coleção de cartas de piadas internas de uma turma do SENAI; tema "arquivo da turma" (fichas, registros, figurinhas de álbum); 6 níveis de raridade (comum → mítico) em que moldura, cor, textura e animação de revelação escalam; uso principal no celular; anti-objetivos do spec §4. Saída: `visual-direction.md` (conceito, fontes do Google Fonts, paleta, regras do card por tier, regras da animação de revelação por tier, do/don't) e `tokens.css` com os nomes acima.
- [ ] **Step 2:** `StyleGuidePage` em `/_estilo` mostrando paleta, escala tipográfica e os 6 tiers.
- [ ] **Step 3:** `npm run dev`, abrir `/_estilo` em 360 px e 1280 px no navegador, screenshot; conferir cada anti-objetivo (ok/violado) e corrigir violações.
- [ ] **Step 4:** Mostrar os screenshots ao dono e **esperar aprovação da direção visual** antes da Task 4.
- [ ] **Step 5: Commit** `feat: visual direction and design tokens`

---

### Task 4: Primitivas de UI

**Files:**
- Create: `src/ui/{Button, CoinAmount, RarityBadge, CardView, Avatar, PlayerName, Tabs, Modal, Toast}.tsx` + `.module.css`, `src/ui/index.ts`
- Test: `src/ui/CardView.test.tsx`, `src/ui/RarityBadge.test.tsx`, `src/ui/Button.test.tsx`
- Modify: `StyleGuidePage.tsx` (exibe todas as primitivas)

**Interfaces — Produces:**
- `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean })` — `loading` implica `disabled` e `aria-busy="true"`.
- `CoinAmount({ value: number; compact?: boolean })`
- `RarityBadge({ odds_n: number; compact?: boolean })` — texto de `formatOdds`, cor do tier.
- `CardView({ entry: CollectionEntry; size?: 's' | 'm' | 'l'; showQuantity?: boolean; onClick?: () => void })` — raiz com `data-tier`; `owned:false` renderiza só moldura do tier + `RarityBadge` + "???".
- `Avatar({ player: Pick<PlayerSummary, 'avatar_url' | 'avatar_card' | 'frame_item_id' | 'nickname'>; size?: 's' | 'm' | 'l' })`
- `PlayerName({ player: PlayerSummary; showTitle?: boolean })`
- `Tabs({ tabs: { id: string; label: string }[]; value: string; onChange(id: string): void })`, `Modal({ open: boolean; onClose(): void; title: string; children })`, `ToastProvider` + `useToast(): (msg: string, kind?: 'info' | 'error' | 'success') => void`.

- [ ] **Step 1: Write the failing tests**
  - `CardView` com `{owned:false, card:{id:'c1', odds_n:1_000_000, active:true}, quantity:0}`: mostra `"1/1 mi"` e `"???"`; raiz tem `data-tier="epico"`.
  - `CardView` owned com `title:'O Grampeador'` mostra o título e `data-tier` correto.
  - `RarityBadge odds_n={10_000_000_000} compact` → `"1/10 bi"`.
  - `Button loading` → `toBeDisabled()` e `aria-busy="true"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar seguindo `docs/design/visual-direction.md`, usando só tokens (nenhuma cor literal nos `.module.css`).
- [ ] **Step 4:** Run → PASS; conferir `/_estilo` em 360 px.
- [ ] **Step 5: Commit** `feat: ui primitives`

---

### Task 5: Contrato `SorteApi` + mock core

**Files:**
- Create: `src/data/api.ts`, `src/data/mock/store.ts`, `src/data/mock/seed.ts`, `src/data/mock/mockApi.ts`, `src/data/index.ts`, `src/data/contract/core.contract.ts`, `src/data/mock/mockApi.test.ts`, `src/test/memoryStorage.ts`

**Interfaces — Produces** (`api.ts`; todos os métodos retornam `Promise` e falham com `ApiError`; `social`, `admin` e `games` são definidos nas Tasks 6 e 7 — nesta task ficam declarados vazios e são preenchidos depois):

```ts
export interface SorteApi {
  auth: { getSession(): Promise<Session | null>; signInWithGoogle(): Promise<void>; signOut(): Promise<void>; onAuthChange(cb: (s: Session | null) => void): () => void };
  profile: {
    getMine(): Promise<Profile>;
    get(id: string): Promise<{ profile: PublicProfile; stats: { pulls: number; collection_pct: number; rarest_odds: number | null } }>;
    update(patch: Partial<Pick<Profile, 'nickname' | 'bio' | 'avatar_card_id'>> & { avatar_url?: string | null; equipment?: Partial<Equipment> }): Promise<Profile>;
    uploadAvatar(file: File): Promise<Profile>;
    isNicknameAvailable(nick: string): Promise<boolean>;
  };
  economy: {
    getLuck(): Promise<LuckState>; getDailyStatus(): Promise<{ claimed_today: boolean; next_at: string }>; claimDaily(): Promise<{ coins_after: number }>;
    pull(): Promise<PullResult>; recycle(card_id: string, quantity: number): Promise<{ coins_after: number; gained: number }>;
    getTransactions(limit: number): Promise<CoinTransaction[]>; getSettings(): Promise<Settings>;
  };
  cards: { getCollection(): Promise<CollectionEntry[]>; getDetail(id: string): Promise<{ entry: CollectionEntry; owners: PlayerSummary[] }> };
  shop: {
    listItems(type?: ItemType): Promise<Item[]>; buy(item_id: string): Promise<{ coins_after: number }>;
    getMyItems(): Promise<{ item: Item; quantity: number }[]>; usePotion(item_id: string): Promise<ActiveEffect>; getActiveEffects(): Promise<ActiveEffect[]>;
  };
  social: SocialApi; admin: AdminApi; games: GamesApi;
}
```

- `src/data/index.ts`: `export const api: SorteApi = createMockApi();` — único ponto de troca.
- `createMockApi(opts?: { latencyMs?: number; storage?: Storage; rand?: () => number; now?: () => Date }): SorteApi` — padrões `latencyMs: 150`, `storage: localStorage`, chave `sortesenai:mock:v1`. Exporta `resetMockStore(storage: Storage)`.
- `runCoreContract(makeApi: () => Promise<SorteApi>)` em `core.contract.ts` — suíte Vitest reutilizável.
- `memoryStorage(): Storage` — implementação em memória para testes.

Regras do mock (espelham o spec):
- **Seed:** 24 cartas cobrindo os 6 tiers (piadas placeholder com prefixo `[exemplo]`), 6 jogadores com inventários variados, usuário logado `voce@exemplo.com` com `role:'admin'` e 500 moedas; itens: 3 poções (`2×` por 10 min; `5×` por 20 tiragens; "Lenda Engarrafada" `1.000.000×` por 1 tiragem, preço alto), 3 banners, 3 molduras, 3 cores, 2 efeitos de nome; 6 títulos (um de cada tipo de condição); `Settings` padrão `{ pull_cost: 10, daily_reward: 200, luck_cap: 1_000_000, streak_window_seconds: 8, streak_step: 0.05, streak_cap: 2, feed_min_odds: 1_000_000, recycle_base: 5, game_daily_limits: { slots: 500, memory: 300, reflex: 200, clicker: 200 }, slots_bets: [10, 25, 50] }`.
- **Auth:** `signInWithGoogle` entra direto como o usuário seed; se `storage['sortesenai:mock:access']` for `'not_invited'` ou `'banned'`, a sessão vem com esse `access` e todo método de dados falha com o código correspondente.
- **Fila serial:** todas as mutações passam por uma fila; duas chamadas simultâneas nunca leem o mesmo saldo.
- **`pull`:** debita `pull_cost` (sem saldo → `insufficient_coins`, nada muda); usa `rollCard` com `effectiveLuck`; decrementa `pulls_left` das poções e remove as esgotadas/expiradas; streak: se a tiragem anterior foi há ≤ `streak_window_seconds`, `streak = min(streak_cap, streak + streak_step)`, senão `1`; grava `odds_n_at_pull`; posta no feed se `odds_n ≥ feed_min_odds`; registra transação; avalia títulos (Task 6 completa; aqui `titles_unlocked: []`).
- **`getCollection`:** não possuídas viram objeto novo só com `id, odds_n, active`; inativas não possuídas são omitidas.
- **`claimDaily`** duas vezes no mesmo dia (`now()` local) → `already_claimed`.

- [ ] **Step 1: Write the failing contract tests** (`runCoreContract`, executada em `mockApi.test.ts` com `createMockApi({ latencyMs: 0, storage: memoryStorage(), rand: <gerador com semente> })`):
  - `pull` com 500 moedas → `coins_after === 490` e a carta passa a `owned` em `getCollection`.
  - saldo 5 → `pull` rejeita com `code 'insufficient_coins'` e `getMine().coins === 5`.
  - para toda entrada `owned:false`: `Object.keys(e.card).sort()` igual a `['active','id','odds_n']`; `getDetail` de carta não possuída idem.
  - `claimDaily` → +200; segunda chamada → `already_claimed`.
  - `usePotion` da "Lenda Engarrafada" → `getLuck().effective === 1_000_000`; após um `pull` ela some de `getActiveEffects()`.
  - `recycle` de carta 1/1000 com quantidade 2 → `gained === 20`, quantidade 1; quantidade maior que a possuída → `invalid`.
  - `buy` sem saldo → `insufficient_coins`.
  - saldo 15 e dois `pull()` simultâneos → exatamente um resolve e o outro rejeita com `insufficient_coins`.
  - acesso `'not_invited'` → `cards.getCollection()` rejeita com `not_invited`.
- [ ] **Step 2:** Run `npm test src/data` → FAIL.
- [ ] **Step 3:** Implementar `store.ts` (estado, persistência, fila), `seed.ts`, `mockApi.ts`, `index.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: SorteApi contract and mock core`

---

### Task 6: Mock social, títulos, sugestões e admin

**Files:**
- Create: `src/data/mock/social.ts`, `src/data/mock/admin.ts`, `src/data/contract/social.contract.ts`, `src/data/contract/admin.contract.ts`
- Modify: `src/data/api.ts`, `src/data/mock/mockApi.ts`, `src/data/mock/mockApi.test.ts`

**Interfaces — Produces:**

```ts
export interface SocialApi {
  getFeed(limit: number): Promise<FeedEvent[]>; subscribeFeed(cb: (e: FeedEvent) => void): () => void;
  getRanking(kind: RankingKind): Promise<RankingEntry[]>;
  getMyTitles(): Promise<{ title: Title; unlocked_at: string }[]>; listTitles(): Promise<Title[]>;
  createSuggestion(input: { text: string; image?: File }): Promise<Suggestion>; getMySuggestions(): Promise<Suggestion[]>;
}
export interface AdminApi {
  listCards(): Promise<CardContent[]>;
  upsertCard(input: { id?: string; title: string; joke: string; odds_n: number; image?: File | null }): Promise<CardContent>;
  setCardActive(id: string, active: boolean): Promise<void>;
  listSuggestions(status: Suggestion['status']): Promise<(Suggestion & { author: PlayerSummary })[]>;
  approveSuggestion(id: string, input: { title: string; joke: string; odds_n: number }): Promise<CardContent>;
  rejectSuggestion(id: string, note: string): Promise<void>;
  getSettings(): Promise<Settings>; updateSettings(patch: Partial<Settings>): Promise<Settings>;
  listItems(): Promise<Item[]>; upsertItem(input: Omit<Item, 'id' | 'image_url'> & { id?: string; image?: File | null }): Promise<Item>;
  upsertTitle(input: Omit<Title, 'id'> & { id?: string }): Promise<Title>; grantTitle(user_id: string, title_id: string): Promise<void>;
  listPlayers(): Promise<(Profile & { cards_owned: number })[]>;
  adjustCoins(user_id: string, amount: number, reason: string): Promise<{ coins_after: number }>;
  setBanned(user_id: string, banned: boolean): Promise<void>;
  listAllowedEmails(): Promise<{ email: string; created_at: string }[]>; addAllowedEmail(email: string): Promise<void>; removeAllowedEmail(email: string): Promise<void>;
}
```

Regras:
- Ranking `coins` = saldo; `collection` = % de cartas ativas possuídas (0–100, 1 casa); `rarest` = maior `odds_n_at_pull` (sem tiragem → fora). `position` começa em 1.
- Títulos avaliados no servidor (mock) após `pull`, `claimDaily` e pagamento de jogo; recém-desbloqueados voltam em `PullResult.titles_unlocked` (jogos/daily só gravam).
- Todo método de `admin` com não-admin → `forbidden`. `odds_n` não inteiro ou fora de 10–10.000.000.000 → `invalid`. `adjustCoins` com `reason` vazio ou saldo final negativo → `invalid`. `addAllowedEmail` normaliza para minúsculas e valida formato (`invalid`).
- Banir um jogador faz a sessão dele ter `access:'banned'`.

- [ ] **Step 1: Write the failing tests:**
  - `pull` de carta ≥ `feed_min_odds` (rand fixo) → evento em `getFeed(10)[0]` e callback de `subscribeFeed` chamado; carta abaixo do limite → nada no feed.
  - `getRanking('rarest')` ordenado por `value` desc, `position` 1..n.
  - título `{type:'pull_count', count:1}` → 1º `pull` traz em `titles_unlocked`; 2º não repete.
  - `approveSuggestion` cria carta, status `approved` com `card_id`; `upsertCard({ odds_n: 5, ... })` e `({ odds_n: 20_000_000_000, ... })` → `invalid`.
  - não-admin em `admin.listPlayers()` → `forbidden`.
  - `updateSettings({ pull_cost: 50 })` → próximo `pull` debita 50.
  - `addAllowedEmail('Fulano@Gmail.com')` → lista contém `'fulano@gmail.com'`; `addAllowedEmail('xx')` → `invalid`.
  - alterar `odds_n` de carta já tirada não muda `getRanking('rarest')`; desativar carta tira ela do denominador de `collection`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: mock social, titles, suggestions and admin`

---

### Task 7: Mock dos jogos

**Files:**
- Create: `src/data/mock/games.ts`, `src/data/contract/games.contract.ts`
- Modify: `src/data/api.ts`, `src/data/types.ts`, `src/data/mock/mockApi.ts`, `src/data/mock/mockApi.test.ts`

**Interfaces — Produces:**

```ts
export type SlotSymbol = 'grampeador' | 'cafe' | 'pendrive' | 'cracha' | 'apostila' | 'estrela';
export interface GameLimit { earned_today: number; limit: number }
export interface GamesApi {
  getLimits(): Promise<Record<GameId, GameLimit>>;
  playSlots(bet: number): Promise<{ reels: [SlotSymbol, SlotSymbol, SlotSymbol]; payout: number; coins_after: number; capped: boolean }>;
  startMemory(): Promise<{ session_id: string; size: 16 }>;
  flipMemory(session_id: string, index: number): Promise<{ index: number; symbol: string; matched: [number, number] | null; finished: boolean; moves: number; payout: number | null; coins_after: number | null }>;
  startReflex(): Promise<{ session_id: string; delay_ms: number }>;
  finishReflex(session_id: string, reaction_ms: number): Promise<{ valid: boolean; reaction_ms: number; payout: number; coins_after: number; capped: boolean }>;
  startClicker(): Promise<{ session_id: string; duration_ms: 10_000 }>;
  finishClicker(session_id: string, clicks: number, elapsed_ms: number): Promise<{ valid: boolean; clicks: number; payout: number; coins_after: number; capped: boolean }>;
}
```

Regras (o backend refaz com relógio do servidor): `payout` limitado ao que falta do limite diário (`capped: true` quando cortado); limite atingido → partida válida com `payout 0`, nunca erro. Sessão finalizada/inexistente → `session_expired`.
- **Slots:** aposta precisa estar em `settings.slots_bets` (`invalid`), é debitada antes (`insufficient_coins`); 3 iguais = aposta × 10 (`estrela` × 50); 2 iguais = aposta × 2; senão 0. O limite diário vale sobre o lucro líquido (prêmio − aposta).
- **Memória:** 8 pares, uma "jogada" = virar 2 cartas; prêmio = `max(10, 120 − 5 × (jogadas − 8))`.
- **Reflexo:** `delay_ms` aleatório entre 1.500 e 5.000; `reaction_ms < 120` → `valid:false`, `payout 0`; senão `payout = max(5, round(60 − reaction_ms / 10))`.
- **Clicker:** `elapsed_ms < 10_000` ou `clicks / 10 > 15` → `valid:false`; senão `payout = clicks`.

- [ ] **Step 1: Write the failing tests:** slots com rand produzindo 3 `estrela`, aposta 10 → `payout 500`; com 460 de lucro já no dia (limite 500) → lucro creditado 40, `capped:true`; aposta 7 → `invalid`; memória com rand fixo resolvida em 8 jogadas → `payout 120`; flip após terminar → `session_expired`; reflexo 80 ms → `valid:false`; clicker 200 cliques em 10 s → `valid:false`; clicker 100 cliques em 10.000 ms → `payout 100`; com `reflex` no limite, `finishReflex` válido → `payout 0` sem lançar e `getLimits().reflex.earned_today === 200`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: mock minigames`

---

### Task 8: Shell do app, autenticação e hooks

**Files:**
- Create: `src/app/{providers.tsx, router.tsx, Layout.tsx, Layout.module.css}`, `src/auth/{AuthProvider.tsx, RequireAuth.tsx, RequireAdmin.tsx}`, `src/data/hooks.ts`, `src/features/login/LoginPage.tsx`, `src/features/restricted/RestrictedPage.tsx`, `src/test/renderWithApp.tsx`
- Test: `src/app/router.test.tsx`

**Interfaces — Produces:**
- `ApiProvider({ api: SorteApi; children })` + `useApi()`; padrão = `api` de `src/data/index.ts`.
- `renderWithApp(opts: { route: string; api?: SorteApi })` — monta todos os providers e o router em memória com `createMockApi({ latencyMs: 0, storage: memoryStorage() })` por padrão; retorna também a `api` usada (para spies).
- `useSession()` e hooks com chaves estáveis: `useMyProfile, useLuck, useDailyStatus, useCollection, useCardDetail(id), useItems(type?), useMyItems, useActiveEffects, useFeed(limit), useRanking(kind), useProfile(id), useMyTitles, useMySuggestions, useGameLimits, useSettings, useTransactions(limit)`; mutações `usePull, useClaimDaily, useRecycle, useBuyItem, useUsePotion, useUpdateProfile, useUploadAvatar, useCreateSuggestion` e `useAdmin<Método>` para cada método do `AdminApi`. Cada mutação invalida as queries afetadas (ex.: `usePull` → profile, luck, collection, feed, activeEffects, titles). Erros de `ApiError` viram toast com mensagem pt-BR por `code`.
- Rotas: `/entrar`, `/restrito`, `/` (Início), `/tirar`, `/colecao`, `/carta/:id`, `/loja`, `/jogos`, `/jogos/caca-niquel`, `/jogos/memoria`, `/jogos/reflexo`, `/jogos/clique-rapido`, `/ranking`, `/perfil/:id`, `/perfil/editar`, `/sugerir`, `/admin/cartas`, `/admin/sugestoes`, `/admin/economia`, `/admin/cosmeticos`, `/admin/jogadores`, `/admin/convidados`, `/_estilo` (só `import.meta.env.DEV`).
- Layout: topo com marca, saldo (`CoinAmount`) e sorte ativa; navegação inferior fixa no celular (Início, Coleção, Jogos, Loja, Perfil); no desktop, navegação no topo/lateral; link "Admin" só para admin. Visual segundo `visual-direction.md`.

- [ ] **Step 1: Write the failing tests:** sem sessão, `/colecao` → `/entrar`; clicar "Entrar com Google" → `/`; sessão `not_invited` → `/restrito` com "acesso restrito" e `cards.getCollection` não chamado (spy); sessão `banned` → `/restrito` com "conta suspensa"; não-admin em `/admin/cartas` → `/`; admin vê link "Admin".
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (páginas ainda não feitas = placeholder com o título). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: app shell, auth guards and data hooks`

---

### Task 9: Início e Tirar carta

**Files:**
- Create: `src/features/home/{HomePage.tsx, DailyReward.tsx, LuckPanel.tsx}`, `src/features/pull/{PullPage.tsx, PullReveal.tsx}`, `src/features/social/FeedList.tsx` (+ CSS)
- Test: `src/features/pull/PullPage.test.tsx`, `src/features/home/HomePage.test.tsx`

**Interfaces — Produces:** `FeedList({ limit: number; live?: boolean })` — usa `useFeed` e `subscribeFeed`; eventos novos entram no topo. `LuckPanel({ compact?: boolean })` — reusado no topo do Layout.

Comportamento: Início = saldo, `LuckPanel` (sorte efetiva, poções ativas com tempo/tiragens restantes, streak), `DailyReward` (botão ou "volta em hh:mm"), botão grande "Tirar carta · 10 moedas" (valor de `Settings`) que leva a `/tirar`, `FeedList limit={8} live`. `/tirar`: botão de tirar e `PullReveal` com duração e intensidade crescentes por tier, conforme `visual-direction.md`; "pular" após 1 s; com `prefers-reduced-motion: reduce` revela direto. Depois: selo "Nova!" se `is_new`, quantidade, toast por título desbloqueado, aviso "foi para o mural" se `feed_posted`, botão "tirar de novo".

- [ ] **Step 1: Write the failing tests:** saldo 5 → botão desabilitado com "moedas insuficientes"; dois cliques rápidos → `economy.pull` chamado 1 vez (spy); com rand fixo, após revelar aparece o título da carta e o saldo do topo vai a 490; `DailyReward` já resgatado mostra "volta em"; com `matchMedia` de reduced motion a carta aparece sem avançar timers.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: home and card pull`

---

### Task 10: Coleção e Detalhe da carta

**Files:**
- Create: `src/features/collection/CollectionPage.tsx`, `src/features/card/{CardDetailPage.tsx, RecycleDialog.tsx}` (+ CSS)
- Test: `src/features/collection/CollectionPage.test.tsx`, `src/features/card/CardDetailPage.test.tsx`

Comportamento: grade de `CardView`; cabeçalho "X de Y · Z%"; filtros por tier e "todas / minhas / faltando"; ordenação por raridade. Detalhe de carta possuída: carta grande, piada, raridade, quantidade, "Reciclar" (diálogo com quantidade 1…quantidade e valor via `recycleValue`), "Quem já tem" com `PlayerName`. Não possuída: moldura + raridade + "Você ainda não tirou esta carta" + quem já tem.

- [ ] **Step 1: Write the failing tests:** após 1 pull a coleção mostra `"1 de 24"`; filtro "faltando" esconde a possuída; `/carta/<id não possuída>`: `queryByText(<piada do seed dessa carta>)` é `null` e a lista de donos aparece; reciclar 1 de 2 cópias de carta 1/1000 → toast "+20 moedas" e quantidade 1.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: collection and card detail`

---

### Task 11: Loja

**Files:**
- Create: `src/features/shop/{ShopPage.tsx, ItemCard.tsx}` (+ CSS)
- Test: `src/features/shop/ShopPage.test.tsx`

Comportamento: `Tabs` "Sorte" / "Cosméticos". Sorte: poções com multiplicador e duração; "Comprar"; se possuída, "Usar (n)". Cosméticos: banners, molduras, cores, efeitos com prévia simples (`Avatar` + `PlayerName` do próprio jogador; a Task 14 troca pelo `ProfileHeader`); possuídos mostram "Equipar" → `/perfil/editar`.

- [ ] **Step 1: Write the failing tests:** item mais caro que o saldo → botão desabilitado com "moedas insuficientes"; clique duplo em "Comprar" → `shop.buy` 1 vez; comprar poção → aparece "Usar (1)"; usar → `LuckPanel` do topo mostra o novo multiplicador.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: shop`

---

### Task 12: Hub de jogos, Caça-níquel e Memória

**Files:**
- Create: `src/features/games/GameFrame.tsx`, `src/features/games/hub/GamesHubPage.tsx`, `src/features/games/slots/SlotsPage.tsx`, `src/features/games/memory/MemoryPage.tsx` (+ CSS)
- Test: `src/features/games/hub/GamesHubPage.test.tsx`, `src/features/games/slots/SlotsPage.test.tsx`, `src/features/games/memory/MemoryPage.test.tsx`

**Interfaces — Produces:** `GameFrame({ game: GameId; title: string; rules: string; children })` — cabeçalho, barra "ganho hoje X / limite" e, quando `earned_today >= limit`, aviso "Limite de hoje atingido — você ainda pode jogar, mas não ganha moedas". Reusado na Task 13.

Comportamento: hub com 4 cartões e progresso do limite. Slots: aposta entre `slots_bets`; a resposta chega antes e os rolos animam até ela; mostra prêmio e saldo. Memória: tabuleiro 4×4; cada clique chama `flipMemory`; par errado desvira após 700 ms; contador de jogadas; resultado no fim; cliques ignorados enquanto há flip pendente ou par errado visível.

- [ ] **Step 1: Write the failing tests:** hub com `reflex` no limite mostra "limite atingido" nesse cartão; slots com saldo menor que a menor aposta → botão desabilitado; slots com rand fixo exibe o `payout` e o saldo atualizado; memória: dois cliques → 2 chamadas a `flipMemory`, e um terceiro clique durante flip pendente não chama.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: games hub, slots and memory`

---

### Task 13: Reflexo e Clique rápido

**Files:**
- Create: `src/features/games/reflex/ReflexPage.tsx`, `src/features/games/clicker/ClickerPage.tsx` (+ CSS)
- Test: `src/features/games/reflex/ReflexPage.test.tsx`, `src/features/games/clicker/ClickerPage.test.tsx`

Comportamento: **Reflexo** — "Espere…" durante `delay_ms`, depois "AGORA!"; mede com `performance.now()`; clique antes do sinal → "cedo demais", rodada descartada sem chamar `finishReflex`, botão "tentar de novo" (nova sessão). **Clique rápido** — contagem 3-2-1, 10 s de cliques/toques numa área grande, envia `clicks` e `elapsed_ms`; `valid:false` → "resultado não aceito".

- [ ] **Step 1: Write the failing tests** (fake timers + `performance.now` mockado): reflexo clicado antes do sinal mostra "cedo demais" e não chama `finishReflex`; clicado 300 ms após o sinal chama `finishReflex(session_id, 300)` e mostra o prêmio; clicker com 50 cliques em 10 s chama `finishClicker(session_id, 50, ≥10000)`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: reflex and clicker games`

---

### Task 14: Ranking e Perfil

**Files:**
- Create: `src/features/ranking/RankingPage.tsx`, `src/features/profile/{ProfilePage.tsx, ProfileHeader.tsx, Showcase.tsx, CoinHistory.tsx}` (+ CSS)
- Modify: `src/features/shop/ItemCard.tsx` (prévia passa a usar `ProfileHeader`)
- Test: `src/features/ranking/RankingPage.test.tsx`, `src/features/profile/ProfilePage.test.tsx`

**Interfaces — Produces:** `ProfileHeader({ profile: PublicProfile; preview?: Partial<Equipment> })` — banner, avatar com moldura, `PlayerName`, título, bio, cor; `preview` sobrepõe equipamentos (usado na Loja e na Task 15).

Comportamento: Ranking com `Tabs` (Moedas / Coleção / Maior raridade), pódio para o top 3, linha do próprio jogador destacada, cada linha leva a `/perfil/:id`. Perfil: `ProfileHeader`, vitrine de 3 cartas, estatísticas (tiragens, % coleção, maior raridade), títulos conquistados; no próprio perfil, botão "Editar perfil" e `CoinHistory` (últimas 20 transações via `useTransactions(20)`).

- [ ] **Step 1: Write the failing tests:** aba "Maior raridade" mostra `formatOdds` do valor; clicar num jogador navega para `/perfil/<id>`; perfil de outro jogador não tem "Editar perfil" nem histórico; vitrine renderiza as cartas de `showcase`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: ranking and profile`

---

### Task 15: Editar perfil e Sugerir piada

**Files:**
- Create: `src/features/profile-edit/ProfileEditPage.tsx`, `src/features/suggest/SuggestPage.tsx` (+ CSS)
- Test: `src/features/profile-edit/ProfileEditPage.test.tsx`, `src/features/suggest/SuggestPage.test.tsx`

Comportamento: apelido (3–20 caracteres, `[A-Za-z0-9_]`, disponibilidade com debounce de 400 ms), bio (até 160), avatar (foto do Google / upload até 2 MB em jpg, png ou webp / carta possuída), vitrine (3 slots, só possuídas), título (só conquistados), banner/moldura/cor/efeito (só possuídos; banner sem upload). `ProfileHeader` com `preview` ao vivo. Sugerir: texto (10–280), imagem opcional (mesmas regras do avatar), lista "Minhas sugestões" com status (em análise / aprovada / recusada) e nota do admin.

- [ ] **Step 1: Write the failing tests:** apelido em uso → "apelido em uso" e salvar desabilitado; `"ab"` → mensagem de tamanho; seletores de vitrine e avatar-carta listam exatamente as cartas possuídas do seed; arquivo de 3 MB → "máximo 2 MB" sem chamar a API; enviar sugestão → aparece com "em análise".
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: profile editing and suggestions`

---

### Task 16: Painel admin

**Files:**
- Create: `src/features/admin/AdminLayout.tsx`, `src/features/admin/cards/AdminCardsPage.tsx`, `src/features/admin/suggestions/AdminSuggestionsPage.tsx`, `src/features/admin/economy/AdminEconomyPage.tsx`, `src/features/admin/cosmetics/AdminCosmeticsPage.tsx`, `src/features/admin/players/AdminPlayersPage.tsx`, `src/features/admin/guests/AdminGuestsPage.tsx` (+ CSS)
- Test: um `*.test.tsx` por página

Comportamento: sub-navegação. **Cartas:** tabela + formulário (título, piada, imagem com prévia, campo "1 em [N]" com prévia ao vivo de `CardView`), ativar/desativar. **Sugestões:** abas pendente/aprovada/recusada; aprovar abre o formulário de carta pré-preenchido; recusar pede nota. **Economia:** todos os campos de `Settings`, numéricos > 0. **Cosméticos:** itens (por tipo) e títulos (condição entre os 5 tipos de `TitleCondition`, campos conforme o tipo) + conceder título manual. **Jogadores:** lista com saldo e cartas, ajustar moedas (± e motivo obrigatório), banir/desbanir. **Convidados:** adicionar/remover e-mails.

- [ ] **Step 1: Write the failing tests:** carta com N = 5 → "entre 10 e 10.000.000.000" sem chamar a API; aprovar sugestão cria carta e ela sai da aba pendente; `pull_cost` 0 → erro de validação; ajustar moedas sem motivo → botão desabilitado; e-mail inválido → erro; condição `game_coins` mostra seletor de jogo e campo de moedas.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: admin panel`

---

### Task 17: Polimento visual, responsivo e README

**Files:**
- Modify: CSS/componentes conforme achados
- Create: `README.md`

- [ ] **Step 1:** Invocar o skill **impeccable** (auditoria + polish) sobre todas as páginas, usando `docs/design/visual-direction.md` e os anti-objetivos como critério; corrigir os achados.
- [ ] **Step 2:** Percorrer todas as rotas no navegador em 360 px, 768 px e 1280 px. Para cada uma: sem scroll horizontal; `1/10.000.000.000`, sorte `1.000.000×` e saldo de 9 dígitos sem quebrar; foco visível por teclado; estados vazio, carregando e erro presentes. Registrar e corrigir.
- [ ] **Step 3:** `README.md` em pt-BR: o que é, como rodar (`npm install`, `npm run dev`), modo mock (usuário seed admin, simular `not_invited`/`banned` via `localStorage`, resetar dados), estrutura de pastas, e que o backend Supabase vem no próximo plano.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run build` → tudo verde.
- [ ] **Step 5: Commit** `chore: visual polish, responsive pass and readme`
