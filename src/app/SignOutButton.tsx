import { useState } from 'react';

/** "Sair": ends the session, then drops the cached data so the next account starts clean. */
export function SignOutButton({ signOut, forget, className = 'btn btn-secondary btn-sm' }: { signOut: () => Promise<void>; forget: () => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      await signOut();
      forget();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className={className} onClick={run} disabled={busy}>
        {busy ? 'Saindo…' : 'Sair'}
      </button>
      {failed && (
        <span role="alert" className="hint" style={{ color: 'var(--color-error)' }}>
          Não deu para sair. Tente de novo.
        </span>
      )}
    </>
  );
}
