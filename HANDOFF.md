# HANDOFF: Cold Outreach Grader

Build a standalone Node.js web app called **outreach-grader**. This is a portfolio tool that grades cold sales outreach messages (email/LinkedIn) using Claude AI. It runs locally; Claude calls go through the user's own Claude subscription (via the `claude` CLI), same pattern as trajecktory.

---

## Project structure to create

```
outreach-grader/
  HANDOFF.md          ← this file
  .env.example
  .gitignore
  package.json
  server.mjs
  lib/
    prompt.mjs        ← scoring + rewrite prompt assembly
    validate.mjs      ← input validation
    claude-cli.mjs    ← claude CLI runner (copy from reference below)
  public/
    index.html
    styles.css
    app.js
```

---

## Reference: claude-cli.mjs

Copy this EXACTLY into `lib/claude-cli.mjs`. Do NOT modify it.

```js
// Run a one-shot prompt on the user's Claude PLAN (their `claude login`), via the
// bundled Claude Code CLI — no Anthropic API key needed.
import { spawn } from 'child_process';
import os from 'os';

function modelAlias(model) {
  if (!model) return null;
  const m = String(model).toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return /^claude-[a-z0-9.-]+$/i.test(m) ? model : null;
}

function startErr(e) {
  if (e && e.code === 'ENOENT') {
    return 'Claude Code CLI not found. Make sure `claude` is installed and on your PATH, then retry.';
  }
  return (e && e.message) || 'Failed to start Claude Code.';
}

function planErr(msg, stderr) {
  const all = `${msg || ''}\n${stderr || ''}`;
  if (/not recognized|command not found|ENOENT/i.test(all)) {
    return 'Claude Code CLI not found. Make sure `claude` is installed and on your PATH.';
  }
  if (/\b401\b|login|authenticat|unauthor|not logged in|sign ?in|token (?:expired|invalid)/i.test(all)) {
    return 'Not signed in to Claude. Run `claude login` in a terminal, then retry.';
  }
  return msg || 'Claude Code failed to generate a response.';
}

export function runClaudePrompt(prompt, { model, system, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const alias = modelAlias(model);
    const args = ['-p', '--output-format', 'json', '--no-session-persistence'];
    if (alias) args.push('--model', alias);

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    let child;
    try {
      child = spawn('claude', args, { cwd: os.tmpdir(), env, shell: isWin, windowsHide: true });
    } catch (e) {
      return reject(new Error(startErr(e)));
    }

    let out = '', err = '', settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; clearTimeout(timer); fn(val); } };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { }
      finish(reject, new Error('Claude timed out. Try again.'));
    }, timeoutMs);

    child.on('error', (e) => finish(reject, new Error(startErr(e))));
    child.stdout && child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr && child.stderr.on('data', (d) => { err += d.toString(); });

    if (child.stdin) {
      try {
        child.stdin.write(system ? `${system}\n\n${prompt}` : prompt);
        child.stdin.end();
      } catch { }
    }

    child.on('close', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(out.trim()); } catch { }
      if (parsed && typeof parsed.result === 'string' && !parsed.is_error) {
        return finish(resolve, parsed.result);
      }
      if (parsed && parsed.is_error) {
        return finish(reject, new Error(planErr(parsed.result, err)));
      }
      if (code !== 0) {
        return finish(reject, new Error(planErr(err || `claude exited ${code}`, err)));
      }
      if (out.trim()) return finish(resolve, out.trim());
      return finish(reject, new Error(planErr(err || 'Claude returned no output', err)));
    });
  });
}
```

---

## package.json

```json
{
  "name": "outreach-grader",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.mjs"
  },
  "dependencies": {
    "express": "^5.1.0",
    "express-rate-limit": "^7.5.0"
  }
}
```

---

## .gitignore

```
node_modules/
.env
```

---

## .env.example

```
# Optional: set to override the default port
PORT=3000
```

---

## server.mjs

Express server. Serves static files from `public/`. Two API routes. Rate limiting. No ANTHROPIC_API_KEY needed.

```js
import express from 'express';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import { grade } from './lib/prompt.mjs';
import { rewrite } from './lib/prompt.mjs';
import { validateGrade, validateRewrite } from './lib/validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Hourly limit reached. Try again in an hour.' },
});

app.use('/api/', globalLimiter);

app.post('/api/grade', aiLimiter, async (req, res) => {
  const err = validateGrade(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const result = await grade(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Grading failed. Try again.' });
  }
});

app.post('/api/rewrite', aiLimiter, async (req, res) => {
  const err = validateRewrite(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const result = await rewrite(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Rewrite failed. Try again.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Outreach Grader running at http://localhost:${PORT}`);
});
```

---

## lib/validate.mjs

```js
const LEVELS = ['ic', 'manager', 'director', 'vp', 'c_suite'];
const FUNCTIONS = ['sales', 'revops', 'marketing', 'finance', 'hr', 'engineering', 'other'];
const INDUSTRIES = ['saas', 'financial_services', 'healthcare', 'manufacturing', 'professional_services', 'other', null];
const CHANNELS = ['cold_email', 'linkedin_dm', 'linkedin_connection'];
const CTAS = ['meeting', 'reply', 'resource', 'referral', 'connect'];

export function validateGrade(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body.';
  const { message, subject_line, recipient_level, recipient_function, industry, channel, cta_type } = body;

  if (!message || typeof message !== 'string' || !message.trim()) return 'Message is required.';
  if (message.length > 5000) return 'Message must be under 5000 characters.';
  if (!LEVELS.includes(recipient_level)) return 'Invalid recipient_level.';
  if (!FUNCTIONS.includes(recipient_function)) return 'Invalid recipient_function.';
  if (!INDUSTRIES.includes(industry ?? null)) return 'Invalid industry.';
  if (!CHANNELS.includes(channel)) return 'Invalid channel.';
  if (!CTAS.includes(cta_type)) return 'Invalid cta_type.';
  if (channel === 'cold_email') {
    if (!subject_line || typeof subject_line !== 'string' || !subject_line.trim()) {
      return 'subject_line is required for cold email.';
    }
    if (subject_line.length > 200) return 'Subject line must be under 200 characters.';
  }
  return null;
}

export function validateRewrite(body) {
  const base = validateGrade(body);
  if (base) return base;
  if (!body.score_result || typeof body.score_result !== 'object') return 'score_result is required.';
  if (typeof body.score_result.overall_score !== 'number') return 'score_result.overall_score must be a number.';
  if (!Array.isArray(body.score_result.top_fixes)) return 'score_result.top_fixes must be an array.';
  return null;
}
```

---

## lib/prompt.mjs

This is the most important file. It assembles the Claude prompts and calls `runClaudePrompt`.

### Imports and helpers

```js
import { runClaudePrompt } from './claude-cli.mjs';
import { clean } from '../../ai-text-hygiene/src/index.mjs';
```

Wait — the ai-text-hygiene library is a sibling repo at `../ai-text-hygiene/`. Import it with a relative path:

```js
import { clean } from '../../../ai-text-hygiene/src/index.mjs';
```

No wait — outreach-grader is at `C:\Users\micha\Documents\ClaudeCode\outreach-grader\`. The ai-text-hygiene repo is at `C:\Users\micha\Documents\ClaudeCode\ai-text-hygiene\`. So the relative path from `lib/prompt.mjs` is:

```js
import { clean } from '../../ai-text-hygiene/src/index.mjs';
```

### Label helpers

```js
const LEVEL_LABELS = {
  ic: 'Individual Contributor (IC)',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP',
  c_suite: 'C-Suite / Executive',
};

const FUNCTION_LABELS = {
  sales: 'Sales',
  revops: 'RevOps / Sales Ops',
  marketing: 'Marketing',
  finance: 'Finance / Accounting',
  hr: 'HR / People',
  engineering: 'Engineering / Product',
  other: 'Other',
};

const INDUSTRY_LABELS = {
  saas: 'SaaS / Tech',
  financial_services: 'Financial Services',
  healthcare: 'Healthcare',
  manufacturing: 'Manufacturing / Industrial',
  professional_services: 'Professional Services',
  other: 'Other',
};

const CHANNEL_LABELS = {
  cold_email: 'cold email',
  linkedin_dm: 'LinkedIn DM / InMail',
  linkedin_connection: 'LinkedIn connection request note',
};

const CTA_LABELS = {
  meeting: 'book a meeting or demo',
  reply: 'get a reply showing interest',
  resource: 'get them to view a resource or link',
  referral: 'get referred to someone else',
  connect: 'connect / build the relationship',
};
```

### Scoring system prompt

Build the system prompt in a function `buildScoringSystemPrompt(body)`:

```
You are a cold outreach evaluator with 12 years of experience leading SDR and BDR teams at high-growth B2B SaaS companies. You have personally reviewed over 50,000 cold emails and LinkedIn messages. You have managed teams that generated $40M+ in qualified pipeline through outbound. You know exactly what gets opened, what gets replies, and what gets marked as spam.

You are evaluating a {CHANNEL_LABEL} sent to a {LEVEL_LABEL} in {FUNCTION_LABEL}{INDUSTRY_CLAUSE}.

The sender's intended CTA is: {CTA_LABEL}.

---

SCORING RUBRIC — score each dimension 1-10:

1. RELEVANCE TO RECIPIENT (weight: 20%)
   - Does the message acknowledge the recipient's LEVEL? A VP cares about business outcomes, not features. A C-suite exec needs ROI in the first line.
   - Does it speak to the recipient's FUNCTION? A message to a CFO should reference financial metrics. A message to an Engineering lead should respect technical depth.
   - Does it account for INDUSTRY context when provided?
   
   Calibration:
   - 1-3: Generic template that could go to anyone.
   - 4-5: Gets function right but misses level, or vice versa.
   - 6-7: Appropriate for level and function but lacks specificity.
   - 8-9: Clearly tailored to this exact persona.
   - 10: Would make the recipient think "this person understands my job."

2. PERSONALIZATION (weight: 20%)
   - Evidence the sender researched THIS specific person or company.
   - Named references: a recent announcement, a LinkedIn post, a mutual connection, a specific company challenge.
   - NOT personalization: "{first_name}" merge tags, "{company}" merge tags, generic industry references.
   
   Calibration:
   - 1-3: Pure template. Zero research signals.
   - 4-5: Has a company name reference but no real research behind it.
   - 6-7: Surface-level specificity (company size, industry, location).
   - 8-9: References something only 5 minutes of research would reveal.
   - 10: The research IS the hook.

3. TALK-ABOUT-THEM RATIO (weight: 15%)
   - Count sentences about the RECIPIENT vs. sentences about the SENDER.
   - First-person pronoun density: "I", "we", "our" vs. "you", "your."
   - The first 2 sentences set the tone. If both are about the sender, the message has lost.
   
   Calibration:
   - 1-3: 80%+ is about the sender. Opens with "I'm reaching out because we..."
   - 4-5: Starts with recipient but quickly pivots to a product pitch.
   - 6-7: Roughly balanced, but sender's value prop dominates.
   - 8-9: 70%+ is about the recipient.
   - 10: The recipient would feel this message is about THEM, not about being sold to.

4. CLARITY (weight: 15%)
   - Is the value proposition clear in the first 2 sentences?
   - Can the recipient understand WHAT this is about within 5 seconds of opening?
   - Are there jargon-heavy phrases that obscure meaning?
   
   Calibration:
   - 1-3: After reading the full message, still unclear what the sender wants.
   - 4-5: Point becomes clear by the end, but opener is vague.
   - 6-7: Clear value prop but buried behind unnecessary context.
   - 8-9: Value prop is in the first 2 sentences.
   - 10: A busy executive scanning on mobile would understand the point from the first line.

5. CTA STRENGTH (weight: 10%)
   - Is the ask SPECIFIC? "Would love to connect" is not specific.
   - Is it LOW-FRICTION for the recipient's level?
   - Does it match the stated CTA type?
   - Is there exactly ONE ask?
   - For LinkedIn connection requests: the note should give a reason to accept, not ask for a meeting.
   
   Calibration:
   - 1-3: No clear ask, or wildly mismatched to channel and relationship level.
   - 4-5: Has a CTA but vague or too aggressive.
   - 6-7: Clear ask, appropriate friction, but generic phrasing.
   - 8-9: Specific, low-friction, easy to say yes to.
   - 10: Feels like a natural next step, not a sales close.

6. LENGTH / READABILITY (weight: 10%)
   Channel length norms:
   - LinkedIn connection request: 200-295 characters ideal. Over 295 is too long. HEAVILY penalize if over 300 chars.
   - LinkedIn DM/InMail: 50-125 words ideal. Over 150 words loses attention.
   - Cold email: 50-150 words ideal (not counting subject line). Over 200 words is too long.
   
   Also check: sentence length (aim for 10-18 words), paragraph breaks, reading level.
   
   Calibration:
   - 1-3: Way over length norms. Wall of text.
   - 4-5: Slightly long or dense.
   - 6-7: Appropriate length but some sentences too complex.
   - 8-9: Right length, scannable, clear structure.
   - 10: Every word earns its place.

7. SPAM RISK (weight: 10%)
   Spam triggers to flag:
   - Cliche phrases: "just following up," "hope this finds you well," "touching base," "synergy," "game-changer," "revolutionary"
   - Excessive punctuation, ALL CAPS, emoji overuse
   - Over-promising: "increase revenue by 300%," unsubstantiated ROI claims
   - Automation signals: reads like it was generated by a sequence tool
   
   Calibration:
   - 1-3: Reads like a marketing blast. Multiple spam triggers.
   - 4-5: One or two notable spam signals.
   - 6-7: Clean but has minor tells.
   - 8-9: Reads like a human wrote it to another human.
   - 10: Could not be distinguished from a genuine personal message.
```

If `channel === 'cold_email'`, add an 8th dimension to the rubric:

```
8. SUBJECT LINE (weight: 10%)
   When a subject line is present, score it separately and adjust weights: Subject Line 10%, Length/Readability 5%, Spam Risk 5%.
   
   - Length: 4-8 words ideal.
   - Does it signal relevance to THIS recipient?
   - No spam triggers: "Free," "Act now," "RE:/FW: faking," excessive caps.
   
   Calibration:
   - 1-3: Generic, spammy, or misleading. "Quick question." "Introduction." "Exciting opportunity."
   - 4-5: Relevant but generic.
   - 6-7: Clear and relevant but not compelling.
   - 8-9: Specific, relevant, creates genuine curiosity tied to the recipient's world.
   - 10: Would be opened even on a busy day because it signals something directly relevant.
```

Then add the output format:

```
---

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown, no commentary:

{
  "overall_score": <integer 1-100, weighted sum using the weights above>,
  "overall_label": "<one phrase, e.g. 'Strong — minor tweaks needed' or 'Needs work — 3 key issues found' or 'Solid foundation — fix the opener'>",
  "dimensions": [
    {
      "name": "<dimension name>",
      "score": <1-10>,
      "explanation": "<1 sentence — reference specific words or phrases from the actual message. NEVER give generic advice.>"
    }
  ],
  "top_fixes": [
    "<Specific, actionable fix — reference actual text from the message. Tell them exactly what to change and what to change it to. Not 'be more personal' but 'Replace your opener \"I wanted to reach out\" with a reference to their Q2 earnings post where they mentioned expanding the sales team.'>",
    "<Second specific fix>",
    "<Third specific fix>"
  ]
}

RULES:
- overall_score is a weighted sum. Use the weights from the rubric.
- Each explanation MUST reference specific words or phrases from the actual message.
- Each top_fix MUST be a rewrite instruction with the exact change to make.
- Score HARSHLY. A 5 means "this needs real work." Reserve 8+ for messages that would actually get replies.
- Think like a recipient, not a sales trainer. Would YOU reply to this?
- If channel is linkedin_connection and message exceeds 300 characters, HEAVILY penalize Length score and mention it in top_fixes.
```

### User message for scoring

```
{CHANNEL_LABEL} to grade:
{if cold_email: "Subject line: {subject_line}\n\n"}
Message:
{message}
```

### grade() function

```js
export async function grade(body) {
  const systemPrompt = buildScoringSystemPrompt(body);
  const userMessage = buildScoringUserMessage(body);
  
  const raw = await runClaudePrompt(userMessage, {
    system: systemPrompt,
    model: 'sonnet',
  });
  
  // Extract JSON from raw output (Claude sometimes adds a preamble)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude returned an unexpected response format. Try again.');
  
  const result = JSON.parse(jsonMatch[0]);
  
  // Validate shape
  if (typeof result.overall_score !== 'number') throw new Error('Invalid response from Claude.');
  if (!Array.isArray(result.dimensions)) throw new Error('Invalid response from Claude.');
  if (!Array.isArray(result.top_fixes)) throw new Error('Invalid response from Claude.');
  
  return result;
}
```

### Rewrite system prompt

```
You are rewriting a cold outreach message based on a scoring evaluation.
You are a 12-year veteran of B2B outbound who has written sequences that generated $40M+ in pipeline.

Context:
- Channel: {CHANNEL_LABEL}
- Recipient: {LEVEL_LABEL} in {FUNCTION_LABEL}{INDUSTRY_CLAUSE}
- CTA goal: {CTA_LABEL}

The original message scored {overall_score}/100. The key issues were:
{top_fixes as a bullet list}

REWRITE RULES:
- Fix every issue identified in the scoring. Do not introduce new problems.
- Maintain the sender's core value proposition — do not invent claims or change what they are selling.
- Keep any genuine personalization from the original. Improve it where possible.
- Match the channel's length norms:
  * LinkedIn connection request: under 295 characters
  * LinkedIn DM/InMail: 50-125 words
  * Cold email: 50-150 words (body only, not counting subject line)
- If channel is cold email, include a rewritten subject line.
- Write at an 8th-grade reading level.
- No buzzwords, no spam triggers, no exclamation marks.
- Open with the recipient, not the sender.
- One CTA, specific, appropriate friction for {LEVEL_LABEL}.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown:

{
  "rewritten_message": "<the rewritten body>",
  "subject_line": "<rewritten subject line — ONLY include this key if channel is cold_email, omit entirely otherwise>",
  "changes_made": ["<brief note on each key change made>"]
}
```

### rewrite() function

```js
export async function rewrite(body) {
  const systemPrompt = buildRewriteSystemPrompt(body);
  const userMessage = `Original message to rewrite:\n${body.subject_line ? `Subject: ${body.subject_line}\n\n` : ''}${body.message}`;
  
  const raw = await runClaudePrompt(userMessage, {
    system: systemPrompt,
    model: 'sonnet',
  });
  
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Rewrite failed. Try again.');
  
  const result = JSON.parse(jsonMatch[0]);
  
  // Run text hygiene on the rewritten message
  if (result.rewritten_message) {
    result.rewritten_message = clean(result.rewritten_message);
  }
  if (result.subject_line) {
    result.subject_line = clean(result.subject_line);
  }
  
  return result;
}
```

The `INDUSTRY_CLAUSE` is: if `industry` is non-null, ` in the ${INDUSTRY_LABELS[industry]} industry`. Otherwise empty string.

---

## public/index.html

Full single-page HTML. Semantic structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Grade your cold outreach message in seconds. Get a score, specific feedback, and an AI-powered rewrite.">
  <title>Outreach Grader</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <div class="logo">Outreach Grader</div>
      <p class="tagline">Paste your message. Get a score and specific fixes in seconds.</p>
    </div>
  </header>

  <main class="main">
    <section class="input-panel" id="inputPanel">

      <div class="selector-group">
        <div class="selector-label">Recipient level</div>
        <div class="pills" role="radiogroup" aria-label="Recipient level" data-field="recipient_level">
          <button class="pill" role="radio" aria-checked="false" data-value="ic">IC</button>
          <button class="pill" role="radio" aria-checked="false" data-value="manager">Manager</button>
          <button class="pill" role="radio" aria-checked="false" data-value="director">Director</button>
          <button class="pill" role="radio" aria-checked="false" data-value="vp">VP</button>
          <button class="pill" role="radio" aria-checked="false" data-value="c_suite">C-Suite</button>
        </div>
      </div>

      <div class="selector-group">
        <div class="selector-label">Recipient function</div>
        <div class="pills" role="radiogroup" aria-label="Recipient function" data-field="recipient_function">
          <button class="pill" role="radio" aria-checked="false" data-value="sales">Sales</button>
          <button class="pill" role="radio" aria-checked="false" data-value="revops">RevOps / Sales Ops</button>
          <button class="pill" role="radio" aria-checked="false" data-value="marketing">Marketing</button>
          <button class="pill" role="radio" aria-checked="false" data-value="finance">Finance</button>
          <button class="pill" role="radio" aria-checked="false" data-value="hr">HR / People</button>
          <button class="pill" role="radio" aria-checked="false" data-value="engineering">Engineering</button>
          <button class="pill" role="radio" aria-checked="false" data-value="other">Other</button>
        </div>
      </div>

      <div class="selector-group">
        <div class="selector-label">Industry <span class="optional">(optional)</span></div>
        <div class="pills" role="radiogroup" aria-label="Industry" data-field="industry">
          <button class="pill" role="radio" aria-checked="false" data-value="saas">SaaS / Tech</button>
          <button class="pill" role="radio" aria-checked="false" data-value="financial_services">Financial Services</button>
          <button class="pill" role="radio" aria-checked="false" data-value="healthcare">Healthcare</button>
          <button class="pill" role="radio" aria-checked="false" data-value="manufacturing">Manufacturing</button>
          <button class="pill" role="radio" aria-checked="false" data-value="professional_services">Professional Services</button>
          <button class="pill" role="radio" aria-checked="false" data-value="other">Other</button>
        </div>
      </div>

      <div class="selector-group">
        <div class="selector-label">Channel</div>
        <div class="pills" role="radiogroup" aria-label="Channel" data-field="channel">
          <button class="pill" role="radio" aria-checked="false" data-value="cold_email">Cold email</button>
          <button class="pill" role="radio" aria-checked="false" data-value="linkedin_dm">LinkedIn DM</button>
          <button class="pill" role="radio" aria-checked="false" data-value="linkedin_connection">Connection note</button>
        </div>
      </div>

      <div class="selector-group">
        <div class="selector-label">Goal</div>
        <div class="pills" role="radiogroup" aria-label="Goal" data-field="cta_type">
          <button class="pill" role="radio" aria-checked="false" data-value="meeting">Book a meeting</button>
          <button class="pill" role="radio" aria-checked="false" data-value="reply">Get a reply</button>
          <button class="pill" role="radio" aria-checked="false" data-value="resource">View a resource</button>
          <button class="pill" role="radio" aria-checked="false" data-value="referral">Get a referral</button>
          <button class="pill" role="radio" aria-checked="false" data-value="connect">Connect / build relationship</button>
        </div>
      </div>

      <div class="message-area">
        <div id="subjectLineGroup" class="subject-line-group" hidden>
          <label class="field-label" for="subjectLine">Subject line</label>
          <input type="text" id="subjectLine" class="subject-input" placeholder="Your email subject line" maxlength="200">
        </div>

        <label class="field-label" for="messageText">Your message</label>
        <textarea id="messageText" class="message-textarea" placeholder="Paste your cold outreach message here..." maxlength="5000"></textarea>
        <div id="charCounter" class="char-counter" hidden><span id="charCount">0</span> / 300 characters</div>
      </div>

      <div id="inputError" class="input-error" hidden></div>

      <button id="gradeBtn" class="btn-primary" type="button">Grade my message</button>
    </section>

    <section class="results-panel" id="resultsPanel" hidden>
      <div class="overall-score-card" id="overallScoreCard">
        <div class="score-ring-wrap">
          <svg class="score-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="ring-track" cx="60" cy="60" r="52"/>
            <circle class="ring-fill" id="ringFill" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7"/>
          </svg>
          <div class="score-center">
            <div class="score-number" id="scoreNumber">--</div>
            <div class="score-denom">/100</div>
          </div>
        </div>
        <div class="score-meta">
          <div class="score-label" id="scoreLabel"></div>
          <button class="btn-secondary" id="rewriteBtn" type="button">Rewrite this for me</button>
        </div>
      </div>

      <div class="dimensions-grid" id="dimensionsGrid"></div>

      <div class="fixes-card" id="fixesCard">
        <div class="fixes-title">Top 3 fixes</div>
        <ol class="fixes-list" id="fixesList"></ol>
      </div>

      <div class="rewrite-panel" id="rewritePanel" hidden>
        <div class="rewrite-header">
          <div class="rewrite-title">Rewritten message</div>
          <button class="btn-copy" id="copyBtn" type="button">Copy</button>
        </div>
        <div id="subjectLineResult" class="rewrite-subject" hidden></div>
        <div class="rewrite-body" id="rewriteBody"></div>
        <div class="changes-list" id="changesList"></div>
      </div>

      <button class="btn-text" id="gradeAgainBtn" type="button">Grade another message</button>
    </section>
  </main>

  <footer class="site-footer">
    <p>Built by <a href="https://linkedin.com/in/michaelinghilterra" target="_blank" rel="noopener">Michael Inghilterra</a> &middot; Powered by Claude</p>
  </footer>

  <script src="app.js"></script>
</body>
</html>
```

---

## public/styles.css

This is the most important file for visual impact. The design should be:
- Dark-first (dark bg default, near-black #0D0F12, card surfaces #161920)
- A single vivid accent: electric blue #3B82F6
- Secondary semantic colors: green #22C55E (high scores), amber #F59E0B (mid scores), red #EF4444 (low scores)
- IBM Plex Sans for UI text (load from Google Fonts)
- IBM Plex Mono for score numbers
- Very clean, lots of breathing room, professional but striking

Include the Google Fonts link at the top of the CSS file (NOT in HTML head — do it via @import):

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
```

CSS custom properties:
```css
:root {
  --bg: #0D0F12;
  --surface: #161920;
  --surface-2: #1E2330;
  --border: #252B38;
  --text: #E8EBF0;
  --text-secondary: #7A8494;
  --accent: #3B82F6;
  --accent-dim: rgba(59, 130, 246, 0.12);
  --score-high: #22C55E;
  --score-mid: #F59E0B;
  --score-low: #EF4444;
  --bar-track: #252B38;
  --radius: 10px;
  --radius-sm: 6px;
}
```

Light theme (via `@media (prefers-color-scheme: light)` guarded as `:root:not([data-theme="dark"])`):
```css
:root:not([data-theme="dark"]) {
  @media (prefers-color-scheme: light) {
    --bg: #F4F6FA;
    --surface: #FFFFFF;
    --surface-2: #F0F2F7;
    --border: #DDE1EA;
    --text: #111827;
    --text-secondary: #6B7280;
    --accent: #2563EB;
    --accent-dim: rgba(37, 99, 235, 0.08);
    --bar-track: #E5E7EB;
  }
}
:root[data-theme="light"] {
  --bg: #F4F6FA;
  --surface: #FFFFFF;
  --surface-2: #F0F2F7;
  --border: #DDE1EA;
  --text: #111827;
  --text-secondary: #6B7280;
  --accent: #2563EB;
  --accent-dim: rgba(37, 99, 235, 0.08);
  --bar-track: #E5E7EB;
}
```

Key styles to implement:
- `.site-header`: full-width, dark surface, generous padding (48px top/bottom), centered content
- `.logo`: IBM Plex Mono, 24px, accent color, letter-spacing
- `.tagline`: text-secondary, 16px
- `.main`: max-width 680px, centered, padding 40px 20px 80px
- `.selector-group`: margin-bottom 24px
- `.selector-label`: 12px, 600 weight, uppercase, letter-spacing 0.5px, text-secondary, margin-bottom 10px
- `.pills`: flex, flex-wrap, gap 8px
- `.pill`: padding 8px 16px, border-radius 20px, border 1px solid var(--border), background transparent, color var(--text), font-size 14px, cursor pointer, transition
- `.pill[aria-checked="true"]`: background var(--accent-dim), border-color var(--accent), color var(--accent), font-weight 500
- `.pill:hover:not([aria-checked="true"])`: border-color var(--text-secondary)
- `.subject-input`: full-width, padding 12px 16px, border 1px solid var(--border), border-radius var(--radius-sm), background var(--surface-2), color var(--text), font-size 15px, margin-bottom 12px
- `.message-textarea`: full-width, min-height 160px, padding 14px 16px, border 1px solid var(--border), border-radius var(--radius), background var(--surface-2), color var(--text), font-size 15px, line-height 1.6, resize vertical
- Focus states on input/textarea: outline 2px solid var(--accent), outline-offset -1px, border-color transparent
- `.char-counter`: 13px, text-secondary, text-align right, margin-top 6px. When `.over-limit`, color var(--score-low)
- `.btn-primary`: display block, full-width, padding 16px, background var(--accent), color white, border none, border-radius var(--radius), font 600 16px, cursor pointer, margin-top 24px, transition opacity
- `.btn-primary:hover`: opacity 0.88
- `.btn-primary:disabled`: opacity 0.5, cursor not-allowed
- `.input-error`: background rgba(239,68,68,0.08), border 1px solid rgba(239,68,68,0.3), color var(--score-low), border-radius var(--radius-sm), padding 12px 16px, font-size 14px, margin-top 16px
- `.overall-score-card`: background var(--surface), border 1px solid var(--border), border-radius var(--radius), padding 32px, display flex, align-items center, gap 32px, margin-bottom 16px
- `.score-ring`: 120px x 120px SVG. `.ring-track`: stroke var(--bar-track), stroke-width 10, fill none. `.ring-fill`: stroke var(--accent), stroke-width 10, fill none, stroke-linecap round, transform rotate(-90deg) on the SVG (origin center), transition stroke-dashoffset 1s ease
- `.score-center`: absolute position inside the ring SVG wrapper, centered text
- `.score-number`: IBM Plex Mono, 40px, 600 weight, color var(--accent)
- `.score-denom`: 14px, text-secondary
- `.score-label`: 16px, 500 weight, margin-bottom 16px
- `.btn-secondary`: padding 10px 20px, border 1px solid var(--border), background transparent, color var(--text), border-radius var(--radius-sm), font 500 14px, cursor pointer
- `.dimensions-grid`: display grid, gap 12px, margin-bottom 16px
- `.dimension-card`: background var(--surface), border 1px solid var(--border), border-radius var(--radius), padding 20px 24px
- `.dim-header`: display flex, justify-content space-between, align-items baseline, margin-bottom 10px
- `.dim-name`: 14px, 600 weight
- `.dim-score`: IBM Plex Mono, 14px, 600 weight (color set by JS based on score)
- `.dim-bar`: height 4px, background var(--bar-track), border-radius 2px, margin-bottom 12px, overflow hidden
- `.dim-bar-fill`: height 100%, border-radius 2px, width 0, transition width 0.8s cubic-bezier(0.4,0,0.2,1)
- `.dim-note`: 13px, text-secondary, line-height 1.5
- `.fixes-card`: background var(--surface), border 1px solid var(--border), border-radius var(--radius), padding 24px, margin-bottom 16px
- `.fixes-title`: 14px, 600 weight, margin-bottom 16px
- `.fixes-list`: list-style none, padding 0, margin 0, display flex, flex-direction column, gap 14px
- `.fixes-list li`: display flex, gap 12px, font-size 14px, line-height 1.6
- `.fix-num`: IBM Plex Mono, 600 weight, color var(--accent), flex-shrink 0
- `.rewrite-panel`: background var(--surface), border 1px solid var(--border), border-radius var(--radius), padding 24px, margin-bottom 16px
- `.rewrite-header`: display flex, justify-content space-between, align-items center, margin-bottom 16px
- `.rewrite-title`: 14px, 600 weight
- `.btn-copy`: padding 8px 16px, border 1px solid var(--border), background transparent, color var(--text), border-radius var(--radius-sm), font 500 13px, cursor pointer
- `.rewrite-subject`: font 600 15px, margin-bottom 16px, padding 12px 16px, background var(--surface-2), border-radius var(--radius-sm), border-left 3px solid var(--accent)
- `.rewrite-body`: font-size 15px, line-height 1.7, white-space pre-wrap, padding 16px, background var(--surface-2), border-radius var(--radius-sm)
- `.changes-list`: margin-top 16px, padding-top 16px, border-top 1px solid var(--border), font-size 13px, color var(--text-secondary), display flex, flex-direction column, gap 6px
- `.btn-text`: background none, border none, color var(--text-secondary), font 500 14px, cursor pointer, padding 0, margin-top 24px, text-decoration underline, display block
- Mobile: at max-width 600px, `.overall-score-card` goes to flex-direction column

---

## public/app.js

Vanilla JS, no framework.

### State

```js
const state = {
  recipient_level: null,
  recipient_function: null,
  industry: null,
  channel: null,
  cta_type: null,
  gradeResult: null,
};
```

### Pill selectors

- On DOMContentLoaded, attach click handlers to all `.pills` groups.
- Clicking a pill: set `aria-checked="true"` on clicked, `"false"` on siblings. Update state[data-field] = data-value.
- Industry pills are OPTIONAL and TOGGLEABLE: clicking an already-selected industry pill deselects it (aria-checked back to false, state.industry = null).
- When channel changes, call `onChannelChange(channel)`.

### onChannelChange(channel)

- Show/hide `#subjectLineGroup` (hidden unless channel === 'cold_email')
- Show/hide `#charCounter` (visible only when channel === 'linkedin_connection')
- Update textarea placeholder:
  - cold_email: "Paste your cold email body here (not including the subject line)..."
  - linkedin_connection: "Write your connection request note (300 character limit)..."
  - linkedin_dm: "Paste your LinkedIn DM or InMail message here..."
- Clear existing score results if re-grading

### Character counter

- On every `input` event on `#messageText`, if channel === 'linkedin_connection', update `#charCount` and toggle `.over-limit` on `#charCounter` when > 295.

### validateInputs()

Returns an error string or null.
- Required: recipient_level, recipient_function, channel, cta_type
- Message must not be empty
- If cold_email: subject line must not be empty

### handleGrade()

1. const err = validateInputs(); if err: show `#inputError` with message, return
2. Hide `#inputError`
3. Set `#gradeBtn` disabled, text "Grading..."
4. Hide `#resultsPanel`

5. POST to /api/grade with body:
```json
{
  "message": messageText.value.trim(),
  "subject_line": (channel === 'cold_email') ? subjectLine.value.trim() : undefined,
  "recipient_level": state.recipient_level,
  "recipient_function": state.recipient_function,
  "industry": state.industry,
  "channel": state.channel,
  "cta_type": state.cta_type
}
```

6. On success: state.gradeResult = data; renderResults(data)
7. On error: show error in `#inputError`
8. Always: restore `#gradeBtn`

### renderResults(data)

1. Show `#resultsPanel`, hide `#inputPanel`
2. Set `#scoreNumber` to data.overall_score
3. Set `#scoreLabel` to data.overall_label
4. Animate SVG ring: ring circumference = 2 * π * 52 ≈ 326.7. stroke-dashoffset = 326.7 * (1 - score/100). Use setTimeout to trigger after paint.
5. Animate ring and score number color based on score: < 40 = score-low, 40-69 = score-mid, 70+ = score-high (use CSS variable names as fill values)
6. Build dimension cards in `#dimensionsGrid`:
   - For each dimension: create `.dimension-card` with `.dim-header` (name + colored score), `.dim-bar` + `.dim-bar-fill`, `.dim-note`
   - Color the score and bar fill: 1-3 = var(--score-low), 4-6 = var(--score-mid), 7-10 = var(--score-high)
   - Trigger bar animation with requestAnimationFrame after appending
7. Build fixes list in `#fixesList`: for each fix, `<li><span class="fix-num">{i+1}.</span><span>{fix}</span></li>`
8. Hide `#rewritePanel`
9. Scroll `#resultsPanel` into view smoothly

### handleRewrite()

1. Set `#rewriteBtn` disabled, text "Rewriting..."
2. POST to /api/rewrite with same inputs + score_result: { overall_score: state.gradeResult.overall_score, top_fixes: state.gradeResult.top_fixes }
3. On success: show `#rewritePanel`
   - If data.subject_line: show `#subjectLineResult` with "Subject: {data.subject_line}"
   - Set `#rewriteBody` to data.rewritten_message (use textContent, not innerHTML)
   - Build `#changesList` from data.changes_made
4. Restore `#rewriteBtn`

### Copy to clipboard

`#copyBtn` click: copies subject line (if present) + message body to clipboard. Show "Copied!" briefly then restore.

### gradeAgainBtn

Shows `#inputPanel`, hides `#resultsPanel`. Clears rewrite panel. Re-enables grade button.

---

## What NOT to do

- Do not install any additional npm packages beyond what's in package.json above.
- Do not create any React/JSX files.
- Do not create any build scripts.
- Do not add TypeScript.
- Do not commit anything.
- Do not use `process.env.ANTHROPIC_API_KEY` in prompt.mjs — Claude runs via CLI, no API key.
- Do not modify the project CLAUDE.md or AGENTS.md during this task.

---

## Acceptance criteria

1. `npm install && node server.mjs` starts the server with no errors
2. The page loads at http://localhost:3000
3. Selecting all required inputs and clicking "Grade my message" sends a POST to /api/grade and renders results
4. Subject line field appears ONLY when Cold email is selected
5. Character counter appears ONLY when Connection note is selected
6. Score ring animates on results render
7. "Rewrite this for me" fetches /api/rewrite and renders the result
8. "Copy" copies to clipboard
9. "Grade another message" returns to input view
10. 400 errors from the server render as inline error messages, not browser alerts
