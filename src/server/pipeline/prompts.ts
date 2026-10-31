// Prompt templates + category inference shared by the sample job and onboarding.
export type GeneratedPrompt = { text: string; intent: 'pricing' | 'docs' | 'comparison' | 'alternatives' | 'howto' | 'brand' };

const KNOWN_CATEGORIES = [
  'crm', 'analytics', 'project management', 'invoicing', 'email marketing', 'helpdesk', 'scheduling',
  'note-taking', 'database', 'website builder', 'accounting', 'form builder', 'design',
  'developer tools', 'payments', 'customer support', 'security', 'observability',
];

export function inferCategory(title: string, h1: string): string {
  const text = `${title} ${h1}`.toLowerCase();
  for (const k of KNOWN_CATEGORIES) if (text.includes(k)) return k;
  const stop = new Set(['the', 'a', 'an', 'for', 'and', 'of', 'your', 'with', 'software', 'app', 'platform', 'tool', 'tools', 'best', 'free', 'online']);
  const words = title.split(/\s+/).map((w) => w.replace(/[^a-z-]/gi, '').toLowerCase()).filter((w) => w.length > 2 && !stop.has(w));
  return words.slice(0, 2).join(' ') || 'software';
}

export function brandFromTitle(title: string, hostname: string): string {
  return (title.split(/[|\-–—:]/)[0] || hostname.split('.')[0]).trim();
}

// 8 sample-report prompts: 3 pricing-intent, 3 docs/how-to, 2 comparison/alternatives (TRD §10).
export function generatePrompts(brand: string, category: string): GeneratedPrompt[] {
  const c = category.toLowerCase();
  return [
    { text: `What is the best ${c} for small businesses?`, intent: 'pricing' },
    { text: `${brand} pricing — how much does ${brand} cost per month?`, intent: 'pricing' },
    { text: `Which ${c} tools are cheapest for a team of 10?`, intent: 'pricing' },
    { text: `How do I set up ${brand}?`, intent: 'howto' },
    { text: `${brand} documentation and API reference`, intent: 'docs' },
    { text: `How to import data into ${brand} from CSV?`, intent: 'howto' },
    { text: `${brand} vs alternatives — which should I pick?`, intent: 'comparison' },
    { text: `Best ${brand} alternatives in 2026`, intent: 'alternatives' },
  ];
}

// Onboarding offers a wider 15-question set (App Flow F2 step 3).
export function onboardingPrompts(brand: string, category: string): GeneratedPrompt[] {
  const c = category.toLowerCase();
  const extra: GeneratedPrompt[] = [
    { text: `Is ${brand} worth it for a small team?`, intent: 'brand' },
    { text: `${brand} reviews and pricing for startups`, intent: 'pricing' },
    { text: `How does ${brand} compare to spreadsheets?`, intent: 'comparison' },
    { text: `${brand} API — how do I authenticate?`, intent: 'docs' },
    { text: `What integrations does ${brand} support?`, intent: 'docs' },
    { text: `${c} for agencies — which tool should I choose?`, intent: 'comparison' },
    { text: `Cheapest ${c} with a free plan`, intent: 'pricing' },
  ];
  return [...generatePrompts(brand, category), ...extra];
}
