import type { CSSProperties } from 'react';
import type { CollectionEntry } from '@/data/types';
import { formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { IconBag, IconBulb, IconCards, IconClover, IconCoin, IconGame, IconSparkle, IconTrophy } from './icons';
import s from './CardView.module.css';

// Placeholder art until real photos exist: a stable emblem picked from the card id.
const EMBLEMS = [IconSparkle, IconClover, IconCoin, IconBulb, IconTrophy, IconGame, IconBag, IconCards];
function emblemFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EMBLEMS[h % EMBLEMS.length];
}
function albumNumber(id: string) {
  const n = parseInt(id.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

interface CardViewProps {
  entry: CollectionEntry;
  size?: 's' | 'm' | 'l';
  showQuantity?: boolean;
  number?: number;
  className?: string;
  style?: CSSProperties;
}

export function CardView({ entry, size = 'm', showQuantity = false, number, className = '', style }: CardViewProps) {
  const tier = rarityTier(entry.card.odds_n);
  const odds = formatOdds(entry.card.odds_n, { compact: true });
  const no = String(number ?? (entry.card as { number?: number }).number ?? albumNumber(entry.card.id)).padStart(2, '0');

  if (!entry.owned) {
    return (
      <article
        className={`${s.card} ${s.locked} ${s[size]} ${className}`}
        data-tier={tier}
        style={style}
        aria-label={`Figurinha ${no} ainda vazia, raridade ${odds}`}
      >
        <div className={s.lockedHead}>
          <span className={s.odds}>{odds}</span>
        </div>
        <span className={s.lockedNum} aria-hidden="true">
          {no}
        </span>
        <span className={s.lockedFoot}>{TIER_LABEL[tier]}</span>
      </article>
    );
  }

  const { card, quantity } = entry;
  const Emblem = emblemFor(card.id);
  return (
    <article className={`${s.card} ${s[size]} ${className}`} data-tier={tier} style={style}>
      <div className={s.face}>
        <span className={s.shine} aria-hidden="true" />
        <div className={s.head}>
          <span className={s.num} aria-label={`Figurinha ${no}`}>
            {no}
          </span>
          <span className={s.odds}>{odds}</span>
        </div>
        {card.image_url ? (
          <img className={s.photo} src={card.image_url} alt={card.title} loading="lazy" />
        ) : (
          <div className={s.art} aria-hidden="true">
            <Emblem className={s.emblem} size={64} />
          </div>
        )}
      </div>
      <div className={s.plate}>
        <h3 className={s.title}>{card.title}</h3>
        {size !== 's' && <p className={s.joke}>{card.joke}</p>}
        <div className={s.foot}>
          <span className={s.tier}>{TIER_LABEL[tier]}</span>
          {showQuantity && <span className={s.qty}>×{quantity}</span>}
        </div>
      </div>
    </article>
  );
}
