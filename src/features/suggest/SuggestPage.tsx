import { SUGGESTIONS } from '@/design/sample';
import { IconUpload } from '@/ui/icons';
import { useState } from 'react';
import { isLive, useCreateSuggestion, useMySuggestions } from '@/data/live';
import { checkImage } from '@/data/upload';
import s from './SuggestPage.module.css';

const STATUS = {
  pending: { label: 'Em análise', cls: 'status-pending' },
  approved: { label: 'Virou carta', cls: 'status-approved' },
  rejected: { label: 'Recusada', cls: 'status-rejected' },
} as const;

export function SuggestPage() {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  function pick(file: File | undefined) {
    if (!file) return;
    const problem = checkImage(file);
    setPhotoError(problem);
    setPhoto(problem ? null : file);
  }
  const mine = useMySuggestions();
  const create = useCreateSuggestion();
  const list = isLive ? mine.data ?? [] : SUGGESTIONS;
  const tooShort = text.trim().length < 10;
  function send() {
    if (tooShort) return;
    if (!isLive) return setDone(true);
    create.mutate({ text: text.trim(), image: photo }, { onSuccess: () => (setText(''), setPhoto(null), setDone(true)) });
  }
  return (
    <div className="page">
      <p className="page-sub">Dá a ideia de uma carta nova: conta a piada, o admin decide a raridade. Se entrar, vira carta para a turma inteira.</p>
      <div className={s.layout}>
        <form className={`panel ${s.form}`} onSubmit={(e) => (e.preventDefault(), send())}>
          <div className="field">
            <label htmlFor="joke">Sua ideia</label>
            <textarea id="joke" className="input" placeholder="Ex.: o dia em que o projetor ligou sozinho no meio da prova" maxLength={280} value={text} onChange={(e) => (setText(e.target.value), setDone(false))} />
            <span className="hint">De 10 a 280 caracteres.</span>
          </div>
          <label className={s.drop}>
            <IconUpload size={24} />
            <strong>{photo ? photo.name : 'Adicionar uma foto'}</strong>
            <span>{photoError ?? (photo ? 'Toque para trocar.' : 'JPG, PNG ou WebP, até 2 MB. Opcional.')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <div className={s.formFoot}>
            <span className="hint">Só você e o admin veem suas ideias.</span>
            {done && <span role="status" className="hint">Enviada! O admin vai avaliar.</span>}
            {create.isError && <span role="alert" className="hint" style={{ color: 'var(--color-error)' }}>Não deu para enviar. Tente de novo.</span>}
            <button type="submit" className="btn btn-primary" disabled={tooShort || create.isPending}>
              Enviar ideia
            </button>
          </div>
        </form>

        <section className={`panel ${s.list}`} aria-labelledby="mine">
          <h2 id="mine" className="section-title">
            Suas ideias
          </h2>
          <ul className={s.items}>
            {list.length === 0 && <li className="hint">Você ainda não deu nenhuma ideia.</li>}
            {list.map((sug) => (
              <li key={sug.id} className={s.item}>
                <span className={`status ${STATUS[sug.status].cls}`}>{STATUS[sug.status].label}</span>
                <p>{sug.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
