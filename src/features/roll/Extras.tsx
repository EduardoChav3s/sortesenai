// The fun around the roll: rare-card celebration with sound, daily missions, the weekly event card
// and the live notice when someone in the class pulls a legendary or mythic card.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CardView } from '@/ui/CardView';
import { formatCoins, formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { supabase } from '@/data/client';
import { isLive, toFeedRow, useClaimMission, useFeed, useMissions, useWeeklyEvent, type PlayableTrack } from '@/data/live';
import { pickRandom } from '@/lib/playlist';
import type { RarityTier } from '@/data/types';
import s from './Extras.module.css';

// ---------------------------------------------------------------- sound on/off (kept per browser)
const SOUND_KEY = 'sortesenai:som';
function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function useSound() {
  const [on, setOn] = useState(readSound);
  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem(SOUND_KEY, v ? 'off' : 'on');
      } catch {
        /* private mode: keep it in memory only */
      }
      return !v;
    });
  }, []);
  return { on, toggle };
}

const BIG: RarityTier[] = ['raro', 'epico', 'lendario', 'mitico'];
const STRENGTH: Record<string, number> = { raro: 1, epico: 2, lendario: 3, mitico: 4 };
const SHOUT: Record<string, string> = { raro: 'Rara!', epico: 'Épica!', lendario: 'LENDÁRIA!!', mitico: 'MÍTICA!!!' };
const COLORS: Record<string, string[]> = {
  raro: ['var(--tier-raro)', 'var(--color-paper-3)'],
  epico: ['var(--tier-epico)', 'var(--tier-raro)', 'var(--color-coin)'],
  lendario: ['var(--tier-lendario)', 'var(--color-coin)', 'var(--tier-epico)'],
  mitico: ['var(--tier-mitico)', 'var(--tier-lendario)', 'var(--color-coin)', 'var(--tier-epico)', 'var(--color-paper-3)'],
};

/** A short rising fanfare made in the browser (no sound files). Longer for rarer cards. */
function fanfare(tier: string) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const base = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    const notes = base.slice(0, 2 + STRENGTH[tier]);
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tier === 'mitico' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.7 : 0.18));
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    });
    setTimeout(() => void ctx.close(), 2000);
  } catch {
    /* no audio: the confetti still plays */
  }
}

type RareMusic = { lendario: PlayableTrack[]; mitico: PlayableTrack[] };
const SONG_SECONDS = 30;

/**
 * Call celebrate(odds) after a pull. Rare or better: shake + confetti + sound, bigger the rarer.
 * Legendary and mythic play one of the admin's songs for that rarity (up to 30 s, then fade), else the fanfare.
 */
export function useRareEffect(soundOn: boolean, music?: RareMusic) {
  const [burst, setBurst] = useState<{ tier: string; key: number } | null>(null);
  const [song, setSong] = useState<string | null>(null);
  const timer = useRef<number>();
  const player = useRef<HTMLAudioElement | null>(null);
  const songTimers = useRef<number[]>([]);

  const stopSong = useCallback(() => {
    songTimers.current.forEach((t) => window.clearTimeout(t));
    songTimers.current = [];
    player.current?.pause();
    player.current = null;
    setSong(null);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      stopSong();
    },
    [stopSong],
  );

  const playSong = useCallback(
    (track: PlayableTrack) => {
      stopSong();
      const a = new Audio(track.url);
      a.volume = 0.7;
      a.addEventListener('ended', () => stopSong());
      player.current = a;
      setSong(track.title);
      a.play().catch(() => stopSong());
      // after 30 s, fade out over 2 s
      songTimers.current.push(
        window.setTimeout(() => {
          for (let i = 1; i <= 10; i++) songTimers.current.push(window.setTimeout(() => a.volume = Math.max(0, 0.7 * (1 - i / 10)), i * 200));
          songTimers.current.push(window.setTimeout(() => stopSong(), 2100));
        }, SONG_SECONDS * 1000),
      );
    },
    [stopSong],
  );

  const celebrate = useCallback(
    (odds: number) => {
      const tier = rarityTier(odds);
      if (!BIG.includes(tier)) return;
      setBurst({ tier, key: Date.now() });
      if (soundOn) {
        const songs = tier === 'lendario' || tier === 'mitico' ? music?.[tier] ?? [] : [];
        const track = pickRandom(songs, Math.random());
        if (track) playSong(track);
        else fanfare(tier);
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBurst(null), 2600 + STRENGTH[tier] * 300);
    },
    [soundOn, music, playSong],
  );
  return { burst, celebrate, song, stopSong };
}

/** Small bar while a rare-card song plays, with a stop button. */
export function SongBar({ title, onStop }: { title: string; onStop: () => void }) {
  return (
    <div className={s.songBar} role="status">
      <span className={s.songNote} aria-hidden="true">
        ♪
      </span>
      <span className={s.songTitle}>{title}</span>
      <button type="button" className={s.songStop} onClick={onStop}>
        Parar
      </button>
    </div>
  );
}

export function RareBurst({ tier }: { tier: string }) {
  const pieces = useMemo(() => {
    const n = [0, 24, 50, 90, 140][STRENGTH[tier]];
    const colors = COLORS[tier];
    return Array.from({ length: n }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 1.6 + Math.random() * 1.4,
      size: 6 + Math.random() * 8,
      rot: Math.random() * 360,
      color: colors[i % colors.length],
    }));
  }, [tier]);
  return (
    <div className={s.burst} data-tier={tier} aria-hidden="true">
      {tier === 'mitico' && <span className={s.flash} />}
      <span className={s.shout}>{SHOUT[tier]}</span>
      {pieces.map((p, i) => (
        <i
          key={i}
          className={s.confetti}
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.6, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--rot': `${p.rot}deg` } as CSSProperties}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- weekly event
export function WeeklyEventBanner() {
  const ev = useWeeklyEvent();
  const e = ev.data;
  if (!isLive || !e) return null;
  const until = new Date(e.ends_at);
  until.setMinutes(until.getMinutes() - 1);
  const odds = e.card.card.odds_n;
  const number = String((e.card.card as { number?: number }).number ?? '').padStart(2, '0');
  return (
    <section className={`panel ${s.event}`} aria-labelledby="event-title">
      <div className={s.eventCard}>
        <CardView entry={e.card.known ? { owned: true, quantity: 1, card: e.card.card } : { owned: false, quantity: 0, card: e.card.card }} size="s" />
      </div>
      <div className={s.eventText}>
        <p className={s.eventTag}>Evento da semana</p>
        <h2 id="event-title" className={s.eventTitle}>
          {e.card.known ? e.card.card.title : `Carta Nº ${number}`} com chance {e.multiplier}×
        </h2>
        <p className={s.eventNote}>
          {formatOdds(odds)} vira {formatOdds(Math.round(odds / e.multiplier))} até {until.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}.
          {!e.card.known && ' Você ainda não tem essa. É a hora.'}
        </p>
        <p className="hint">{TIER_LABEL[rarityTier(odds)]}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- daily missions
export function Missions() {
  const list = useMissions();
  const claim = useClaimMission();
  const missions = list.data ?? [];
  if (!isLive || missions.length === 0) return null;
  const left = missions.filter((m) => !m.claimed).length;
  return (
    <section className={`panel ${s.missions}`} aria-labelledby="missions-title">
      <h2 id="missions-title" className={s.missionsTitle}>
        Missões de hoje <span className={s.missionsLeft}>{left === 0 ? 'todas feitas!' : `${left} para fazer`}</span>
      </h2>
      <ul className={s.missionList}>
        {missions.map((m) => {
          const done = m.progress >= m.goal;
          return (
            <li key={m.id} className={s.mission} data-claimed={m.claimed}>
              <div className={s.missionText}>
                <strong>{m.title}</strong>
                <span>
                  +{formatCoins(m.coins)} moedas · +{m.xp} XP
                </span>
              </div>
              <div className="progress" style={{ '--value': `${(m.progress / m.goal) * 100}%` } as CSSProperties} data-full={done}>
                <span />
              </div>
              <span className={s.missionCount}>
                {m.progress}/{m.goal}
              </span>
              {m.claimed ? (
                <span className={s.missionDone}>Feita ✓</span>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" disabled={!done || claim.isPending} onClick={() => claim.mutate(m.id)}>
                  {done ? 'Pegar' : 'Falta'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {claim.isError && <p role="alert" className={s.err}>Não deu para pegar o prêmio. Tente de novo.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- live notice (whole site)
const NOTICE_MIN_ODDS = 100_000_000; // legendary and mythic

export function LiveNotice() {
  const qc = useQueryClient();
  const feed = useFeed(8);
  const seen = useRef<Set<string> | null>(null);
  const [notes, setNotes] = useState<{ id: string; text: string; mythic: boolean }[]>([]);

  // New mural posts arrive live; the feed query refetches and the effect below spots the big ones.
  useEffect(() => {
    if (!isLive || !supabase) return;
    const ch = supabase
      .channel('mural-ao-vivo')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events' }, () => {
        void qc.invalidateQueries({ queryKey: ['feed'] });
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(ch);
    };
  }, [qc]);

  useEffect(() => {
    const rows = feed.data;
    if (!rows) return;
    if (!seen.current) {
      seen.current = new Set(rows.map((e) => String(e.id)));
      return;
    }
    const known = seen.current;
    const fresh = rows.filter((e) => !known.has(String(e.id)));
    fresh.forEach((e) => known.add(String(e.id)));
    const big = fresh.filter((e) => Number(e.odds_n_at_pull) >= NOTICE_MIN_ODDS).map((e) => toFeedRow(e, Date.now()));
    if (big.length === 0) return;
    const add = big.map((r) => {
      const mythic = rarityTier(r.odds_n) === 'mitico';
      return { id: r.id, mythic, text: `${r.player.name} tirou ${r.card}, ${formatOdds(r.odds_n, { compact: true })} ${TIER_LABEL[rarityTier(r.odds_n)]}${mythic ? '!!!' : '!'}` };
    });
    setNotes((n) => [...n, ...add]);
    add.forEach((a) => window.setTimeout(() => setNotes((n) => n.filter((x) => x.id !== a.id)), a.mythic ? 12_000 : 8_000));
  }, [feed.data]);

  if (notes.length === 0) return null;
  return (
    <div className={s.notices} role="status" aria-live="polite">
      {notes.map((n) => (
        <p key={n.id} className={s.notice} data-mythic={n.mythic}>
          <span className={s.noticeTag}>{n.mythic ? 'MÍTICA' : 'Lendária'}</span>
          {n.text}
          <button type="button" className={s.noticeClose} aria-label="Fechar aviso" onClick={() => setNotes((all) => all.filter((x) => x.id !== n.id))}>
            ×
          </button>
        </p>
      ))}
    </div>
  );
}
