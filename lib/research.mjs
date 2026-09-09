// Contact research uses the built-in CLI WebSearch and WebFetch tools through
// --allowedTools, verified on CLI 2.1.261. Tool names are capitalized. A documented
// Brave Search API fallback exists, but it is deliberately not implemented here.
import { runClaudePrompt } from './claude-cli.mjs';

function emptyResearch(searchNote) {
  return {
    contact_signals: [],
    company_signals: [],
    suggested_hooks: [],
    nothing_found: true,
    search_note: String(searchNote || 'Research did not return usable results.'),
  };
}

function findBalancedEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseJsonObject(text) {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const end = findBalancedEnd(text, start);
    if (end === -1) continue;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { }
  }
  return null;
}

function normalizeResearch(parsed) {
  const requiredKeys = [
    'contact_signals', 'company_signals', 'suggested_hooks', 'nothing_found', 'search_note',
  ];
  if (!requiredKeys.every((key) => Object.hasOwn(parsed, key))) {
    return emptyResearch('Research response was missing required fields.');
  }

  const strings = (value) => Array.isArray(value) ? value.map((item) => String(item)) : [];
  return {
    contact_signals: strings(parsed.contact_signals),
    company_signals: strings(parsed.company_signals),
    suggested_hooks: strings(parsed.suggested_hooks),
    nothing_found: Boolean(parsed.nothing_found),
    search_note: String(parsed.search_note ?? ''),
  };
}

export async function research(body) {
  const functionInstruction = body.recipient_function
    ? ` Weight job postings related to the ${body.recipient_function} function most heavily.`
    : '';

  const system = `You are a sales intelligence researcher. Your job is to find current, publicly available information that a seller can use to personalize outreach to a specific contact.

Report ONLY what search actually returned. Never fabricate and never fill gaps with assumptions.
Tag each bullet with a source TYPE, not a URL, such as "job posting", "press release", "LinkedIn post", or "interview".
If a category yields nothing, say so instead of padding.
Keep bullets short and seller-usable. "Gong posted 6 RevOps roles in Aug 2026, which signals a team build-out, not a cost-cutting year" is useful. "Gong is hiring" is not.

Identity disambiguation is mandatory. Only report a contact signal when the source clearly ties that person to the named company. If several people share the name, or the tie is inferred rather than stated, omit the signal and say so in search_note. A confidently wrong personalization is worse than no personalization. Bias toward omission.

Prefer dated signals and put the date in the bullet. An undated signal used as a cold open can be years stale.

Respond with ONLY the JSON object specified by the user. No markdown fences, no commentary.`;

  const prompt = `Search the public web for current, seller-usable intelligence about ${body.contact_name} at ${body.company}.

Research and synthesize these four categories:
1. Company news from the last 90 days, including funding, layoffs, expansions, launches, and executive hires.
2. Job postings at ${body.company}.${functionInstruction}
3. Public activity by ${body.contact_name}, including posts, articles, podcasts, talks, and press quotes.
4. Awards, speaking engagements, or published opinions showing what ${body.contact_name} cares about.

Return this JSON object:
{
  "contact_signals": ["..."],
  "company_signals": ["..."],
  "suggested_hooks": ["..."],
  "nothing_found": false,
  "search_note": "..."
}`;

  try {
    const raw = await runClaudePrompt(prompt, {
      system,
      allowedTools: ['WebSearch', 'WebFetch'],
      timeoutMs: 300000,
      model: body.model || 'sonnet',
    });
    const parsed = parseJsonObject(raw);
    if (!parsed) return emptyResearch('Research returned a response that was not valid JSON.');
    return normalizeResearch(parsed);
  } catch (error) {
    return emptyResearch(error && error.message ? error.message : 'Research failed. Try again.');
  }
}
