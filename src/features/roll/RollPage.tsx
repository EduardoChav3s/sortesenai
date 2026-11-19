import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CardView } from '@/ui/CardView';
import { Avatar } from '@/ui/Avatar';
import { Missions, RareBurst, SongBar, WeeklyEventBanner, useRareEffect, useSound } from './Extras';
import { rarityTier as tierOf } from '@/lib/rarity';
import { IconClover, IconCoin } from '@/ui/icons';
import { FEED, REEL, WALLET } from '@/design/sample';
import { formatLuck, formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { isLive, toFeedRow, useFeed, useGameSettings, useLuck, usePull, usePullMany, useRareMusic, useReelCards } from '@/data/live';
import { buildStrip, REEL_TARGET } from '@/lib/reel';
import { isApiError } from '@/data/errors';
import type { CollectionEntry } from '@/data/types';
import s from './RollPage.module.css';

const ERRORS: Record<string, string> = {
  insufficient_coins: 'Moedas insuficientes para roletar.',
  banned: 'Sua conta está suspensa.',
};

// Demo mode (no Supabase keys) keeps the sample stickers; the real site uses the album's active cards.
const DEMO_STRIP = [...REEL, ...REEL, ...REEL];
const TARGET = REEL_TARGET;

export function RollPage() {
  // Design preview only: replays the reel motion, no draw happens.
  const [spin, setSpin] = useState(0);
  const [won, setWon] = useState<CollectionEntry | null>(null);
  const [moving, setMoving] = useState(false);
  const [batch, setBatch] = useState<CollectionEntry[]>([]);
  const sound = useSound();
  const rareMusic = useRareMusic();
  const { burst, celebrate, song, stopSong } = useRareEffect(sound.on, rareMusic.data);
  // The reel lands 2 s after the click: use the latest celebrate (songs may have loaded meanwhile).
  const celebrateNow = useRef(celebrate);
  celebrateNow.current = celebrate;
  useEffect(() => {
    if (!sound.on) stopSong();
  }, [sound.on, stopSong]);
  const [shake, setShake] = useState<string | null>(null);
  const landTimer = useRef<number[]>([]);
  useEffect(() => () => landTimer.current.forEach((t) => window.clearTimeout(t)), []);
  // Dev only: /?festa=raro|epico|lendario|mitico previews the celebration without needing the luck.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const tier = new URLSearchParams(window.location.search).get('festa');
    const odds = { raro: 10_000, epico: 1_000_000, lendario: 100_000_000, mitico: 1_000_000_000 }[tier ?? ''];
    if (odds) land(odds);
  }, []);
  /** When the reel stops on a rare card: celebrate and shake the stage. */
  function land(odds: number) {
    landTimer.current.forEach((t) => window.clearTimeout(t));
    landTimer.current = [
      window.setTimeout(() => {
        celebrateNow.current(odds);
        const tier = tierOf(odds);
        if (tier === 'raro' || tier === 'epico' || tier === 'lendario' || tier === 'mitico') setShake(tier);
      }, 2200),
      window.setTimeout(() => setShake(null), 5200),
    ];
  }
  // The reel shows every active card in full (never deleted or turned-off ones). It is rebuilt when that set
  // of cards changes and reshuffled at each roll, never in the middle of a spin.
  const reel = useReelCards();
  const reelEntries: CollectionEntry[] = (reel.data ?? []).map((card) => ({ owned: true, quantity: 1, card }));
  const [base, setBase] = useState<CollectionEntry[]>([]);
  // photo links are renewed before they expire; a new link rebuilds the strip so no photo breaks
  const activeKey = (reel.data ?? []).map((c) => `${c.id}:${c.image_url ?? ''}:${c.title}`).sort().join(',');
  useEffect(() => {
    if (isLive && reel.data) setBase(buildStrip(reelEntries, Math.random));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);
  const reshuffle = () => {
    if (isLive && reel.data) setBase(buildStrip(reelEntries, Math.random));
  };
  // Fetch every reel photo as soon as the cards arrive, so nothing pops in while the reel spins.
  const preloaded = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    const urls = [...new Set((reel.data ?? []).map((c) => c.image_url).filter((u): u is string => !!u))];
    preloaded.current = urls.map((u) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = u;
      return img;
    });
  }, [activeKey]);
  const settings = useGameSettings();
  const pullCost = isLive ? Number(settings.data?.pull_cost ?? WALLET.pullCost) : WALLET.pullCost;
  const pull = usePull();
  const many = usePullMany();
  const luck = useLuck();
  const busy = pull.isPending || many.isPending;
  const feedQuery = useFeed(8);
  const feed = isLive ? (feedQuery.data ?? []).map((e) => toFeedRow(e, Date.now())) : FEED;
  const stripBase = isLive ? base : DEMO_STRIP;
  const strip = won && stripBase.length ? stripBase.map((e, i) => (i === TARGET ? won : e)) : stripBase;
  const windowNo = (strip[TARGET]?.card as { number?: number } | undefined)?.number;
  const failure = pull.error ?? many.data?.error ?? many.error;
  const errorText = failure ? (isApiError(failure) ? ERRORS[failure.code] : undefined) ?? 'Não deu para roletar agora. Tente de novo.' : null;

  function roll() {
    setBatch([]);
    many.reset();
    if (!isLive) return setSpin((n) => n + 1);
    pull.mutate(undefined, {
      onSuccess: (r) => {
        reshuffle();
        setWon({ owned: true, quantity: r.quantity, card: r.card });
        setSpin((n) => n + 1);
        land(r.card.odds_n);
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
        const top = [...got].sort((a, b) => b.card.odds_n - a.card.odds_n)[0];
        reshuffle();
        setWon(top);
        setSpin((n) => n + 1);
        land(top.card.odds_n);
      },
    });
  }
  const luckText = isLive
    ? luck.data ? `Sorte ${formatLuck(Number(luck.data.effective))} ativa${Number(luck.data.potions) > 1 ? ' com bônus' : ''}` : 'Sorte 1x'
    : `Sorte ${formatLuck(WALLET.luck)} ativa por mais ${WALLET.luckLeft}`;

  return (
    <div className={s.page}>
      {burst && <RareBurst key={burst.key} tier={burst.tier} />}
      {song && <SongBar title={song} onStop={stopSong} />}
      <WeeklyEventBanner />
      <section className={`panel ${s.stage}`} aria-label="Roleta" data-shake={shake ?? undefined}>
        <div className={s.track}>
          {strip.length === 0 ? (
            <p className={s.reelEmpty}>{reel.isLoading ? 'Abrindo o álbum…' : 'Nenhuma carta no álbum ainda. O admin precisa cadastrar cartas.'}</p>
          ) : (
            <div
              key={spin}
              className={`${s.strip} ${spin > 0 ? s.spinning : ''}`}
              style={{ '--target': TARGET, '--start': 3 } as CSSProperties}
              // no bigger copy while the cards slide; it comes back once the winner has landed
              onAnimationStart={(e) => e.target === e.currentTarget && setMoving(true)}
              onAnimationEnd={(e) => (e.target as Element).classList.contains(s.winner) && setMoving(false)}
            >
              {strip.map((entry, i) => (
                <CardView key={`${entry.card.id}-${i}`} entry={entry} size="m" eager zoom={!moving} className={i === TARGET ? s.winner : s.cell} />
              ))}
            </div>
          )}
          <div className={s.window} aria-hidden="true">
            <span className={s.notchTop} />
            {windowNo !== undefined && <span className={s.slotNo}>Nº {String(windowNo).padStart(2, '0')}</span>}
            <span className={s.notchBottom} />
          </div>
        </div>

        <div className={s.actions}>
          <button type="button" className={`btn btn-primary btn-lg ${s.roll}`} onClick={roll} disabled={busy}>
            Roletar
            <span className={s.cost}>
              <IconCoin size={16} />
              {pullCost}
            </span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={rollTen} disabled={busy}>
            {many.isPending ? 'Roletando 10…' : 'Roletar 10 de uma vez'}
            <span className={s.cost}>
              <IconCoin size={16} />
              {pullCost * 10}
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
          <button type="button" className={s.soundToggle} aria-pressed={sound.on} onClick={sound.toggle}>
            {sound.on ? 'Som ligado' : 'Som desligado'}
          </button>
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

      <Missions />

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
