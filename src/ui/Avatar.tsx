import { useState, type CSSProperties } from 'react';

/** Round player picture: the photo when there is one, else colored initials. */
export function Avatar({ initials, hue, size, url }: { initials: string; hue: number; size: string; url?: string | null }) {
  const [broken, setBroken] = useState(false);
  const show = url && !broken;
  return (
    <span className="avatar" style={{ '--hue': hue, '--size': size } as CSSProperties}>
      {show ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : initials}
    </span>
  );
}
