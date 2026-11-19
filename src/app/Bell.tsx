// The bell: notes the database wrote for this player (sales, proposals, coins, gifts, friends), live.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarkRead, useNotifications } from '@/data/bellLive';
import { isLive } from '@/data/live';
import { timeAgo } from '@/lib/chest';
import { IconBell } from '@/ui/icons';
import s from './Bell.module.css';

export function Bell() {
  const notes = useNotifications();
  const mark = useMarkRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!isLive) return null;
  const unread = notes.data?.unread ?? 0;
  const items = notes.data?.items ?? [];
  return (
    <div className={s.wrap} ref={box}>
      <button
        type="button"
        className={`btn btn-secondary ${s.bell}`}
        aria-label={unread > 0 ? `Avisos: ${unread} novos` : 'Avisos'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-ring={unread > 0 || undefined}
      >
        <IconBell size={18} />
        {unread > 0 && <span className={s.count}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className={`panel ${s.panel}`} role="dialog" aria-label="Avisos">
          <div className={s.head}>
            <strong>Avisos</strong>
            {unread > 0 && (
              <button type="button" className={s.all} onClick={() => mark.mutate(null)}>
                Marcar todos como lidos
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className={s.empty}>Nada por aqui ainda. Quando alguém comprar sua oferta, mandar moedas ou uma proposta, aparece aqui.</p>
          ) : (
            <ul className={s.list}>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={s.item}
                    data-unread={!n.read || undefined}
                    onClick={() => {
                      if (!n.read) mark.mutate([n.id]);
                      setOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <span className={s.text}>{n.body}</span>
                    <time className={s.time}>{timeAgo(n.created_at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
