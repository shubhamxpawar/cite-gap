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
  const add = (raw: string) => {
    if (pages.size >= MAX_URLS) return;
    try {
      const norm = normalizeUrl(raw);
      const host = new URL(norm).hostname;
      if (!hostMatches(host, own)) return;
      if (pages.has(norm)) return;
      pages.set(norm, { url: norm, pageType: classifyPage(norm) });
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

  let sitemapsTried = 0;
  const queue = [...sitemapUrls];
  const seenSitemaps = new Set<string>();
  while (queue.length && sitemapsTried < MAX_SITEMAPS && pages.size < MAX_URLS) {
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

  if (pages.size < 10) {
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

  const list = [...pages.values()];
  if (!list.length) {
    return { pages: [], sitemapsTried, source: 'none', error: 'No pages found (site unreachable or no sitemap/nav links)' };
  }
  // homepage first, then known page types before "other"
  const order: Record<string, number> = { homepage: 0, pricing: 1, comparison: 2, alternatives: 3, docs: 4, integrations: 5, blog: 6, changelog: 7, other: 8 };
  list.sort((a, b) => order[a.pageType] - order[b.pageType]);
  return { pages: list, sitemapsTried, source: sitemapsTried > 0 && list.length ? 'sitemap' : 'nav' };
}
