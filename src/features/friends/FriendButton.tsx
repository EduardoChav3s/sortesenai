import { isLive, useFriendActions } from '@/data/live';
import type { FriendStatus } from '@/data/types';
import { friendAction } from './friendAction';

/** Add / accept / cancel / unfriend, by status. An incoming request also gets "Recusar". */
export function FriendButton({ id, status, small = false }: { id: string; status: FriendStatus | undefined; small?: boolean }) {
  const { send, respond, remove } = useFriendActions();
  const a = friendAction(status);
  if (!a) return null;
  const busy = send.isPending || respond.isPending || remove.isPending;
  const failed = send.isError || respond.isError || remove.isError;
  const sm = small ? ' btn-sm' : '';
  function run() {
    if (!isLive || !a) return;
    if (a.act === 'send') send.mutate(id);
    else if (a.act === 'accept') respond.mutate({ id, accept: true });
    else remove.mutate(id);
  }
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--space-xs)', alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}${sm}`} disabled={busy} onClick={run}>
        {busy ? 'Um momento…' : a.label}
      </button>
      {status === 'incoming' && (
        <button type="button" className={`btn btn-secondary${sm}`} disabled={busy} onClick={() => isLive && respond.mutate({ id, accept: false })}>
          Recusar
        </button>
      )}
      {failed && (
        <span role="alert" className="hint" style={{ color: 'var(--color-error)' }}>
          Não deu certo. Tente de novo.
        </span>
      )}
    </span>
  );
}
