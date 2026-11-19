// Admin "Loja": create and edit luck potions and titles (and turn them off without deleting).
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { formatCoins, formatLuck } from '@/lib/format';
import { isLive, useAdminGameActions, useAdminItems, useAdminTitles } from '@/data/live';
import { removeShopImage, uploadShopImage } from '@/data/client';
import type { ShopItemRow, ShopTitleRow } from '@/data/api';
import { itemPayload, type ItemForm } from './gameForms';
import s from './AdminPage.module.css';

const CONDITION: Record<string, string> = {
  manual: 'Só por compra ou dado pelo admin',
  pull_count: 'Ganho ao roletar',
  pulled_at_least: 'Ganho ao tirar carta rara',
  collection_pct: 'Ganho ao completar a coleção',
  game_coins: 'Ganho nos jogos',
};

const ATTR: Record<string, string> = { luck: 'Sorte', xp: 'XP', money: 'Moedas' };

const itemToForm = (i?: ShopItemRow): ItemForm => ({
  id: i?.id,
  name: i?.name ?? '',
  description: i?.description ?? '',
  price: i ? String(i.price) : '',
  multiplier: i ? String(i.multiplier) : '2',
  kind: i?.duration_pulls ? 'pulls' : 'minutes',
  duration: i ? String(i.duration_pulls ?? i.duration_minutes ?? '') : '10',
  active: i?.active ?? true,
  image_url: i?.image_url ?? '',
  image_path: i?.image_path ?? null,
  attribute: (i?.attribute as ItemForm['attribute']) ?? 'luck',
});

function ItemEditor({ item, onDone }: { item?: ShopItemRow; onDone: (msg: string) => void }) {
  const { saveItem } = useAdminGameActions();
  const [f, setF] = useState<ItemForm>(itemToForm(item));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const [sending, setSending] = useState(false);
  const [broken, setBroken] = useState(false);
  const oldPath = item?.image_path ?? null;
  // a file sent in this form and not saved is removed, so the bucket keeps only pictures in use
  const dropUnsaved = (path: string | null | undefined) => {
    if (isLive && path && path !== oldPath) void removeShopImage(path);
  };
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isLive) return;
    setSending(true);
    setError(null);
    try {
      const sent = await uploadShopImage(file);
      dropUnsaved(f.image_path);
      setF((x) => ({ ...x, image_url: sent.url, image_path: sent.path }));
      setBroken(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para enviar a imagem.');
    } finally {
      setSending(false);
    }
  }
  function clearPicture() {
    dropUnsaved(f.image_path);
    setF((x) => ({ ...x, image_url: '', image_path: null }));
    setBroken(false);
  }
  function typeLink(url: string) {
    dropUnsaved(f.image_path);
    setBroken(false);
    setF((x) => ({ ...x, image_url: url, image_path: null }));
  }
  function cancel() {
    dropUnsaved(f.image_path);
    onDone('');
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const r = itemPayload(f);
    if (!r.ok) return setError(r.error);
    if (!isLive) return;
    saveItem.mutate(r.payload, {
      onSuccess: () => {
        if (oldPath && oldPath !== r.payload.image_path) void removeShopImage(oldPath); // replaced or removed
        onDone(`"${r.payload.name}" salva.`);
      },
      onError: () => setError('O banco recusou. Confira os campos.'),
    });
  }
  return (
    <form className={`panel ${s.newCard}`} onSubmit={submit} aria-label={item ? `Editar ${item.name}` : 'Nova poção'}>
      <h2 className={s.formTitle}>{item ? `Editar: ${item.name}` : 'Nova poção'}</h2>
      <div className={s.gameGrid}>
        <div className="field">
          <label htmlFor="it-name">Nome</label>
          <input id="it-name" className="input" maxLength={40} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="it-price">Preço (moedas)</label>
          <input id="it-price" className="input" inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="it-attr">Amplifica</label>
          <select id="it-attr" className="input" value={f.attribute ?? 'luck'} onChange={(e) => set('attribute', e.target.value as ItemForm['attribute'])}>
            <option value="luck">Sorte</option>
            <option value="xp">XP</option>
            <option value="money">Moedas</option>
          </select>
          <span className="hint">Multiplica o bônus dos artefatos ativos desse tipo.</span>
        </div>
        <div className="field">
          <label htmlFor="it-mult">Força (×)</label>
          <input id="it-mult" className="input" inputMode="decimal" value={f.multiplier} onChange={(e) => set('multiplier', e.target.value)} />
          <span className="hint">Ex.: 2 deixa as cartas 2× mais fáceis.</span>
        </div>
        <div className="field">
          <label htmlFor="it-dur">Dura</label>
          <span className={s.inline}>
            <input id="it-dur" className="input" inputMode="numeric" value={f.duration} onChange={(e) => set('duration', e.target.value.replace(/\D/g, ''))} />
            <select className="input" aria-label="Unidade da duração" value={f.kind} onChange={(e) => set('kind', e.target.value as ItemForm['kind'])}>
              <option value="minutes">minutos</option>
              <option value="pulls">roletadas</option>
            </select>
          </span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="it-desc">Descrição (opcional)</label>
        <input id="it-desc" className="input" maxLength={140} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </div>
      <fieldset className={`field ${s.picField}`}>
        <legend>Imagem (opcional)</legend>
        <div className={s.picRow}>
          <div className={s.itemPic}>
            {f.image_url && !broken ? (
              <img src={f.image_url} alt="Prévia da imagem da poção" onError={() => setBroken(true)} />
            ) : (
              <span className="hint">{broken ? 'Não abriu' : 'Sem imagem'}</span>
            )}
          </div>
          <div className={s.picTools}>
            <input
              className="input"
              aria-label="Link da imagem"
              placeholder="https://… ou envie um arquivo"
              value={f.image_path ? '' : f.image_url ?? ''}
              onChange={(e) => typeLink(e.target.value)}
            />
            <span className={s.inline}>
              <label className="btn btn-secondary btn-sm">
                {sending ? 'Enviando…' : f.image_url ? 'Trocar por arquivo' : 'Enviar arquivo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={sending} onChange={pick} />
              </label>
              {f.image_url && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearPicture}>
                  Remover imagem
                </button>
              )}
            </span>
            <span className="hint">{f.image_path ? 'Arquivo enviado. Salve a poção para usar.' : 'JPG, PNG ou WebP até 2 MB. Aparece inteira, sem esticar.'}</span>
          </div>
        </div>
      </fieldset>
      <label className={s.check}>
        <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        À venda na loja
      </label>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary" onClick={cancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saveItem.isPending || sending}>
          {saveItem.isPending ? 'Salvando…' : 'Salvar poção'}
        </button>
      </div>
    </form>
  );
}

function TitleEditor({ title, onDone }: { title?: ShopTitleRow; onDone: (msg: string) => void }) {
  const { saveTitle } = useAdminGameActions();
  const [name, setName] = useState(title?.name ?? '');
  const [desc, setDesc] = useState(title?.description ?? '');
  const [price, setPrice] = useState(title?.price ? String(title.price) : '');
  const [active, setActive] = useState(title?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Dê um nome ao título.');
    if (n.length > 40) return setError('Nome com no máximo 40 letras.');
    if (price && !(Number(price) > 0)) return setError('Preço: use um número maior que zero, ou deixe vazio.');
    if (!isLive) return;
    saveTitle.mutate(
      { id: title?.id, name: n, description: desc.trim(), price: price ? Number(price) : null, active, condition: title?.condition ?? { type: 'manual' } },
      { onSuccess: () => onDone(`"${n}" salvo.`), onError: () => setError('O banco recusou. Já existe um título com esse nome?') },
    );
  }
  return (
    <form className={`panel ${s.newCard}`} onSubmit={submit} aria-label={title ? `Editar ${title.name}` : 'Novo título'}>
      <h2 className={s.formTitle}>{title ? `Editar: ${title.name}` : 'Novo título'}</h2>
      <div className={s.gameGrid}>
        <div className="field">
          <label htmlFor="ti-name">Nome</label>
          <input id="ti-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ti-price">Preço (moedas)</label>
          <input id="ti-price" className="input" inputMode="numeric" value={price} placeholder="vazio = não vende" onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          <span className="hint">Vazio: só se ganha jogando ou pelo admin.</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="ti-desc">Descrição (opcional)</label>
        <input id="ti-desc" className="input" maxLength={140} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      {title && <p className="hint">Como se ganha: {CONDITION[title.condition?.type] ?? title.condition?.type}</p>}
      <label className={s.check}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativo
      </label>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary" onClick={() => onDone('')}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saveTitle.isPending}>
          {saveTitle.isPending ? 'Salvando…' : 'Salvar título'}
        </button>
      </div>
    </form>
  );
}

export function ShopTab() {
  const items = useAdminItems();
  const titles = useAdminTitles();
  const [editing, setEditing] = useState<{ kind: 'item' | 'title'; row?: ShopItemRow | ShopTitleRow } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = (msg: string) => {
    setEditing(null);
    setNotice(msg || null);
  };
  const dur = (i: ShopItemRow) => (i.duration_minutes ? `${i.duration_minutes} min` : i.duration_pulls === 1 ? '1 roletada' : `${i.duration_pulls} roletadas`);
  return (
    <>
      {notice && <p role="status" className={s.notice}>{notice}</p>}
      {editing?.kind === 'item' && <ItemEditor key={editing.row?.id ?? 'new'} item={editing.row as ShopItemRow | undefined} onDone={done} />}
      {editing?.kind === 'title' && <TitleEditor key={editing.row?.id ?? 'new'} title={editing.row as ShopTitleRow | undefined} onDone={done} />}

      <section className={`panel ${s.musicSlot}`} aria-labelledby="shop-items">
        <div className={s.top}>
          <h2 id="shop-items" className={s.formTitle}>
            Poções de sorte
          </h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (setNotice(null), setEditing({ kind: 'item' }))}>
            Nova poção
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Poção</th>
              <th scope="col">Efeito</th>
              <th scope="col" className="num">
                Preço
              </th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(items.data ?? []).map((i) => (
              <tr key={i.id} data-banned={!i.active}>
                <td>
                  {i.image_url && (
                    <span className={`${s.itemPic} ${s.itemPicSm}`}>
                      <img src={i.image_url} alt="" />
                    </span>
                  )}
                  <strong>{i.name}</strong> {!i.active && <span className={s.badge}>fora da loja</span>}
                </td>
                <td>
                  {ATTR[i.attribute ?? 'luck']} {formatLuck(Number(i.multiplier))} por {dur(i)}
                </td>
                <td className="num">{formatCoins(Number(i.price))}</td>
                <td className={s.actions}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setNotice(null), setEditing({ kind: 'item', row: i }))}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`panel ${s.musicSlot}`} aria-labelledby="shop-titles">
        <div className={s.top}>
          <h2 id="shop-titles" className={s.formTitle}>
            Títulos
          </h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (setNotice(null), setEditing({ kind: 'title' }))}>
            Novo título
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Título</th>
              <th scope="col">Como se ganha</th>
              <th scope="col" className="num">
                Preço
              </th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(titles.data ?? []).map((t) => (
              <tr key={t.id} data-banned={!t.active}>
                <td>
                  <strong>{t.name}</strong> {!t.active && <span className={s.badge}>desativado</span>}
                </td>
                <td className="hint">{CONDITION[t.condition?.type] ?? t.condition?.type}</td>
                <td className="num">{t.price ? formatCoins(Number(t.price)) : 'não vende'}</td>
                <td className={s.actions}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setNotice(null), setEditing({ kind: 'title', row: t }))}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
