// The four minigames. Each opens in a dialog over the games page.
// The server keeps every secret and its own clock; the screen only shows what it says.
import { useEffect, useRef, useState } from 'react';
import { api } from '@/data/client';
import { isLive, useGameDone } from '@/data/live';
import { isApiError } from '@/data/errors';
import { formatCoins } from '@/lib/format';
import type { GameId } from '@/data/types';
import { applyFlip, canFlip, hideOpen, NEW_BOARD, type MemoryState } from './memory';
import s from './Games.module.css';

const SLOT_ICON: Record<string, string> = { grampeador: '📎', cafe: '☕', pendrive: '💾', cracha: '🪪', apostila: '📘', estrela: '⭐' };
const SLOT_KEYS = Object.keys(SLOT_ICON);
const MEMORY_ICON: Record<string, string> = { a: '🍀', b: '🎲', c: '📎', d: '☕', e: '💾', f: '📘', g: '⭐', h: '🔥' };

function errorText(e: unknown) {
  if (isApiError(e) && e.code === 'insufficient_coins') return 'Moedas insuficientes.';
  if (isApiError(e) && e.code === 'session_expired') return 'A partida expirou. Comece de novo.';
  return 'Não deu certo. Tente de novo.';
}

function Prize({ payout, capped }: { payout: number; capped?: boolean }) {
  if (payout > 0) return <p className={s.win}>+{formatCoins(payout)} moedas{capped && ' (limite de hoje)'}</p>;
  return <p className={s.lose}>{capped ? 'Limite de hoje atingido. Valeu pela diversão!' : 'Sem moedas dessa vez.'}</p>;
}

// ---------------------------------------------------------------- slots
function Slots({ done }: { done: () => void }) {
  const [bet, setBet] = useState(10);
  const [reels, setReels] = useState(['estrela', 'estrela', 'estrela']);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ payout: number; capped: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef<number>();
  useEffect(() => () => window.clearInterval(tick.current), []);

  async function spin() {
    setSpinning(true);
    setResult(null);
    setError(null);
    tick.current = window.setInterval(() => setReels([0, 1, 2].map(() => SLOT_KEYS[Math.floor(Math.random() * SLOT_KEYS.length)])), 90);
    try {
      const [r] = await Promise.all([api!.playSlots(bet), new Promise((ok) => setTimeout(ok, 900))]);
      window.clearInterval(tick.current);
      setReels(r.reels);
      setResult({ payout: Number(r.payout), capped: r.capped });
      done();
    } catch (e) {
      window.clearInterval(tick.current);
      setError(errorText(e));
    }
    setSpinning(false);
  }

  return (
    <div className={s.stack}>
      <div className={s.reels} data-spinning={spinning} role="img" aria-label={`Rolos: ${reels.join(', ')}`}>
        {reels.map((r, i) => (
          <span key={i}>{SLOT_ICON[r] ?? '?'}</span>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Aposta">
        {[10, 25, 50].map((b) => (
          <button key={b} type="button" aria-pressed={bet === b} onClick={() => setBet(b)} disabled={spinning}>
            {b} moedas
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-lg" onClick={spin} disabled={spinning}>
        {spinning ? 'Girando…' : 'Girar'}
      </button>
      <div aria-live="polite">
        {result && <Prize payout={result.payout} capped={result.capped} />}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
      <p className={s.note}>Dois iguais pagam 2x. Três iguais pagam 10x. Três estrelas pagam 50x.</p>
    </div>
  );
}

// ---------------------------------------------------------------- memory
function Memory({ done }: { done: () => void }) {
  const [session, setSession] = useState<string | null>(null);
  const [m, setM] = useState<MemoryState>(NEW_BOARD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const r = await api!.startMemory();
      setSession(r.session_id);
      setM(NEW_BOARD);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }
  useEffect(() => {
    void start();
  }, []);

  async function flip(i: number) {
    if (!session || busy || !canFlip(m, i)) return;
    setBusy(true);
    try {
      const r = await api!.flipMemory(session, i);
      const next = applyFlip(m, { ...r, payout: r.payout == null ? null : Number(r.payout) });
      setM(next);
      if (next.open.length === 2) setTimeout(() => setM((cur) => hideOpen(cur)), 750);
      if (next.finished) done();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <div className={s.stack}>
      <p className={s.note}>Jogadas: {m.moves}. Ache os 8 pares.</p>
      <div className={s.board}>
        {Array.from({ length: 16 }, (_, i) => {
          const face = m.faces[i];
          return (
            <button
              key={i}
              type="button"
              className={s.tile}
              data-open={face !== undefined}
              data-matched={m.matched.includes(i)}
              onClick={() => flip(i)}
              disabled={!session || m.finished}
              aria-label={face ? `Carta ${i + 1}: ${MEMORY_ICON[face] ?? face}` : `Carta ${i + 1}, virada`}
            >
              {face ? MEMORY_ICON[face] ?? face : ''}
            </button>
          );
        })}
      </div>
      {m.finished && (
        <>
          <Prize payout={m.payout ?? 0} />
          <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
            Jogar de novo
          </button>
        </>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}{' '}
          <button type="button" className="btn btn-secondary btn-sm" onClick={start}>
            Recomeçar
          </button>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- reflex
type ReflexPhase = 'idle' | 'starting' | 'wait' | 'go' | 'sending' | 'early' | 'done';
function Reflex({ done }: { done: () => void }) {
  const [phase, setPhase] = useState<ReflexPhase>('idle');
  const [result, setResult] = useState<{ ms: number; valid: boolean; payout: number; capped: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function start() {
    setError(null);
    setResult(null);
    setPhase('starting');
    try {
      const r = await api!.startReflex();
      session.current = r.session_id;
      setPhase('wait');
      timer.current = window.setTimeout(() => setPhase('go'), r.delay_ms);
    } catch (e) {
      setError(errorText(e));
      setPhase('idle');
    }
  }

  async function hit() {
    if (phase === 'wait') {
      window.clearTimeout(timer.current);
      return setPhase('early');
    }
    if (phase !== 'go' || !session.current) return;
    setPhase('sending');
    try {
      const r = await api!.finishReflex(session.current);
      setResult({ ms: r.reaction_ms, valid: r.valid, payout: Number(r.payout), capped: r.capped });
      done();
    } catch (e) {
      setError(errorText(e));
    }
    setPhase('done');
  }

  const label: Record<ReflexPhase, string> = {
    idle: 'Toque em Começar',
    starting: 'Preparando…',
    wait: 'Espere ficar verde…',
    go: 'AGORA!',
    sending: 'Medindo…',
    early: 'Cedo demais!',
    done: result ? `${result.ms} ms` : 'Fim',
  };

  return (
    <div className={s.stack}>
      <button type="button" className={s.pad} data-phase={phase} onPointerDown={hit} disabled={phase !== 'wait' && phase !== 'go'}>
        {label[phase]}
      </button>
      <div aria-live="polite">
        {result && (result.valid ? <Prize payout={result.payout} capped={result.capped} /> : <p className={s.lose}>Tempo inválido. Tente de novo.</p>)}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
      {(phase === 'idle' || phase === 'early' || phase === 'done') && (
        <button type="button" className="btn btn-primary" onClick={start}>
          {phase === 'idle' ? 'Começar' : 'Jogar de novo'}
        </button>
      )}
      <p className={s.note}>Quanto mais rápido, mais moedas. O tempo é medido pelo servidor.</p>
    </div>
  );
}

// ---------------------------------------------------------------- quick clicks
type ClickPhase = 'idle' | 'starting' | 'run' | 'sending' | 'done';
function Clicker({ done }: { done: () => void }) {
  const [phase, setPhase] = useState<ClickPhase>('idle');
  const [clicks, setClicks] = useState(0);
  const [left, setLeft] = useState(10);
  const [result, setResult] = useState<{ payout: number; capped: boolean; valid: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = useRef(0);
  const timer = useRef<number>();
  useEffect(() => () => window.clearInterval(timer.current), []);

  async function finish(session: string) {
    setPhase('sending');
    try {
      const r = await api!.finishClicker(session, Math.min(count.current, 150));
      setResult({ payout: Number(r.payout), capped: r.capped, valid: r.valid });
      done();
    } catch (e) {
      setError(errorText(e));
    }
    setPhase('done');
  }

  async function start() {
    setError(null);
    setResult(null);
    setPhase('starting');
    try {
      const r = await api!.startClicker();
      count.current = 0;
      setClicks(0);
      const end = Date.now() + r.duration_ms + 150; // a hair past the server's 10 s
      setLeft(Math.ceil(r.duration_ms / 1000));
      setPhase('run');
      timer.current = window.setInterval(() => {
        const ms = end - Date.now();
        setLeft(Math.max(0, Math.ceil(ms / 1000)));
        if (ms <= 0) {
          window.clearInterval(timer.current);
          void finish(r.session_id);
        }
      }, 100);
    } catch (e) {
      setError(errorText(e));
      setPhase('idle');
    }
  }

  function hit() {
    if (phase !== 'run') return;
    count.current += 1;
    setClicks(count.current);
  }

  return (
    <div className={s.stack}>
      <p className={s.timer} aria-live="polite">
        {phase === 'run' ? `${left}s` : phase === 'done' ? 'Fim!' : '10s'}
      </p>
      <button type="button" className={s.clickPad} onPointerDown={hit} disabled={phase !== 'run'}>
        <strong>{clicks}</strong>
        <span>cliques</span>
      </button>
      <div aria-live="polite">
        {result && (result.valid ? <Prize payout={result.payout} capped={result.capped} /> : <p className={s.lose}>Partida inválida. Tente de novo.</p>)}
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
      {(phase === 'idle' || phase === 'done') && (
        <button type="button" className="btn btn-primary" onClick={start}>
          {phase === 'idle' ? 'Começar' : 'Jogar de novo'}
        </button>
      )}
      <p className={s.note}>Cada clique vale 1 moeda, até o limite do dia.</p>
    </div>
  );
}

// ---------------------------------------------------------------- dialog
const PLAY: Record<GameId, (p: { done: () => void }) => JSX.Element> = { slots: Slots, memory: Memory, reflex: Reflex, clicker: Clicker };

export function GameDialog({ game, name, onClose }: { game: GameId; name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const done = useGameDone();
  useEffect(() => {
    const d = ref.current;
    // No close() on cleanup: it fires onClose, and StrictMode runs this effect twice.
    // Removing the element from the page already ends the modal.
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);
  const Play = PLAY[game];
  return (
    <dialog ref={ref} className={s.dialog} onClose={onClose} aria-labelledby="game-title">
      <header className={s.head}>
        <h2 id="game-title" className={s.title}>
          {name}
        </h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Fechar
        </button>
      </header>
      {isLive ? <Play done={done} /> : <p className={s.note}>Entre com sua conta para jogar valendo moedas.</p>}
    </dialog>
  );
}
