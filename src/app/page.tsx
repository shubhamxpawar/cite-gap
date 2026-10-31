import Link from 'next/link';
import { SampleForm } from '@/components/sample-form';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { PageTypeChip, SourceBadge } from '@/components/ui';

const STEPS = [
  { n: '01', title: 'Ask', body: 'We send the questions your buyers ask to ChatGPT and Perplexity, verbatim.' },
  { n: '02', title: 'Detect', body: 'Every cited URL is captured, normalized and tagged as yours, a competitor or a third party.' },
  { n: '03', title: 'Diagnose', body: 'Your page and the winning page are compared feature by feature: prices in HTML, tables, schema, headings.' },
  { n: '04', title: 'Fix', body: 'A prioritized checklist with evidence and suggested copy — smallest effort first.' },
  { n: '05', title: 'Verify', body: 'Mark items done, re-run the same prompts, and see when your page is cited.' },
];

const FAQ = [
  {
    q: 'How is this different from site-level AI trackers?',
    a: 'Trackers tell you a brand was mentioned. CiteGap shows the exact prompt, the exact URL that was cited, which of your pages should have won, and what is different about the page that won.',
  },
  {
    q: 'Do you scrape ChatGPT or Perplexity?',
    a: 'No. We call the providers\' APIs with web search. That approximates, but does not exactly replicate, the consumer apps (personalization and UI-only retrieval differ). Every result is labelled API-grounded with engine, model and timestamp.',
  },
  {
    q: 'Are these results guaranteed?',
    a: 'No. Single samples are noisy and citations rotate. Fix findings are differences between your page and the cited page — evidence, not a guarantee of citation. Audits use 3 samples per prompt.',
  },
  {
    q: 'What if my competitor blocks the fetch?',
    a: 'The report still builds from the answer excerpt and the features we could observe, with a banner telling you the competitor page could not be fetched.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-[1200px] px-4 pb-14 pt-12 sm:pt-20">
          <div className="max-w-3xl">
            <p className="mb-3 inline-block border-2 border-ink bg-own-tint px-2 py-0.5 font-mono text-xs font-bold">
              PAGE-LEVEL · EVIDENCE-FIRST
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-5xl">
              ChatGPT recommended your competitor&rsquo;s pricing page.
              <span className="block text-muted">Find out why — page by page.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted">
              Enter your domain. We run the questions your buyers ask, capture the exact URLs that were cited,
              and show what your page is missing versus the page that won.
            </p>
            <div className="mt-7">
              <SampleForm />
            </div>
          </div>
        </section>

        {/* Example teardown */}
        <section className="border-y-2 border-ink bg-surface">
          <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-display text-xl font-bold">Example teardown</h2>
                <span className="border border-ink bg-third-tint px-1.5 py-0.5 text-xs">Example</span>
              </div>
              <div className="brutal p-4">
                <p className="font-mono text-xs text-muted">prompt</p>
                <p className="font-mono text-sm font-semibold">&ldquo;best CRM for a team of 10 — pricing&rdquo;</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="border-2 border-ink bg-competitor-tint p-3">
                    <p className="text-xs font-bold uppercase">Winner</p>
                    <p className="mono-url mt-1 font-semibold">rival.com/pricing</p>
                    <p className="mt-1 text-xs">Cited by ChatGPT and Perplexity · 4 prompts</p>
                  </div>
                  <div className="border-2 border-ink bg-own-tint p-3">
                    <p className="text-xs font-bold uppercase">Your page</p>
                    <p className="mono-url mt-1 font-semibold">acme.com/pricing</p>
                    <p className="mt-1 text-xs">Not cited in any of the 8 answers</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  <li>▲ <strong>Price in server-rendered HTML</strong> — winner yes, yours no (JS-only table).</li>
                  <li>▲ <strong>FAQPage schema</strong> — winner yes, yours missing.</li>
                  <li>▲ <strong>Comparison table</strong> — winner 2, yours 0.</li>
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <PageTypeChip type="pricing" />
                  <PageTypeChip type="comparison" />
                  <SourceBadge model="example · API-grounded" date="illustrative" />
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <h2 className="font-display text-xl font-bold">What you get in the free sample</h2>
              {[
                'Page-type × engine matrix with exact URLs',
                'Pages missing from AI answers',
                'Top competitor URLs and how often they were cited',
                'One teaser fix with concrete evidence',
              ].map((t) => (
                <p key={t} className="flex items-start gap-2 border-b border-ink/15 pb-2 text-sm">
                  <span aria-hidden className="mt-0.5 font-bold text-own">✓</span>{t}
                </p>
              ))}
              <p className="text-xs text-muted">Full fix reports and history need a free account.</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[1200px] px-4 py-12">
          <h2 className="font-display text-2xl font-bold">How it works</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s) => (
              <div key={s.n} className="brutal p-4">
                <p className="font-mono text-xs text-muted">{s.n}</p>
                <h3 className="mt-1 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing strip */}
        <section className="border-y-2 border-ink bg-accent/30">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">Simple pricing, built for operators</h2>
              <p className="text-sm text-muted">Free sample · Starter $39/mo · Growth $99/mo · one-time audit $149.</p>
            </div>
            <Link href="/pricing" className="brutal-flat bg-surface px-4 py-2 font-display font-bold hover:bg-ink hover:text-surface">
              See plans ▸
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[1200px] px-4 py-12">
          <h2 className="font-display text-2xl font-bold">Questions</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {FAQ.map((f) => (
              <details key={f.q} className="brutal p-4">
                <summary className="cursor-pointer font-display font-bold">{f.q}</summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
