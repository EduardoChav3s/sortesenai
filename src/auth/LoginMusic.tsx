// Background music on the sign-in page. Browsers only allow sound after the first click or key,
// so it starts then (or on the play button). Stops by itself once the player signs in (unmount).
import { useEffect, useRef, useState } from 'react';
import { api, musicUrl } from '@/data/client';
import { needsTapToStart, nextIndex } from '@/lib/playlist';
import s from './LoginMusic.module.css';

const PREF_KEY = 'sortesenai:musica-login';
// No music (and no network) in demo mode or while the test suite runs.
const ENABLED = !!api && import.meta.env.MODE !== 'test';
function readWanted() {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}
function saveWanted(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
}

export function LoginMusic() {
  const [tracks, setTracks] = useState<{ title: string; url: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false); // the browser refused to start sound on its own
  const [dismissed, setDismissed] = useState(false);
  const wanted = useRef(readWanted());
  const audio = useRef<HTMLAudioElement | null>(null);
  const count = useRef(0);

  // Songs come from the database (open before sign-in) and play from the public music bucket.
  useEffect(() => {
    if (!ENABLED) return;
    let alive = true;
    api!
      .loginMusic()
      .then((list) => alive && setTracks(list.map((t) => ({ title: t.title, url: musicUrl(t.path) }))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ENABLED) return;
    const a = new Audio();
    a.volume = 0.35;
    a.preload = 'auto';
    const onEnd = () => setIdx((i) => nextIndex(i, count.current));
    const onPlay = () => {
      setPlaying(true);
      setBlocked(false);
      setDismissed(true);
    };
    const onPause = () => setPlaying(false);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    audio.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    count.current = tracks.length;
    const a = audio.current;
    if (!a || tracks.length === 0) return;
    a.loop = tracks.length === 1;
    a.src = tracks[idx % tracks.length].url;
    // Try to start right away. Most browsers refuse sound before the first tap: then the tap screen shows.
    // Dev only: /_login?sem-som acts like a browser that blocks sound, to preview the tap screen.
    if (import.meta.env.DEV && wanted.current && new URLSearchParams(window.location.search).has('sem-som') && !a.dataset.tapped) {
      setBlocked(true);
      return;
    }
    if (wanted.current)
      a.play().catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'NotAllowedError') setBlocked(true);
      });
  }, [idx, tracks]);

  // Autoplay is usually blocked: start on the first interaction with the page, if the player wants music.
  useEffect(() => {
    if (tracks.length === 0) return;
    const start = () => {
      if (wanted.current && audio.current?.paused) audio.current.play().catch(() => undefined);
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, [tracks.length]);

  if (tracks.length === 0) return null;
  const current = tracks[idx % tracks.length];

  function enter() {
    wanted.current = true;
    saveWanted(true);
    setDismissed(true);
    if (audio.current) audio.current.dataset.tapped = '1';
    audio.current?.play().catch(() => undefined);
  }

  const gate = needsTapToStart({ hasTracks: tracks.length > 0, wanted: wanted.current, blocked, dismissed });

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      wanted.current = false;
      saveWanted(false);
      a.pause();
    } else {
      wanted.current = true;
      saveWanted(true);
      a.play().catch(() => undefined);
    }
  }

  return (
    <>
      {gate && (
        <button type="button" className={s.gate} onClick={enter} autoFocus>
          <img className={s.gateLogo} src="/brand/mascote.webp" alt="" width={96} height={96} />
          <span className={s.gateBrand}>
            Sorte<span>Senai</span>
          </span>
          <span className={s.gateCta}>Toque para entrar</span>
          <span className={s.gateHint}>♪ com música: {current.title}</span>
        </button>
      )}
    <div className={s.player} data-playing={playing} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className={s.play} onClick={toggle} aria-label={playing ? 'Pausar música' : 'Tocar música'}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M8 5l11 7-11 7z" fill="currentColor" />
          </svg>
        )}
      </button>
      <span className={s.info}>
        <span className={s.label}>{playing ? 'Tocando' : 'Música'}</span>
        <span className={s.title}>{current.title}</span>
      </span>
      {playing && (
        <span className={s.bars} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {tracks.length > 1 && (
        <button type="button" className={s.next} onClick={() => setIdx((i) => nextIndex(i, tracks.length))} aria-label="Próxima música">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M6 5l9 7-9 7zM16 5h3v14h-3z" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
    </>
  );
}
