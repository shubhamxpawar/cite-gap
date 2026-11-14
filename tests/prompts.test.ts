import { describe, expect, it } from 'vitest';
import { brandFromTitle, generatePrompts, inferCategory, onboardingPrompts } from '@/server/pipeline/prompts';

describe('prompt generation from a real site title', () => {
  // Title as served by https://cliputils.com/ (Aug 2026).
  const title = 'Free AI Video & Audio Tools, No Watermark · Clip Utils';
  const h1 = 'Free AI Video & Audio Tools';

  it('picks the hostname brand from the matching title segment', () => {
    expect(brandFromTitle(title, 'cliputils.com')).toBe('Clip Utils');
  });

  it('falls back to the hostname brand when no segment matches', () => {
    expect(brandFromTitle('Best Project Management Software', 'acme.com')).toBe('Best Project Management Software');
    expect(brandFromTitle('', 'cliputils.com')).toBe('cliputils');
  });

  it('detects the AI-video niche instead of falling back to software', () => {
    expect(inferCategory(title, h1)).toBe('ai video');
  });

  it('generates prompts that mention the niche, not accounting software', () => {
    const brand = brandFromTitle(title, 'cliputils.com');
    const category = inferCategory(title, h1);
    for (const p of generatePrompts(brand, category)) {
      expect(p.text.toLowerCase()).toMatch(/ai video|clip utils|cliputils/);
    }
    expect(onboardingPrompts(brand, category).length).toBe(15);
  });
});
