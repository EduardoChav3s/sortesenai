import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { CardView } from '@/ui/CardView';
import { IconUpload } from '@/ui/icons';
import { checkImage } from '@/data/upload';
import { isApiError } from '@/data/errors';
import { COLLECTION } from '@/design/sample';
import { formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { isLive, useAdminActions, useAdminCards, useRole } from '@/data/live';
import type { CardContent } from '@/data/types';
import s from './AdminPage.module.css';


const SAMPLE_CARDS: CardContent[] = COLLECTION.filter((e) => e.owned).map((e) => e.card as CardContent);

/** Object url for a picked file, freed when it changes. */
function usePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

const saveError = (e: unknown) =>
  isApiError(e) ? 'Não deu para salvar. Confira os campos.' : e instanceof Error ? e.message : 'Não deu para salvar.';

function PhotoInput({ label, onPick }: { label: string; onPick: (f: File) => void }) {
  return (
    <label className={`btn btn-secondary btn-sm ${s.pickPhoto}`}>
      <IconUpload size={16} />
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function NewCardForm({ onDone }: { onDone: () => void }) {
  const { upsertCard } = useAdminActions();
  const [title, setTitle] = useState('');
  const [joke, setJoke] = useState('');
  const [odds, setOdds] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const preview = usePreview(image);
  const n = Number(odds);
  const oddsOk = Number.isInteger(n) && n >= 10 && n <= 10_000_000_000;
  const valid = title.trim() && joke.trim() && oddsOk;
  function pick(file: File) {
    const problem = checkImage(file);
    setImageError(problem);
    setImage(problem ? null : file);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !isLive) return;
    upsertCard.mutate({ title: title.trim(), joke: joke.trim(), odds_n: n, image }, { onSuccess: onDone });
  }
  return (
    <form className={`panel ${s.newCard}`} onSubmit={submit}>
      <div className={s.newCardGrid}>
      <div className={s.newCardFields}>
      <div className="field">
        <label htmlFor="nc-title">Título</label>
        <input id="nc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      </div>
      <div className="field">
        <label htmlFor="nc-joke">Piada</label>
        <input id="nc-joke" className="input" value={joke} onChange={(e) => setJoke(e.target.value)} maxLength={280} />
      </div>
      <div className="field">
        <label htmlFor="nc-odds">Raridade: 1 em</label>
        <input id="nc-odds" className="input" inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value.replace(/\D/g, ''))} />
        <span className="hint">{oddsOk ? `${formatOdds(n)}, ${TIER_LABEL[rarityTier(n)]}` : 'Entre 10 e 10.000.000.000.'}</span>
      </div>
      <div className="field">
        <span className={s.fieldLabel}>Foto</span>
        <PhotoInput label={image ? 'Trocar foto' : 'Escolher foto'} onPick={pick} />
        <span className="hint">{imageError ?? (image ? image.name : 'JPG, PNG ou WebP até 2 MB. Opcional, mas fica bem melhor.')}</span>
      </div>
      </div>
      <div className={s.preview}>
        <CardView
          entry={{ owned: true, quantity: 1, card: { id: 'preview', odds_n: oddsOk ? n : 10, active: true, title: title.trim() || 'Título da carta', joke: joke.trim() || 'A piada aparece aqui.', image_url: preview } }}
          size="m"
        />
        <span className="hint">Prévia: assim a turma vai ver.</span>
      </div>
      </div>
      {upsertCard.isError && <p role="alert" className={s.error}>{saveError(upsertCard.error)}</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={!valid || upsertCard.isPending}>
          {upsertCard.isPending ? 'Salvando…' : 'Salvar carta'}
        </button>
      </div>
    </form>
  );
}

function CardsTab() {
  const live = useAdminCards();
  const { setActive, setImage } = useAdminActions();
  const [rowError, setRowError] = useState<string | null>(null);
  function changePhoto(c: CardContent, file: File) {
    const problem = checkImage(file);
    setRowError(problem);
    if (problem || !isLive) return;
    setImage.mutate({ card: c, image: file }, { onError: (e) => setRowError(saveError(e)) });
  }
  const [adding, setAdding] = useState(false);
  const cards = isLive ? (live.data ?? []) : SAMPLE_CARDS;
  return (
    <>
      <div className={s.top}>
        <p className="page-sub">{cards.length} cartas no álbum.</p>
        {!adding && (
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Nova carta
          </button>
        )}
      </div>
      {adding && <NewCardForm onDone={() => setAdding(false)} />}
      {rowError && <p role="alert" className={s.error}>{rowError}</p>}
      <div className={`panel ${s.tablePanel}`}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Carta</th>
              <th scope="col">Raridade</th>
              <th scope="col">Foto</th>
              <th scope="col">Ativa</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => {
              const tier = rarityTier(c.odds_n);
              return (
                <tr key={c.id}>
                  <td>
                    <span className={s.cardCell}>
                      {c.image_url ? (
                        <img className={s.thumb} src={c.image_url} alt="" />
                      ) : (
                        <span className={s.thumb} style={{ '--tint': `var(--tier-${tier})` } as CSSProperties} />
                      )}
                      {c.title}
                    </span>
                  </td>
                  <td>
                    <span className={s.odds}>{formatOdds(c.odds_n)}</span> {TIER_LABEL[tier]}
                  </td>
                  <td>
                    {setImage.isPending && setImage.variables?.card.id === c.id ? (
                      <span className="hint">Enviando…</span>
                    ) : (
                      <PhotoInput label={c.image_url ? 'Trocar' : 'Pôr foto'} onPick={(f) => changePhoto(c, f)} />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={c.active}
                      aria-label={`Carta ${c.title} ativa`}
                      className={s.switch}
                      disabled={!isLive || setActive.isPending}
                      onClick={() => setActive.mutate({ id: c.id, active: !c.active })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AdminPage() {
  const role = useRole();
  if (isLive && role.isLoading) return <p className="page-sub">Conferindo permissão…</p>;
  if (isLive && role.data !== 'admin')
    return (
      <div className="panel" style={{ padding: 'var(--space-xl)' }}>
        <p className="section-title">Só para admins</p>
        <p className="page-sub">Peça para o admin da turma liberar seu acesso.</p>
      </div>
    );
  return (
    <div className="page">
      <CardsTab />
    </div>
  );
}
