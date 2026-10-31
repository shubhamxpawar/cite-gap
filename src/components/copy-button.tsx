'use client';

import { useState } from 'react';

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
      }}
      aria-label={`Copy ${label ?? value}`}
      className="text-xs text-muted hover:text-ink"
    >
      {copied ? '✓ copied' : '⧉ copy'}
    </button>
  );
}
