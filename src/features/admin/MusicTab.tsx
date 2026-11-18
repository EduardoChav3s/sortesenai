import { useState, type FormEvent } from 'react';
import { IconUpload } from '@/ui/icons';
import { checkAudio } from '@/data/upload';
import { isLive, useAdminTracks, useMusicActions } from '@/data/live';
import type { MusicSlot } from '@/data/api';
import s from './AdminPage.module.css';

const SLOTS: { id: MusicSlot; label: string; note: string }[] = [
  { id: 'login', label: 'Tela de login', note: 'Tocam em sequência, baixinho, enquanto a pessoa entra.' },
  { id: 'lendario', label: 'Carta Lendária', note: 'Uma delas toca quando alguém tira uma Lendária.' },
  { id: 'mitico', label: 'Carta Mítica', note: 'Uma delas toca quando alguém tira uma Mítica.' },
];

function AddTrack() {
  const { add } = useMusicActions();
  const [title, setTitle] = useState('');
  const [slot, setSlot] = useState<MusicSlot>('login');
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  function pick(f: File | undefined) {
    if (!f) return;
    const p = checkAudio(f);
    setProblem(p);
    setFile(p ? null : f);
    if (!p && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 80));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !title.trim() || !isLive) return;
    add.mutate(
      { title: title.trim(), slot, file },
      {
        onSuccess: () => {
          setDone(`"${title.trim()}" adicionada em ${SLOTS.find((x) => x.id === slot)!.label}.`);
          setTitle('');
          setFile(null);
        },
      },
    );
  }
  return (
    <form className={`panel ${s.newCard}`} onSubmit={submit} aria-label="Adicionar música">
      <h2 className={s.formTitle}>Adicionar música</h2>
      <div className={s.musicFields}>
        <div className="field">
          <span className={s.fieldLabel}>Arquivo</span>
          <label className={`btn btn-secondary btn-sm ${s.pickPhoto}`}>
            <IconUpload size={16} />
            {file ? 'Trocar arquivo' : 'Escolher música'}
            <input
              type="file"
              accept="audio/*"
              className="visually-hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <span className={problem ? s.coinsError : 'hint'}>{problem ?? (file ? file.name : 'MP3, OGG, WAV ou M4A até 15 MB.')}</span>
        </div>
        <div className="field">
          <label htmlFor="mu-title">Nome</label>
          <input id="mu-title" className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Tema da turma" />
        </div>
        <div className="field">
          <label htmlFor="mu-slot">Toca em</label>
          <select id="mu-slot" className="input" value={slot} onChange={(e) => setSlot(e.target.value as MusicSlot)}>
            {SLOTS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <span className="hint">{SLOTS.find((x) => x.id === slot)!.note}</span>
        </div>
      </div>
      {add.isError && <p role="alert" className={s.error}>{add.error instanceof Error ? add.error.message : 'Não deu para salvar.'}</p>}
      {done && !add.isPending && (
        <p role="status" className={s.notice}>
          {done}
        </p>
      )}
      <div className={s.formActions}>
        <button type="submit" className="btn btn-primary" disabled={!file || !title.trim() || add.isPending}>
          {add.isPending ? 'Enviando…' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}

export function MusicTab() {
  const tracks = useAdminTracks();
  const { remove } = useMusicActions();
  const [asking, setAsking] = useState<string | null>(null);
  const list = tracks.data ?? [];
  return (
    <>
      <p className="page-sub">As músicas ficam numa pasta pública: qualquer pessoa com o link consegue ouvir. Use só músicas que a turma pode ouvir.</p>
      <AddTrack />
      {remove.isError && <p role="alert" className={s.error}>Não deu para apagar. Tente de novo.</p>}
      {SLOTS.map((slot) => {
        const mine = list.filter((t) => t.slot === slot.id);
        return (
          <section key={slot.id} className={`panel ${s.musicSlot}`} aria-labelledby={`slot-${slot.id}`}>
            <h2 id={`slot-${slot.id}`} className={s.formTitle}>
              {slot.label} <span className={s.tabCountNeutral}>{mine.length}</span>
            </h2>
            {isLive && tracks.isLoading ? (
              <p className="hint">Carregando…</p>
            ) : mine.length === 0 ? (
              <p className="hint">{slot.id === 'login' ? 'Nenhuma música. A tela de login fica em silêncio.' : 'Nenhuma música. Toca o som curto de sempre.'}</p>
            ) : (
              <ul className={s.trackList}>
                {mine.map((t) => (
                  <li key={t.id} className={s.track}>
                    <strong className={s.trackTitle}>{t.title}</strong>
                    <audio className={s.trackAudio} src={t.url} controls preload="none" />
                    {asking === t.id ? (
                      <span className={s.confirm}>
                        <button type="button" className="btn btn-danger btn-sm" disabled={remove.isPending} onClick={() => remove.mutate(t.id, { onSettled: () => setAsking(null) })}>
                          {remove.isPending ? 'Apagando…' : 'Sim, apagar'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(null)}>
                          Não
                        </button>
                      </span>
                    ) : (
                      <button type="button" className={`btn btn-secondary btn-sm ${s.dangerText}`} onClick={() => setAsking(t.id)}>
                        Apagar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
