'use client';

// Two-step destructive button: first click arms ("Click again to confirm"),
// second click submits. Auto-disarms after 5 s. Used for single-run deletion.
import { useEffect, useRef, useState } from 'react';

export function TwoStepDeleteButton({ action, name, value, label, confirmLabel, className }: {
  action: (formData: FormData) => void | Promise<void>;
  name: string;
  value: string;
  label: string;
  confirmLabel: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const arm = () => {
    setArmed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), 5_000);
  };

  return (
    <form action={action} className="inline">
      <input type="hidden" name={name} value={value} />
      <button
        type="submit"
        aria-live="polite"
        className={`${armed ? 'border-critical text-critical font-bold' : 'border-ink/30 text-muted hover:border-critical hover:text-critical'} border px-2 py-1 text-xs ${className ?? ''}`}
        onClick={(e) => {
          if (!armed) {
            e.preventDefault();
            arm();
          }
        }}
      >
        {armed ? confirmLabel : label}
      </button>
    </form>
  );
}
