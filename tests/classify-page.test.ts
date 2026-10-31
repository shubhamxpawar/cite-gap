import { describe, expect, it } from 'vitest';
import { classifyPage, ownershipOf } from '@/server/pipeline/classify-page';

describe('classifyPage (TRD §5, 40 fixtures)', () => {
  const cases: [string, string][] = [
    ['https://acme.com/', 'homepage'],
    ['https://acme.com', 'homepage'],
    ['https://docs.acme.com/', 'docs'],
    ['https://developer.acme.com/api', 'docs'],
    ['https://developers.acme.com/', 'docs'],
    ['https://help.acme.com/article/123', 'docs'],
    ['https://support.acme.com/', 'docs'],
    ['https://acme.com/docs', 'docs'],
    ['https://acme.com/docs/getting-started', 'docs'],
    ['https://acme.com/documentation/getting-started', 'docs'],
    ['https://acme.com/guides/foo', 'docs'],
    ['https://acme.com/api', 'docs'],
    ['https://acme.com/api-reference', 'docs'],
    ['https://acme.com/reference/v2', 'docs'],
    ['https://acme.com/help', 'docs'],
    ['https://acme.com/learn', 'docs'],
    ['https://acme.com/tutorials', 'docs'],
    ['https://acme.com/pricing', 'pricing'],
    ['https://acme.com/plans', 'pricing'],
    ['https://acme.com/price', 'pricing'],
    ['https://acme.com/packages', 'pricing'],
    ['https://acme.com/pricing/enterprise', 'pricing'],
    ['https://acme.com/vs/rival', 'comparison'],
    ['https://acme.com/compare', 'comparison'],
    ['https://acme.com/comparison', 'comparison'],
    ['https://acme.com/acme-vs-rival', 'comparison'],
    ['https://acme.com/vs', 'comparison'],
    ['https://acme.com/alternatives', 'alternatives'],
    ['https://acme.com/competitors', 'alternatives'],
    ['https://acme.com/best-alternatives', 'alternatives'],
    ['https://acme.com/blog/post', 'blog'],
    ['https://acme.com/resources/guide', 'blog'],
    ['https://acme.com/articles/x', 'blog'],
    ['https://acme.com/changelog', 'changelog'],
    ['https://acme.com/release-notes', 'changelog'],
    ['https://acme.com/integrations', 'integrations'],
    ['https://acme.com/apps', 'integrations'],
    ['https://acme.com/marketplace', 'integrations'],
    ['https://acme.com/about', 'other'],
    ['https://acme.com/careers', 'other'],
  ];

  it.each(cases)('classifies %s as %s', (url, expected) => {
    expect(classifyPage(url)).toBe(expected);
  });

  it('first match wins: docs beats pricing when both appear', () => {
    expect(classifyPage('https://acme.com/docs/pricing')).toBe('docs');
  });

  it('uses title only as a fallback for otherwise unclassified paths', () => {
    expect(classifyPage('https://acme.com/x1', 'Simple pricing for teams')).toBe('pricing');
    expect(classifyPage('https://acme.com/x2', 'Acme vs Rival')).toBe('comparison');
    expect(classifyPage('https://acme.com/x3', 'API reference')).toBe('docs');
    expect(classifyPage('https://acme.com/x4', 'Our story')).toBe('other');
  });
});

describe('ownershipOf (TRD §5)', () => {
  it('treats the own domain and its subdomains as own', () => {
    expect(ownershipOf('https://acme.com/pricing', 'acme.com', [])).toBe('own');
    expect(ownershipOf('https://docs.acme.com/api', 'acme.com', [])).toBe('own');
    expect(ownershipOf('https://www.acme.com/', 'acme.com', [])).toBe('own');
  });

  it('tracks competitor domains and subdomains', () => {
    expect(ownershipOf('https://rival.com/pricing', 'acme.com', ['rival.com'])).toBe('competitor');
    expect(ownershipOf('https://blog.rival.com/x', 'acme.com', ['rival.com'])).toBe('competitor');
  });

  it('everything else is third party (G2, Reddit, Wikipedia)', () => {
    expect(ownershipOf('https://g2.com/categories/crm', 'acme.com', ['rival.com'])).toBe('third_party');
    expect(ownershipOf('https://en.wikipedia.org/wiki/CRM', 'acme.com', [])).toBe('third_party');
  });

  it('does not confuse suffix lookalikes with the own domain', () => {
    expect(ownershipOf('https://notacme.com/pricing', 'acme.com', [])).toBe('third_party');
    expect(ownershipOf('https://acme.com.evil.io/', 'acme.com', [])).toBe('third_party');
  });
});
