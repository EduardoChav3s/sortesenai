// [exemplo] Dados de demonstração para a fase de design. Nada aqui é real.
import type { CollectionEntry } from '@/data/types';

const owned = (id: string, odds_n: number, title: string, joke: string, quantity = 1): CollectionEntry => ({
  owned: true,
  quantity,
  card: { id, odds_n, active: true, title, joke, image_url: null },
});
const locked = (id: string, odds_n: number): CollectionEntry => ({ owned: false, quantity: 0, card: { id, odds_n, active: true } });

export const COLLECTION: CollectionEntry[] = [
  owned('c01', 12, 'O café da cantina', 'Ninguém sabe se é café ou chá.', 14),
  owned('c02', 18, 'A cadeira que balança', 'Sempre sobra pra quem chega atrasado.', 9),
  owned('c03', 25, 'Bom dia, grupo', 'Mandado às 5h47 por alguém.', 6),
  owned('c04', 60, 'O ar-condicionado', 'Ou Ártico, ou Saara.', 3),
  owned('c05', 450, 'Wi-Fi do bloco B', 'Conecta, mas só na janela.', 2),
  owned('c06', 1_200, 'O projetor', 'Liga no terceiro tapa.', 1),
  locked('c07', 3_000),
  owned('c08', 25_000, 'O pendrive perdido', 'Tinha o TCC de três pessoas.'),
  locked('c09', 80_000),
  owned('c10', 3_000_000, 'A prova surpresa', 'Surpresa para o professor também.'),
  locked('c11', 40_000_000),
  owned('c12', 400_000_000, 'O grampeador', 'Ele sabe o que fez.'),
  locked('c13', 2_000_000_000),
  locked('c14', 10_000_000_000),
  owned('c15', 35, 'Fila do micro-ondas', 'Doze marmitas, um micro-ondas.', 4),
  locked('c16', 700),
  owned('c17', 9_000, 'O apelido do Léo', 'Ninguém lembra de onde veio.'),
  locked('c18', 150_000),
];

/** The strip shown in the reel, left to right; index 3 sits in the window. */
export const REEL: CollectionEntry[] = [
  COLLECTION[2],
  COLLECTION[4],
  COLLECTION[0],
  COLLECTION[11],
  COLLECTION[5],
  COLLECTION[14],
  COLLECTION[7],
];

export interface SamplePlayer {
  id: string;
  name: string;
  initials: string;
  hue: number;
  title: string | null;
}
export const ME: SamplePlayer = { id: 'p0', name: 'Duda', initials: 'DU', hue: 230, title: 'Colecionador 30%' };
export const PLAYERS: SamplePlayer[] = [
  ME,
  { id: 'p1', name: 'Ana', initials: 'AN', hue: 340, title: 'Primeira 1/1 milhão' },
  { id: 'p2', name: 'João', initials: 'JO', hue: 145, title: null },
  { id: 'p3', name: 'Bia', initials: 'BI', hue: 80, title: 'Viciada em caça-níquel' },
  { id: 'p4', name: 'Rafa', initials: 'RA', hue: 200, title: null },
  { id: 'p5', name: 'Léo', initials: 'LE', hue: 20, title: 'Mão quente' },
];

export const FEED = [
  { id: 'f1', player: PLAYERS[1], card: 'A prova surpresa', odds_n: 3_000_000, luck: 5, ago: 'há 2 min' },
  { id: 'f2', player: PLAYERS[5], card: 'O grampeador', odds_n: 400_000_000, luck: 1_000_000, ago: 'há 18 min' },
  { id: 'f3', player: PLAYERS[3], card: 'A prova surpresa', odds_n: 3_000_000, luck: 2, ago: 'há 1 h' },
  { id: 'f4', player: PLAYERS[2], card: 'O pendrive perdido', odds_n: 1_500_000, luck: 10, ago: 'há 3 h' },
];

export const WALLET = { coins: 12_480, luck: 5, luckLeft: '12 min', pullCost: 10 };

export const POTIONS = [
  { id: 'i1', name: 'Gota de sorte', mult: 2, duration: '10 minutos', price: 150, owned: 2 },
  { id: 'i2', name: 'Frasco azul', mult: 5, duration: '20 roletadas', price: 600, owned: 0 },
  { id: 'i3', name: 'Garrafa do sábado', mult: 25, duration: '30 minutos', price: 4_000, owned: 0 },
];
export const LEGEND_POTION = { id: 'i4', name: 'Lenda engarrafada', mult: 1_000_000, duration: '1 roletada', price: 250_000 };

export const GAMES = [
  { id: 'slots', name: 'Caça-níquel', rule: 'Três iguais pagam dez vezes a aposta.', earned: 320, limit: 500 },
  { id: 'memory', name: 'Memória', rule: 'Ache os 8 pares com menos jogadas.', earned: 0, limit: 300 },
  { id: 'reflex', name: 'Reflexo', rule: 'Clique quando a tela acender.', earned: 200, limit: 200 },
  { id: 'clicker', name: 'Clique rápido', rule: 'Dez segundos, quantos cliques couber.', earned: 45, limit: 200 },
] as const;

export const RANKING = [
  { player: PLAYERS[5], value: 48_210 },
  { player: PLAYERS[1], value: 31_900 },
  { player: PLAYERS[0], value: 12_480 },
  { player: PLAYERS[3], value: 9_870 },
  { player: PLAYERS[2], value: 4_120 },
  { player: PLAYERS[4], value: 2_005 },
];

export const SUGGESTIONS = [
  { id: 's1', text: 'O dia em que o alarme de incêndio tocou na prova.', status: 'pending' as const },
  { id: 's2', text: 'A impressora que só imprime em rosa.', status: 'approved' as const },
  { id: 's3', text: 'O professor que chama todo mundo de “meu consagrado”.', status: 'rejected' as const },
];
