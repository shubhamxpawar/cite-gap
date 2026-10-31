import { describe, expect, it } from 'vitest';
import { extractFeatures } from '@/server/pipeline/extract-features';
import { parseRobotsTxt, robotsVerdicts } from '@/server/pipeline/robots';
import { matchOwnPage } from '@/server/pipeline/match-own-page';

const ssrPricing = `<!doctype html><html><head>
<title>Acme Pricing — plans for every team</title>
<meta name="description" content="Simple pricing for teams of every size." />
<link rel="canonical" href="https://acme.com/pricing" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":["Product","Offer"],"dateModified":"2026-09-02"}</script>
<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
</head><body>
<h1>Pricing</h1>
<h2>Plans</h2><h2>Frequently asked questions</h2><h2>Can I cancel anytime?</h2>
<table><tr><td>Starter</td><td>$19 per seat / month</td></tr><tr><td>Pro</td><td>$49 per seat / month</td></tr></table>
<table><tr><td>Enterprise</td><td>Contact us</td></tr></table>
<p>${'Our plans are built for growing teams and include support, integrations and reporting. '.repeat(20)}</p>
<p>Starting at $19 per seat and $49 per user per month. Compare Starter vs Pro vs Enterprise.</p>
<a href="https://g2.com/products/acme">Reviews</a>
<time datetime="2026-09-01">Sept 1</time>
</body></html>`;

const jsOnly = `<!doctype html><html><head><title>Acme</title></head><body>
<div id="root"></div>
<script>${'window.__DATA__={};'.repeat(400)}</script>
</body></html>`;

const docsPage = `<!doctype html><html><head><title>API reference</title>
<meta name="robots" content="noindex" /></head><body>
<h1>API reference</h1><h2>Authentication</h2><h2>How do I create a key?</h2>
<pre><code>curl https://api.acme.com/v1</code></pre>
<pre>npm install acme</pre>
<p>${'Use the API to create records and read them back. '.repeat(30)}</p>
</body></html>`;

describe('extractFeatures (TRD §7.4)', () => {
  it('reads SSR pricing signals', () => {
    const { features, text } = extractFeatures(ssrPricing, 'https://acme.com/pricing', { status: 200 });
    expect(features.httpStatus).toBe(200);
    expect(features.titleLen).toBeGreaterThan(10);
    expect(features.metaDescriptionLen).toBeGreaterThan(10);
    expect(features.h1Count).toBe(1);
    expect(features.h2).toContain('Plans');
    expect(features.questionHeadings).toBeGreaterThanOrEqual(1);
    expect(features.tables).toBe(2);
    expect(features.priceTokens).toBeGreaterThanOrEqual(3);
    expect(features.planNames).toBeGreaterThanOrEqual(3);
    expect(features.jsonLdTypes).toEqual(expect.arrayContaining(['Product', 'Offer', 'FAQPage']));
    expect(features.dateModified).toBe('2026-09-02');
    expect(features.visibleDate).toBe('2026-09-01');
    expect(features.canonicalMismatch).toBe(false);
    expect(features.noindex).toBe(false);
    expect(features.likelyJsRendered).toBe(false);
    expect(features.outboundLinks).toBe(1);
    expect(text.length).toBeGreaterThan(500);
  });

  it('flags JS-only pages as likely JS-rendered', () => {
    const { features } = extractFeatures(jsOnly, 'https://acme.com/', { status: 200 });
    expect(features.likelyJsRendered).toBe(true);
    expect(features.wordCount).toBeLessThan(150);
  });

  it('detects noindex from meta and x-robots-tag', () => {
    expect(extractFeatures(docsPage, 'https://acme.com/docs').features.noindex).toBe(true);
    expect(extractFeatures(ssrPricing, 'https://acme.com/pricing', { headers: { 'x-robots-tag': 'noindex, nofollow' } }).features.noindex).toBe(true);
  });

  it('counts code blocks on docs pages', () => {
    expect(extractFeatures(docsPage, 'https://acme.com/docs').features.codeBlocks).toBe(2);
  });

  it('detects a canonical mismatch', () => {
    const html = `<html><head><title>x</title><link rel="canonical" href="https://acme.com/other"></head><body>${'word '.repeat(200)}</body></html>`;
    expect(extractFeatures(html, 'https://acme.com/pricing').features.canonicalMismatch).toBe(true);
  });

  it('passes robots verdicts and llms.txt through when supplied', () => {
    const { features } = extractFeatures(ssrPricing, 'https://acme.com/pricing', {
      robots: { GPTBot: 'deny', PerplexityBot: 'allow' },
      llmsTxt: true,
    });
    expect(features.robots).toEqual({ GPTBot: 'deny', PerplexityBot: 'allow' });
    expect(features.llmsTxt).toBe(true);
  });
});

describe('robots.txt parsing (TRD §7.4)', () => {
  const robots = `
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /private
Allow: /

User-agent: *
Disallow: /admin
`;
  it('parses groups', () => {
    const groups = parseRobotsTxt(robots);
    expect(groups.length).toBe(3);
    expect(groups[0].agents).toEqual(['gptbot']);
  });
  it('marks GPTBot denied and ClaudeBot allowed', () => {
    const v = robotsVerdicts(robots);
    expect(v.GPTBot).toBe('deny');
    expect(v.ClaudeBot).toBe('allow');
  });
  it('falls back to the wildcard group', () => {
    const v = robotsVerdicts('User-agent: *\nDisallow: /\n');
    expect(v.PerplexityBot).toBe('deny');
  });
});

describe('own-page matcher (TRD §7 step 2)', () => {
  const candidates = [
    { id: '1', url: 'https://acme.com/pricing', title: 'Pricing', pageType: 'pricing', textExcerpt: 'plans pricing per seat' },
    { id: '2', url: 'https://acme.com/docs', title: 'Docs', pageType: 'docs', textExcerpt: 'api reference' },
  ];
  it('picks /pricing for a pricing prompt', () => {
    expect(matchOwnPage('how much does acme cost per seat?', candidates)?.id).toBe('1');
  });
  it('picks /docs for a docs prompt', () => {
    expect(matchOwnPage('acme api reference docs', candidates)?.id).toBe('2');
  });
  it('returns null when there are no candidates (MISSING_PAGE)', () => {
    expect(matchOwnPage('pricing', [])).toBeNull();
  });
});
