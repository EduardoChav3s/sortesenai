// "RESET GLOBAL DO SERVIDOR": only the server owner sees it, and the database checks it again.
// Two steps: open the confirmation, then type the exact phrase.
import { useState } from 'react';
import type { ServerOwnerStatus } from '@/data/api';
import { formatCoins } from '@/lib/format';
import s from './AdminPage.module.css';

const PHRASE = 'RESETAR SERVIDOR';

interface Props {
  onReset: (phrase: string) => void;
  busy: boolean;
  lastReset?: ServerOwnerStatus['last_reset'];
  result?: string | null;
  error?: string | null;
}

export function ResetPanel({ onReset, busy, lastReset, result, error }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const close = () => (setOpen(false), setTyped(''));
  return (
    <section className={`panel ${s.musicSlot} ${s.danger}`} aria-labelledby="reset-title">
      <h2 id="reset-title" className={s.formTitle}>
        Zona de perigo
      </h2>
      <p className="hint">
        Tira todas as cartas e zera as moedas de todos os jogadores. Também limpa roletadas, poções, títulos, missões, jogos, mural, presentes,
        trocas e duelos. Contas, cargos, cartas do álbum, loja e regras ficam. Não dá para desfazer.
      </p>
      {lastReset && (
        <p className="hint">
          Último reset: {new Date(lastReset.at).toLocaleString('pt-BR')} por {lastReset.by ?? 'admin'} ({lastReset.details.players} jogadores,{' '}
          {formatCoins(lastReset.details.cards_removed)} cartas e {formatCoins(lastReset.details.coins_removed)} moedas apagadas).
        </p>
      )}
      {result && <p role="status" className={s.notice}>{result}</p>}
      {error && <p role="alert" className={s.error}>{error}</p>}
      {!open ? (
        <div className={s.formActions}>
          <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
            RESET GLOBAL DO SERVIDOR
          </button>
        </div>
      ) : (
        <form
          className={s.dangerConfirm}
          onSubmit={(e) => {
            e.preventDefault();
            if (typed === PHRASE) onReset(typed);
          }}
        >
          <div className="field">
            <label htmlFor="reset-phrase">Digite RESETAR SERVIDOR para confirmar</label>
            <input id="reset-phrase" className="input" autoComplete="off" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <div className={s.formActions}>
            <button type="button" className="btn btn-secondary" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger" disabled={typed !== PHRASE || busy}>
              {busy ? 'Apagando…' : 'Apagar o progresso de todos'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
