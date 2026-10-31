// SSRF-safe page fetcher — docs/01-TRD.md §8.
// - http/https only, DNS resolved and checked before every hop
// - private/loopback/link-local/metadata ranges blocked (IPv4 + IPv6)
// - max 3 redirects, each re-checked; 8 s timeout; 2 MB body cap; content-type allowlist
// - identified UA + 1 request/second per host
import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent, request } from 'undici';

export const USER_AGENT = 'CiteGapBot/1.0 (+https://citegap.app/bot)';
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'text/plain',
];

export type FetchFailureCode =
  | 'INVALID_URL' | 'PRIVATE_ADDRESS' | 'TOO_MANY_REDIRECTS'
  | 'TOO_LARGE' | 'UNSUPPORTED_CONTENT_TYPE' | 'NETWORK' | 'TIMEOUT';

export class SafeFetchError extends Error {
  readonly code: FetchFailureCode;
  constructor(code: FetchFailureCode, message: string, opts: { cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'SafeFetchError';
    this.code = code;
  }
}

export interface FetchedPage {
  status: number;
  finalUrl: string;
  body: string;
  contentType: string;
  headers: Record<string, string>;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata', 'instance-data',
]);

/** True for any address we must never connect to. Accepts IPv4 and IPv6 literals. */
export function isPrivateIp(address: string): boolean {
  const addr = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(addr)) {
    const parts = addr.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT
    if (a === 169 && b === 254) return true;                 // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;                   // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19)) return true;    // benchmarking
    if (a >= 224) return true;                               // multicast + reserved + broadcast
    return false;
  }
  if (net.isIPv6(addr)) {
    if (addr === '::' || addr === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true;         // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(addr)) return true;        // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(addr)) return true;           // multicast
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const hexMapped = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = Number.parseInt(hexMapped[1], 16);
      const lo = Number.parseInt(hexMapped[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return false;
  }
  // Not an IP literal — treat as unsafe for direct use.
  return true;
}

/** Synchronous URL safety gate: scheme + hostname shape (no DNS). Throws SafeFetchError. */
export function checkUrlSafety(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError('INVALID_URL', `not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('INVALID_URL', `unsupported scheme: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new SafeFetchError('INVALID_URL', 'missing hostname');
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new SafeFetchError('PRIVATE_ADDRESS', `blocked hostname: ${host}`);
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new SafeFetchError('PRIVATE_ADDRESS', `blocked private address: ${host}`);
  }
  return url;
}

interface ResolvedAddress { address: string; family: number }

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new SafeFetchError('PRIVATE_ADDRESS', `blocked private address: ${host}`);
    return [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch (err) {
    throw new SafeFetchError('NETWORK', `DNS lookup failed for ${host}`, { cause: err });
  }
  if (!addresses.length) throw new SafeFetchError('NETWORK', `no DNS records for ${host}`);
  for (const a of addresses) {
    if (isPrivateIp(a.address)) throw new SafeFetchError('PRIVATE_ADDRESS', `${host} resolves to blocked address ${a.address}`);
  }
  return addresses;
}

// per-host 1 req/s
const lastFetchByHost = new Map<string, number>();
async function throttle(host: string) {
  const last = lastFetchByHost.get(host) ?? 0;
  const wait = 1000 - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchByHost.set(host, Date.now());
}

/** Pins the connection to the pre-validated address so DNS rebinding cannot swap it. */
function pinnedLookup(addresses: ResolvedAddress[]) {
  return (
    _hostname: string,
    options: { all?: boolean },
    callback: (err: NodeJS.ErrnoException | null, address: string | ResolvedAddress[], family?: number) => void,
  ) => {
    if (options?.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
}

async function readCapped(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) throw new SafeFetchError('TOO_LARGE', `response exceeds ${MAX_BYTES} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

function headersToObject(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

/** Fetches a public page with SSRF protection. Follows ≤3 redirects, re-validating each hop. */
export async function fetchPageSafe(rawUrl: string, opts: { timeoutMs?: number; accept?: string[] } = {}): Promise<FetchedPage> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const allowed = opts.accept ?? ALLOWED_CONTENT_TYPES;
  let url = checkUrlSafety(rawUrl);
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const addresses = await resolvePublicAddresses(url.hostname);
    await throttle(url.hostname);

    const dispatcher = new Agent({ connect: { lookup: pinnedLookup(addresses) } });
    let res;
    try {
      res = await request(url, {
        method: 'GET',
        dispatcher,
        signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.1',
          'accept-language': 'en',
        },
      });
    } catch (err) {
      void dispatcher.close();
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new SafeFetchError('TIMEOUT', `timed out fetching ${url.toString()}`, { cause: err });
      }
      throw new SafeFetchError('NETWORK', `network error fetching ${url.toString()}`, { cause: err });
    }

    const headers = headersToObject(res.headers as Record<string, string | string[] | undefined>);
    const status = res.statusCode;

    if (status >= 300 && status < 400 && headers.location) {
      await res.body.dump();
      void dispatcher.close();
      if (hop === MAX_REDIRECTS) throw new SafeFetchError('TOO_MANY_REDIRECTS', `more than ${MAX_REDIRECTS} redirects`);
      url = checkUrlSafety(new URL(headers.location, url).toString());
      continue;
    }

    const contentType = (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!allowed.includes(contentType)) {
      await res.body.dump();
      void dispatcher.close();
      throw new SafeFetchError('UNSUPPORTED_CONTENT_TYPE', `unsupported content-type "${contentType || 'none'}" for ${url.toString()}`);
    }

    try {
      const body = await readCapped(res.body as AsyncIterable<Uint8Array>);
      return { status, finalUrl: url.toString(), body, contentType, headers };
    } finally {
      void dispatcher.close();
    }
  }
  throw new SafeFetchError('TOO_MANY_REDIRECTS', 'redirect limit reached');
}
