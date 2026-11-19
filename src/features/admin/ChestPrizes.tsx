// Admin: the daily chest's prizes. Each prize has a weight; its chance is its weight over the sum of the active ones.
import { useState, type FormEvent } from 'react';
import type { AdminChestPrize } from '@/data/api';
import { useArtifactConfig } from '@/data/artifactsLive';
import { useAdminChestPrizes, useChestAdmin } from '@/data/bellLive';
import { useAdminItems } from '@/data/live';
import { ConfirmButton } from '@/ui/ConfirmButton';
import s from './AdminPage.module.css';

type Kind = AdminChestPrize['kind'];
const KIND: Record<Kind, string> = { coins: 'Moedas', fragments: 'Fragmentos', potion: 'Poção' };
const pct = (c: number | null) => (c === null ? '—' : `${(c * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

export function ChestPrizes() {
  const prizes = useAdminChestPrizes();
  const admin = useChestAdmin();
  const frags = useArtifactConfig().data?.fragment_types ?? [];
  const items = useAdminItems().data ?? [];
  const [kind, setKind] = useState<Kind>('coins');
  const [amount, setAmount] = useState('100');
  const [target, setTarget] = useState('');
  const [weight, setWeight] = useState('10');
  const [error, setError] = useState<string | null>(null);
  function add(e: FormEvent) {
    e.preventDefault();
    const a = Number(amount);
    const w = Number(weight);
    if (!Number.isInteger(a) || a <= 0 || !Number.isInteger(w) || w <= 0) return setError('Quantidade e peso: números inteiros maiores que zero.');
    if (kind !== 'coins' && !target) return setError(kind === 'fragments' ? 'Escolha o tipo de fragmento.' : 'Escolha a poção.');
    setError(null);
    admin.save.mutate(
      { kind, amount: a, weight: w, active: true, fragment_type: kind === 'fragments' ? target : null, item_id: kind === 'potion' ? target : null },
      { onError: () => setError('O banco recusou. Confira os campos.') },
    );
  }
  return (
    <section className={`panel ${s.musicSlot}`} aria-labelledby="chest-title">
      <h2 id="chest-title" className={s.formTitle}>
        Baú do dia
      </h2>
      <p className="hint">Cada jogador abre um baú por dia e ganha um prêmio. Peso maior = sai mais. Sem prêmio ligado, o baú dá as moedas fixas do bônus diário.</p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Prêmio</th>
            <th scope="col" className="num">
              Peso
            </th>
            <th scope="col" className="num">
              Chance
            </th>
            <th scope="col">
              <span className="visually-hidden">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(prizes.data ?? []).map((p) => (
            <tr key={p.id} data-banned={!p.active}>
              <td>
                <strong>{p.label}</strong> {!p.active && <span className={s.badge}>desligado</span>}
              </td>
              <td className="num">
                <input
                  className="input"
                  aria-label={`Peso de ${p.label}`}
                  inputMode="numeric"
                  defaultValue={p.weight}
                  key={`${p.id}-${p.weight}`}
                  style={{ inlineSize: '5rem' }}
                  onBlur={(e) => {
                    const w = Number(e.target.value);
                    if (Number.isInteger(w) && w > 0 && w !== p.weight) admin.save.mutate({ ...p, weight: w });
                  }}
                />
              </td>
              <td className="num">{pct(p.chance)}</td>
              <td className={s.actions}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => admin.save.mutate({ ...p, active: !p.active })}>
                  {p.active ? 'Desligar' : 'Ligar'}
                </button>{' '}
                <ConfirmButton className="btn btn-danger btn-sm" confirmLabel="Excluir?" onConfirm={() => admin.remove.mutate(p.id)}>
                  Excluir
                </ConfirmButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className={s.inline} onSubmit={add} aria-label="Novo prêmio do baú">
        <select className="input" aria-label="Tipo de prêmio" value={kind} onChange={(e) => (setKind(e.target.value as Kind), setTarget(''))}>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KIND[k]}
            </option>
          ))}
        </select>
        <input className="input" aria-label="Quantidade" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} style={{ inlineSize: '6rem' }} />
        {kind === 'fragments' && (
          <select className="input" aria-label="Tipo de fragmento" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Fragmento…</option>
            {frags.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        {kind === 'potion' && (
          <select className="input" aria-label="Poção" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Poção…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        )}
        <input className="input" aria-label="Peso" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, ''))} style={{ inlineSize: '5rem' }} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={admin.save.isPending}>
          Adicionar prêmio
        </button>
      </form>
      {error && <p role="alert" className={s.error}>{error}</p>}
    </section>
  );
}
