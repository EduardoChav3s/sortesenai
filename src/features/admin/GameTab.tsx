// Admin "Jogo": the game rules, the weekly event card and the daily missions.
import { useEffect, useState, type FormEvent } from 'react';
import { formatOdds } from '@/lib/format';
import { isLive, useAdminCards, useAdminGameActions, useAdminMissionDefs, useGameSettings, useGlobalReset, useServerOwner, useWeeklyEvent } from '@/data/live';
import { isApiError } from '@/data/errors';
import { settingsPatch, type SettingsForm } from './gameForms';
import { ResetPanel } from './ResetPanel';
import { ChestPrizes } from './ChestPrizes';
import s from './AdminPage.module.css';

/** Shown only when the database says this account is the server owner. */
function OwnerReset() {
  const owner = useServerOwner();
  const reset = useGlobalReset();
  if (!owner.data?.owner) return null;
  const err = reset.error;
  const error = err ? (isApiError(err) && err.code === 'forbidden' ? 'Só o dono do servidor pode resetar.' : 'O reset não rodou. Nada foi apagado.') : null;
  const result = reset.data ? `Reset feito: ${reset.data.players} jogadores voltaram do zero.` : null;
  return <ResetPanel busy={reset.isPending} onReset={(phrase) => reset.mutate(phrase)} lastReset={owner.data.last_reset} result={result} error={error} />;
}

const num = (v: unknown, fallback = '') => (typeof v === 'number' ? String(v) : fallback);

function RulesForm({ settings }: { settings: Record<string, unknown> }) {
  const { saveSettings } = useAdminGameActions();
  const limits = (settings.game_daily_limits as Record<string, number>) ?? {};
  const [f, setF] = useState<SettingsForm>({
    pullCost: num(settings.pull_cost),
    dailyReward: num(settings.daily_reward),
    recycleBase: num(settings.recycle_base),
    slots: num(limits.slots),
    memory: num(limits.memory),
    reflex: num(limits.reflex),
    clicker: num(limits.clicker),
    bets: Array.isArray(settings.slots_bets) ? (settings.slots_bets as number[]).join(', ') : '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof SettingsForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const r = settingsPatch(f);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    if (!isLive) return;
    saveSettings.mutate(r.patch, {
      onSuccess: () => setMsg({ ok: true, text: 'Regras salvas. Valem a partir de agora para todo mundo.' }),
      onError: () => setMsg({ ok: false, text: 'O banco recusou. Confira os números.' }),
    });
  }
  const field = (k: keyof SettingsForm, label: string, hint?: string) => (
    <div className="field">
      <label htmlFor={`gs-${k}`}>{label}</label>
      <input id={`gs-${k}`} className="input" inputMode="numeric" value={f[k]} onChange={set(k)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
  return (
    <form className={`panel ${s.newCard}`} onSubmit={submit} aria-label="Regras do jogo">
      <h2 className={s.formTitle}>Regras do jogo</h2>
      <div className={s.gameGrid}>
        {field('pullCost', 'Custo da roletada', 'Moedas por roletada. Roletar 10 custa 10×.')}
        {field('dailyReward', 'Bônus diário', 'Moedas do botão de bônus, uma vez por dia.')}
        {field('recycleBase', 'Moedas por repetida (base)', 'Uma repetida 1/10 vale isso. Cada ×10 de raridade dobra.')}
      </div>
      <p className={s.fieldLabel}>Limite de moedas por dia em cada jogo</p>
      <div className={s.gameGrid}>
        {field('slots', 'Caça-níquel')}
        {field('memory', 'Memória')}
        {field('reflex', 'Reflexo')}
        {field('clicker', 'Clique rápido')}
      </div>
      <div className="field">
        <label htmlFor="gs-bets">Apostas do caça-níquel</label>
        <input id="gs-bets" className="input" value={f.bets} onChange={set('bets')} placeholder="10, 25, 50" />
        <span className="hint">Valores separados por vírgula, até 6.</span>
      </div>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? s.notice : s.error}>
          {msg.text}
        </p>
      )}
      <div className={s.formActions}>
        <button type="submit" className="btn btn-primary" disabled={saveSettings.isPending}>
          {saveSettings.isPending ? 'Salvando…' : 'Salvar regras'}
        </button>
      </div>
    </form>
  );
}

function EventForm({ pinned }: { pinned: string | null }) {
  const cards = useAdminCards();
  const ev = useWeeklyEvent();
  const { saveSettings } = useAdminGameActions();
  const [choice, setChoice] = useState(pinned ?? 'auto');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setChoice(pinned ?? 'auto'), [pinned]);
  const active = (cards.data ?? []).filter((c) => c.active).sort((a, b) => b.odds_n - a.odds_n);
  const now = ev.data?.card;
  function save() {
    if (!isLive) return;
    saveSettings.mutate({ event_card: choice === 'auto' ? null : choice }, { onSuccess: () => setMsg('Evento salvo.') });
  }
  return (
    <section className={`panel ${s.newCard}`} aria-labelledby="event-admin">
      <h2 id="event-admin" className={s.formTitle}>
        Evento da semana
      </h2>
      <p className="hint">
        Agora: {now ? `${now.known ? now.card.title : `Carta Nº ${String((now.card as { number?: number }).number ?? '').padStart(2, '0')}`} (${formatOdds(now.card.odds_n)}) com chance 2×` : 'nenhum'}
        {pinned ? ' · escolhida por você' : ' · sorteada automaticamente'}.
      </p>
      <div className="field">
        <label htmlFor="ev-card">Carta com chance dobrada</label>
        <select id="ev-card" className="input" value={choice} onChange={(e) => (setChoice(e.target.value), setMsg(null))}>
          <option value="auto">Sorteio automático (troca toda segunda)</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              Nº {String((c as { number?: number }).number ?? '').padStart(2, '0')} · {c.title} · {formatOdds(c.odds_n)}
            </option>
          ))}
        </select>
      </div>
      {saveSettings.isError && <p role="alert" className={s.error}>Não deu para salvar o evento.</p>}
      {msg && <p role="status" className={s.notice}>{msg}</p>}
      <div className={s.formActions}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saveSettings.isPending || choice === (pinned ?? 'auto')}>
          Salvar evento
        </button>
      </div>
    </section>
  );
}

function MissionsForm({ pinned }: { pinned: string[] | null }) {
  const defs = useAdminMissionDefs();
  const { saveSettings } = useAdminGameActions();
  const [auto, setAuto] = useState(!pinned);
  const [picked, setPicked] = useState<string[]>(pinned ?? []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    setAuto(!pinned);
    setPicked(pinned ?? []);
  }, [pinned]);
  function toggle(id: string) {
    setMsg(null);
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id]));
  }
  function save() {
    if (!isLive) return;
    if (!auto && (picked.length < 1 || picked.length > 5)) return setMsg({ ok: false, text: 'Escolha de 1 a 5 missões.' });
    saveSettings.mutate({ missions: auto ? null : picked }, { onSuccess: () => setMsg({ ok: true, text: 'Missões salvas. A turma já vê as novas.' }) });
  }
  return (
    <section className={`panel ${s.newCard}`} aria-labelledby="missions-admin">
      <h2 id="missions-admin" className={s.formTitle}>
        Missões do dia
      </h2>
      <div className="segmented" role="group" aria-label="Como escolher as missões">
        <button type="button" aria-pressed={auto} onClick={() => (setAuto(true), setMsg(null))}>
          Sorteio automático
        </button>
        <button type="button" aria-pressed={!auto} onClick={() => (setAuto(false), setMsg(null))}>
          Fixar missões
        </button>
      </div>
      <p className="hint">{auto ? 'Todo dia o site sorteia 3 missões, iguais para todos.' : `Essas valem todo dia até você voltar para o sorteio. ${picked.length} de até 5.`}</p>
      {!auto && (
        <ul className={s.missionPick}>
          {(defs.data ?? []).map((d) => (
            <li key={d.id}>
              <label className={s.check}>
                <input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} disabled={!picked.includes(d.id) && picked.length >= 5} />
                {d.title} <span className="hint">+{d.coins} moedas</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {saveSettings.isError && <p role="alert" className={s.error}>Não deu para salvar as missões.</p>}
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? s.notice : s.error}>
          {msg.text}
        </p>
      )}
      <div className={s.formActions}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saveSettings.isPending}>
          Salvar missões
        </button>
      </div>
    </section>
  );
}

export function GameTab() {
  const settings = useGameSettings();
  if (isLive && settings.isLoading) return <p className="hint">Carregando regras…</p>;
  if (isLive && settings.isError) return <p role="alert" className={s.error}>Não deu para carregar as regras do jogo.</p>;
  const v = settings.data ?? { pull_cost: 10, daily_reward: 200, recycle_base: 5, game_daily_limits: { slots: 500, memory: 300, reflex: 200, clicker: 200 }, slots_bets: [10, 25, 50] };
  return (
    <>
      <RulesForm key={JSON.stringify([v.pull_cost, v.daily_reward, v.recycle_base, v.game_daily_limits, v.slots_bets])} settings={v} />
      <EventForm pinned={typeof v.event_card === 'string' ? v.event_card : null} />
      <MissionsForm pinned={Array.isArray(v.missions) ? (v.missions as string[]) : null} />
      {isLive && <ChestPrizes />}
      <OwnerReset />
    </>
  );
}
