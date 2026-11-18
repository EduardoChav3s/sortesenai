import { useState, type CSSProperties } from 'react';
import { RANKING } from '@/design/sample';
import { formatCoins, formatOdds } from '@/lib/format';
import { isLive, playerChip, useRanking, useWallet } from '@/data/live';
import s from './RankingPage.module.css';

type Kind = 'coins' | 'collection' | 'rarest';
const LABEL: Record<Kind, string> = { coins: 'Moedas', collection: 'Coleção', rarest: 'Maior raridade' };

export function RankingPage() {
  const [kind, setKind] = useState<Kind>('coins');
  const live = useRanking(kind);
  const wallet = useWallet();
  const list = isLive ? (live.data ?? []).map((e) => ({ player: playerChip(e.player.id, e.player.nickname), value: Number(e.value) })) : RANKING;
  const meName = isLive ? wallet.data?.nickname : 'Duda';
  const show = (v: number) => (kind === 'coins' ? `${formatCoins(v)} moedas` : kind === 'collection' ? `${v}% da coleção` : formatOdds(v, { compact: true }));
  const podium = [list[1], list[0], list[2]].filter(Boolean);
  const pos = [2, 1, 3];

  return (
    <div className="page">
      <div className="segmented" role="group" aria-label="Ordenar ranking por">
        {(Object.keys(LABEL) as Kind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {LABEL[k]}
          </button>
        ))}
      </div>

      <ol className={s.podium} aria-label="Pódio">
        {podium.length === 3 && podium.map((r, i) => (
          <li key={r.player.id} className={s.place} data-pos={pos[i]}>
            <span className="avatar" style={{ '--hue': r.player.hue, '--size': pos[i] === 1 ? '64px' : '52px' } as CSSProperties}>
              {r.player.initials}
            </span>
            <span className={s.name}>{r.player.name}</span>
            <span className={s.value}>{show(r.value)}</span>
            <span className={s.pedestal}>{pos[i]}º</span>
          </li>
        ))}
      </ol>

      <div className={`panel ${s.tablePanel}`}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Posição</th>
              <th scope="col">Jogador</th>
              <th scope="col" className="num">
                {LABEL[kind]}
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={r.player.id} data-me={r.player.name === meName}>
                <td className={s.pos}>{i + 1}º</td>
                <td>
                  <span className={s.who}>
                    <span className="avatar" style={{ '--hue': r.player.hue, '--size': '32px' } as CSSProperties}>
                      {r.player.initials}
                    </span>
                    {r.player.name === meName ? `${r.player.name} (você)` : r.player.name}
                  </span>
                </td>
                <td className="num">{show(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
