import { useState, type CSSProperties } from 'react';
import { GameDialog } from './play/Games';
import type { GameId } from '@/data/types';
import { GAMES } from '@/design/sample';
import { formatCoins } from '@/lib/format';
import { isLive, useGameLimits } from '@/data/live';
import s from './GamesPage.module.css';

function Preview({ id }: { id: (typeof GAMES)[number]['id'] }) {
  if (id === 'slots')
    return (
      <div className={s.slots} aria-hidden="true">
        <span>7</span>
        <span>7</span>
        <span>
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" fill="currentColor" />
          </svg>
        </span>
      </div>
    );
  if (id === 'memory')
    return (
      <div className={s.memory} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} data-open={i === 2 || i === 5} />
        ))}
      </div>
    );
  if (id === 'reflex')
    return (
      <div className={s.reflex} aria-hidden="true">
        <span />
      </div>
    );
  return (
    <div className={s.clicker} aria-hidden="true">
      <span>87</span>
      <small>cliques</small>
    </div>
  );
}

export function GamesPage() {
  const limits = useGameLimits();
  const [playing, setPlaying] = useState<{ id: GameId; name: string } | null>(null);
  const games = GAMES.map((g) => {
    const l = isLive ? limits.data?.[g.id] : undefined;
    return l ? { ...g, earned: Number(l.earned_today), limit: Number(l.limit) } : g;
  });
  return (
    <div className="page">
      <p className="page-sub">Cada jogo tem um limite de moedas por dia. Depois dele dá para continuar jogando, só por diversão.</p>
      <ul className={s.grid}>
        {games.map((g) => {
          const full = g.earned >= g.limit;
          return (
            <li key={g.id} className={`panel ${s.game}`}>
              <Preview id={g.id} />
              <div className={s.body}>
                <h2 className={s.name}>{g.name}</h2>
                <p className={s.rule}>{g.rule}</p>
                <div className={s.limit}>
                  <div className="progress" data-full={full} style={{ '--value': `${(g.earned / g.limit) * 100}%` } as CSSProperties}>
                    <span />
                  </div>
                  <span className={s.limitText}>
                    {full ? 'Limite de hoje atingido' : `${formatCoins(g.earned)} de ${formatCoins(g.limit)} moedas hoje`}
                  </span>
                </div>
                <button type="button" className={`btn ${full ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setPlaying({ id: g.id, name: g.name })}>
                  {full ? 'Jogar sem prêmio' : 'Jogar'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {playing && <GameDialog key={playing.id} game={playing.id} name={playing.name} onClose={() => setPlaying(null)} />}
    </div>
  );
}
