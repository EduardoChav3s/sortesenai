// Artifacts: forge them from fragments, turn spare cards into fragments, and equip them for lasting bonuses.
// Potions amplify the equipped artifacts' bonuses for a while. Every rule is checked in the database.
import { useEffect, useState } from 'react';
import type { Artifact, Attribute, ConvertResult, ForgeArtifact, MyArtifact } from '@/data/api';
import { useArtifactActions, useAttributes, useForge, useFragments, useMyArtifacts, useSpareFragments } from '@/data/artifactsLive';
import { isApiError } from '@/data/errors';
import { isLive } from '@/data/live';
import { bonusLine, missingMaterials } from '@/lib/artifacts';
import { formatCoins } from '@/lib/format';
import { TIER_LABEL } from '@/lib/rarity';
import type { RarityTier } from '@/data/types';
import { CardView } from '@/ui/CardView';
import { ConfirmButton } from '@/ui/ConfirmButton';
import { IconSparkle } from '@/ui/icons';
import s from './ArtifactsPage.module.css';

type Tab = 'forja' | 'meus' | 'fragmentos';
const ATTR_LABEL: Record<Attribute, string> = { luck: 'Sorte', xp: 'XP', money: 'Moedas' };
const x = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')}x`;

function errorText(e: unknown) {
  const code = isApiError(e) ? e.code : null;
  if (code === 'missing_materials') return 'Faltam fragmentos para fabricar.';
  if (code === 'invalid') return 'Não deu: confira e tente de novo.';
  if (code === 'not_found') return 'Esse artefato não está mais disponível.';
  return 'Não deu certo. Tente de novo.';
}

function Picture({ a, big = false }: { a: Pick<Artifact, 'image_url' | 'name'>; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`${s.pic} ${big ? s.picBig : ''}`}>
      {a.image_url && !broken ? <img src={a.image_url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /> : <IconSparkle size={big ? 56 : 40} />}
    </span>
  );
}

function Rarity({ tier }: { tier: string }) {
  return (
    <span className={s.rarity} data-tier={tier}>
      {TIER_LABEL[tier as RarityTier] ?? tier}
    </span>
  );
}

function Bonuses({ a }: { a: Artifact }) {
  const list = bonusLine(a);
  return (
    <ul className={s.bonuses} aria-label="Bônus">
      {list.map((b) => (
        <li key={b}>{b}</li>
      ))}
    </ul>
  );
}

/** The three attributes now: artifacts base × (1 + potions). */
function BonusBar() {
  const attrs = useAttributes();
  if (!isLive || !attrs.data) return null;
  return (
    <section className={`panel ${s.bonusBar}`} aria-label="Seus bônus agora">
      {(['luck', 'xp', 'money'] as Attribute[]).map((k) => {
        const v = attrs.data[k];
        return (
          <div key={k} className={s.attr} data-amp={v.amp > 0 || undefined}>
            <span className={s.attrName}>{ATTR_LABEL[k]}</span>
            <strong className={s.attrValue}>{x(v.value)}</strong>
            <span className={s.attrHow}>
              {x(v.base)} dos artefatos{v.amp > 0 ? ` · +${Math.round(v.amp * 100)}% de poção` : ''}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function FragmentStrip() {
  const frags = useFragments();
  if (!frags.data?.length) return null;
  return (
    <ul className={s.frags} aria-label="Seus fragmentos">
      {frags.data.map((f) => (
        <li key={f.id} className={s.frag} style={{ '--frag': f.color } as React.CSSProperties}>
          <span className={s.fragDot} aria-hidden="true" />
          {f.name} <strong>{formatCoins(f.quantity)}</strong>
        </li>
      ))}
    </ul>
  );
}

function Recipe({ recipe }: { recipe: Artifact['recipe'] }) {
  return (
    <ul className={s.recipe}>
      {recipe.map((r) => {
        const pct = Math.min(100, (Number(r.have) / Number(r.amount)) * 100);
        const short = Number(r.amount) - Number(r.have);
        return (
          <li key={r.fragment_type} style={{ '--frag': r.color } as React.CSSProperties}>
            <span className={s.recipeTop}>
              <span>{r.name}</span>
              <span className={short > 0 ? s.short : s.okText}>
                {formatCoins(Math.min(Number(r.have), Number(r.amount)))}/{formatCoins(Number(r.amount))}
                {short > 0 ? ` · faltam ${formatCoins(short)}` : ''}
              </span>
            </span>
            <span className={s.bar} aria-hidden="true">
              <span style={{ inlineSize: `${pct}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Forge({ onDone }: { onDone: (msg: string) => void }) {
  const forge = useForge();
  const act = useArtifactActions();
  const [confirm, setConfirm] = useState<ForgeArtifact | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!made) return;
    const t = window.setTimeout(() => setMade(null), 1600);
    return () => window.clearTimeout(t);
  }, [made]);
  if (forge.isLoading) return <p className="page-sub">Acendendo a forja…</p>;
  if (!forge.data?.length)
    return (
      <div className={`panel ${s.empty}`}>
        <span className={s.emblem} aria-hidden="true">
          <IconSparkle size={32} />
        </span>
        <p className={s.emptyTitle}>Nenhum artefato na forja ainda</p>
        <p className={s.emptyText}>Quando o admin criar artefatos, eles aparecem aqui com a receita.</p>
      </div>
    );
  return (
    <>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <ul className={s.grid}>
        {forge.data.map((a) => {
          const need = missingMaterials(a.recipe);
          return (
            <li key={a.id} className={`panel ${s.art}`} data-tier={a.rarity} data-made={made === a.id || undefined}>
              <Picture a={a} />
              <div className={s.artHead}>
                <h3 className={s.artName}>{a.name}</h3>
                <Rarity tier={a.rarity} />
              </div>
              {a.description && <p className={s.desc}>{a.description}</p>}
              <Bonuses a={a} />
              <Recipe recipe={a.recipe} />
              <div className={s.artFoot}>
                {a.owned > 0 && <span className={s.owned}>Você tem {a.owned}</span>}
                <button type="button" className="btn btn-primary btn-sm" disabled={!need.ready} onClick={() => (setError(null), setConfirm(a))}>
                  {need.ready ? 'Fabricar' : 'Faltam fragmentos'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {confirm && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label={`Fabricar ${confirm.name}`} onClick={() => setConfirm(null)}>
          <div className={`panel ${s.sheet}`} onClick={(e) => e.stopPropagation()}>
            <Picture a={confirm} big />
            <h2 className={s.sheetTitle}>Fabricar {confirm.name}?</h2>
            <Bonuses a={confirm} />
            <p className={s.desc}>Estes fragmentos serão usados:</p>
            <ul className={s.useList}>
              {confirm.recipe.map((r) => (
                <li key={r.fragment_type} style={{ '--frag': r.color } as React.CSSProperties}>
                  <span className={s.fragDot} aria-hidden="true" />
                  {formatCoins(Number(r.amount))} {r.name} <span className={s.desc}>(fica com {formatCoins(Number(r.have) - Number(r.amount))})</span>
                </li>
              ))}
            </ul>
            <div className={s.sheetActions}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={act.craft.isPending}
                onClick={() =>
                  act.craft.mutate(confirm.id, {
                    onSuccess: () => {
                      setMade(confirm.id);
                      onDone(`${confirm.name} fabricado! Ele já está em Meus artefatos.`);
                      setConfirm(null);
                    },
                    onError: (e) => (setError(errorText(e)), setConfirm(null)),
                  })
                }
              >
                {act.craft.isPending ? 'Forjando…' : 'Fabricar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Mine() {
  const mine = useMyArtifacts();
  const act = useArtifactActions();
  const [open, setOpen] = useState<MyArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (mine.isLoading) return <p className="page-sub">Abrindo sua coleção…</p>;
  const items = mine.data?.items ?? [];
  const slots = mine.data?.slots ?? 3;
  const used = items.filter((i) => i.equipped).length;
  if (!items.length)
    return (
      <div className={`panel ${s.empty}`}>
        <span className={s.emblem} aria-hidden="true">
          <IconSparkle size={32} />
        </span>
        <p className={s.emptyTitle}>Nenhum artefato ainda</p>
        <p className={s.emptyText}>Transforme cartas repetidas em fragmentos e fabrique o primeiro na Forja.</p>
      </div>
    );
  return (
    <>
      <p className={s.slotLine}>
        Ativos: <strong>{used}</strong> de {slots}. Só os ativos dão bônus.
      </p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <ul className={s.grid}>
        {items.map((a) => (
          <li key={a.user_artifact_id} className={`panel ${s.art}`} data-tier={a.rarity} data-equipped={a.equipped || undefined}>
            <button type="button" className={s.openBtn} onClick={() => setOpen(a)} aria-label={`Ver detalhes de ${a.name}`}>
              <Picture a={a} />
            </button>
            <div className={s.artHead}>
              <h3 className={s.artName}>{a.name}</h3>
              <Rarity tier={a.rarity} />
            </div>
            <Bonuses a={a} />
            {!a.active && <p className={s.short}>Desligado pelo admin: não dá bônus agora.</p>}
            <div className={s.artFoot}>
              {a.equipped && <span className={s.on}>Ativo</span>}
              <button
                type="button"
                className={`btn btn-sm ${a.equipped ? 'btn-secondary' : 'btn-primary'}`}
                disabled={act.toggle.isPending || (!a.equipped && used >= slots)}
                onClick={() => (setError(null), act.toggle.mutate({ id: a.user_artifact_id, active: !a.equipped }, { onError: () => setError(`Você só pode ter ${slots} artefatos ativos.`) }))}
              >
                {a.equipped ? 'Desativar' : used >= slots ? 'Espaços cheios' : 'Ativar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {open && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div className={`panel ${s.sheet}`} data-tier={open.rarity} onClick={(e) => e.stopPropagation()}>
            <Picture a={open} big />
            <h2 className={s.sheetTitle}>{open.name}</h2>
            <Rarity tier={open.rarity} />
            {open.description && <p className={s.desc}>{open.description}</p>}
            <Bonuses a={open} />
            <p className={s.desc}>
              Fabricado em {new Date(open.crafted_at).toLocaleDateString('pt-BR')}. {open.equipped ? 'Está ativo.' : 'Está guardado.'}
            </p>
            <p className={s.desc}>Poções do mesmo tipo amplificam este bônus enquanto duram.</p>
            <div className={s.sheetActions}>
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Fragments({ onDone }: { onDone: (msg: string) => void }) {
  const spares = useSpareFragments();
  const act = useArtifactActions();
  const [error, setError] = useState<string | null>(null);
  const list = (spares.data ?? []).filter((x) => x.gives);
  const say = (r: ConvertResult[]) =>
    onDone(r.length === 0 ? 'Nada para transformar.' : r.map((x) => `${x.card}: ${x.copies} repetida${x.copies > 1 ? 's' : ''} → ${x.gained} ${x.fragment}`).join(' · '));
  if (spares.isLoading) return <p className="page-sub">Contando repetidas…</p>;
  return (
    <>
      <p className={s.slotLine}>Cada repetida vira fragmentos. Você sempre fica com uma cópia de cada carta no álbum.</p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      {list.length === 0 ? (
        <div className={`panel ${s.empty}`}>
          <p className={s.emptyTitle}>Nenhuma repetida para transformar</p>
          <p className={s.emptyText}>Quando você tirar uma carta que já tem, ela aparece aqui.</p>
        </div>
      ) : (
        <>
          <div className={s.allRow}>
            <ConfirmButton className="btn btn-primary" confirmLabel="Transformar todas?" disabled={act.convertAll.isPending} onConfirm={() => act.convertAll.mutate(undefined, { onSuccess: say, onError: (e) => setError(errorText(e)) })}>
              Transformar todas as repetidas
            </ConfirmButton>
          </div>
          <ul className={s.spares}>
            {list.map((x) => (
              <li key={x.card.id} className={`panel ${s.spare}`} style={{ '--frag': x.gives!.color } as React.CSSProperties}>
                <CardView entry={{ owned: true, quantity: x.spares + 1, card: x.card }} size="s" showQuantity />
                <div className={s.spareInfo}>
                  <p>
                    <strong>{x.spares}</strong> repetida{x.spares > 1 ? 's' : ''}
                  </p>
                  <p className={s.desc}>
                    <span className={s.fragDot} aria-hidden="true" /> cada uma vira {x.gives!.amount} {x.gives!.name}
                  </p>
                  <div className={s.spareBtns}>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={act.convert.isPending} onClick={() => act.convert.mutate({ cardId: x.card.id, quantity: 1 }, { onSuccess: (r) => say([r]), onError: (e) => setError(errorText(e)) })}>
                      Transformar 1
                    </button>
                    {x.spares > 1 && (
                      <button type="button" className="btn btn-primary btn-sm" disabled={act.convert.isPending} onClick={() => act.convert.mutate({ cardId: x.card.id, quantity: x.spares }, { onSuccess: (r) => say([r]), onError: (e) => setError(errorText(e)) })}>
                        Transformar {x.spares} → {x.spares * x.gives!.amount}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function ArtifactsPage() {
  const [tab, setTab] = useState<Tab>('forja');
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);
  return (
    <div className="page">
      <p className="page-sub">Transforme repetidas em fragmentos, fabrique artefatos e ative até o limite de espaços. Poções amplificam os bônus dos artefatos enquanto duram.</p>
      <BonusBar />
      <FragmentStrip />
      <div className="segmented" role="group" aria-label="Seção de artefatos">
        <button type="button" aria-pressed={tab === 'forja'} onClick={() => setTab('forja')}>
          Forja de Artefatos
        </button>
        <button type="button" aria-pressed={tab === 'meus'} onClick={() => setTab('meus')}>
          Meus Artefatos
        </button>
        <button type="button" aria-pressed={tab === 'fragmentos'} onClick={() => setTab('fragmentos')}>
          Fragmentos
        </button>
      </div>
      {notice && (
        <p role="status" className={s.toast}>
          {notice}
        </p>
      )}
      {tab === 'forja' ? <Forge onDone={setNotice} /> : tab === 'meus' ? <Mine /> : <Fragments onDone={setNotice} />}
    </div>
  );
}
