import { describe, expect, it } from 'vitest';
import { normalizeUrl, tryNormalizeUrl, resolveUrl, normalizeHostname } from '@/server/pipeline/normalize-url';

describe('normalizeUrl (TRD §5)', () => {
  const cases: [string, string][] = [
    ['https://www.Example.com/Path/', 'https://example.com/Path'],
    ['https://example.com/', 'https://example.com/'],
    ['https://example.com/#section', 'https://example.com/'],
    ['https://example.com/pricing#plans', 'https://example.com/pricing'],
    ['https://example.com/pricing/', 'https://example.com/pricing'],
    ['https://example.com/pricing?utm_source=x&utm_medium=y', 'https://example.com/pricing'],
    ['https://example.com/pricing?ref=nav', 'https://example.com/pricing'],
    ['https://example.com/pricing?gclid=abc', 'https://example.com/pricing'],
    ['https://example.com/pricing?fbclid=abc', 'https://example.com/pricing'],
    ['https://example.com/pricing?source=twitter', 'https://example.com/pricing'],
    ['https://example.com/search?b=2&a=1', 'https://example.com/search?a=1&b=2'],
    ['https://example.com/search?b=2&a=1&utm_campaign=z', 'https://example.com/search?a=1&b=2'],
    ['https://example.com/%7Euser', 'https://example.com/~user'],
    ['https://example.com/a%2Fb', 'https://example.com/a%2Fb'],
    ['https://example.com:443/pricing', 'https://example.com/pricing'],
    ['HTTP://EXAMPLE.COM/PLANS', 'http://example.com/PLANS'],
    ['acme.com/pricing', 'https://acme.com/pricing'],
    ['www.acme.com', 'https://acme.com/'],
    ['https://docs.acme.com/guide/', 'https://docs.acme.com/guide'],
    ['https://example.com/search?q=hello%20world', 'https://example.com/search?q=hello%20world'],
  ];

  it.each(cases)('normalizes %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it('returns null for unusable citations instead of throwing', () => {
    expect(tryNormalizeUrl('not a url')).toBeNull();
    expect(tryNormalizeUrl('mailto:hi@acme.com')).toBeNull();
  });

  it('extracts the normalized hostname', () => {
    expect(normalizeHostname('https://www.Acme.com/pricing')).toBe('acme.com');
  });

  it('resolves relative hrefs and rejects non-http schemes', () => {
    expect(resolveUrl('https://acme.com/docs/', '../pricing')).toBe('https://acme.com/pricing');
    expect(resolveUrl('https://acme.com/', 'mailto:x@y.com')).toBeNull();
    expect(resolveUrl('https://acme.com/', 'javascript:alert(1)')).toBeNull();
  });
});
