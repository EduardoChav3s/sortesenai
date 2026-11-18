import { useEffect, useState, type ReactNode } from 'react';
import { decideGate } from './gate';
import { LoginPage, type LoginDeps } from './LoginPage';
import { LoginMusic } from './LoginMusic';
import s from './AuthGate.module.css';

type Access = 'ok' | 'not_invited' | 'banned';

/** What the gate needs from Supabase; injected so tests run without a server. */
export interface AuthDeps extends LoginDeps {
  getSession(): Promise<{ email: string } | null>;
  onChange(cb: (signedIn: boolean) => void): () => void;
  checkAccess(): Promise<Access>;
}

function Screen({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <main className={s.screen}>
      <div className={`panel ${s.card}`}>
        <img className={s.mark} src="/brand/mascote.webp" alt="" width={88} height={88} />
        <h1 className={s.word}>
          <span className={s.sorte}>Sorte</span>
          <span className={s.senai}>Senai</span>
        </h1>
        <h2 className={s.title}>{title}</h2>
        <p className={s.text}>{text}</p>
        {children}
      </div>
    </main>
  );
}

export function AuthGate({ deps, children }: { deps: AuthDeps | null; children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [checked, setChecked] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    if (!deps) return;
    let alive = true;
    deps.getSession().then((sess) => {
      if (!alive) return;
      setSignedIn(!!sess);
      setChecked(true);
    });
    // Supabase repeats "signed in" on load and token refresh; only a real change resets the access check.
    const off = deps.onChange((v) => {
      setSignedIn((prev) => {
        if (prev !== v) setAccess(null);
        return v;
      });
      setChecked(true);
    });
    return () => {
      alive = false;
      off();
    };
  }, [deps]);

  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!deps || !signedIn) return;
    let alive = true;
    setFailed(false);
    deps.checkAccess().then(
      (a) => alive && setAccess(a),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [deps, signedIn, attempt]);

  const gate = decideGate({ configured: !!deps, signedIn, access });
  if (gate === 'demo' || gate === 'app') return <>{children}</>;
  if (gate === 'loading' && failed)
    return (
      <Screen title="Não deu para abrir sua conta" text="Confira sua internet e tente de novo.">
        <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
          Tentar de novo
        </button>
      </Screen>
    );
  if (!checked || gate === 'loading') return <Screen title="Abrindo o álbum…" text="Preparando sua conta." />;
  if (gate === 'login')
    return (
      <>
        <LoginPage deps={deps!} onAdmin={() => window.location.assign('/admin')} />
        <LoginMusic />
      </>
    );
  const banned = gate === 'banned';
  return (
    <Screen
      title={banned ? 'Conta suspensa' : 'Acesso restrito'}
      text={banned ? 'Fale com o admin da turma para voltar.' : 'Não deu para abrir sua conta. Saia e entre de novo.'}
    >
      <button type="button" className="btn btn-secondary" onClick={() => deps!.signOut()}>
        Sair e usar outra conta
      </button>
    </Screen>
  );
}
