'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EngineChip, PageTypeChip, SourceBadge, UrlPill } from '@/components/ui';

type Step = { step: string; detail: string; at: string; status: 'running' | 'done' | 'error' };
type MatrixCell = { own: number; competitor: number; thirdParty: number };
type Result = {
  category: string;
  pagesByType: Record<string, number>;
  prompts: { text: string; intent: string }[];
  matrix: Record<string, Record<string, MatrixCell>>;
  missingTypes: string[];
  topCompetitorUrls: { url: string; host: string; count: number; pageType: string }[];
  teaser: { title: string; bullets: string[] };
  engines?: string[];
  mock?: boolean;
};

const ROWS = ['pricing', 'docs', 'comparison'];
const ENGINE_COLS = ['chatgpt', 'perplexity'];

export function SampleReport({ id, hostname }: { id: string; hostname: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [status, setStatus] = useState<'running' | 'ready' | 'partial' | 'failed'>('running');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/sample/${id}/stream`);
    es.addEventListener('step', (e) => {
      const step = JSON.parse((e as MessageEvent).data) as Step;
      setSteps((prev) => {
        const next = prev.filter((s) => !(s.step === step.step && s.status === 'running'));
        return [...next, step];
      });
    });
    es.addEventListener('done', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { status: typeof status; result: Result | null };
      setStatus(data.status);
      setResult(data.result);
      es.close();
    });
    es.addEventListener('error', (e) => {
      const data = (e as MessageEvent).data;
      if (data) setError((JSON.parse(data) as { message: string }).message);
      es.close();
    });
    return () => es.close();
  }, [id]);

  if (status === 'failed') {
    return (
      <div className="brutal p-8 text-center">
        <h2 className="font-display text-xl font-bold">We couldn&rsquo;t build this report</h2>
        <p className="mt-2 text-muted">The engines did not respond. Try again in a minute — nothing was charged to your budget.</p>
        <Link href="/" className="brutal-flat mt-4 inline-block bg-accent px-4 py-2 font-display font-bold">Try another domain</Link>
      </div>
    );
  }

  if (status === 'running' || !result) {
    return (
      <div>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">Reading {hostname}</h2>
          <p className="font-mono text-xs text-muted">{elapsed}s elapsed · live</p>
        </div>
        <ol className="space-y-2" aria-live="polite" aria-busy="true">
          {steps.map((s, i) => (
            <li key={`${s.step}-${i}`} className="brutal flex items-start gap-3 p-3">
              <span aria-hidden className={`mt-0.5 inline-block size-3 shrink-0 ${s.status === 'error' ? 'bg-critical' : s.status === 'running' ? 'animate-pulse bg-accent' : 'bg-own'}`} />
              <div>
                <p className="font-display text-sm font-bold">{s.step}</p>
                <p className="text-xs text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
          {steps.length === 0 && <li className="brutal p-3 text-sm text-muted">Connecting…</li>}
          <li className="brutal flex items-center gap-3 border-dashed p-3 text-sm text-muted">
            <span aria-hidden className="inline-block size-3 animate-pulse bg-third" />
            Working — this usually takes 30–90 seconds.
          </li>
        </ol>
        {error && <p role="alert" className="mt-3 border-2 border-critical p-2 text-sm text-critical">{error}</p>}
        <div className="mt-4 grid gap-2 opacity-40" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="brutal h-16 animate-pulse bg-third-tint" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-xs text-muted">SAMPLE REPORT</p>
          <h1 className="font-display text-3xl font-bold">{hostname}</h1>
          <p className="mt-1 text-sm text-muted">Category inferred: <strong className="text-ink">{result.category}</strong> · {result.prompts.length} buyer questions · {result.engines?.join(' + ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result.mock && (
            <span className="border-2 border-ink bg-accent px-2 py-0.5 text-xs font-bold" title="No provider API key is configured in this environment; engine answers are synthetic.">
              DEMO DATA · MOCK ENGINE
            </span>
          )}
          <SourceBadge model={result.engines?.join('+')} date={new Date().toLocaleDateString()} />
        </div>
      </header>

      {status === 'partial' && (
        <p className="border-2 border-ink bg-accent px-3 py-2 text-sm font-medium">One engine did not respond. Showing what we have — sample counts are smaller.</p>
      )}

      <section>
        <h2 className="font-display text-xl font-bold">Where each page type was cited</h2>
        <p className="mb-3 text-xs text-muted">Counts of cited URLs across the 8 buyer questions. Rows follow the intent of the question.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse border-2 border-ink bg-surface text-sm">
            <caption className="sr-only">Citation matrix by page type and engine</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-third-tint">
                <th scope="col" className="p-2 text-left font-display">Page type</th>
                {ENGINE_COLS.map((e) => <th key={e} scope="col" className="p-2 text-left"><EngineChip engine={e} /></th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row} className="border-b border-ink/20 last:border-0">
                  <th scope="row" className="p-2 text-left"><PageTypeChip type={row} /></th>
                  {ENGINE_COLS.map((engine) => {
                    const cell = result.matrix[row]?.[engine];
                    return (
                      <td key={engine} className="p-2">
                        {!cell ? <span className="text-xs text-muted">no citation</span> : (
                          <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                            <span className="bg-own-tint px-1.5 py-0.5 font-bold">own {cell.own}</span>
                            <span className="bg-competitor-tint px-1.5 py-0.5">comp {cell.competitor}</span>
                            <span className="bg-third-tint px-1.5 py-0.5">3rd {cell.thirdParty}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-xl font-bold">Pages missing from AI answers</h2>
          <ul className="mt-2 space-y-2">
            {result.missingTypes.length === 0 && <li className="brutal p-3 text-sm">Every tracked page type was cited at least once. Check the full report for prompt-level detail.</li>}
            {result.missingTypes.map((t) => (
              <li key={t} className="brutal flex items-start gap-2 p-3 text-sm">
                <span aria-hidden className="mt-0.5 font-bold text-competitor">▲</span>
                <span>
                  <strong>/{t}</strong> was never cited.
                  {t === 'comparison' && ' No comparison page was cited for the “vs” questions — third-party roundups won instead.'}
                  {t === 'pricing' && ' Competitors and review sites answered the pricing questions.'}
                  {t === 'docs' && ' Your documentation did not appear in setup or how-to answers.'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">Top URLs that beat you</h2>
          <ul className="mt-2 space-y-2">
            {result.topCompetitorUrls.map((u) => (
              <li key={u.url} className="brutal flex flex-wrap items-center justify-between gap-2 p-3">
                <UrlPill url={u.url} owner="third_party" pageType={u.pageType} />
                <span className="font-mono text-xs font-bold">{u.count}× cited</span>
              </li>
            ))}
            {result.topCompetitorUrls.length === 0 && <li className="brutal p-3 text-sm">No non-own URLs were cited — your pages won every answer in this sample.</li>}
          </ul>
        </section>
      </div>

      <section className="brutal bg-accent/20 p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold">{result.teaser.title}</h2>
          <span className="border border-ink bg-surface px-1.5 py-0.5 text-xs font-bold">TEASER</span>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {result.teaser.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2"><span aria-hidden className="font-bold text-competitor">▲</span>{b}</li>
          ))}
          <li aria-hidden className="select-none blur-[3px]">Your /pricing is missing the plan comparison table that appears on the winning page, and its prices are client-rendered.</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/signup?sampleId=${id}`}
            className="brutal-flat bg-ink px-4 py-2 font-display font-bold text-surface hover:bg-surface hover:text-ink"
          >
            Unlock full fix report (free account) ▸
          </Link>
          <p className="text-xs text-muted">Free workspace · 8 prompts · 2 engines · no card.</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold">The questions we asked</h2>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {result.prompts.map((p) => (
            <li key={p.text} className="flex items-start justify-between gap-2 border-b border-ink/15 py-1 text-sm">
              <span className="font-mono text-xs">{p.text}</span>
              <span className="shrink-0 border border-ink/40 px-1 text-[10px] uppercase text-muted">{p.intent}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
