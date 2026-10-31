// Thin llm() wrapper — docs/01-TRD.md §1. JSON-schema-style output via OpenAI or
// Anthropic when a key exists. No keys → throws NoKeyAvailableError; callers fall
// back to deterministic analysis (docs/decisions.md D5).
export class NoKeyAvailableError extends Error {}

const SYSTEM = 'You are a precise SEO analyst. Output only JSON conforming to the requested schema. Only cite evidence present in the supplied text. Never invent facts. Never promise rankings.';

export async function llmJson<T>(opts: { prompt: string; validate: (x: unknown) => T }): Promise<{ value: T; model: string }> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const model = openaiKey ? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini' : process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';

  let text: string | undefined;
  if (openaiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: opts.prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`llm openai ${res.status}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    text = json.choices[0]?.message?.content;
  } else if (anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: 'user', content: opts.prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`llm anthropic ${res.status}`);
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    text = json.content.find((c) => c.type === 'text')?.text;
  } else {
    throw new NoKeyAvailableError('no provider key configured');
  }

  const parsed: unknown = JSON.parse(text ?? '');
  return { value: opts.validate(parsed), model };
}
