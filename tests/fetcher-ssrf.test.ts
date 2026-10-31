import { describe, expect, it } from 'vitest';
import { checkUrlSafety, isPrivateIp, SafeFetchError } from '@/server/pipeline/fetcher';

describe('SSRF protection (TRD §8)', () => {
  const blocked = [
    '127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:169.254.169.254',
  ];
  it.each(blocked)('blocks private/reserved address %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'];
  it.each(allowed)('allows public address %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it('rejects localhost by name before any DNS lookup', () => {
    expect(() => checkUrlSafety('http://localhost:3000/admin')).toThrow(SafeFetchError);
    expect(() => checkUrlSafety('http://foo.localhost/')).toThrow(SafeFetchError);
  });

  it('rejects the cloud metadata endpoint', () => {
    expect(() => checkUrlSafety('http://169.254.169.254/latest/meta-data/')).toThrow(/private address/i);
  });

  it('rejects non-http schemes and malformed URLs', () => {
    expect(() => checkUrlSafety('file:///etc/passwd')).toThrow(/unsupported scheme/i);
    expect(() => checkUrlSafety('gopher://example.com')).toThrow(/unsupported scheme/i);
    expect(() => checkUrlSafety('not-a-url')).toThrow(/not a valid URL/i);
  });

  it('accepts a normal public https URL', () => {
    const url = checkUrlSafety('https://acme.com/pricing');
    expect(url.hostname).toBe('acme.com');
  });
});
