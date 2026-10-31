// robots.txt checks for the AI crawlers CiteGap tracks — docs/01-TRD.md §7.4.
import { fetchPageSafe } from './fetcher';

export const TRACKED_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended',
] as const;

export type RobotsVerdict = Record<string, 'allow' | 'deny'>;

interface Group {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export function parseRobotsTxt(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (!current) continue;
      current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/** A bot is denied when its matching group disallows "/" (or a path that covers everything). */
export function robotsVerdicts(text: string, bots: readonly string[] = TRACKED_BOTS): RobotsVerdict {
  const groups = parseRobotsTxt(text);
  const verdict: RobotsVerdict = {};
  for (const bot of bots) {
    const name = bot.toLowerCase();
    const specific = groups.filter((g) => g.agents.includes(name));
    const fallback = groups.filter((g) => g.agents.includes('*'));
    const group = specific.length ? specific : fallback;
    const blocksAll = group.some((g) => g.rules.some((r) => !r.allow && (r.path === '/' || r.path === '/*')));
    verdict[bot] = blocksAll ? 'deny' : 'allow';
  }
  return verdict;
}

export async function fetchRobotsVerdicts(hostname: string): Promise<RobotsVerdict | undefined> {
  try {
    const res = await fetchPageSafe(`https://${hostname}/robots.txt`, { accept: ['text/plain', 'text/html'], timeoutMs: 8_000 });
    if (res.status >= 400) return undefined;
    return robotsVerdicts(res.body);
  } catch {
    return undefined;
  }
}

export async function hasLlmsTxt(hostname: string): Promise<boolean> {
  try {
    const res = await fetchPageSafe(`https://${hostname}/llms.txt`, { accept: ['text/plain', 'text/markdown', 'text/html'], timeoutMs: 6_000 });
    return res.status < 400;
  } catch {
    return false;
  }
}
