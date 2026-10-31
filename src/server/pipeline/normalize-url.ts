// URL normalization — docs/01-TRD.md §5.
// lowercase scheme+host; strip www.; drop fragment; drop tracking params;
// remove trailing slash (except root); sort remaining query params; decode redundant percent-encoding.

const DROP_PARAMS = new Set(['ref', 'gclid', 'fbclid', 'source']);

function isDroppedParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || DROP_PARAMS.has(k);
}

// Decode percent-escapes that only encode unreserved characters (%7E → ~).
// Reserved characters stay encoded so the URL keeps its meaning.
function decodeRedundant(input: string): string {
  return input.replace(/%([0-9a-f]{2})/gi, (match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    const ch = String.fromCharCode(code);
    return /[A-Za-z0-9\-._~]/.test(ch) ? ch : match;
  });
}

/** Normalizes an absolute (or scheme-less) URL. Throws on input that is not a valid http(s) URL. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('empty url');
  if (/^(mailto|javascript|data|file|ftp|gopher|ws|wss):/i.test(trimmed)) throw new Error('unsupported scheme');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`unsupported scheme ${url.protocol}`);

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) throw new Error('missing host');

  let path = decodeRedundant(url.pathname || '/');
  if (path !== '/' && path.endsWith('/')) path = path.replace(/\/+$/, '');
  if (!path) path = '/';

  const params: [string, string][] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (isDroppedParam(key)) continue;
    params.push([decodeRedundant(key), decodeRedundant(value)]);
  }
  params.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const query = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `${url.protocol}//${host}${path}${query}`;
}

/** Returns null instead of throwing (for citation streams where one bad URL must not kill a run). */
export function tryNormalizeUrl(input: string): string | null {
  try {
    return normalizeUrl(input);
  } catch {
    return null;
  }
}

/** Hostname only: lowercase, no www, no port. Throws on invalid input. */
export function normalizeHostname(input: string): string {
  return new URL(normalizeUrl(input)).hostname;
}

/** Resolves a possibly-relative href against a base URL; returns null for non-http(s) targets. */
export function resolveUrl(base: string, href: string): string | null {
  try {
    const resolved = new URL(href, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}
