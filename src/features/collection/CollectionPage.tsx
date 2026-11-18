import { useState, type CSSProperties } from 'react';
import { CardView } from '@/ui/CardView';
import { COLLECTION } from '@/design/sample';
import { TIERS, TIER_LABEL, rarityTier } from '@/lib/rarity';
import type { RarityTier } from '@/data/types';
import { isLive, useCollection, useRecycle } from '@/data/live';
import { duplicates, recycleValue } from '@/lib/economy';
import { formatCoins } from '@/lib/format';
import { IconCoin } from '@/ui/icons';
import type { CollectionEntry } from '@/data/types';
import s from './CollectionPage.module.css';

type Filter = 'todas' | 'minhas' | 'faltando' | 'repetidas';
/** Same as recycle_base in the database settings. The server pays the real amount. */
const RECYCLE_BASE = 5;

export function CollectionPage() {
  const [filter, setFilter] = useState<Filter>('todas');
  const [tier, setTier] = useState<RarityTier | null>(null);
  const live = useCollection();
  const recycle = useRecycle();
  const [demoTraded, setDemoTraded] = useState(false);
  const all: CollectionEntry[] = isLive ? (live.data ?? []) : demoTraded ? COLLECTION.map((e) => (e.owned ? { ...e, quantity: 1 } : e)) : COLLECTION;
  const dup = duplicates(all, RECYCLE_BASE);
  function trade(list: { id: string; quantity: number }[]) {
    if (!isLive) return setDemoTraded(true);
    recycle.mutate(list);
  }
  const tradeError = recycle.isError ? 'Não deu para trocar. Confira a coleção e tente de novo.' : null;
  const ownedCount = all.filter((e) => e.owned).length;
  const pct = Math.round((ownedCount / Math.max(1, all.length)) * 100);

  const shown = all.map((e, i) => ({ e, n: i + 1 }))
    .filter(({ e }) => (filter === 'minhas' ? e.owned : filter === 'faltando' ? !e.owned : filter === 'repetidas' ? e.owned && e.quantity > 1 : true))
    .filter(({ e }) => (tier ? rarityTier(e.card.odds_n) === tier : true))
    .sort((a, b) => a.e.card.odds_n - b.e.card.odds_n);

  return (
    <div className="page">
      <div className={s.toolbar}>
        <div className={s.bar}>
          <span className={s.pct}>
            <strong>
              {ownedCount} de {all.length}
            </strong>{' '}
            cartas, {pct}% da coleção
          </span>
          <div className="progress" style={{ '--value': `${pct}%` } as CSSProperties}>
            <span />
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Mostrar">
          {(['todas', 'minhas', 'faltando', 'repetidas'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'todas' ? 'Todas' : f === 'minhas' ? 'Minhas' : f === 'faltando' ? 'Faltando' : `Repetidas${dup.count ? ` (${dup.count})` : ''}`}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Raridade">
          {TIERS.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={tier === t} onClick={() => setTier(tier === t ? null : t)}>
              <span className="chip-dot" style={{ '--dot': `var(--tier-${t})` } as CSSProperties} />
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {!(isLive && (live.isLoading || live.isError)) && (
      <section className={`panel ${s.dupes}`} aria-labelledby="dupes-title">
        <div className={s.dupesText}>
          <h2 id="dupes-title" className={s.dupesTitle}>
            Repetidas viram moedas
          </h2>
          <p className={s.dupesNote}>
            {dup.count > 0
              ? `Você tem ${dup.count} ${dup.count === 1 ? 'carta repetida' : 'cartas repetidas'}. Uma de cada fica no álbum.`
              : 'Nenhuma repetida agora. Quanto mais rara a carta, mais moedas ela vale.'}
          </p>
          <p className={s.soon}>Em breve: repetidas raras também vão render itens especiais.</p>
        </div>
        <div className={s.dupesAction}>
          {recycle.isSuccess && <span role="status" className={s.gain}>+{formatCoins(recycle.data.gained)} moedas</span>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={dup.count === 0 || recycle.isPending}
            onClick={() => trade(dup.items.map((i) => ({ id: i.card.id, quantity: i.extra })))}
          >
            {recycle.isPending ? 'Trocando…' : 'Trocar todas'}
            {dup.total > 0 && (
              <span className={s.price}>
                <IconCoin size={16} />
                {formatCoins(dup.total)}
              </span>
            )}
          </button>
        </div>
        {tradeError && (
          <p role="alert" className={s.error}>
            {tradeError}
          </p>
        )}
      </section>
      )}

      {isLive && live.isLoading ? (
        <p className="page-sub">Abrindo o álbum…</p>
      ) : isLive && live.isError ? (
        <div className={`panel ${s.empty}`}>
          <p className={s.emptyTitle}>Não deu para abrir o álbum</p>
          <button type="button" className="btn btn-secondary" onClick={() => live.refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : shown.length > 0 ? (
        <ul className={s.grid}>
          {shown.map(({ e }) => (
            <li key={e.card.id}>
              <CardView entry={e} size="s" showQuantity className={s.card} />
              {e.owned && e.quantity > 1 && (
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm ${s.tradeOne}`}
                  disabled={recycle.isPending}
                  onClick={() => trade([{ id: e.card.id, quantity: e.quantity - 1 }])}
                  aria-label={`Trocar ${e.quantity - 1} repetidas de ${'title' in e.card ? e.card.title : 'carta'}`}
                >
                  Trocar {e.quantity - 1}
                  <span className={s.price}>
                    <IconCoin size={14} />
                    {formatCoins(recycleValue(e.card.odds_n, RECYCLE_BASE) * (e.quantity - 1))}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className={`panel ${s.empty}`}>
          <p className={s.emptyTitle}>Nenhuma carta aqui ainda</p>
          <p>Troque o filtro ou vá roletar: cada roletada pode trazer uma carta nova.</p>
        </div>
      )}
    </div>
  );
}
