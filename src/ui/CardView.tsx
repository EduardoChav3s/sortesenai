import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CollectionEntry } from '@/data/types';
import { formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { placeZoom, zoomWidth, type Box } from '@/lib/zoom';
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
  /** Load the photo right away (the roll's reel); elsewhere photos load as they come into view. */
  eager?: boolean;
  /** While the mouse is over the card, show a bigger copy. Off for cards that move (the spinning reel) or are only decoration. */
  zoom?: boolean;
}

export function CardView({ entry, size = 'm', showQuantity = false, number, className = '', style, eager = false, zoom = true }: CardViewProps) {
  const [big, setBig] = useState<ZoomAt | null>(null);
  // the copy stays still on screen, so it closes as soon as the page scrolls or the window changes size
  useEffect(() => {
    if (!big) return;
    const close = () => setBig(null);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [big]);
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
  // only a mouse: on a phone a tap would leave the copy stuck open
  const open = (e: ReactPointerEvent<HTMLElement>) => {
    if (!zoom || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = { left: r.left, top: r.top, width: r.width, height: r.height };
    const width = zoomWidth(at, viewSize());
    setBig(width ? { card: at, width } : null);
  };
  return (
    <>
      <article className={`${s.card} ${s[size]} ${className}`} data-tier={tier} style={style} onPointerEnter={open} onPointerLeave={() => setBig(null)}>
        <div className={s.face}>
          <span className={s.shine} aria-hidden="true" />
          <div className={s.head}>
            <span className={s.num} aria-label={`Figurinha ${no}`}>
              {no}
            </span>
            <span className={s.odds}>{odds}</span>
          </div>
          {card.image_url ? (
            <img className={s.photo} src={card.image_url} alt={card.title} loading={eager ? 'eager' : 'lazy'} decoding="async" />
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
      {zoom &&
        big &&
        createPortal(
          <ZoomCopy at={big}>
            <CardView entry={entry} size="l" number={number} showQuantity={showQuantity} eager zoom={false} style={{ fontSize: `${big.width / 11}px` }} />
          </ZoomCopy>,
          document.body,
        )}
    </>
  );
}

type ZoomAt = { card: Box; width: number };
const viewSize = () => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * The bigger copy shown while the mouse is over a card. All of its text shows, so a long joke makes it
 * taller (on a short screen the photo gives way). It is placed once its real height is known, before it is painted.
 */
function ZoomCopy({ at, children }: { at: ZoomAt; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => placeZoom(at.card, viewSize(), { width: at.width, height: at.width * 1.4 }));
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight; // offsetHeight ignores the grow animation's scale
    if (height) setBox(placeZoom(at.card, viewSize(), { width: at.width, height }));
  }, [at]);
  return (
    <div
      ref={ref}
      className={s.zoom}
      data-card-zoom=""
      aria-hidden="true"
      style={{ left: box.left, top: box.top, '--dx': `${box.dx}px`, '--dy': `${box.dy}px`, '--from': box.scale, '--face': `${at.width * 0.96}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
