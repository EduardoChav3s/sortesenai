import { useEffect, useState, type ReactNode } from 'react';

/** A button that asks inside itself: the first click arms it ("Confirmar?"), the second click within 4 s does it. */
export function ConfirmButton({ children, confirmLabel, onConfirm, className, disabled }: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      data-armed={armed || undefined}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
