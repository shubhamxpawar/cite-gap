import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { Disclaimer } from '@/components/ui';

export const metadata = { title: 'Pricing — CiteGap' };

const PLANS = [
  {
    name: 'Starter',
    price: '$39',
    cadence: '/mo',
    tagline: 'For a solo founder fixing one site.',
    popular: false,
    features: ['25 prompts', '3 engines', '2 competitors', 'Weekly checks', '5 fix reports / month'],
    cta: 'Start with Starter',
    href: '/signup?plan=starter',
  },
  {
    name: 'Growth',
    price: '$99',
    cadence: '/mo',
    tagline: 'For a lean growth team shipping weekly.',
    popular: true,
    features: ['100 prompts', '4 engines', '5 competitors', '2× weekly + daily top-10', 'Unlimited fix reports'],
    cta: 'Start with Growth',
    href: '/signup?plan=growth',
  },
  {
    name: 'Audit',
    price: '$149',
    cadence: 'one-time',
    tagline: 'A deep read before you commit to a plan.',
    popular: false,
    features: ['40 prompts', '4 engines', '5 competitors', '3 samples per prompt, once', 'Full PDF / HTML export'],
    cta: 'Request an audit',
    href: '/signup?plan=audit',
  },
];

const FAQ = [
  {
    q: 'How is the audit credit applied?',
    a: 'The $149 audit is credited toward any plan you start within 30 days of the audit. Buy the audit, then pick Starter or Growth and the credit is deducted.',
  },
  {
    q: 'What counts as an engine?',
    a: 'Each provider API is one engine: ChatGPT, Claude, Perplexity or Gemini. Plans with fewer engines run the highest-priority set you configure.',
  },
  {
    q: 'What is a fix report?',
    a: 'A page-level diagnosis for one lost prompt: the cited URL, your best matching page, measured differences, and a prioritized checklist with suggested copy.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes. Prompts, competitors and run history stay with the workspace; limits and cadence change immediately.',
  },
  {
    q: 'Do you guarantee citations?',
    a: 'No. Fix findings are evidence-based differences between your page and the page that won. Samples are noisy; compare runs before large changes.',
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-4 py-12">
          <h1 className="font-display text-4xl font-bold">Pricing that fits an operator, not an enterprise.</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Every plan answers the same question: which page did the engine cite, and what is different about yours?
            Start with a free sample report — no account needed.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => (
              <section key={p.name} className={`relative flex flex-col p-5 ${p.popular ? 'brutal bg-surface' : 'brutal-flat bg-surface'}`}>
                {p.popular && (
                  <span className="absolute -top-3 left-4 border-2 border-ink bg-accent px-2 py-0.5 text-xs font-bold uppercase">Most popular</span>
                )}
                <h2 className="font-display text-xl font-bold">{p.name}</h2>
                <p className="mt-1 text-xs text-muted">{p.tagline}</p>
                <p className="mt-4 font-display text-4xl font-bold">
                  {p.price}<span className="ml-1 font-sans text-sm font-medium text-muted">{p.cadence}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 border-b border-ink/15 pb-1.5">
                      <span aria-hidden className="font-bold text-own">✓</span>{f}
                    </li>
                  ))}
                </ul>
                <Link href={p.href} className={`mt-5 inline-block px-4 py-2 text-center font-display font-bold ${p.popular ? 'brutal brutal-hover bg-accent' : 'brutal-flat bg-surface hover:bg-ink hover:text-surface'}`}>
                  {p.cta} ▸
                </Link>
              </section>
            ))}
          </div>

          <div className="brutal mt-4 flex flex-wrap items-center justify-between gap-3 bg-own-tint p-4">
            <div>
              <h2 className="font-display text-lg font-bold">Free sample report</h2>
              <p className="text-sm">8 auto-generated prompts · 2 engines · once per domain every 7 days · teaser fix only.</p>
            </div>
            <Link href="/" className="brutal-flat bg-surface px-4 py-2 font-display font-bold hover:bg-ink hover:text-surface">Get a free sample ▸</Link>
          </div>

          <p className="mt-4 text-xs text-muted">The audit credit is explained in one line above: $149, credited to any plan within 30 days.</p>

          <section className="mt-12">
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

          <div className="mt-8">
            <Disclaimer>Prices are in USD. Provider costs are capped per plan; the budget guard stops a run before it exceeds the cap. Findings are evidence-based differences, not guaranteed causes of citation.</Disclaimer>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
