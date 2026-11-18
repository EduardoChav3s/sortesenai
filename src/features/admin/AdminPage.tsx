import { Fragment, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { CardView } from '@/ui/CardView';
import { Avatar } from '@/ui/Avatar';
import { IconUpload } from '@/ui/icons';
import { checkImage } from '@/data/upload';
import { isApiError } from '@/data/errors';
import { COLLECTION } from '@/design/sample';
import { formatCoins, formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { isLive, playerChip, useAdminActions, useAdminCards, useAdminPlayers, useAdminSuggestions, useMyProfile, useRole } from '@/data/live';
import { IdeasTab } from './IdeasTab';
import type { AdminPlayer } from '@/data/api';
import type { CardContent } from '@/data/types';
import { coinChange, type CoinMode } from './coinChange';
import s from './AdminPage.module.css';

const SAMPLE_CARDS: CardContent[] = COLLECTION.filter((e) => e.owned).map((e) => e.card as CardContent);
const SAMPLE_PLAYERS: AdminPlayer[] = [
  { id: 'p1', nickname: 'duda', email: 'duda@exemplo.com', avatar_url: null, coins: 12_480, role: 'admin', banned: false, cards_owned: 31 },
  { id: 'p2', nickname: 'ana', email: 'ana@exemplo.com', avatar_url: null, coins: 4_120, role: 'player', banned: false, cards_owned: 12 },
];
const TABS = ['Cartas', 'Ideias', 'Jogadores'] as const;
type Tab = (typeof TABS)[number];

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

// ---------------------------------------------------------------- cards
/** New card when `card` is empty, otherwise edits that card. A new photo is optional when editing. */
function CardForm({ card, onDone }: { card?: CardContent; onDone: () => void }) {
  const { upsertCard, editCard } = useAdminActions();
  const save = card ? editCard : upsertCard;
  const [title, setTitle] = useState(card?.title ?? '');
  const [joke, setJoke] = useState(card?.joke ?? '');
  const [odds, setOdds] = useState(card ? String(card.odds_n) : '');
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const preview = usePreview(image);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
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
    const base = { title: title.trim(), joke: joke.trim(), odds_n: n, image };
    if (card) editCard.mutate({ id: card.id, ...base }, { onSuccess: onDone });
    else upsertCard.mutate(base, { onSuccess: onDone });
  }
  const photo = preview ?? card?.image_url ?? null;
  return (
    <form ref={ref} className={`panel ${s.newCard}`} onSubmit={submit} aria-label={card ? `Editar ${card.title}` : 'Nova carta'}>
      <h2 className={s.formTitle}>{card ? `Editar: ${card.title}` : 'Nova carta'}</h2>
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
            {card && oddsOk && n !== card.odds_n && <span className="hint">Quem já tem a carta continua com ela. A nova raridade vale para as próximas roletadas.</span>}
          </div>
          <div className="field">
            <span className={s.fieldLabel}>Foto</span>
            <PhotoInput label={photo ? 'Trocar foto' : 'Escolher foto'} onPick={pick} />
            <span className="hint">{imageError ?? (image ? image.name : card ? 'Sem foto nova, fica a atual.' : 'JPG, PNG ou WebP até 2 MB. Opcional, mas fica bem melhor.')}</span>
          </div>
        </div>
        <div className={s.preview}>
          <CardView
            entry={{ owned: true, quantity: 1, card: { id: card?.id ?? 'preview', odds_n: oddsOk ? n : 10, active: true, title: title.trim() || 'Título da carta', joke: joke.trim() || 'A piada aparece aqui.', image_url: photo } }}
            size="m"
          />
          <span className="hint">Prévia: assim a turma vai ver.</span>
        </div>
      </div>
      {save.isError && <p role="alert" className={s.error}>{saveError(save.error)}</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={!valid || save.isPending}>
          {save.isPending ? 'Salvando…' : card ? 'Salvar mudanças' : 'Salvar carta'}
        </button>
      </div>
    </form>
  );
}

function CardsTab() {
  const live = useAdminCards();
  const { setActive, deleteCard } = useAdminActions();
  const [form, setForm] = useState<'new' | CardContent | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cards = isLive ? (live.data ?? []) : SAMPLE_CARDS;

  function remove(c: CardContent) {
    if (!isLive) return setConfirm(null);
    deleteCard.mutate(c.id, {
      onSuccess: (r) => {
        setConfirm(null);
        setNotice(`"${c.title}" foi apagada${r.owners ? ` e saiu do álbum de ${r.owners} ${r.owners === 1 ? 'jogador' : 'jogadores'}` : ''}.`);
        if (form !== 'new' && form?.id === c.id) setForm(null);
      },
    });
  }

  return (
    <>
      <div className={s.top}>
        <p className="page-sub">{cards.length} cartas no álbum.</p>
        {form !== 'new' && (
          <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
            Nova carta
          </button>
        )}
      </div>
      {form && <CardForm key={form === 'new' ? 'new' : form.id} card={form === 'new' ? undefined : form} onDone={() => setForm(null)} />}
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      {deleteCard.isError && (
        <p role="alert" className={s.error}>
          Não deu para apagar. Tente de novo.
        </p>
      )}
      <div className={`panel ${s.tablePanel}`}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Carta</th>
              <th scope="col">Raridade</th>
              <th scope="col">Ativa</th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => {
              const tier = rarityTier(c.odds_n);
              const asking = confirm === c.id;
              return (
                <tr key={c.id} data-asking={asking}>
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
                  <td className={s.actions}>
                    {asking ? (
                      <span className={s.confirm}>
                        <span className={s.confirmText}>Some do álbum de todo mundo. Apagar?</span>
                        <button type="button" className="btn btn-danger btn-sm" disabled={deleteCard.isPending} onClick={() => remove(c)}>
                          {deleteCard.isPending ? 'Apagando…' : 'Sim, apagar'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(null)}>
                          Não
                        </button>
                      </span>
                    ) : (
                      <span className={s.rowButtons}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setNotice(null), setForm(c))}>
                          Editar
                        </button>
                        <button type="button" className={`btn btn-secondary btn-sm ${s.dangerText}`} onClick={() => (setNotice(null), setConfirm(c.id))}>
                          Excluir
                        </button>
                      </span>
                    )}
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

// ---------------------------------------------------------------- players and coins
const MODES: { id: CoinMode; label: string; reason: string }[] = [
  { id: 'dar', label: 'Dar', reason: 'presente do admin' },
  { id: 'tirar', label: 'Tirar', reason: 'ajuste do admin' },
  { id: 'definir', label: 'Definir saldo', reason: 'saldo definido pelo admin' },
];

function CoinsForm({ player, onDone }: { player: AdminPlayer; onDone: (msg: string) => void }) {
  const { setCoins, adjustCoins } = useAdminActions();
  const [mode, setMode] = useState<CoinMode>('dar');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const change = coinChange(mode, amount, player.coins);
  const busy = setCoins.isPending || adjustCoins.isPending;
  const failed = setCoins.isError || adjustCoins.isError;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!change.ok || !isLive) return;
    const why = reason.trim() || MODES.find((m) => m.id === mode)!.reason;
    const done = () => onDone(`${player.nickname} agora tem ${formatCoins(change.after)} moedas.`);
    if (change.kind === 'set') setCoins.mutate({ id: player.id, coins: change.coins, reason: why }, { onSuccess: done });
    else adjustCoins.mutate({ id: player.id, amount: change.amount, reason: why }, { onSuccess: done });
  }
  return (
    <form className={s.coinsForm} onSubmit={submit} aria-label={`Moedas de ${player.nickname}`}>
      <div className="segmented" role="group" aria-label="O que fazer">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className={s.coinsFields}>
        <div className="field">
          <label htmlFor={`amt-${player.id}`}>{mode === 'definir' ? 'Novo saldo' : 'Quantas moedas'}</label>
          <input id={`amt-${player.id}`} className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} autoFocus />
        </div>
        <div className="field">
          <label htmlFor={`why-${player.id}`}>Motivo (opcional)</label>
          <input id={`why-${player.id}`} className="input" value={reason} maxLength={80} placeholder={MODES.find((m) => m.id === mode)!.reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <p className={amount === '' || change.ok ? 'hint' : s.coinsError}>
        {amount === '' ? `Agora tem ${formatCoins(player.coins)} moedas.` : change.ok ? `Vai ficar com ${formatCoins(change.after)} moedas.` : change.error}
      </p>
      {failed && <p role="alert" className={s.error}>Não deu para mudar o saldo. Tente de novo.</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDone('')}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!change.ok || busy}>
          {busy ? 'Salvando…' : 'Confirmar'}
        </button>
      </div>
    </form>
  );
}

function PlayersTab() {
  const live = useAdminPlayers();
  const me = useMyProfile();
  const { setBanned } = useAdminActions();
  const [open, setOpen] = useState<string | null>(null);
  const [banAsk, setBanAsk] = useState<string | null>(null);
  function toggleBan(p: AdminPlayer) {
    if (!isLive) return setBanAsk(null);
    setBanned.mutate(
      { id: p.id, banned: !p.banned },
      { onSuccess: () => (setBanAsk(null), setNotice(p.banned ? `${p.nickname} voltou a jogar.` : `${p.nickname} foi suspenso e não entra mais no site.`)) },
    );
  }
  const [notice, setNotice] = useState<string | null>(null);
  const players = isLive ? (live.data ?? []) : SAMPLE_PLAYERS;
  return (
    <>
      <p className="page-sub">{players.length} jogadores. Toda mudança de saldo fica no histórico de moedas do jogador.</p>
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      {isLive && live.isError && <p role="alert" className={s.error}>Não deu para carregar os jogadores.</p>}
      {setBanned.isError && <p role="alert" className={s.error}>Não deu para mudar o acesso. Tente de novo.</p>}
      <div className={`panel ${s.tablePanel}`}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Jogador</th>
              <th scope="col" className="num">
                Moedas
              </th>
              <th scope="col" className="num">
                Cartas
              </th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const chip = playerChip(p.id, p.nickname, p.avatar_url);
              return (
                <Fragment key={p.id}>
                  <tr data-open={open === p.id} data-asking={banAsk === p.id} data-banned={p.banned}>
                    <td>
                      <span className={s.cardCell}>
                        <Avatar initials={chip.initials} hue={chip.hue} size="32px" url={chip.avatar} />
                        <span className={s.playerText}>
                          <strong>
                            {p.nickname}
                            {p.role === 'admin' && <span className={s.badge}>admin</span>}
                            {p.banned && <span className={s.badge}>suspenso</span>}
                          </strong>
                          <span>{p.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className={`num ${s.odds}`}>{formatCoins(p.coins)}</td>
                    <td className="num">{p.cards_owned}</td>
                    <td className={s.actions}>
                      {banAsk === p.id ? (
                        <span className={s.confirm}>
                          <span className={s.confirmText}>{p.banned ? 'Liberar o acesso de novo?' : 'Tira o acesso ao site. Suspender?'}</span>
                          <button type="button" className={`btn ${p.banned ? 'btn-primary' : 'btn-danger'} btn-sm`} disabled={setBanned.isPending} onClick={() => toggleBan(p)}>
                            {setBanned.isPending ? 'Salvando…' : p.banned ? 'Sim, reativar' : 'Sim, suspender'}
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBanAsk(null)}>
                            Não
                          </button>
                        </span>
                      ) : (
                        open !== p.id && (
                          <span className={s.rowButtons}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setNotice(null), setOpen(p.id))}>
                              Moedas
                            </button>
                            {p.id !== me.data?.profile.id && (
                              <button type="button" className={`btn btn-secondary btn-sm ${p.banned ? '' : s.dangerText}`} onClick={() => (setNotice(null), setOpen(null), setBanAsk(p.id))}>
                                {p.banned ? 'Reativar' : 'Suspender'}
                              </button>
                            )}
                          </span>
                        )
                      )}
                    </td>
                  </tr>
                  {open === p.id && (
                    <tr className={s.formRow}>
                      <td colSpan={4}>
                        <CoinsForm
                          player={p}
                          onDone={(msg) => {
                            setOpen(null);
                            setNotice(msg || null);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
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
  const [tab, setTab] = useState<Tab>('Cartas');
  const newIdeas = useAdminSuggestions('pending').data?.length ?? 0;
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
      <div className="segmented" role="group" aria-label="Seção do admin">
        {TABS.map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
            {t === 'Ideias' && newIdeas > 0 && <span className={s.tabCount}>{newIdeas}</span>}
          </button>
        ))}
      </div>
      {tab === 'Cartas' ? <CardsTab /> : tab === 'Ideias' ? <IdeasTab /> : <PlayersTab />}
    </div>
  );
}
