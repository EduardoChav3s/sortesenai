import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CardView } from '@/ui/CardView';
import { Avatar } from '@/ui/Avatar';
import { IconClover, IconCoin } from '@/ui/icons';
import { FEED, REEL, WALLET } from '@/design/sample';
import { formatLuck, formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { isLive, toFeedRow, useFeed, useLuck, usePull, usePullMany } from '@/data/live';
import { isApiError } from '@/data/errors';
import type { CollectionEntry } from '@/data/types';
import s from './RollPage.module.css';

const ERRORS: Record<string, string> = {
  insufficient_coins: 'Moedas insuficientes para roletar.',
  banned: 'Sua conta está suspensa.',
};

// Three copies of the strip so the reel can travel one full lap and land on the same card.
const STRIP = [...REEL, ...REEL, ...REEL];
const TARGET = REEL.length + 3;

export function RollPage() {
  // Design preview only: replays the reel motion, no draw happens.
  const [spin, setSpin] = useState(0);
  const [won, setWon] = useState<CollectionEntry | null>(null);
  const [batch, setBatch] = useState<CollectionEntry[]>([]);
  const pull = usePull();
  const many = usePullMany();
  const luck = useLuck();
  const busy = pull.isPending || many.isPending;
  const feedQuery = useFeed(8);
  const feed = isLive ? (feedQuery.data ?? []).map((e) => toFeedRow(e, Date.now())) : FEED;
  const strip = won ? STRIP.map((e, i) => (i === TARGET ? won : e)) : STRIP;
  const failure = pull.error ?? many.data?.error ?? many.error;
  const errorText = failure ? (isApiError(failure) ? ERRORS[failure.code] : undefined) ?? 'Não deu para roletar agora. Tente de novo.' : null;

  function roll() {
    setBatch([]);
    many.reset();
    if (!isLive) return setSpin((n) => n + 1);
    pull.mutate(undefined, {
      onSuccess: (r) => {
        setWon({ owned: true, quantity: r.quantity, card: r.card });
        setSpin((n) => n + 1);
      },
    });
  }

  // Ten in a row: the reel lands on the rarest one, the rest show up below.
  function rollTen() {
    pull.reset();
    if (!isLive) {
      setBatch(REEL.slice(0, 10).map((e) => ({ ...e, owned: true, quantity: 1 }) as CollectionEntry));
      return setSpin((n) => n + 1);
    }
    many.mutate(10, {
      onSuccess: ({ results }) => {
        const got: CollectionEntry[] = results.map((r) => ({ owned: true, quantity: r.quantity, card: r.card }));
        setBatch(got);
        if (got.length === 0) return;
        setWon([...got].sort((a, b) => b.card.odds_n - a.card.odds_n)[0]);
        setSpin((n) => n + 1);
      },
    });
  }
  const luckText = isLive
    ? luck.data ? `Sorte ${formatLuck(Number(luck.data.effective))} ativa${Number(luck.data.potions) > 1 ? ' com poção' : ''}` : 'Sorte 1x'
    : `Sorte ${formatLuck(WALLET.luck)} ativa por mais ${WALLET.luckLeft}`;

  return (
    <div className={s.page}>
      <section className={`panel ${s.stage}`} aria-label="Roleta">
        <div className={s.track}>
          <div
            key={spin}
            className={`${s.strip} ${spin > 0 ? s.spinning : ''}`}
            style={{ '--target': TARGET, '--start': 3 } as CSSProperties}
          >
            {strip.map((entry, i) => (
              <CardView key={`${entry.card.id}-${i}`} entry={entry} size="m" className={i === TARGET ? s.winner : s.cell} />
            ))}
          </div>
          <div className={s.window} aria-hidden="true">
            <span className={s.notchTop} />
            <span className={s.slotNo}>Nº {REEL[3].card.id.slice(1)}</span>
            <span className={s.notchBottom} />
          </div>
        </div>

        <div className={s.actions}>
          <button type="button" className={`btn btn-primary btn-lg ${s.roll}`} onClick={roll} disabled={busy}>
            Roletar
            <span className={s.cost}>
              <IconCoin size={16} />
              {WALLET.pullCost}
            </span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={rollTen} disabled={busy}>
            {many.isPending ? 'Roletando 10…' : 'Roletar 10 de uma vez'}
            <span className={s.cost}>
              <IconCoin size={16} />
              {WALLET.pullCost * 10}
            </span>
          </button>
        </div>
        {errorText && (
          <p role="alert" className={s.error}>
            {errorText}
          </p>
        )}
        <p className={s.luckLine}>
          <IconClover size={16} />
          {luckText}
        </p>
        {batch.length > 0 && (
          <div className={s.batch}>
            <p className={s.batchTitle}>
              Você tirou {batch.length} {batch.length === 1 ? 'carta' : 'cartas'}
            </p>
            <ul className={s.batchGrid}>
              {batch.map((e, i) => (
                <li key={`${e.card.id}-${i}`}>
                  <CardView entry={e} size="s" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={`panel ${s.mural}`} aria-labelledby="mural-title">
        <h2 id="mural-title" className={s.muralTitle}>
          Mural
          <span className={s.live}>ao vivo</span>
        </h2>
        {feed.length === 0 && <p className={s.empty}>Ninguém tirou uma carta rara ainda. Pode ser você.</p>}
        <ul className={s.feed}>
          {feed.map((f) => {
            const tier = rarityTier(f.odds_n);
            return (
              <li key={f.id} className={s.feedItem}>
                <Avatar initials={f.player.initials} hue={f.player.hue} size="36px" url={(f.player as { avatar?: string | null }).avatar} />
                <span className={s.feedText}>
                  <span>
                    {(f.player as { id?: string }).id ? <Link to={`/jogador/${(f.player as { id?: string }).id}`} className={s.who}><strong>{f.player.name}</strong></Link> : <strong>{f.player.name}</strong>} tirou <strong>{f.card}</strong>
                  </span>
                  <span className={s.feedMeta}>
                    <span className={s.badge} data-tier={tier}>
                      {formatOdds(f.odds_n, { compact: true })} {TIER_LABEL[tier]}
                    </span>
                    <span>{f.ago}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
