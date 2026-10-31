// Page classification + ownership — docs/01-TRD.md §5.
export type PageType =
  | 'pricing' | 'docs' | 'comparison' | 'alternatives' | 'blog'
  | 'changelog' | 'integrations' | 'homepage' | 'other';

export type OwnerClass = 'own' | 'competitor' | 'third_party';

const DOCS_HOST = /^(docs|developer|developers|help|support)\./i;
const DOCS_PATH = /^\/(docs|documentation|guides?|api(-reference)?|reference|help|learn|tutorials?)(\/|$)/i;
const PRICING_PATH = /(^|\/)(pricing|plans?|price|packages)(\/|$)/i;
const COMPARISON_PATH = /(^|\/)(vs|versus|compare|comparison)(\/|$|-)/i;
const COMPARISON_SLUG = /-vs-/i;
const ALTERNATIVES_PATH = /(^|\/)(alternatives?|competitors?)(\/|$|-)/i;
const ALTERNATIVES_SLUG = /-alternatives(\/|$)/i;
const BLOG_PATH = /(^|\/)(blog|resources|articles)(\/|$)/i;
const CHANGELOG_PATH = /(^|\/)(changelog|release-notes)(\/|$)/i;
const INTEGRATIONS_PATH = /(^|\/)(integrations?|apps|marketplace)(\/|$)/i;

/**
 * First match wins (TRD §5). `url` may be absolute or just a path; `title` is a
 * fallback signal for otherwise unclassifiable URLs.
 */
export function classifyPage(url: string, title?: string): PageType {
  let host = '';
  let path = url;
  try {
    const u = new URL(url, 'https://example.invalid');
    host = u.hostname;
    path = u.pathname;
  } catch {
    path = url.split(/[?#]/)[0] || '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  const slug = path.split('/').filter(Boolean).pop() ?? '';

  if (DOCS_HOST.test(host) || DOCS_PATH.test(path)) return 'docs';
  if (PRICING_PATH.test(path)) return 'pricing';
  if (COMPARISON_PATH.test(path) || COMPARISON_SLUG.test(slug)) return 'comparison';
  if (ALTERNATIVES_PATH.test(path) || ALTERNATIVES_SLUG.test(slug)) return 'alternatives';
  if (CHANGELOG_PATH.test(path)) return 'changelog';
  if (BLOG_PATH.test(path)) return 'blog';
  if (INTEGRATIONS_PATH.test(path)) return 'integrations';
  if (path === '/' || path === '') return 'homepage';

  // Title fallback: only for pages the URL rules could not classify.
  const t = (title ?? '').toLowerCase();
  if (/\bpricing\b|\bplans\b/.test(t)) return 'pricing';
  if (/\bvs\b|\bcomparison\b/.test(t)) return 'comparison';
  if (/\balternatives?\b/.test(t)) return 'alternatives';
  if (/\bdocs?\b|\bapi reference\b/.test(t)) return 'docs';
  return 'other';
}

function hostOf(urlOrHost: string): string {
  try {
    return new URL(urlOrHost).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return urlOrHost.toLowerCase().replace(/^www\./, '').split('/')[0];
  }
}

function matchesDomain(host: string, domain: string): boolean {
  const d = hostOf(domain);
  return host === d || host.endsWith(`.${d}`);
}

/** Ownership per TRD §5: own host or subdomain → own; tracked competitor → competitor; else third_party. */
export function ownershipOf(urlOrHost: string, ownDomain: string, competitorDomains: string[]): OwnerClass {
  const host = hostOf(urlOrHost);
  if (ownDomain && matchesDomain(host, ownDomain)) return 'own';
  if (competitorDomains.some((d) => d && matchesDomain(host, d))) return 'competitor';
  return 'third_party';
}
