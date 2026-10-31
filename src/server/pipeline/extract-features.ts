// Deterministic page features — docs/01-TRD.md §7.4 + docs/04-Backend-Schema.md §7.
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

export interface PageFeatures {
  httpStatus: number;
  noindex: boolean;
  canonicalMismatch: boolean;
  likelyJsRendered: boolean;
  wordCount: number;
  h1Count: number;
  h2: string[];
  questionHeadings: number;
  tables: number;
  priceTokens: number;
  planNames: number;
  codeBlocks: number;
  jsonLdTypes: string[];
  visibleDate: string | null;
  dateModified: string | null;
  metaDescriptionLen: number;
  titleLen: number;
  outboundLinks: number;
  robots?: Record<string, string>;
  llmsTxt?: boolean;
}

export interface ExtractResult {
  features: PageFeatures;
  text: string;
  title: string;
  metaDescription: string;
}

const PLAN_WORDS = /\b(free|starter|basic|pro|professional|team|business|growth|scale|premium|enterprise|ultimate)\b/gi;
const PRICE_TOKEN = /(?:\$\s?\d[\d,.]*|\d[\d,.]*\s?(?:\/|per\s)\s?(?:mo|month|seat|user|year|yr)|\bper\s+seat\b|\bper\s+user\b)/gi;
const QUESTION_START = /^(how|what|why|when|which|who|can|should|is|are|do|does)\b/i;

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function jsonLdTypes(document: Document): { types: string[]; dateModified: string | null } {
  const types = new Set<string>();
  let dateModified: string | null = null;
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const parsed = JSON.parse(script.textContent ?? '');
      const visit = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(visit);
        const obj = node as Record<string, unknown>;
        const t = obj['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
        if (typeof obj.dateModified === 'string') dateModified = obj.dateModified;
        if (obj['@graph']) visit(obj['@graph']);
      };
      visit(parsed);
    } catch {
      // malformed JSON-LD is itself data; ignore the block
    }
  }
  return { types: [...types], dateModified };
}

function findVisibleDate(document: Document, text: string): string | null {
  const time = document.querySelector('time[datetime]')?.getAttribute('datetime');
  if (time) return time.slice(0, 10);
  const meta = document.querySelector('meta[property="article:published_time"], meta[name="date"], meta[itemprop="datePublished"]')?.getAttribute('content');
  if (meta) return meta.slice(0, 10);
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match ? match[1] : null;
}

function readableText(document: Document, rawHtml: string): string {
  try {
    const clone = document.cloneNode(true) as Document;
    const article = new Readability(clone).parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      return article.textContent.replace(/\s+/g, ' ').trim();
    }
  } catch {
    // fall through to the crude extraction
  }
  const body = document.body;
  const stripped = (body?.innerHTML ?? rawHtml)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return stripped.replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts the TRD §7.4 feature set from raw HTML. `finalUrl` is the post-redirect URL.
 * `opts.robots` / `opts.llmsTxt` are filled in by the caller when it has fetched them.
 */
export function extractFeatures(
  html: string,
  finalUrl: string,
  opts: { status?: number; headers?: Record<string, string>; robots?: Record<string, string>; llmsTxt?: boolean } = {},
): ExtractResult {
  const { document } = parseHTML(html);
  const doc = document as unknown as Document;

  const title = textOf(doc.querySelector('title'));
  const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  const text = readableText(doc, html);

  const robotsMeta = (doc.querySelector('meta[name="robots"], meta[name="googlebot"]')?.getAttribute('content') ?? '').toLowerCase();
  const xRobots = (opts.headers?.['x-robots-tag'] ?? '').toLowerCase();
  const noindex = robotsMeta.includes('noindex') || xRobots.includes('noindex');

  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  let canonicalMismatch = false;
  if (canonical) {
    try {
      const c = new URL(canonical, finalUrl);
      const f = new URL(finalUrl);
      canonicalMismatch = c.hostname !== f.hostname || c.pathname.replace(/\/$/, '') !== f.pathname.replace(/\/$/, '');
    } catch {
      canonicalMismatch = true;
    }
  }

  const scriptBytes = Array.from(doc.querySelectorAll('script'))
    .reduce((n, s) => n + (s.textContent?.length ?? 0), 0);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const likelyJsRendered = wordCount < 150 && (scriptBytes > 5_000 || html.length > 20_000);

  const h2 = Array.from(doc.querySelectorAll('h2')).map(textOf).filter(Boolean).slice(0, 20);
  const questionHeadings = [...Array.from(doc.querySelectorAll('h2, h3')).map(textOf)]
    .filter((h) => h.endsWith('?') || QUESTION_START.test(h)).length;

  const ld = jsonLdTypes(doc);
  const modifiedMeta = doc.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') ?? null;
  const dateModified = (ld.dateModified ?? modifiedMeta)?.slice(0, 10) ?? null;

  const origin = (() => {
    try { return new URL(finalUrl).hostname.replace(/^www\./, ''); } catch { return ''; }
  })();
  const outboundLinks = Array.from(doc.querySelectorAll('a[href^="http"]')).filter((a) => {
    try { return new URL(a.getAttribute('href') ?? '').hostname.replace(/^www\./, '') !== origin; } catch { return false; }
  }).length;

  const priceTokens = (text.match(PRICE_TOKEN) ?? []).length;
  const planNames = new Set((text.match(PLAN_WORDS) ?? []).map((w) => w.toLowerCase())).size;

  const features: PageFeatures = {
    httpStatus: opts.status ?? 200,
    noindex,
    canonicalMismatch,
    likelyJsRendered,
    wordCount,
    h1Count: doc.querySelectorAll('h1').length,
    h2,
    questionHeadings,
    tables: doc.querySelectorAll('table').length,
    priceTokens,
    planNames,
    codeBlocks: doc.querySelectorAll('pre').length,
    jsonLdTypes: ld.types,
    visibleDate: findVisibleDate(doc, text),
    dateModified,
    metaDescriptionLen: metaDescription.length,
    titleLen: title.length,
    outboundLinks,
    ...(opts.robots ? { robots: opts.robots } : {}),
    ...(opts.llmsTxt !== undefined ? { llmsTxt: opts.llmsTxt } : {}),
  };

  return { features, text, title, metaDescription };
}
