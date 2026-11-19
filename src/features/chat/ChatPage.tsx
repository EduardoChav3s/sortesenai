// The live chat: messages, pictures, card offers (buy at a price or make a proposal) and coins.
// Every rule is checked in the database; this page only shows and asks.
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AlbumCard, ChatMessage } from '@/data/api';
import { useChat, useChatActions, useChatRoom } from '@/data/chatLive';
import { isApiError } from '@/data/errors';
import { isLive, useCollection, useMyProfile, useRole, useWallet } from '@/data/live';
import { checkImage } from '@/data/upload';
import type { CollectionEntry, PlayerSummary } from '@/data/types';
import { typingLine, type OnlinePlayer } from '@/lib/chatRoom';
import { fitWithin, insertMention, mentionAt, splitMentions } from '@/lib/mentions';
import { formatCoins, formatOdds } from '@/lib/format';
import { rarityTier, TIER_LABEL } from '@/lib/rarity';
import { Avatar } from '@/ui/Avatar';
import { CardView } from '@/ui/CardView';
import { ConfirmButton } from '@/ui/ConfirmButton';
import { IconCards, IconCoin, IconUpload } from '@/ui/icons';
import s from './ChatPage.module.css';

const hueOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (name: string) => name.slice(0, 2).toUpperCase();
const hour = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const entryOf = (card: AlbumCard, quantity = 1): CollectionEntry => ({ owned: true, quantity, card });

function errorText(e: unknown): string {
  const code = isApiError(e) ? e.code : null;
  if (code === 'insufficient_coins') return 'Moedas insuficientes.';
  if (code === 'slow_down') return 'Calma! Espere uns segundos para mandar de novo.';
  if (code === 'banned') return 'Sua conta está suspensa.';
  if (code === 'forbidden') return 'Você não pode fazer isso.';
  if (code === 'not_found') return 'Essa mensagem não existe mais.';
  if (code === 'invalid') return 'Não deu. Confira e tente de novo (a carta precisa estar repetida).';
  if (e instanceof Error && !isApiError(e)) return e.message;
  return 'Não deu certo. Tente de novo.';
}

function Face({ p, size = '36px' }: { p: PlayerSummary | OnlinePlayer; size?: string }) {
  return <Avatar initials={initials(p.nickname)} hue={hueOf(p.id)} size={size} url={p.avatar_url} />;
}

function Rarity({ odds }: { odds: number }) {
  const tier = rarityTier(odds);
  return (
    <span className={s.rarity} data-tier={tier}>
      {TIER_LABEL[tier]} · {formatOdds(odds, { compact: true })}
    </span>
  );
}

/** Message text with @mentions of known players highlighted (stronger when it is me). */
function Rich({ text, h }: { text: string; h: Handlers }) {
  return (
    <>
      {splitMentions(text, h.nicks).map((seg, i) =>
        seg.mention ? (
          <span key={i} className={s.mention} data-me={seg.mention.toLowerCase() === h.myNick?.toLowerCase() || undefined}>
            {seg.text}
          </span>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}

/** A big print becomes a WebP of at most 1600 px, so it stays under the 2 MB limit and loads fast. */
async function shrinkPrint(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = fitWithin(bitmap.width, bitmap.height, 1600);
    if (size.width === bitmap.width && file.size < 900_000 && file.type !== 'image/png') return file;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.85));
    return blob && blob.size < file.size ? new File([blob], 'print.webp', { type: 'image/webp' }) : file;
  } catch {
    return file;
  }
}

interface Handlers {
  nicks: string[];
  myNick: string | null;
  me: string | null;
  admin: boolean;
  busy: boolean;
  onZoom: (src: string) => void;
  onBuy: (m: ChatMessage) => void;
  onBid: (m: ChatMessage) => void;
  onAccept: (bid: number) => void;
  onCancel: (m: ChatMessage) => void;
  onRemove: (m: ChatMessage) => void;
}

function Offer({ m, h }: { m: ChatMessage; h: Handlers }) {
  const mine = m.author.id === h.me;
  const open = m.status === 'open';
  const bids = m.bids.filter((b) => b.status === 'open');
  if (!m.card) return null;
  return (
    <article className={s.offer} data-status={open && m.available ? 'open' : 'closed'} aria-label={`Oferta de ${m.author.nickname}: ${m.card.title}`}>
      <div className={s.offerHead}>
        <IconCards size={16} />
        <span>Oferta de carta</span>
        {m.status === 'done' && <span className={s.closed}>Fechada{m.buyer ? ` · ${m.buyer.nickname}` : ''}</span>}
        {m.status === 'cancelled' && <span className={s.closed}>Cancelada</span>}
        {open && !m.available && <span className={s.closed}>Indisponível</span>}
      </div>
      <div className={s.offerMain}>
        <CardView entry={entryOf(m.card)} size="s" />
        <div className={s.offerInfo}>
          <h3>{m.card.title}</h3>
          <Rarity odds={m.card.odds_n} />
          <p className={s.ask}>{m.price ? `${formatCoins(m.price)} moedas` : 'Aceita propostas'}</p>
          {m.body && <p className={s.hint}>“{m.body}”</p>}
          {open && m.available && !mine && (
            <div className={s.offerActions}>
              {m.price && (
                <ConfirmButton className="btn btn-primary btn-sm" disabled={h.busy} confirmLabel="Confirmar compra?" onConfirm={() => h.onBuy(m)}>
                  Comprar por {formatCoins(m.price)}
                </ConfirmButton>
              )}
              <button type="button" className="btn btn-secondary btn-sm" disabled={h.busy} onClick={() => h.onBid(m)}>
                Fazer proposta
              </button>
            </div>
          )}
          {open && mine && (
            <div className={s.offerActions}>
              {bids.length === 0 && <span className={s.hint}>Esperando propostas…</span>}
              <button type="button" className="btn btn-secondary btn-sm" disabled={h.busy} onClick={() => h.onCancel(m)}>
                Cancelar oferta
              </button>
            </div>
          )}
        </div>
      </div>
      {open && bids.length > 0 && (
        <ul className={s.bids} aria-label="Propostas">
          {bids.map((b) => (
            <li key={b.id} className={s.bid}>
              <Face p={b.bidder} size="24px" />
              <span className={s.bidText}>
                <strong>{b.bidder.nickname}</strong> oferece {b.card ? b.card.title : ''}
                {b.card && b.coins > 0 ? ' + ' : ''}
                {b.coins > 0 ? `${formatCoins(b.coins)} moedas` : ''}
              </span>
              {mine && (
                <ConfirmButton className="btn btn-primary btn-sm" disabled={h.busy} confirmLabel="Confirmar troca?" onConfirm={() => h.onAccept(b.id)}>
                  Aceitar
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Message({ m, h }: { m: ChatMessage; h: Handlers }) {
  if (m.kind === 'system')
    return (
      <li className={s.system}>
        {m.body} · {hour(m.created_at)}
      </li>
    );
  const mine = m.author.id === h.me;
  return (
    <li className={`${s.row} ${mine ? s.mine : ''}`}>
      {!mine && (
        <Link to={`/jogador/${m.author.id}`} aria-label={`Perfil de ${m.author.nickname}`}>
          <Face p={m.author} />
        </Link>
      )}
      <div className={s.body}>
        {!mine && (
          <header className={s.who}>
            <strong>{m.author.nickname}</strong>
            {m.author.level ? <span className={s.level}>Nv {m.author.level}</span> : null}
            {m.author.title_name && <span className={s.titleTag}>{m.author.title_name}</span>}
            <time className={s.time}>{hour(m.created_at)}</time>
          </header>
        )}
        {m.kind === 'text' && (
          <p className={s.bubble}>
            <Rich text={m.body ?? ''} h={h} />
            {mine && <time className={s.timeIn}>{hour(m.created_at)}</time>}
          </p>
        )}
        {m.kind === 'image' && (
          <figure className={s.photoMsg}>
            {m.image_url ? (
              <button type="button" className={s.photo} onClick={() => h.onZoom(m.image_url!)} aria-label="Ver imagem maior">
                <img src={m.image_url} alt={m.body ?? `Imagem de ${m.author.nickname}`} loading="lazy" decoding="async" />
              </button>
            ) : (
              <span className={s.hint}>Imagem indisponível</span>
            )}
            {m.body && (
              <figcaption>
                <Rich text={m.body} h={h} />
              </figcaption>
            )}
            {mine && <time className={s.timeIn}>{hour(m.created_at)}</time>}
          </figure>
        )}
        {m.kind === 'offer' && <Offer m={m} h={h} />}
        {m.kind === 'coins' && m.to && (
          <div className={s.coins} role="note">
            <span className={s.coinIcon}>
              <IconCoin size={20} />
            </span>
            <div>
              <p className={s.coinLine}>
                <strong>{m.author.nickname}</strong> enviou <strong className={s.amount}>{formatCoins(m.amount ?? 0)} moedas</strong> para{' '}
                <strong>{m.to.id === h.me ? 'você' : m.to.nickname}</strong>
              </p>
              {m.body && <p className={s.hint}>“{m.body}”</p>}
            </div>
            {mine && <time className={s.timeIn}>{hour(m.created_at)}</time>}
          </div>
        )}
        {h.admin && (
          <ConfirmButton className={s.remove} confirmLabel="Apagar para todos?" onConfirm={() => h.onRemove(m)}>
            Apagar
          </ConfirmButton>
        )}
      </div>
    </li>
  );
}

/** Spare copies: the only ones that can be offered or proposed (the player always keeps one). */
function useSpares() {
  const col = useCollection();
  return (col.data ?? []).filter((e) => e.owned && e.quantity >= 2);
}

function CardPicker({ spares, pick, setPick }: { spares: CollectionEntry[]; pick: string | null; setPick: (id: string | null) => void }) {
  if (spares.length === 0) return <p className={s.hint}>Você não tem cartas repetidas. Só dá para oferecer cartas que você tem mais de uma.</p>;
  return (
    <ul className={s.pickGrid}>
      {spares.map((e) => (
        <li key={e.card.id}>
          <button type="button" className={s.pick} aria-pressed={pick === e.card.id} onClick={() => setPick(pick === e.card.id ? null : e.card.id)}>
            <CardView entry={e} size="s" zoom={false} showQuantity eager />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={s.sheet} role="dialog" aria-modal="true" aria-label={title}>
      <div className={s.sheetHead}>
        <h2>{title}</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Fechar
        </button>
      </div>
      {children}
    </div>
  );
}

export function ChatPage() {
  const chat = useChat();
  const act = useChatActions();
  const role = useRole();
  const wallet = useWallet();
  const profile = useMyProfile().data?.profile;
  const meInfo: OnlinePlayer | null = profile ? { id: profile.id, nickname: profile.nickname, avatar_url: profile.avatar_url, level: profile.level ?? 1 } : null;
  const room = useChatRoom(meInfo);
  const spares = useSpares();
  const myId = profile?.id ?? null;
  const coins = Number(wallet.data?.coins ?? 0);

  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: 'offer' } | { kind: 'coins'; to?: string } | { kind: 'bid'; m: ChatMessage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const nearBottom = useRef(true);

  const msgs = chat.data ?? [];
  const lastId = msgs[msgs.length - 1]?.id;
  // stay at the bottom when new messages arrive, unless the player scrolled up to read
  useLayoutEffect(() => {
    const el = list.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId, msgs.length]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    if (!zoomed) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setZoomed(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [zoomed]);

  const fail = (e: unknown) => setError(errorText(e));
  const busy = act.buy.isPending || act.accept.isPending || act.cancel.isPending || act.bid.isPending || act.coins.isPending || act.offer.isPending;

  // a picture from the button, from Ctrl+V (a print) or dropped on the chat
  async function takeFile(raw: File | null | undefined) {
    if (!raw) return;
    if (!raw.type.startsWith('image/')) return setError('Só dá para mandar imagens (JPG, PNG ou WebP).');
    const f = await shrinkPrint(raw);
    const problem = checkImage(f);
    if (problem) return setError(problem);
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }
  function pickImage(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    void takeFile(f);
  }
  const [dragging, setDragging] = useState(false);
  // @mentions: the list opens while an @word is typed right before the cursor
  const input = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  function chooseMention(nick: string, start: number) {
    const r = insertMention(text, start, caret, nick);
    setText(r.text);
    setCaret(r.caret);
    window.requestAnimationFrame(() => input.current?.setSelectionRange(r.caret, r.caret));
  }
  function clearImage() {
    setFile(null);
    setPreview(null);
  }
  function send(e: FormEvent) {
    e.preventDefault();
    if (!isLive || (!text.trim() && !file)) return;
    setError(null);
    act.send.mutate(
      { text, file },
      {
        onSuccess: () => {
          setText('');
          clearImage();
          nearBottom.current = true;
        },
        onError: fail,
      },
    );
  }

  // every player the chat knows: online now, in the messages, and me
  const known = new Map<string, string>();
  for (const p of room.online) known.set(p.id, p.nickname);
  for (const m of msgs) if (m.kind !== 'system') known.set(m.author.id, m.author.nickname);
  if (profile) known.set(profile.id, profile.nickname);
  const nicks = [...new Set(known.values())];
  const at = mentionAt(text, caret);
  const suggestions =
    at && closedAt !== at.start
      ? nicks.filter((n) => n !== profile?.nickname && n.toLowerCase().startsWith(at.query.toLowerCase())).slice(0, 6)
      : [];

  const h: Handlers = {
    nicks,
    myNick: profile?.nickname ?? null,
    me: myId,
    admin: role.data === 'admin',
    busy,
    onZoom: setZoomed,
    onBuy: (m) => act.buy.mutate(m.id, { onError: fail }),
    onBid: (m) => (setError(null), setSheet({ kind: 'bid', m })),
    onAccept: (bid) => act.accept.mutate(bid, { onError: fail }),
    onCancel: (m) => act.cancel.mutate(m.id, { onError: fail }),
    onRemove: (m) => act.remove.mutate(m.id, { onError: fail }),
  };

  // people to send coins to: who is online and who talked recently
  const people = new Map<string, PlayerSummary | OnlinePlayer>();
  for (const p of room.online) if (p.id !== myId) people.set(p.id, p);
  for (const m of [...msgs].reverse()) if (m.kind !== 'system' && m.author.id !== myId && !people.has(m.author.id)) people.set(m.author.id, m.author);
  const typing = typingLine(room.typingNames);
  const coinTarget = sheet?.kind === 'coins' ? sheet.to : undefined;

  return (
    <div className={`page ${s.page}`}>
      <div className={s.layout}>
        <section
          className={`panel ${s.chat}`}
          aria-label="Chat da turma"
          data-dragging={dragging || undefined}
          onDragOver={(e) => {
            if ([...e.dataTransfer.types].includes('Files')) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void takeFile([...e.dataTransfer.files].find((f) => f.type.startsWith('image/')));
          }}
        >
          {dragging && <div className={s.dropHint}>Solte a imagem para mandar no chat</div>}
          <header className={s.chatHead}>
            <div>
              <h1 className={s.title}>Chat da turma</h1>
              <p className={s.sub} data-status={chat.status}>
                <span className={s.dot} aria-hidden="true" />
                {chat.status === 'live' ? `${room.online.length} online agora` : chat.status === 'connecting' ? 'Conectando…' : 'Sem conexão ao vivo'}
              </p>
            </div>
            <div className={s.stack} aria-label="Jogadores online">
              {room.online.slice(0, 6).map((p) => (
                <span key={p.id} className={s.stackItem} title={p.nickname}>
                  <Face p={p} size="30px" />
                </span>
              ))}
              {room.online.length > 6 && <span className={s.more}>+{room.online.length - 6}</span>}
            </div>
          </header>

          <ol
            ref={list}
            className={s.list}
            aria-live="polite"
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            {chat.isLoading && <li className={s.system}>Abrindo o chat…</li>}
            {chat.isError && <li className={s.system}>Não deu para abrir o chat. Recarregue a página.</li>}
            {!chat.isLoading && !chat.isError && msgs.length === 0 && <li className={s.empty}>Ninguém falou ainda. Comece a conversa!</li>}
            {msgs.map((m) => (
              <Message key={m.id} m={m} h={h} />
            ))}
          </ol>
          <p className={s.typing} aria-live="polite">
            {typing && (
              <>
                {typing}
                <span className={s.dots} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </>
            )}
          </p>

          <form className={s.composer} onSubmit={send}>
            <div className={s.tools}>
              <button type="button" className={s.tool} onClick={() => (setError(null), setSheet({ kind: 'offer' }))}>
                <IconCards size={18} /> Oferecer carta
              </button>
              <button type="button" className={s.tool} onClick={() => (setError(null), setSheet({ kind: 'coins' }))}>
                <IconCoin size={18} /> Enviar moedas
              </button>
              <label className={s.tool}>
                <IconUpload size={18} /> Imagem
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickImage} />
              </label>
            </div>
            {error && !sheet && (
              <p role="alert" className={s.picError}>
                {error}
              </p>
            )}
            {preview && (
              <div className={s.pending}>
                <img src={preview} alt="Imagem que vai ser enviada" />
                <span className={s.hint}>Escreva uma legenda (opcional) e envie.</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearImage}>
                  Remover
                </button>
              </div>
            )}
            {suggestions.length > 0 && at && (
              <ul className={s.mentions} role="listbox" aria-label="Mencionar alguém">
                {suggestions.map((n, i) => (
                  <li key={n}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === pick % suggestions.length}
                      className={s.mentionOption}
                      onMouseDown={(e) => (e.preventDefault(), chooseMention(n, at.start))}
                    >
                      @{n}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={s.inputRow}>
              <input
                ref={input}
                className="input"
                aria-label="Mensagem"
                placeholder={preview ? 'Legenda da imagem…' : 'Escreva para a turma… (@ para mencionar, Ctrl+V cola um print)'}
                maxLength={300}
                value={text}
                aria-autocomplete="list"
                onChange={(e) => (setText(e.target.value), setCaret(e.target.selectionStart ?? e.target.value.length), setPick(0), setClosedAt(null), room.typing())}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                onKeyDown={(e) => {
                  if (!suggestions.length || !at) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
                  } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    chooseMention(suggestions[pick % suggestions.length], at.start);
                  } else if (e.key === 'Escape') {
                    setClosedAt(at.start);
                  }
                }}
                onPaste={(e) => {
                  const img = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
                  if (img) {
                    e.preventDefault();
                    void takeFile(img);
                  }
                }}
              />
              <button type="submit" className="btn btn-primary" disabled={(!text.trim() && !file) || act.send.isPending}>
                {act.send.isPending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </form>

          {zoomed && (
            <div className={s.lightbox} role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setZoomed(null)}>
              <img src={zoomed} alt="" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoomed(null)}>
                Fechar
              </button>
            </div>
          )}
          {sheet && <div className={s.scrim} onClick={() => setSheet(null)} />}
          {sheet?.kind === 'offer' && (
            <OfferSheet spares={spares} busy={busy} error={error} onClose={() => setSheet(null)} onSend={(v) => act.offer.mutate(v, { onSuccess: () => setSheet(null), onError: fail })} />
          )}
          {sheet?.kind === 'coins' && (
            <CoinSheet
              key={coinTarget ?? 'any'}
              people={[...people.values()]}
              first={coinTarget}
              coins={coins}
              busy={busy}
              error={error}
              onClose={() => setSheet(null)}
              onSend={(v) => act.coins.mutate(v, { onSuccess: () => setSheet(null), onError: fail })}
            />
          )}
          {sheet?.kind === 'bid' && (
            <BidSheet offer={sheet.m} spares={spares} coins={coins} busy={busy} error={error} onClose={() => setSheet(null)} onSend={(v) => act.bid.mutate(v, { onSuccess: () => setSheet(null), onError: fail })} />
          )}
        </section>

        <aside className={`panel ${s.side}`} aria-label="Quem está no chat">
          <h2 className={s.sideTitle}>Online · {room.online.length}</h2>
          <ul className={s.people2}>
            {room.online.map((p) => (
              <li key={p.id} className={s.member} data-online="true">
                <span className={s.avatarWrap}>
                  <Face p={p} />
                  <span className={s.presence} aria-hidden="true" />
                </span>
                <span className={s.memberText}>
                  <strong>
                    {p.nickname} {p.id === myId && <span className={s.hint}>(você)</span>}
                  </strong>
                  <span>Nível {p.level}</span>
                </span>
                {p.id !== myId && (
                  <button type="button" className={s.give} onClick={() => (setError(null), setSheet({ kind: 'coins', to: p.id }))} aria-label={`Enviar moedas para ${p.nickname}`}>
                    <IconCoin size={16} />
                  </button>
                )}
              </li>
            ))}
            {room.online.length === 0 && <li className={s.hint}>Ninguém online agora.</li>}
          </ul>
          <div className={s.legend}>
            <p className={s.sideTitle}>Como funciona</p>
            <p className={s.hint}>Só dá para oferecer cartas repetidas. Quem compra paga o preço; quem faz proposta espera o dono aceitar. Moedas e cartas passam na hora.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function OfferSheet({ spares, busy, error, onClose, onSend }: {
  spares: CollectionEntry[]; busy: boolean; error: string | null; onClose: () => void;
  onSend: (v: { cardId: string; price: number | null; note: string }) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  return (
    <Sheet title="Oferecer carta" onClose={onClose}>
      <p className={s.hint}>Escolha uma carta repetida. Ela só sai do seu álbum quando alguém comprar ou você aceitar uma proposta.</p>
      <CardPicker spares={spares} pick={pick} setPick={setPick} />
      <div className={s.amountRow}>
        <div className="field">
          <label htmlFor="of-price">Preço em moedas (opcional)</label>
          <input id="of-price" className="input" inputMode="numeric" placeholder="vazio = só propostas" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className={`field ${s.grow}`}>
          <label htmlFor="of-note">Recado (opcional)</label>
          <input id="of-note" className="input" maxLength={60} placeholder="Ex.: troco por carta rara" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className={s.picError}>{error}</p>}
      <button type="button" className="btn btn-primary" disabled={!pick || busy} onClick={() => pick && onSend({ cardId: pick, price: price ? Number(price) : null, note })}>
        Publicar oferta
      </button>
    </Sheet>
  );
}

function BidSheet({ offer, spares, coins, busy, error, onClose, onSend }: {
  offer: ChatMessage; spares: CollectionEntry[]; coins: number; busy: boolean; error: string | null; onClose: () => void;
  onSend: (v: { offer: number; cardId: string | null; coins: number }) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const value = Number(amount) || 0;
  return (
    <Sheet title={`Proposta por ${offer.card?.title ?? 'carta'}`} onClose={onClose}>
      <p className={s.hint}>Ofereça uma carta repetida, moedas, ou os dois. {offer.author.nickname} escolhe a proposta que quiser.</p>
      <CardPicker spares={spares} pick={pick} setPick={setPick} />
      <div className="field">
        <label htmlFor="bid-coins">Moedas (opcional)</label>
        <input id="bid-coins" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <span className="hint">Você tem {formatCoins(coins)} moedas. Elas só saem se a proposta for aceita.</span>
      </div>
      {error && <p role="alert" className={s.picError}>{error}</p>}
      <button type="button" className="btn btn-primary" disabled={(!pick && value <= 0) || value > coins || busy} onClick={() => onSend({ offer: offer.id, cardId: pick, coins: value })}>
        Enviar proposta
      </button>
    </Sheet>
  );
}

function CoinSheet({ people, first, coins, busy, error, onClose, onSend }: {
  people: (PlayerSummary | OnlinePlayer)[]; first?: string; coins: number; busy: boolean; error: string | null; onClose: () => void;
  onSend: (v: { to: string; amount: number; note: string }) => void;
}) {
  const [to, setTo] = useState<string | null>(first ?? people[0]?.id ?? null);
  const [amount, setAmount] = useState('100');
  const [note, setNote] = useState('');
  const value = Number(amount) || 0;
  const target = people.find((p) => p.id === to);
  function send() {
    if (to && target) onSend({ to, amount: value, note });
  }
  return (
    <Sheet title="Enviar moedas" onClose={onClose}>
      <div className="field">
        <span className={s.label}>Para quem</span>
        {people.length === 0 ? (
          <p className={s.hint}>Ninguém por aqui ainda. Quem estiver online ou falar no chat aparece aqui.</p>
        ) : (
          <div className={s.people}>
            {people.map((p) => (
              <button key={p.id} type="button" className={s.person} aria-pressed={to === p.id} onClick={() => setTo(p.id)}>
                <Face p={p} size="32px" />
                {p.nickname}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={s.amountRow}>
        <div className="field">
          <label htmlFor="cn-amount">Quantia</label>
          <input id="cn-amount" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className={s.quick}>
          {[100, 500, 1000].map((v) => (
            <button key={v} type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount(String(v))}>
              {formatCoins(v)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="cn-note">Recado (opcional)</label>
        <input id="cn-note" className="input" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: valeu pela troca" />
      </div>
      <p className={s.hint}>
        Você tem {formatCoins(coins)} moedas. Depois de enviar: {formatCoins(Math.max(0, coins - value))}.
      </p>
      {error && <p role="alert" className={s.picError}>{error}</p>}
      <ConfirmButton
        className="btn btn-primary"
        disabled={!target || value <= 0 || value > coins || busy}
        confirmLabel={`Confirmar: ${formatCoins(value)} moedas para ${target?.nickname ?? ''}?`}
        onConfirm={send}
      >
        <IconCoin size={16} /> Enviar {formatCoins(value)} moedas{target ? ` para ${target.nickname}` : ''}
      </ConfirmButton>
    </Sheet>
  );
}
