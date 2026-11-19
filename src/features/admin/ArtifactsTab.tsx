// Admin "Artefatos": create, edit, turn off and delete artifacts and their recipes, the fragment types,
// which rarity gives which fragment, which cards never give fragments, and how many artifacts can be active.
import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { AdminArtifact, FragmentType } from '@/data/api';
import { useArtifactAdmin, useArtifactConfig } from '@/data/artifactsLive';
import { removeShopImage, uploadShopImage } from '@/data/client';
import { isLive, useAdminCards } from '@/data/live';
import { artifactPayload, bonusLine, type ArtifactForm } from '@/lib/artifacts';
import { formatOdds } from '@/lib/format';
import { TIERS, TIER_LABEL } from '@/lib/rarity';
import { ConfirmButton } from '@/ui/ConfirmButton';
import s from './AdminPage.module.css';

const toForm = (a?: AdminArtifact): ArtifactForm => ({
  id: a?.id,
  name: a?.name ?? '',
  description: a?.description ?? '',
  rarity: a?.rarity ?? 'raro',
  luck: String(a?.luck_mult ?? 1),
  xp: String(a?.xp_mult ?? 1),
  money: String(a?.money_mult ?? 1),
  active: a?.active ?? true,
  image_url: a?.image_url ?? '',
  image_path: a?.image_path ?? null,
  recipe: (a?.recipe ?? []).map((r) => ({ fragment_type: r.fragment_type, amount: String(r.amount) })),
});

function Editor({ artifact, types, onDone }: { artifact?: AdminArtifact; types: FragmentType[]; onDone: (msg: string) => void }) {
  const admin = useArtifactAdmin();
  const [f, setF] = useState<ArtifactForm>(toForm(artifact));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [broken, setBroken] = useState(false);
  const oldPath = artifact?.image_path ?? null;
  const set = <K extends keyof ArtifactForm>(k: K, v: ArtifactForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const drop = (path: string | null | undefined) => {
    if (isLive && path && path !== oldPath) void removeShopImage(path, 'artifacts');
  };
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isLive) return;
    setSending(true);
    setError(null);
    try {
      const sent = await uploadShopImage(file, 'artifacts');
      drop(f.image_path);
      setF((x) => ({ ...x, image_url: sent.url, image_path: sent.path }));
      setBroken(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para enviar a imagem.');
    } finally {
      setSending(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const r = artifactPayload(f);
    if (!r.ok) return setError(r.error);
    if (!isLive) return;
    admin.save.mutate(r.payload, {
      onSuccess: () => {
        if (oldPath && oldPath !== r.payload.image_path) void removeShopImage(oldPath, 'artifacts');
        onDone(`"${r.payload.name}" salvo.`);
      },
      onError: () => setError('O banco recusou. Confira os campos e a receita.'),
    });
  }
  const unused = types.filter((t) => !f.recipe.some((r) => r.fragment_type === t.id));
  return (
    <form className={`panel ${s.newCard}`} onSubmit={submit} aria-label={artifact ? `Editar ${artifact.name}` : 'Novo artefato'}>
      <h2 className={s.formTitle}>{artifact ? `Editar: ${artifact.name}` : 'Novo artefato'}</h2>
      <div className={s.gameGrid}>
        <div className="field">
          <label htmlFor="ar-name">Nome</label>
          <input id="ar-name" className="input" maxLength={40} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ar-rarity">Raridade</label>
          <select id="ar-rarity" className="input" value={f.rarity} onChange={(e) => set('rarity', e.target.value)}>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ar-luck">Sorte (×)</label>
          <input id="ar-luck" className="input" inputMode="decimal" value={f.luck} onChange={(e) => set('luck', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ar-xp">XP (×)</label>
          <input id="ar-xp" className="input" inputMode="decimal" value={f.xp} onChange={(e) => set('xp', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ar-money">Moedas (×)</label>
          <input id="ar-money" className="input" inputMode="decimal" value={f.money} onChange={(e) => set('money', e.target.value)} />
          <span className="hint">1 = não dá esse bônus.</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="ar-desc">Descrição (opcional)</label>
        <input id="ar-desc" className="input" maxLength={160} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </div>
      <fieldset className={`field ${s.picField}`}>
        <legend>Imagem (opcional)</legend>
        <div className={s.picRow}>
          <div className={s.itemPic}>
            {f.image_url && !broken ? <img src={f.image_url} alt="Prévia da imagem do artefato" onError={() => setBroken(true)} /> : <span className="hint">{broken ? 'Não abriu' : 'Sem imagem'}</span>}
          </div>
          <div className={s.picTools}>
            <input
              className="input"
              aria-label="Link da imagem do artefato"
              placeholder="https://… ou envie um arquivo"
              value={f.image_path ? '' : f.image_url}
              onChange={(e) => (drop(f.image_path), setBroken(false), setF((x) => ({ ...x, image_url: e.target.value, image_path: null })))}
            />
            <span className={s.inline}>
              <label className="btn btn-secondary btn-sm">
                {sending ? 'Enviando…' : f.image_url ? 'Trocar por arquivo' : 'Enviar arquivo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={sending} onChange={pick} />
              </label>
              {f.image_url && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => (drop(f.image_path), setF((x) => ({ ...x, image_url: '', image_path: null })))}>
                  Remover imagem
                </button>
              )}
            </span>
          </div>
        </div>
      </fieldset>
      <fieldset className={`field ${s.picField}`}>
        <legend>Receita (fragmentos para fabricar)</legend>
        {f.recipe.map((r, i) => (
          <span key={i} className={s.inline}>
            <select
              className="input"
              aria-label="Tipo de fragmento"
              value={r.fragment_type}
              onChange={(e) => set('recipe', f.recipe.map((x, j) => (j === i ? { ...x, fragment_type: e.target.value } : x)))}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              aria-label="Quantidade"
              inputMode="numeric"
              value={r.amount}
              onChange={(e) => set('recipe', f.recipe.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/\D/g, '') } : x)))}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('recipe', f.recipe.filter((_, j) => j !== i))}>
              Tirar
            </button>
          </span>
        ))}
        {unused.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('recipe', [...f.recipe, { fragment_type: unused[0].id, amount: '10' }])}>
            + Fragmento
          </button>
        )}
      </fieldset>
      <label className={s.check}>
        <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        Ativo (aparece na forja e dá bônus)
      </label>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-secondary" onClick={() => (drop(f.image_path), onDone(''))}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={admin.save.isPending || sending}>
          {admin.save.isPending ? 'Salvando…' : 'Salvar artefato'}
        </button>
      </div>
    </form>
  );
}

function FragmentTypes({ types }: { types: FragmentType[] }) {
  const admin = useArtifactAdmin();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3d8bfd');
  return (
    <section className={`panel ${s.musicSlot}`} aria-labelledby="frag-types">
      <h2 id="frag-types" className={s.formTitle}>
        Tipos de fragmento
      </h2>
      <ul className={s.simpleList}>
        {types.map((t) => (
          <li key={t.id} className={s.inline}>
            <input type="color" aria-label={`Cor de ${t.name}`} value={t.color} onChange={(e) => admin.saveType.mutate({ id: t.id, name: t.name, color: e.target.value, active: t.active })} />
            <strong>{t.name}</strong>
            <label className={s.check}>
              <input type="checkbox" checked={t.active} onChange={(e) => admin.saveType.mutate({ id: t.id, name: t.name, color: t.color, active: e.target.checked })} />
              Disponível
            </label>
          </li>
        ))}
      </ul>
      <form
        className={s.inline}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) admin.saveType.mutate({ name: name.trim(), color, active: true }, { onSuccess: () => setName('') });
        }}
      >
        <input className="input" aria-label="Nome do novo fragmento" placeholder="Ex.: Mítico" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="color" aria-label="Cor do novo fragmento" value={color} onChange={(e) => setColor(e.target.value)} />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={!name.trim()}>
          Criar tipo
        </button>
      </form>
      {admin.saveType.isError && <p role="alert" className={s.error}>Não deu: já existe um fragmento com esse nome?</p>}
    </section>
  );
}

function Rules({ types, rules }: { types: FragmentType[]; rules: { tier: string; fragment_type: string | null; amount: number }[] }) {
  const admin = useArtifactAdmin();
  return (
    <section className={`panel ${s.musicSlot}`} aria-labelledby="frag-rules">
      <h2 id="frag-rules" className={s.formTitle}>
        Quanto cada repetida vale
      </h2>
      <p className="hint">Cada cópia repetida de uma carta dessa raridade vira esses fragmentos (quando o jogador transformar).</p>
      <ul className={s.simpleList}>
        {TIERS.map((tier) => {
          const r = rules.find((x) => x.tier === tier);
          return (
            <li key={tier} className={s.inline}>
              <strong className={s.tierName}>{TIER_LABEL[tier]}</strong>
              <select
                className="input"
                aria-label={`Fragmento das cartas ${TIER_LABEL[tier]}`}
                value={r?.fragment_type ?? ''}
                onChange={(e) => admin.saveRule.mutate({ tier, fragmentType: e.target.value || null, amount: r?.amount ?? 1 })}
              >
                <option value="">Não dá fragmento</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                aria-label={`Quantidade por repetida ${TIER_LABEL[tier]}`}
                inputMode="numeric"
                defaultValue={r?.amount ?? 1}
                key={`${tier}-${r?.amount}`}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n) && n >= 0 && n !== r?.amount) admin.saveRule.mutate({ tier, fragmentType: r?.fragment_type ?? null, amount: n });
                }}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BlockedCards({ blocked }: { blocked: { id: string; title: string; number: number; odds_n: number }[] }) {
  const admin = useArtifactAdmin();
  const cards = useAdminCards();
  const [pick, setPick] = useState('');
  const free = (cards.data ?? []).filter((c) => !blocked.some((b) => b.id === c.id));
  return (
    <section className={`panel ${s.musicSlot}`} aria-labelledby="frag-blocked">
      <h2 id="frag-blocked" className={s.formTitle}>
        Cartas que não viram fragmento
      </h2>
      {blocked.length === 0 ? (
        <p className="hint">Todas as cartas podem virar fragmento.</p>
      ) : (
        <ul className={s.simpleList}>
          {blocked.map((c) => (
            <li key={c.id} className={s.inline}>
              <span>
                Nº {c.number} {c.title} <span className="hint">({formatOdds(c.odds_n, { compact: true })})</span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => admin.cardFragments.mutate({ cardId: c.id, allowed: true })}>
                Liberar
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className={s.inline}>
        <select className="input" aria-label="Carta para bloquear" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Escolha uma carta…</option>
          {free.map((c) => (
            <option key={c.id} value={c.id}>
              Nº {c.number} {c.title}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!pick} onClick={() => admin.cardFragments.mutate({ cardId: pick, allowed: false }, { onSuccess: () => setPick('') })}>
          Bloquear
        </button>
      </span>
    </section>
  );
}

export function ArtifactsTab() {
  const config = useArtifactConfig();
  const admin = useArtifactAdmin();
  const [editing, setEditing] = useState<{ row?: AdminArtifact } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [slots, setSlots] = useState('');
  if (isLive && config.isLoading) return <p className="hint">Carregando artefatos…</p>;
  if (isLive && config.isError) return <p role="alert" className={s.error}>Não deu para carregar os artefatos. O SQL de artefatos já rodou?</p>;
  const c = config.data ?? { artifacts: [], fragment_types: [], rules: [], blocked_cards: [], slots: 3 };
  const typeName = (id: string) => c.fragment_types.find((t) => t.id === id)?.name ?? '?';
  const done = (msg: string) => (setEditing(null), setNotice(msg || null));
  return (
    <>
      <h2 className="section-title">Gerenciar Artefatos</h2>
      {notice && <p role="status" className={s.notice}>{notice}</p>}
      {editing && <Editor key={editing.row?.id ?? 'new'} artifact={editing.row} types={c.fragment_types.filter((t) => t.active || editing.row?.recipe.some((r) => r.fragment_type === t.id))} onDone={done} />}

      <section className={`panel ${s.musicSlot}`} aria-labelledby="artifacts-list">
        <div className={s.top}>
          <h2 id="artifacts-list" className={s.formTitle}>
            Artefatos
          </h2>
          <button type="button" className="btn btn-primary btn-sm" disabled={c.fragment_types.length === 0} onClick={() => (setNotice(null), setEditing({}))}>
            Novo artefato
          </button>
        </div>
        {c.artifacts.length === 0 ? (
          <p className="hint">Nenhum artefato ainda. Crie o primeiro: os jogadores fabricam na Forja.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Artefato</th>
                <th scope="col">Bônus</th>
                <th scope="col">Receita</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {c.artifacts.map((a) => (
                <tr key={a.id} data-banned={!a.active}>
                  <td>
                    {a.image_url && (
                      <span className={`${s.itemPic} ${s.itemPicSm}`}>
                        <img src={a.image_url} alt="" />
                      </span>
                    )}
                    <strong>{a.name}</strong> <span className="hint">{TIER_LABEL[a.rarity as keyof typeof TIER_LABEL] ?? a.rarity}</span>{' '}
                    {!a.active && <span className={s.badge}>desativado</span>}
                    {a.owners > 0 && <span className="hint"> · {a.owners} jogador{a.owners > 1 ? 'es têm' : ' tem'}</span>}
                  </td>
                  <td>{bonusLine(a).join(' · ')}</td>
                  <td className="hint">{a.recipe.map((r) => `${r.amount} ${typeName(r.fragment_type)}`).join(' + ')}</td>
                  <td className={s.actions}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setNotice(null), setEditing({ row: a }))}>
                      Editar
                    </button>{' '}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => admin.save.mutate({ ...a, active: !a.active })}>
                      {a.active ? 'Desativar' : 'Ativar'}
                    </button>{' '}
                    <ConfirmButton
                      className="btn btn-danger btn-sm"
                      confirmLabel={a.owners > 0 ? `Tirar de ${a.owners}?` : 'Excluir?'}
                      onConfirm={() => admin.remove.mutate(a.id, { onSuccess: () => setNotice(`"${a.name}" excluído.`) })}
                    >
                      Excluir
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={`panel ${s.musicSlot}`} aria-labelledby="artifact-slots">
        <h2 id="artifact-slots" className={s.formTitle}>
          Artefatos ativos ao mesmo tempo
        </h2>
        <form
          className={s.inline}
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(slots);
            if (Number.isInteger(n) && n >= 1 && n <= 20) admin.slots.mutate(n, { onSuccess: () => (setSlots(''), setNotice(`Agora cada jogador pode ativar ${n}.`)) });
          }}
        >
          <input className="input" aria-label="Espaços de artefato" inputMode="numeric" placeholder={String(c.slots)} value={slots} onChange={(e) => setSlots(e.target.value.replace(/\D/g, ''))} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!slots}>
            Salvar
          </button>
          <span className="hint">Hoje: {c.slots}. De 1 a 20.</span>
        </form>
      </section>

      <FragmentTypes types={c.fragment_types} />
      <Rules types={c.fragment_types.filter((t) => t.active)} rules={c.rules} />
      <BlockedCards blocked={c.blocked_cards} />
    </>
  );
}
