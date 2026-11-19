// The daily chest: once a day the database draws one prize (coins, fragments or a potion) by its weight;
// the strip spins like the card reel and stops on it.
import { useEffect, useMemo, useState } from 'react';
import type { ChestPrize } from '@/data/api';
import { useChest, useOpenChest } from '@/data/bellLive';
import { isApiError } from '@/data/errors';
import { chestStrip } from '@/lib/chest';
import { IconClover, IconCoin, IconGift, IconSparkle } from '@/ui/icons';
import s from './Chest.module.css';

const LENGTH = 21;
const TARGET = 16;
const START = 2;
const icon = (kind: string) => (kind === 'coins' ? <IconCoin size={28} /> : kind === 'fragments' ? <IconSparkle size={28} /> : <IconClover size={28} />);

export function ChestDialog({ onClose }: { onClose: () => void }) {
  const chest = useChest();
  const open = useOpenChest();
  const prizes = useMemo(() => chest.data?.prizes ?? [], [chest.data]);
  const [won, setWon] = useState<{ id: string | null; label: string; kind: string } | null>(null);
  const [spun, setSpun] = useState(false);
  const [done, setDone] = useState(false);
  const strip = useMemo(
    () => chestStrip<ChestPrize>(prizes, won?.id ?? null, Math.random, LENGTH, TARGET),
    // a new strip only when the prizes arrive or the prize is known
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prizes.length, won?.id],
  );
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !open.isPending && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, open.isPending]);
  useEffect(() => {
    if (!won) return;
    const go = window.requestAnimationFrame(() => setSpun(true));
    const stop = window.setTimeout(() => setDone(true), 4000);
    return () => (window.cancelAnimationFrame(go), window.clearTimeout(stop));
  }, [won]);
  const claimed = chest.data?.claimed_today && !won;
  const error = open.error ? (isApiError(open.error) && open.error.code === 'already_claimed' ? 'Você já abriu o baú hoje.' : 'O baú não abriu. Tente de novo.') : null;
  const index = spun ? TARGET : START;
  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label="Baú do dia" onClick={() => !open.isPending && onClose()}>
      <div className={`panel ${s.box}`} onClick={(e) => e.stopPropagation()}>
        <h2 className={s.title}>
          <IconGift size={22} /> Baú do dia
        </h2>
        {prizes.length > 0 && (
          <div className={s.track}>
            <div className={s.strip} data-spin={spun || undefined} style={{ transform: `translateX(calc(${index} * -1 * var(--step)))` }}>
              {strip.map((p, i) => (
                <div key={i} className={s.tile} data-kind={p.kind} data-win={(done && i === TARGET) || undefined}>
                  {icon(p.kind)}
                  <span>{p.label}</span>
                </div>
              ))}
            </div>
            <span className={s.window} aria-hidden="true" />
          </div>
        )}
        <p className={s.result} aria-live="polite">
          {done && won ? (
            <>
              Você ganhou <strong>{won.label}</strong>!
            </>
          ) : won ? (
            'Abrindo…'
          ) : claimed ? (
            'Você já abriu o baú hoje. Volte amanhã!'
          ) : (
            'Um prêmio por dia: moedas, fragmentos ou poção.'
          )}
        </p>
        {error && <p role="alert" className={s.error}>{error}</p>}
        <div className={s.actions}>
          {!won && !claimed && (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={open.isPending || chest.isLoading || prizes.length === 0}
              onClick={() => open.mutate(undefined, { onSuccess: (r) => setWon(r.prize) })}
            >
              {open.isPending ? 'Abrindo…' : 'Abrir baú'}
            </button>
          )}
          {(done || claimed || !won) && (
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={open.isPending}>
              Fechar
            </button>
          )}
        </div>
        {prizes.length > 0 && (
          <details className={s.odds}>
            <summary>Chances de cada prêmio</summary>
            <ul>
              {prizes.map((p) => (
                <li key={p.id}>
                  <span>{p.label}</span>
                  <span>{(p.chance * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
