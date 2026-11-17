// Page discovery — docs/01-TRD.md §10 step 2: robots.txt → sitemap(s) → classify; nav fallback; caps.
import { fetchPageSafe } from './fetcher';
import { normalizeUrl, resolveUrl } from './normalize-url';
import { classifyPage, type PageType } from './classify-page';
import { parseHTML } from 'linkedom';

export interface DiscoveredPage {
  url: string;
  pageType: PageType;
}

export interface DiscoverResult {
  pages: DiscoveredPage[];
  sitemapsTried: number;
  source: 'sitemap' | 'nav' | 'none';
  error?: string;
}

const MAX_URLS = 500;
const MAX_SITEMAPS = 6;
const MAX_SITEMAP_BYTES_FROM = 5 * 1024 * 1024;

// Important page types that must survive a 500-URL sitemap cap (blog/other can
 // always be re-derived; a missing /pricing or homepage hides the product).
const IMPORTANT_TYPES = new Set<PageType>(['homepage', 'pricing', 'comparison', 'alternatives', 'docs', 'integrations', 'changelog']);
const TYPE_ORDER: Record<string, number> = { homepage: 0, pricing: 1, comparison: 2, alternatives: 3, docs: 4, integrations: 5, changelog: 6, blog: 7, other: 8 };

function localePenalty(url: string): number {
  try {
    const first = new URL(url).pathname.split('/').filter(Boolean)[0] ?? '';
    // /pt-br/…, /zh-tw/…, /en/… style locale prefixes sort after plain paths
    return /^[a-z]{2}([-_][a-zA-Z0-9]{2,4})?$/.test(first) ? 1 : 0;
  } catch {
    return 0;
  }
}

function hostMatches(host: string, own: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  const o = own.toLowerCase().replace(/^www\./, '');
  return h === o || h.endsWith(`.${o}`);
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

async function fetchText(url: string, accept: string[]): Promise<string | null> {
  try {
    const res = await fetchPageSafe(url, { accept, timeoutMs: 10_000 });
    if (res.status >= 400) return null;
    if (res.body.length > MAX_SITEMAP_BYTES_FROM) return res.body.slice(0, MAX_SITEMAP_BYTES_FROM);
    return res.body;
  } catch {
    return null;
  }
}

export async function discoverPages(hostname: string): Promise<DiscoverResult> {
  const own = hostname.toLowerCase().replace(/^www\./, '');
  const root = `https://${own}/`;
  const pages = new Map<string, DiscoveredPage>();
  const important = new Map<string, DiscoveredPage>();
  const IMPORTANT_MAX = 250;
  const add = (raw: string) => {
    try {
      const norm = normalizeUrl(raw);
      const host = new URL(norm).hostname;
      if (!hostMatches(host, own)) return;
      const pageType = classifyPage(norm);
      const isImportant = IMPORTANT_TYPES.has(pageType as PageType);
      if (isImportant) {
        if (!important.has(norm) && important.size < IMPORTANT_MAX) important.set(norm, { url: norm, pageType });
        return;
      }
      if (pages.size >= MAX_URLS) return;
      if (pages.has(norm)) return;
      pages.set(norm, { url: norm, pageType });
    } catch {
      // ignore malformed loc
    }
  };

  const robots = await fetchText(`https://${own}/robots.txt`, ['text/plain', 'text/html']);
  const sitemapUrls: string[] = [];
  if (robots) {
    for (const line of robots.split(/\r?\n/)) {
      const m = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (m) {
        const resolved = resolveUrl(`https://${own}/`, m[1]);
        if (resolved && !sitemapUrls.includes(resolved)) sitemapUrls.push(resolved);
      }
    }
  }
  if (sitemapUrls.length === 0) sitemapUrls.push(`https://${own}/sitemap.xml`, `https://${own}/sitemap_index.xml`);

  // Critical pages first: they must appear whenever the site serves them, even if the
  // sitemap is enormous. Reserve room for them before the sitemap pass fills `important`.
  const critical = ['/', '/pricing', '/pro', '/plans', '/compare', '/comparison', '/alternatives', '/docs', '/changelog', '/integrations'];
  await Promise.all(
    critical.map(async (path) => {
      const url = resolveUrl(root, path)!;
      const norm = normalizeUrl(url);
      if (important.has(norm)) return;
      const pageType = classifyPage(url) as PageType;
      if (!IMPORTANT_TYPES.has(pageType)) return;
      try {
        const res = await fetchPageSafe(url, { timeoutMs: 8_000 });
        if (res.status < 400) important.set(norm, { url: norm, pageType });
      } catch {
        // absent path — nothing to add
      }
    }),
  );

  let sitemapsTried = 0;
  const queue = [...sitemapUrls];
  const seenSitemaps = new Set<string>();
  while (queue.length && sitemapsTried < MAX_SITEMAPS && pages.size + important.size < MAX_URLS) {
    const sitemapUrl = queue.shift()!;
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    sitemapsTried += 1;
    const xml = await fetchText(sitemapUrl, ['application/xml', 'text/xml', 'text/plain']);
    if (!xml) continue;
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    const found = locs(xml);
    if (isIndex) {
      for (const child of found) {
        const resolved = resolveUrl(sitemapUrl, child);
        if (resolved && queue.length + sitemapsTried < MAX_SITEMAPS) queue.push(resolved);
      }
    } else {
      for (const loc of found) add(loc);
    }
  }

  if (pages.size + important.size < 10) {
    // nav fallback: homepage links
    const home = await fetchText(root, ['text/html', 'application/xhtml+xml']);
    if (home) {
      const { document } = parseHTML(home);
      for (const a of Array.from(document.querySelectorAll('a[href]'))) {
        const href = a.getAttribute('href');
        if (!href) continue;
        const resolved = resolveUrl(root, href);
        if (resolved) add(resolved);
        if (pages.size >= MAX_URLS) break;
      }
    }
  }

  const list = [...important.values(), ...pages.values()]
    .sort((a, b) => (TYPE_ORDER[a.pageType] ?? 9) - (TYPE_ORDER[b.pageType] ?? 9) || localePenalty(a.url) - localePenalty(b.url) || a.url.localeCompare(b.url))
    .slice(0, MAX_URLS);
  if (!list.length) {
    return { pages: [], sitemapsTried, source: 'none', error: 'No pages found (site unreachable or no sitemap/nav links)' };
  }
  return { pages: list, sitemapsTried, source: sitemapsTried > 0 && list.length ? 'sitemap' : 'nav' };
}
