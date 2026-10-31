'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/;

export function SampleForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const host = value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    if (!host) return setError('Enter a domain, e.g. acme.com');
    if (!HOST_RE.test(host)) return setError('That does not look like a domain. Try acme.com');
    setSubmitting(true);
    try {
      const res = await fetch('/api/sample', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostname: host }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setError(json.error ?? 'Something went wrong. Try again.');
        setSubmitting(false);
        return;
      }
      router.push(`/sample/${json.id}`);
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl" noValidate>
      <div className={`flex flex-col gap-2 sm:flex-row ${compact ? '' : 'sm:gap-3'}`}>
        <label className="sr-only" htmlFor="domain">Your domain</label>
        <input
          id="domain"
          name="domain"
          inputMode="url"
          autoComplete="url"
          placeholder="yourdomain.com"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'domain-error' : undefined}
          className={`brutal-flat min-h-11 flex-1 bg-surface px-3 py-2 font-mono text-sm ${error ? 'border-critical' : ''}`}
        />
        <button
          type="submit"
          disabled={submitting}
          className="brutal brutal-hover min-h-11 bg-accent px-4 py-2 font-display font-bold disabled:opacity-60"
        >
          {submitting ? 'Starting…' : 'Get free sample report ▸'}
        </button>
      </div>
      {error && <p id="domain-error" role="alert" className="mt-2 text-sm font-medium text-critical">{error}</p>}
      <p className="mt-2 text-xs text-muted">No signup · ~60 seconds · checks ChatGPT + Perplexity</p>
    </form>
  );
}
