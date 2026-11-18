// Gifts, trades and duels between friends: the pieces used on a friend's page and on the Amigos page.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CardView } from '@/ui/CardView';
import { Avatar } from '@/ui/Avatar';
import { formatCoins, formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { isApiError } from '@/data/errors';
import { isLive, playerChip, useCollection, useMyProfile, usePlayerCollection, useSocialActions, useWallet } from '@/data/live';
import type { Challenge, SeenCard, Trade } from '@/data/api';
import type { CollectionEntry } from '@/data/types';
import s from './Social.module.css';

const toEntry = (c: SeenCard, quantity = 1): CollectionEntry =>
  c.known ? { owned: true, quantity, card: c.card } : { owned: false, quantity: 0, card: c.card };

const errText = (e: unknown) => {
  if (isApiError(e) && e.code === 'insufficient_coins') return 'Moedas insuficientes.';
  if (isApiError(e) && e.code === 'invalid') return 'Alguém não tem mais essa carta repetida.';
  if (isApiError(e) && e.code === 'forbidden') return 'Vocês precisam ser amigos.';
  if (isApiError(e) && e.code === 'not_found') return 'Isso já foi respondido.';
  return 'Não deu certo. Tente de novo.';
};

// ---------------------------------------------------------------- card picker
interface PickItem {
  id: string;
  entry: CollectionEntry;
  note: string;
  disabled?: boolean;
}
function CardPicker({ items, picked, onPick, empty }: { items: PickItem[]; picked: string | null; onPick: (id: string) => void; empty: string }) {
  if (items.length === 0) return <p className="hint">{empty}</p>;
  return (
    <ul className={s.pickGrid}>
      {items.map((it) => (
        <li key={it.id}>
          <button type="button" className={s.pick} aria-pressed={picked === it.id} disabled={it.disabled} onClick={() => onPick(it.id)}>
            <CardView entry={it.entry} size="s" />
            <span className={s.pickNote}>{it.note}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** My spare copies (2 or more), rarest first. */
function useMySpares(): PickItem[] {
  const mine = useCollection();
  return (mine.data ?? [])
    .filter((e) => e.owned && e.quantity >= 2)
    .sort((a, b) => b.card.odds_n - a.card.odds_n)
    .map((e) => ({ id: e.card.id, entry: e, note: `Você tem ${e.quantity}` }));
}

// ---------------------------------------------------------------- actions on a friend's page
type Mode = 'gift' | 'trade' | 'duel' | null;

export function FriendActions({ friendId, friendName }: { friendId: string; friendName: string }) {
  const [mode, setMode] = useState<Mode>(null);
  const [done, setDone] = useState<string | null>(null);
  const close = (msg?: string) => {
    setMode(null);
    setDone(msg ?? null);
  };
  return (
    <section className={`panel ${s.actions}`} aria-labelledby="friend-actions">
      <div className={s.actionsHead}>
        <h2 id="friend-actions" className={s.title}>
          Com {friendName}
        </h2>
        <div className={s.buttons}>
          {(['gift', 'trade', 'duel'] as const).map((m) => (
            <button key={m} type="button" className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-secondary'}`} onClick={() => (setDone(null), setMode(mode === m ? null : m))}>
              {m === 'gift' ? 'Presentear' : m === 'trade' ? 'Propor troca' : 'Desafiar'}
            </button>
          ))}
        </div>
      </div>
      {done && (
        <p role="status" className={s.ok}>
          {done}
        </p>
      )}
      {mode === 'gift' && <GiftForm to={friendId} name={friendName} onDone={close} />}
      {mode === 'trade' && <TradeForm to={friendId} name={friendName} onDone={close} />}
      {mode === 'duel' && <DuelForm to={friendId} name={friendName} onDone={close} />}
    </section>
  );
}

function GiftForm({ to, name, onDone }: { to: string; name: string; onDone: (msg?: string) => void }) {
  const spares = useMySpares();
  const { gift } = useSocialActions();
  const [card, setCard] = useState<string | null>(null);
  return (
    <div className={s.flow}>
      <p className={s.step}>Escolha uma carta repetida para dar. Uma cópia sempre fica com você.</p>
      <CardPicker items={spares} picked={card} onPick={setCard} empty="Você não tem cartas repetidas agora." />
      {gift.isError && <p role="alert" className={s.err}>{errText(gift.error)}</p>}
      <div className={s.foot}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDone()}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!card || gift.isPending || !isLive}
          onClick={() => card && gift.mutate({ to, card }, { onSuccess: () => onDone(`Presente enviado para ${name}!`) })}
        >
          {gift.isPending ? 'Enviando…' : `Dar para ${name}`}
        </button>
      </div>
    </div>
  );
}

function TradeForm({ to, name, onDone }: { to: string; name: string; onDone: (msg?: string) => void }) {
  const spares = useMySpares();
  const theirs = usePlayerCollection(to);
  const { propose } = useSocialActions();
  const [give, setGive] = useState<string | null>(null);
  const [want, setWant] = useState<string | null>(null);
  const theirItems: PickItem[] = (theirs.data ?? [])
    .filter((e) => e.card.id !== give)
    .map((e) => ({
      id: e.card.id,
      entry: toEntry(e.known ? { known: true, card: e.card } : { known: false, card: e.card }, e.quantity),
      note: e.quantity >= 2 ? (e.known ? `Tem ${e.quantity}` : `Tem ${e.quantity} · você não tem`) : 'Só tem 1',
      disabled: e.quantity < 2,
    }));
  return (
    <div className={s.flow}>
      <p className={s.step}>1. A sua repetida que vai</p>
      <CardPicker items={spares} picked={give} onPick={setGive} empty="Você não tem cartas repetidas para oferecer." />
      <p className={s.step}>2. A carta de {name} que você quer (só as repetidas dele podem ser trocadas)</p>
      <CardPicker items={theirItems} picked={want} onPick={setWant} empty={`${name} ainda não tem cartas.`} />
      {propose.isError && <p role="alert" className={s.err}>{errText(propose.error)}</p>}
      <div className={s.foot}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDone()}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!give || !want || propose.isPending || !isLive}
          onClick={() => give && want && propose.mutate({ to, give, want }, { onSuccess: () => onDone(`Proposta enviada. Quando ${name} aceitar, as cartas trocam de dono.`) })}
        >
          {propose.isPending ? 'Enviando…' : 'Propor troca'}
        </button>
      </div>
    </div>
  );
}

function DuelForm({ to, name, onDone }: { to: string; name: string; onDone: (msg?: string) => void }) {
  const wallet = useWallet();
  const { challenge } = useSocialActions();
  const [bet, setBet] = useState('50');
  const n = Number(bet);
  const coins = wallet.data?.coins ?? 0;
  const problem = !/^\d+$/.test(bet) ? 'Digite um número.' : n < 10 ? 'A aposta mínima é 10.' : n > 100_000 ? 'A aposta máxima é 100.000.' : isLive && n > coins ? `Você só tem ${formatCoins(coins)} moedas.` : null;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (problem || !isLive) return;
    challenge.mutate({ to, bet: n }, { onSuccess: () => onDone(`Desafio enviado. Quando ${name} aceitar, o duelo acontece na hora.`) });
  }
  return (
    <form className={s.flow} onSubmit={submit}>
      <p className={s.step}>Cada um faz 5 tiragens de duelo. Quem tirar a carta mais rara leva as duas apostas. Empate devolve. As tiragens de duelo não entram no álbum.</p>
      <div className="field">
        <label htmlFor="bet">Aposta (cada um paga)</label>
        <input id="bet" className="input" inputMode="numeric" value={bet} onChange={(e) => setBet(e.target.value.replace(/\D/g, ''))} />
        <span className={problem ? s.err : 'hint'}>{problem ?? `Quem ganhar leva ${formatCoins(n * 2)} moedas.`}</span>
      </div>
      {challenge.isError && <p role="alert" className={s.err}>{errText(challenge.error)}</p>}
      <div className={s.foot}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDone()}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!!problem || challenge.isPending}>
          {challenge.isPending ? 'Enviando…' : `Desafiar por ${formatCoins(n || 0)}`}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- duel result
function best(draws: SeenCard[]) {
  return draws.reduce((m, c) => Math.max(m, c.card.odds_n), 0);
}

export function DuelResult({ duel }: { duel: Challenge }) {
  const me = useMyProfile().data?.profile.id;
  const rows = [
    { who: duel.from, draws: duel.draws_from },
    { who: duel.to, draws: duel.draws_to },
  ];
  const outcome = !duel.winner
    ? 'Empate! Cada um recebeu a aposta de volta.'
    : duel.winner === me
      ? `Você ganhou ${formatCoins(duel.bet * 2)} moedas!`
      : `${duel.winner === duel.from.id ? duel.from.nickname : duel.to.nickname} ganhou ${formatCoins(duel.bet * 2)} moedas.`;
  return (
    <div className={s.duel} data-me-won={duel.winner === me} data-tie={!duel.winner} aria-live="polite">
      <p className={s.outcome}>{outcome}</p>
      {rows.map((r, i) => {
        const top = best(r.draws);
        return (
          <div key={i} className={s.duelRow} data-won={duel.winner === r.who.id}>
            <p className={s.duelWho}>
              {r.who.id === me ? 'Você' : r.who.nickname} · melhor {formatOdds(top || 10, { compact: true })} {TIER_LABEL[rarityTier(top || 10)]}
            </p>
            <ul className={s.draws}>
              {r.draws.map((c, k) => (
                <li key={k} className={s.draw} data-best={c.card.odds_n === top} style={{ animationDelay: `${(i * 5 + k) * 90}ms` }}>
                  <CardView entry={toEntry(c)} size="s" />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- inbox on the Amigos page
function Who({ p }: { p: Trade['from'] }) {
  const chip = playerChip(p.id, p.nickname, p.avatar_url);
  return (
    <Link to={`/jogador/${p.id}`} className={s.who}>
      <Avatar initials={chip.initials} hue={chip.hue} size="32px" url={chip.avatar} />
      <strong>{p.nickname}</strong>
    </Link>
  );
}

function MiniCard({ c, label }: { c: SeenCard; label: string }) {
  return (
    <figure className={s.mini}>
      <CardView entry={toEntry(c)} size="s" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function TradeItem({ t, incoming }: { t: Trade; incoming: boolean }) {
  const { respondTrade, cancelTrade } = useSocialActions();
  const busy = respondTrade.isPending || cancelTrade.isPending;
  const err = respondTrade.error ?? cancelTrade.error;
  return (
    <li className={s.item}>
      <div className={s.itemHead}>
        <Who p={incoming ? t.from : t.to} />
        <span className="hint">{incoming ? 'quer trocar com você' : 'esperando resposta'}</span>
      </div>
      <div className={s.swap}>
        <MiniCard c={t.give} label={incoming ? 'Você recebe' : 'Você dá'} />
        <span className={s.arrow} aria-hidden="true">
          ⇄
        </span>
        <MiniCard c={t.want} label={incoming ? 'Você dá' : 'Você recebe'} />
      </div>
      {err && <p role="alert" className={s.err}>{errText(err)}</p>}
      <div className={s.foot}>
        {incoming ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => isLive && respondTrade.mutate({ id: t.id, accept: false })}>
              Recusar
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => isLive && respondTrade.mutate({ id: t.id, accept: true })}>
              Aceitar troca
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => isLive && cancelTrade.mutate(t.id)}>
            Cancelar proposta
          </button>
        )}
      </div>
    </li>
  );
}

export function ChallengeItem({ c, incoming }: { c: Challenge; incoming: boolean }) {
  const { respondChallenge, cancelChallenge } = useSocialActions();
  const [result, setResult] = useState<Challenge | null>(null);
  const busy = respondChallenge.isPending || cancelChallenge.isPending;
  const err = respondChallenge.error ?? cancelChallenge.error;
  if (result)
    return (
      <li className={s.item}>
        <DuelResult duel={result} />
      </li>
    );
  return (
    <li className={s.item}>
      <div className={s.itemHead}>
        <Who p={incoming ? c.from : c.to} />
        <span className="hint">{incoming ? `te desafiou por ${formatCoins(c.bet)} moedas` : `desafio de ${formatCoins(c.bet)} moedas, esperando`}</span>
      </div>
      {err && <p role="alert" className={s.err}>{errText(err)}</p>}
      <div className={s.foot}>
        {incoming ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => isLive && respondChallenge.mutate({ id: c.id, accept: false })}>
              Recusar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => isLive && respondChallenge.mutate({ id: c.id, accept: true }, { onSuccess: (r) => r && setResult(r) })}
            >
              {respondChallenge.isPending ? 'Duelando…' : `Aceitar e pagar ${formatCoins(c.bet)}`}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => isLive && cancelChallenge.mutate(c.id)}>
            Cancelar e pegar a aposta de volta
          </button>
        )}
      </div>
    </li>
  );
}
