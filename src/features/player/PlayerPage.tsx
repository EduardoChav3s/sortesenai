import { Link, Navigate, useParams } from 'react-router-dom';
import { CardView } from '@/ui/CardView';
import { Avatar } from '@/ui/Avatar';
import { formatOdds } from '@/lib/format';
import { isLive, playerChip, usePlayer, usePlayerCollection } from '@/data/live';
import type { CollectionEntry } from '@/data/types';
import { FriendButton } from '@/features/friends/FriendButton';
import p from '@/features/profile/ProfilePage.module.css';
import s from './PlayerPage.module.css';

/** Someone else's album page: who they are, their level and every card they own. */
export function PlayerPage() {
  const { id = '' } = useParams();
  const view = usePlayer(id);
  const cards = usePlayerCollection(id);

  if (!isLive) return <p className="page-sub">Entre com sua conta para ver o perfil da turma.</p>;
  if (view.isLoading) return <p className="page-sub">Abrindo o perfil…</p>;
  if (view.isError || !view.data)
    return (
      <div className={`panel ${s.missing}`}>
        <p className="section-title">Jogador não encontrado</p>
        <p className="page-sub">Pode ter saído da turma ou o link está errado.</p>
        <Link to="/amigos" className="btn btn-secondary">
          Voltar para Amigos
        </Link>
      </div>
    );
  if (view.data.is_me) return <Navigate to="/perfil" replace />;

  const { profile, stats, titles, friend } = view.data;
  const chip = playerChip(profile.id, profile.nickname, profile.avatar_url);
  const showcase: CollectionEntry[] = (profile.showcase ?? []).map((c) => ({
    owned: true, quantity: 1,
    card: { id: c.id, odds_n: Number(c.odds_n), active: c.active, title: c.title ?? '', joke: c.joke ?? '', image_url: (c as { image_url?: string | null }).image_url ?? null },
  }));
  const owned = cards.data ?? [];
  const known = owned.filter((e) => e.known).length;

  return (
    <div className="page">
      <section className={`panel ${p.hero}`}>
        <div className={p.banner} style={profile.banner_url ? { backgroundImage: `url("${profile.banner_url}")` } : undefined} />
        <div className={p.who}>
          <span className={`${p.avatarRing} ${s.ring}`}>
            <Avatar initials={chip.initials} hue={chip.hue} size="96px" url={chip.avatar} />
            <span className={s.level} aria-label={`Nível ${profile.level ?? 1}`}>
              {profile.level ?? 1}
            </span>
          </span>
          <div className={p.id}>
            <h2 className={p.name}>{profile.nickname}</h2>
            {profile.title_name && <span className={p.title}>{profile.title_name}</span>}
            <p className={p.bio}>{profile.bio || 'Sem bio ainda.'}</p>
          </div>
          <FriendButton id={profile.id} status={friend} />
        </div>
      </section>

      <div className={p.stats}>
        <div className={`panel ${p.stat}`}>
          <span className={p.statValue}>Nível {profile.level ?? 1}</span>
          <span className={p.statLabel}>{stats.pulls.toLocaleString('pt-BR')} roletadas</span>
        </div>
        <div className={`panel ${p.stat}`}>
          <span className={p.statValue}>{stats.collection_pct}%</span>
          <span className={p.statLabel}>da coleção</span>
        </div>
        <div className={`panel ${p.stat}`}>
          <span className={p.statValue}>{stats.rarest_odds ? formatOdds(Number(stats.rarest_odds), { compact: true }) : 'nenhuma'}</span>
          <span className={p.statLabel}>maior raridade tirada</span>
        </div>
      </div>

      {showcase.length > 0 && (
        <section className={p.section}>
          <h2 className="section-title">Vitrine</h2>
          <div className={p.showcase}>
            {showcase.map((e) => (
              <CardView key={e.card.id} entry={e} size="m" />
            ))}
          </div>
        </section>
      )}

      {titles.length > 0 && (
        <section className={p.section}>
          <h2 className="section-title">Títulos</h2>
          <div className={p.titles}>
            {titles.map((t) => (
              <span key={t.id} className={s.titleChip}>
                {t.name}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className={p.section} aria-labelledby="their-cards">
        <h2 id="their-cards" className="section-title">
          Cartas de {profile.nickname} <span className={s.count}>{owned.length}</span>
        </h2>
        {owned.length > known && (
          <p className="hint">Cartas que você ainda não tem aparecem fechadas: dá para ver a raridade, mas a piada fica em segredo até você tirar.</p>
        )}
        {cards.isLoading ? (
          <p className="hint">Abrindo o álbum…</p>
        ) : owned.length === 0 ? (
          <p className="page-sub">Ainda não tirou nenhuma carta.</p>
        ) : (
          <ul className={s.grid}>
            {owned.map((e) => (
              <li key={e.card.id} className={s.cell}>
                <CardView
                  entry={e.known ? { owned: true, quantity: e.quantity, card: e.card } : { owned: false, quantity: 0, card: e.card }}
                  size="s"
                  showQuantity={e.known}
                />
                <span className={s.caption}>{e.known ? `Tem ${e.quantity}` : `Tem ${e.quantity} · você não tem`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
