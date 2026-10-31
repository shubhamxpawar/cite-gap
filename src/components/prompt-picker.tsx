'use client';

import { useMemo, useState } from 'react';

export type PickablePrompt = { text: string; intent: string };

const GROUPS: { key: string; label: string; intents: string[] }[] = [
  { key: 'pricing', label: 'Pricing intent', intents: ['pricing'] },
  { key: 'comparison', label: 'Comparison & alternatives', intents: ['comparison', 'alternatives'] },
  { key: 'docs', label: 'Docs & how-to', intents: ['docs', 'howto'] },
  { key: 'brand', label: 'Brand', intents: ['brand'] },
];

export function PromptPicker({ prompts, limit, initial }: { prompts: PickablePrompt[]; limit: number; initial: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: prompts.filter((p) => g.intents.includes(p.intent)) })).filter((g) => g.items.length),
    [prompts],
  );

  function toggle(text: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else if (next.size < limit) next.add(text);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between border-2 border-ink bg-surface px-3 py-2">
        <span className="text-sm font-medium">Selected questions</span>
        <span className={`font-mono text-sm font-bold ${selected.size >= limit ? 'text-competitor' : ''}`}>{selected.size}/{limit}</span>
      </div>
      <div className="space-y-4">
        {groups.map((g) => (
          <fieldset key={g.key}>
            <legend className="mb-1 font-display text-sm font-bold">{g.label}</legend>
            <div className="space-y-1">
              {g.items.map((p) => {
                const checked = selected.has(p.text);
                const disabled = !checked && selected.size >= limit;
                return (
                  <label key={p.text} className={`flex cursor-pointer items-start gap-2 border border-ink/25 bg-surface px-2 py-1.5 text-sm ${disabled ? 'opacity-50' : 'hover:bg-third-tint'}`}>
                    <input
                      type="checkbox"
                      name="prompt"
                      value={p.text}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(p.text)}
                      className="mt-1 size-4 accent-[var(--ink)]"
                    />
                    <span className="font-mono text-xs leading-5">{p.text}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {selected.size === 0 && <p className="mt-2 text-xs text-muted">Pick at least one. The free plan allows {limit}.</p>}
    </div>
  );
}
