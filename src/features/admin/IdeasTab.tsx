import { useState, type FormEvent } from 'react';
import { CardView } from '@/ui/CardView';
import { Avatar } from '@/ui/Avatar';
import { formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { isLive, playerChip, useAdminActions, useAdminSuggestions } from '@/data/live';
import type { AdminSuggestion } from '@/data/api';
import s from './AdminPage.module.css';

type Status = 'pending' | 'approved' | 'rejected';
const STATUS: { id: Status; label: string }[] = [
  { id: 'pending', label: 'Novas' },
  { id: 'approved', label: 'Viraram carta' },
  { id: 'rejected', label: 'Recusadas' },
];

const SAMPLE: AdminSuggestion[] = [
  { id: 'i1', text: 'O dia em que o alarme de incêndio tocou na prova.', image_path: null, image_url: null, status: 'pending', admin_note: null, created_at: new Date().toISOString(), author: { id: 'p2', nickname: 'ana', avatar_url: null } },
];

const when = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

/** Turn an idea into a card: the admin sets title, joke and rarity, and may keep the idea's photo. */
function ApproveForm({ idea, onDone }: { idea: AdminSuggestion; onDone: (msg: string) => void }) {
  const { approveIdea } = useAdminActions();
  const [title, setTitle] = useState('');
  const [joke, setJoke] = useState(idea.text);
  const [odds, setOdds] = useState('100');
  const [usePhoto, setUsePhoto] = useState(!!idea.image_path);
  const n = Number(odds);
  const oddsOk = Number.isInteger(n) && n >= 10 && n <= 10_000_000_000;
  const valid = title.trim() && joke.trim() && oddsOk;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !isLive) return;
    approveIdea.mutate(
      { id: idea.id, title: title.trim(), joke: joke.trim(), odds_n: n, image_path: idea.image_path, usePhoto },
      {
        onSuccess: (r) =>
          onDone(`"${title.trim()}" virou carta${usePhoto && idea.image_path && !r.photoCopied ? ', mas a foto não foi copiada. Ponha uma em Cartas > Editar.' : '.'}`),
      },
    );
  }
  return (
    <form className={s.approve} onSubmit={submit} aria-label="Virar carta">
      <div className={s.newCardFields}>
        <div className="field">
          <label htmlFor={`ap-title-${idea.id}`}>Título da carta</label>
          <input id={`ap-title-${idea.id}`} className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor={`ap-joke-${idea.id}`}>Piada</label>
          <input id={`ap-joke-${idea.id}`} className="input" value={joke} maxLength={280} onChange={(e) => setJoke(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`ap-odds-${idea.id}`}>Raridade: 1 em</label>
          <input id={`ap-odds-${idea.id}`} className="input" inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value.replace(/\D/g, ''))} />
          <span className="hint">{oddsOk ? `${formatOdds(n)}, ${TIER_LABEL[rarityTier(n)]}` : 'Entre 10 e 10.000.000.000.'}</span>
        </div>
        {idea.image_path && (
          <label className={s.check}>
            <input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} />
            Usar a foto que veio com a ideia
          </label>
        )}
      </div>
      <div className={s.preview}>
        <CardView
          entry={{ owned: true, quantity: 1, card: { id: idea.id, odds_n: oddsOk ? n : 10, active: true, title: title.trim() || 'Título da carta', joke: joke.trim() || 'A piada aparece aqui.', image_url: usePhoto ? idea.image_url : null } }}
          size="m"
        />
      </div>
      {approveIdea.isError && <p role="alert" className={s.error}>Não deu para aprovar. Confira os campos.</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDone('')}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!valid || approveIdea.isPending}>
          {approveIdea.isPending ? 'Criando…' : 'Virar carta'}
        </button>
      </div>
    </form>
  );
}

function RejectForm({ idea, onDone }: { idea: AdminSuggestion; onDone: (msg: string) => void }) {
  const { rejectIdea } = useAdminActions();
  const [note, setNote] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isLive) return;
    rejectIdea.mutate({ id: idea.id, note }, { onSuccess: () => onDone('Ideia recusada.') });
  }
  return (
    <form className={s.reject} onSubmit={submit} aria-label="Recusar ideia">
      <div className="field">
        <label htmlFor={`rj-${idea.id}`}>Motivo (opcional, quem mandou vê)</label>
        <input id={`rj-${idea.id}`} className="input" value={note} maxLength={140} placeholder="Ex.: já tem uma carta parecida" onChange={(e) => setNote(e.target.value)} autoFocus />
      </div>
      {rejectIdea.isError && <p role="alert" className={s.error}>Não deu para recusar. Tente de novo.</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDone('')}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-danger btn-sm" disabled={rejectIdea.isPending}>
          {rejectIdea.isPending ? 'Recusando…' : 'Recusar ideia'}
        </button>
      </div>
    </form>
  );
}

export function IdeasTab() {
  const [status, setStatus] = useState<Status>('pending');
  const live = useAdminSuggestions(status);
  const [open, setOpen] = useState<{ id: string; mode: 'approve' | 'reject' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ideas = isLive ? live.data ?? [] : status === 'pending' ? SAMPLE : [];
  const done = (msg: string) => {
    setOpen(null);
    setNotice(msg || null);
  };
  return (
    <>
      <div className={s.top}>
        <div className="segmented" role="group" aria-label="Mostrar ideias">
          {STATUS.map((st) => (
            <button key={st.id} type="button" aria-pressed={status === st.id} onClick={() => (setStatus(st.id), setOpen(null), setNotice(null))}>
              {st.label}
            </button>
          ))}
        </div>
      </div>
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      {isLive && live.isLoading ? (
        <p className="hint">Carregando ideias…</p>
      ) : isLive && live.isError ? (
        <p role="alert" className={s.error}>Não deu para carregar as ideias.</p>
      ) : ideas.length === 0 ? (
        <p className="page-sub">{status === 'pending' ? 'Nenhuma ideia nova. Quando a turma mandar, ela aparece aqui.' : 'Nada por aqui ainda.'}</p>
      ) : (
        <ul className={s.ideas}>
          {ideas.map((idea) => {
            const chip = idea.author ? playerChip(idea.author.id, idea.author.nickname, idea.author.avatar_url) : null;
            const isOpen = open?.id === idea.id;
            return (
              <li key={idea.id} className={`panel ${s.idea}`}>
                <div className={s.ideaHead}>
                  {chip && <Avatar initials={chip.initials} hue={chip.hue} size="32px" url={chip.avatar} />}
                  <span className={s.ideaWho}>
                    <strong>{idea.author?.nickname ?? 'Jogador que saiu'}</strong>
                    <span>{when(idea.created_at)}</span>
                  </span>
                </div>
                <div className={s.ideaBody}>
                  <p className={s.ideaText}>{idea.text}</p>
                  {idea.image_url && <img className={s.ideaPhoto} src={idea.image_url} alt="Foto enviada com a ideia" />}
                </div>
                {idea.admin_note && <p className="hint">Motivo: {idea.admin_note}</p>}
                {status === 'pending' && !isOpen && (
                  <div className={s.rowButtons}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => (setNotice(null), setOpen({ id: idea.id, mode: 'approve' }))}>
                      Aprovar
                    </button>
                    <button type="button" className={`btn btn-secondary btn-sm ${s.dangerText}`} onClick={() => (setNotice(null), setOpen({ id: idea.id, mode: 'reject' }))}>
                      Recusar
                    </button>
                  </div>
                )}
                {isOpen && open.mode === 'approve' && <ApproveForm idea={idea} onDone={done} />}
                {isOpen && open.mode === 'reject' && <RejectForm idea={idea} onDone={done} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
