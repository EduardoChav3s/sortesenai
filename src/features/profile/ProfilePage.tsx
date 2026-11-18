import { useState, type CSSProperties, type FormEvent } from 'react';
import { CardView } from '@/ui/CardView';
import { COLLECTION, ME } from '@/design/sample';
import { formatOdds } from '@/lib/format';
import { IconUpload } from '@/ui/icons';
import { isLive, playerChip, useMyProfile, useUpdateProfile } from '@/data/live';
import { isApiError } from '@/data/errors';
import { checkImage } from '@/data/upload';
import type { CollectionEntry } from '@/data/types';
import s from './ProfilePage.module.css';

const SHOWCASE = [COLLECTION[11], COLLECTION[9], COLLECTION[7]];

function saveError(e: unknown) {
  if (isApiError(e) && e.code === 'nickname_taken') return 'Esse apelido já é de outra pessoa.';
  if (isApiError(e) && e.code === 'invalid') return 'Confira os campos: apelido de 3 a 20 letras, números ou _.';
  return e instanceof Error && !isApiError(e) ? e.message : 'Não deu para salvar. Tente de novo.';
}

function EditForm({ nickname, bio, onDone }: { nickname: string; bio: string; onDone: () => void }) {
  const save = useUpdateProfile();
  const [nick, setNick] = useState(nickname);
  const [text, setText] = useState(bio);
  const nickOk = /^[A-Za-z0-9_]{3,20}$/.test(nick);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!nickOk) return;
    if (!isLive) return onDone();
    save.mutate({ nickname: nick, bio: text.trim() }, { onSuccess: onDone });
  }
  return (
    <form className={`panel ${s.edit}`} onSubmit={submit}>
      <div className="field">
        <label htmlFor="pf-nick">Apelido</label>
        <input id="pf-nick" className="input" value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} />
        <span className="hint">{nickOk ? 'Aparece no ranking e no mural.' : 'De 3 a 20 letras, números ou _.'}</span>
      </div>
      <div className="field">
        <label htmlFor="pf-bio">Bio</label>
        <textarea id="pf-bio" className="input" value={text} maxLength={160} onChange={(e) => setText(e.target.value)} />
        <span className="hint">{text.length}/160</span>
      </div>
      {save.isError && <p role="alert" className={s.error}>{saveError(save.error)}</p>}
      <div className={s.editActions}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={!nickOk || save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

export function ProfilePage() {
  const [editing, setEditing] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const update = useUpdateProfile();
  function pickBanner(file: File | undefined) {
    if (!file) return;
    const problem = checkImage(file);
    setBannerError(problem);
    if (problem || !isLive) return;
    update.mutate({ banner: file }, { onError: (e) => setBannerError(saveError(e)) });
  }
  function chooseTitle(id: string | null) {
    if (isLive) update.mutate({ title_id: id });
  }
  const live = useMyProfile();
  const p = live.data;
  const me = isLive && p ? { ...playerChip(p.profile.id, p.profile.nickname), title: p.profile.title_name } : ME;
  const bio = isLive ? p?.profile.bio || 'Sem bio ainda.' : '[exemplo] Ainda atrás do grampeador mítico. Aceito poções emprestadas.';
  const stats = isLive
    ? { pulls: p?.stats.pulls ?? 0, pct: p?.stats.collection_pct ?? 0, rarest: p?.stats.rarest_odds ?? null }
    : { pulls: 1240, pct: 61, rarest: 400_000_000 };
  const showcase: CollectionEntry[] = isLive
    ? (p?.profile.showcase ?? []).map((c) => ({ owned: true, quantity: 1, card: { id: c.id, odds_n: Number(c.odds_n), active: c.active, title: c.title ?? '', joke: c.joke ?? '', image_url: (c as { image_url?: string | null }).image_url ?? null } }))
    : SHOWCASE;
  const titles = isLive
    ? (p?.titles ?? []).map((t) => ({ id: t.id, name: t.name }))
    : ['Colecionador 30%', 'Primeira 1/1 mil', '100 roletadas', 'Madrugador'].map((name, i) => ({ id: String(i), name }));
  const bannerUrl = isLive ? p?.profile.banner_url ?? null : null;
  return (
    <div className="page">
      <section className={`panel ${s.hero}`}>
        <div className={s.banner} style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : undefined}>
          <label className={`btn btn-secondary btn-sm ${s.bannerBtn}`} aria-disabled={update.isPending}>
            <IconUpload size={16} />
            {update.isPending && update.variables?.banner ? 'Enviando…' : 'Trocar banner'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              disabled={update.isPending}
              onChange={(e) => {
                pickBanner(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className={s.who}>
          <span className={s.avatarRing}>
            <span className="avatar" style={{ '--hue': me.hue, '--size': '96px' } as CSSProperties}>
              {me.initials}
            </span>
          </span>
          <div className={s.id}>
            <h2 className={s.name}>{me.name}</h2>
            {me.title && <span className={s.title}>{me.title}</span>}
            <p className={s.bio}>{bio}</p>
          </div>
          {!editing && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
              Editar perfil
            </button>
          )}
        </div>
        {bannerError && (
          <p role="alert" className={`${s.error} ${s.heroError}`}>
            {bannerError}
          </p>
        )}
      </section>
      {editing && <EditForm nickname={me.name} bio={isLive ? p?.profile.bio ?? '' : ''} onDone={() => setEditing(false)} />}

      <div className={s.stats}>
        <div className={`panel ${s.stat}`}>
          <span className={s.statValue}>{stats.pulls.toLocaleString('pt-BR')}</span>
          <span className={s.statLabel}>roletadas</span>
        </div>
        <div className={`panel ${s.stat}`}>
          <span className={s.statValue}>{stats.pct}%</span>
          <span className={s.statLabel}>da coleção</span>
        </div>
        <div className={`panel ${s.stat}`}>
          <span className={s.statValue}>{stats.rarest ? formatOdds(stats.rarest, { compact: true }) : 'nenhuma'}</span>
          <span className={s.statLabel}>maior raridade tirada</span>
        </div>
      </div>

      <section className={s.section}>
        <h2 className="section-title">Vitrine</h2>
        <div className={s.showcase}>
          {showcase.length === 0 && <p className="page-sub">Escolha até 3 figurinhas para mostrar aqui.</p>}
          {showcase.map((e) => (
            <CardView key={e.card.id} entry={e} size="m" />
          ))}
        </div>
      </section>

      <section className={s.section}>
        <h2 className="section-title">Títulos</h2>
        <div className={s.titles}>
          {titles.length === 0 && <p className="page-sub">Nenhum título ainda. Roletar e jogar desbloqueia títulos.</p>}
          {titles.length > 0 && <p className="hint" style={{ flexBasis: '100%' }}>Toque num título para mostrar ao lado do seu nome.</p>}
          {titles.map((t) => {
            const using = me.title === t.name;
            return (
              <button
                key={t.id}
                type="button"
                className={s.titleChip}
                aria-pressed={using}
                disabled={update.isPending}
                onClick={() => chooseTitle(using ? null : t.id)}
                title={using ? 'Tirar do perfil' : 'Usar no perfil'}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
