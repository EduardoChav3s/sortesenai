import { useState, type FormEvent } from 'react';
import { CardView } from '@/ui/CardView';
import type { CollectionEntry } from '@/data/types';
import s from './LoginPage.module.css';

export type LoginErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_exists'
  | 'weak_password'
  | 'rate_limited'
  | 'unknown';

export class LoginError extends Error {
  constructor(public code: LoginErrorCode) {
    super(code);
  }
}

/** What the login page needs from Supabase Auth; injected so tests run without a server. */
export interface LoginDeps {
  signInGoogle(): Promise<void>;
  signInPassword(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  isAdmin(): Promise<boolean>;
  signOut(): Promise<void>;
}

const MESSAGES: Record<LoginErrorCode, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. O link chegou na sua caixa de entrada.',
  user_exists: 'Esse e-mail já tem conta. Use a aba Entrar.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
  rate_limited: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  unknown: 'Algo deu errado. Tente de novo.',
};

type Tab = 'entrar' | 'criar';

const sticker = (id: string, odds_n: number, title: string, joke: string, image_url: string): CollectionEntry => ({
  owned: true,
  quantity: 1,
  card: { id, odds_n, active: true, title, joke, image_url },
});
// Background rows of album slots: empty frames and a few printed stickers, by tier.
const ROWS: string[][] = [
  ['', 'raro', '', '', 'comum', '', 'epico', '', '', 'incomum', '', ''],
  ['incomum', '', '', 'lendario', '', '', 'comum', '', 'raro', '', '', ''],
  ['', '', 'epico', '', 'comum', '', '', 'mitico', '', '', 'incomum', ''],
];

// The three stickers on the login cover.
const FAN = {
  left: sticker('c08', 25_000, 'Homem Goiaba', 'Feito para chupar.', '/cards/homem-goiaba.png'),
  mid: sticker('c12', 400_000_000, 'Predador', 'Cuidado com ele...', '/cards/predador.webp'),
  right: sticker('c10', 3_000_000, 'Cruz Credo', 'Homem que não aceito nem no céu nem no inferno.', '/cards/cruz-credo.webp'),
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

export function LoginPage({ deps, onAdmin }: { deps: LoginDeps; onAdmin?: () => void }) {
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const creating = !admin && tab === 'criar';

  function switchTab(t: Tab) {
    setTab(t);
    setError(null);
    setSent(false);
  }

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(MESSAGES[e instanceof LoginError ? e.code : 'unknown']);
    } finally {
      setBusy(false);
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const mail = email.trim().toLowerCase();
    if (creating) {
      if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
      if (password !== confirm) return setError('As duas senhas não são iguais.');
      return run(async () => {
        const r = await deps.signUp(mail, password);
        if (r.needsConfirm) setSent(true);
      });
    }
    return run(async () => {
      await deps.signInPassword(mail, password);
      if (!admin) return;
      if (await deps.isAdmin()) onAdmin?.();
      else {
        await deps.signOut();
        setError('Essa conta não é admin. Entre pela tela de jogador.');
      }
    });
  }

  return (
    <main className={s.page}>
      <section className={s.side} aria-hidden="true">
        <div className={s.backdrop}>
          {ROWS.map((row, r) => (
            <div key={r} className={s.row} data-dir={r % 2 ? 'right' : 'left'}>
              {[...row, ...row].map((tier, i) => (
                <span key={i} className={s.slot} data-tier={tier} />
              ))}
            </div>
          ))}
        </div>
        <div className={s.brand}>
          <img className={s.mark} src="/brand/mascote.webp" alt="" width={56} height={56} />
          <span className={s.word}>
            <span className={s.sorte}>Sorte</span>
            <span className={s.senai}>Senai</span>
          </span>
        </div>
        <div className={s.fan}>
          <CardView entry={FAN.left} size="m" className={s.fanLeft} />
          <CardView entry={FAN.mid} size="m" className={s.fanMid} />
          <CardView entry={FAN.right} size="m" className={s.fanRight} />
        </div>
        <p className={s.pitch}>As piadas da turma viraram figurinhas. Quanto mais rara, mais difícil de tirar.</p>
      </section>

      <section className={`panel ${s.card}`} aria-labelledby="login-title">
        {admin ? (
          <header className={s.head}>
            <span className={s.badge}>Área restrita</span>
            <h1 id="login-title" className={s.title}>
              Painel do admin
            </h1>
            <p className={s.sub}>Entre com o e-mail e a senha da sua conta de admin.</p>
          </header>
        ) : (
          <header className={s.head}>
            <h1 id="login-title" className={s.title}>
              {creating ? 'Crie sua conta' : 'Bem-vindo de volta'}
            </h1>
            <p className={s.sub}>Entre com Google ou e-mail e comece a colecionar.</p>
          </header>
        )}

        {sent ? (
          <div className={s.sent} role="status">
            <p className={s.sentTitle}>Confira seu e-mail</p>
            <p>
              Mandamos um link para <strong>{email.trim().toLowerCase()}</strong>. Abra o link para ativar a conta e depois entre aqui.
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => switchTab('entrar')}>
              Voltar para Entrar
            </button>
          </div>
        ) : (
          <>
            {!admin && (
              <>
                <button type="button" className={`btn btn-secondary ${s.google}`} onClick={() => run(() => deps.signInGoogle())} disabled={busy}>
                  <GoogleMark />
                  Continuar com Google
                </button>
                <p className={s.divider}>
                  <span>ou com e-mail</span>
                </p>
                <div className={s.tabs} role="tablist" aria-label="Escolha">
                  <button type="button" role="tab" aria-selected={tab === 'entrar'} onClick={() => switchTab('entrar')}>
                    Entrar
                  </button>
                  <button type="button" role="tab" aria-selected={tab === 'criar'} onClick={() => switchTab('criar')}>
                    Criar conta
                  </button>
                </div>
              </>
            )}

            <form className={s.form} onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="login-email">E-mail</label>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">Senha</label>
                <input
                  id="login-password"
                  className="input"
                  type="password"
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {creating && (
                <div className="field">
                  <label htmlFor="login-confirm">Confirmar senha</label>
                  <input
                    id="login-confirm"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <span className="hint">Pelo menos 8 caracteres.</span>
                </div>
              )}
              {error && (
                <p role="alert" className={s.error}>
                  {error}
                </p>
              )}
              <button type="submit" className={`btn btn-primary ${s.submit}`} disabled={busy}>
                {admin ? 'Entrar no painel' : creating ? 'Criar conta' : 'Entrar'}
              </button>
            </form>
          </>
        )}

        <footer className={s.foot}>
          {admin ? (
            <button type="button" className={s.link} onClick={() => (setAdmin(false), setError(null))}>
              Voltar para a entrada de jogador
            </button>
          ) : (
            <button type="button" className={s.link} onClick={() => (setAdmin(true), setError(null), setSent(false))}>
              Sou admin
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
