import { useState, type CSSProperties } from 'react';
import { CardView } from '@/ui/CardView';
import { COLLECTION } from '@/design/sample';
import { TIERS, TIER_LABEL, rarityTier } from '@/lib/rarity';
import type { RarityTier } from '@/data/types';
import { isLive, useCollection } from '@/data/live';
import type { CollectionEntry } from '@/data/types';
import s from './CollectionPage.module.css';

type Filter = 'todas' | 'minhas' | 'faltando';

export function CollectionPage() {
  const [filter, setFilter] = useState<Filter>('todas');
  const [tier, setTier] = useState<RarityTier | null>(null);
  const live = useCollection();
  const all: CollectionEntry[] = isLive ? (live.data ?? []) : COLLECTION;
  const ownedCount = all.filter((e) => e.owned).length;
  const pct = Math.round((ownedCount / Math.max(1, all.length)) * 100);

  const shown = all.map((e, i) => ({ e, n: i + 1 }))
    .filter(({ e }) => (filter === 'minhas' ? e.owned : filter === 'faltando' ? !e.owned : true))
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
          {(['todas', 'minhas', 'faltando'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'todas' ? 'Todas' : f === 'minhas' ? 'Minhas' : 'Faltando'}
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
