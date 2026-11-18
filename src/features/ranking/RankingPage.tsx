import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RANKING } from '@/design/sample';
import { formatCoins, formatOdds } from '@/lib/format';
import { isLive, playerChip, useRanking, useWallet } from '@/data/live';
import type { RankingKind } from '@/data/types';
import { Avatar } from '@/ui/Avatar';
import s from './RankingPage.module.css';

const LABEL: Record<RankingKind, string> = { coins: 'Moedas', level: 'Nível', collection: 'Coleção', rarest: 'Maior raridade' };

type Row = { player: ReturnType<typeof playerChip> & { level: number }; value: number };

/** Name that opens the player's page (or your own profile). */
function PlayerName({ id, name, me }: { id: string; name: string; me: boolean }) {
  return (
    <Link to={me ? '/perfil' : `/jogador/${id}`} className={s.link}>
      {me ? `${name} (você)` : name}
    </Link>
  );
}

function Level({ n }: { n: number }) {
  return (
    <span className={s.level} title={`Nível ${n}`}>
      Nv {n}
    </span>
  );
}

export function RankingPage() {
  const [kind, setKind] = useState<RankingKind>('coins');
  const live = useRanking(kind);
  const wallet = useWallet();
  const list: Row[] = isLive
    ? (live.data ?? []).map((e) => ({ player: { ...playerChip(e.player.id, e.player.nickname, e.player.avatar_url ?? null), level: e.player.level ?? 1 }, value: Number(e.value) }))
    : RANKING.map((r, i) => ({ player: { ...r.player, avatar: null, level: 6 - i }, value: r.value }));
  const meName = isLive ? wallet.data?.nickname : 'Duda';
  const show = (r: Row) =>
    kind === 'coins'
      ? `${formatCoins(r.value)} moedas`
      : kind === 'level'
        ? `Nível ${r.player.level} · ${formatCoins(r.value)} XP`
        : kind === 'collection'
          ? `${r.value}% da coleção`
          : formatOdds(r.value, { compact: true });
  const podium = [list[1], list[0], list[2]].filter(Boolean);
  const pos = [2, 1, 3];

  return (
    <div className="page">
      <div className="segmented" role="group" aria-label="Ordenar ranking por">
        {(Object.keys(LABEL) as RankingKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {LABEL[k]}
          </button>
        ))}
      </div>

      <ol className={s.podium} aria-label="Pódio">
        {podium.length === 3 &&
          podium.map((r, i) => (
            <li key={r.player.id} className={s.place} data-pos={pos[i]}>
              <span className={s.podiumAvatar}>
                <Avatar initials={r.player.initials} hue={r.player.hue} size={pos[i] === 1 ? '64px' : '52px'} url={r.player.avatar} />
                <Level n={r.player.level} />
              </span>
              <span className={s.name}>
                <PlayerName id={r.player.id} name={r.player.name} me={r.player.name === meName} />
              </span>
              <span className={s.value}>{show(r)}</span>
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
                    <Avatar initials={r.player.initials} hue={r.player.hue} size="32px" url={r.player.avatar} />
                    <PlayerName id={r.player.id} name={r.player.name} me={r.player.name === meName} />
                    <Level n={r.player.level} />
                  </span>
                </td>
                <td className="num">{show(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
