import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/ui/Avatar';
import { isLive, playerChip, useChallenges, useFriends, useGifts, useSearchPlayers, useTrades } from '@/data/live';
import { CardView } from '@/ui/CardView';
import { ChallengeItem, DuelResult, TradeItem } from './Social';
import x from './Social.module.css';
import type { FriendPlayer } from '@/data/api';
import { RANKING } from '@/design/sample';
import { FriendButton } from './FriendButton';
import s from './FriendsPage.module.css';

// Demo mode (no Supabase keys): the sample class, nobody added yet.
const DEMO: FriendPlayer[] = RANKING.map((r, i) => ({
  id: r.player.id, nickname: r.player.name, avatar_url: null, avatar_card: null, title_name: null,
  frame_item_id: null, name_effect_item_id: null, level: 6 - i, friend: 'none',
}));

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** One player line: picture, name (opens their profile), level, title, and an action on the right. */
export function PlayerRow({ p, children }: { p: FriendPlayer; children?: ReactNode }) {
  const chip = playerChip(p.id, p.nickname, p.avatar_url);
  return (
    <li className={s.row}>
      <Link to={`/jogador/${p.id}`} className={s.who}>
        <Avatar initials={chip.initials} hue={chip.hue} size="40px" url={chip.avatar} />
        <span className={s.whoText}>
          <strong>{p.nickname}</strong>
          <span>
            {p.level ? `Nível ${p.level}` : 'Nível 1'}
            {p.title_name ? ` · ${p.title_name}` : ''}
          </span>
        </span>
      </Link>
      <span className={s.action}>{children}</span>
    </li>
  );
}

export function FriendsPage() {
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 250);
  const friends = useFriends();
  const search = useSearchPlayers(query);
  const lists = isLive ? friends.data ?? { friends: [], incoming: [], outgoing: [] } : { friends: [], incoming: [], outgoing: [] };
  const results = isLive ? search.data ?? [] : DEMO.filter((p) => p.nickname.toLowerCase().includes(query.toLowerCase()));
  const trades = useTrades().data ?? { incoming: [], outgoing: [] };
  const duels = useChallenges().data ?? { incoming: [], outgoing: [], recent: [] };
  const gifts = useGifts().data ?? [];
  const waiting = trades.incoming.length + duels.incoming.length;
  const sent = trades.outgoing.length + duels.outgoing.length;

  return (
    <div className="page">
      <p className="page-sub">Adicione a turma, troque repetidas, dê presentes e desafie para duelos. Abra o perfil de um amigo para começar.</p>
      <div className={s.layout}>
        <div className={s.col}>
          {waiting > 0 && (
            <section className={`panel ${s.box} ${s.incoming}`} aria-labelledby="todo-title">
              <h2 id="todo-title" className={s.boxTitle}>
                Esperando você <span className={s.count}>{waiting}</span>
              </h2>
              <ul className={s.list}>
                {trades.incoming.map((t) => (
                  <TradeItem key={t.id} t={t} incoming />
                ))}
                {duels.incoming.map((c) => (
                  <ChallengeItem key={c.id} c={c} incoming />
                ))}
              </ul>
            </section>
          )}
          {lists.incoming.length > 0 && (
            <section className={`panel ${s.box} ${s.incoming}`} aria-labelledby="in-title">
              <h2 id="in-title" className={s.boxTitle}>
                Pedidos recebidos <span className={s.count}>{lists.incoming.length}</span>
              </h2>
              <ul className={s.list}>
                {lists.incoming.map((p) => (
                  <PlayerRow key={p.id} p={p}>
                    <FriendButton id={p.id} status="incoming" small />
                  </PlayerRow>
                ))}
              </ul>
            </section>
          )}

          <section className={`panel ${s.box}`} aria-labelledby="friends-title">
            <h2 id="friends-title" className={s.boxTitle}>
              Seus amigos <span className={s.count}>{lists.friends.length}</span>
            </h2>
            {isLive && friends.isLoading ? (
              <p className="hint">Carregando…</p>
            ) : lists.friends.length === 0 ? (
              <p className={s.empty}>Nenhum amigo ainda. Procure alguém da turma ao lado e mande um pedido.</p>
            ) : (
              <ul className={s.list}>
                {lists.friends.map((p) => (
                  <PlayerRow key={p.id} p={p}>
                    <Link to={`/jogador/${p.id}`} className="btn btn-secondary btn-sm">
                      Ver perfil
                    </Link>
                  </PlayerRow>
                ))}
              </ul>
            )}
          </section>

          {gifts.length > 0 && (
            <section className={`panel ${s.box}`} aria-labelledby="gifts-title">
              <h2 id="gifts-title" className={s.boxTitle}>
                Presentes recebidos
              </h2>
              <ul className={x.pickGrid}>
                {gifts.map((g) => (
                  <li key={g.id} className={x.mini}>
                    <CardView entry={g.card.known ? { owned: true, quantity: 1, card: g.card.card } : { owned: false, quantity: 0, card: g.card.card }} size="s" />
                    <span className={x.pickNote}>de {g.from.nickname}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {duels.recent.length > 0 && (
            <section className={`panel ${s.box}`} aria-labelledby="duels-title">
              <h2 id="duels-title" className={s.boxTitle}>
                Últimos duelos
              </h2>
              <ul className={s.list}>
                {duels.recent.slice(0, 3).map((c) => (
                  <li key={c.id} className={x.item}>
                    <DuelResult duel={c} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sent > 0 && (
            <section className={`panel ${s.box}`} aria-labelledby="sent-title">
              <h2 id="sent-title" className={s.boxTitle}>
                Trocas e desafios enviados
              </h2>
              <ul className={s.list}>
                {trades.outgoing.map((t) => (
                  <TradeItem key={t.id} t={t} incoming={false} />
                ))}
                {duels.outgoing.map((c) => (
                  <ChallengeItem key={c.id} c={c} incoming={false} />
                ))}
              </ul>
            </section>
          )}

          {lists.outgoing.length > 0 && (
            <section className={`panel ${s.box}`} aria-labelledby="out-title">
              <h2 id="out-title" className={s.boxTitle}>
                Pedidos enviados
              </h2>
              <ul className={s.list}>
                {lists.outgoing.map((p) => (
                  <PlayerRow key={p.id} p={p}>
                    <FriendButton id={p.id} status="outgoing" small />
                  </PlayerRow>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className={`panel ${s.box}`} aria-labelledby="find-title">
          <h2 id="find-title" className={s.boxTitle}>
            Encontrar jogadores
          </h2>
          <label htmlFor="find" className="visually-hidden">
            Procurar pelo apelido
          </label>
          <input id="find" className="input" type="search" placeholder="Procurar pelo apelido" value={q} onChange={(e) => setQ(e.target.value)} />
          {isLive && search.isError ? (
            <p className={s.empty}>Não deu para buscar agora. Tente de novo.</p>
          ) : results.length === 0 ? (
            <p className={s.empty}>{query ? `Ninguém com "${query}" no apelido.` : 'Ainda não tem mais ninguém por aqui.'}</p>
          ) : (
            <ul className={s.list}>
              {results.map((p) => (
                <PlayerRow key={p.id} p={p}>
                  {p.friend === 'friends' ? <span className={s.tag}>Amigos</span> : <FriendButton id={p.id} status={p.friend} small />}
                </PlayerRow>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
