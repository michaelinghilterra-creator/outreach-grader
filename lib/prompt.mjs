import { runClaudePrompt } from './claude-cli.mjs';
import { clean } from '../../ai-text-hygiene/src/index.mjs';

const LEVEL_LABELS = {
  ic: 'Individual Contributor (IC)', manager: 'Manager', director: 'Director', vp: 'VP', c_suite: 'C-Suite / Executive',
};
const FUNCTION_LABELS = {
  sales: 'Sales', revops: 'RevOps / Sales Ops', marketing: 'Marketing', finance: 'Finance / Accounting',
  hr: 'HR / People', engineering: 'Engineering / Product', other: 'Other',
};
const INDUSTRY_LABELS = {
  saas: 'SaaS / Tech', financial_services: 'Financial Services', healthcare: 'Healthcare',
  manufacturing: 'Manufacturing / Industrial', professional_services: 'Professional Services', other: 'Other',
};
const CHANNEL_LABELS = {
  cold_email: 'cold email', linkedin_dm: 'LinkedIn DM / InMail',
  linkedin_connection: 'LinkedIn connection request note',
};
const CTA_LABELS = {
  meeting: 'book a meeting or demo', reply: 'get a reply showing interest',
  resource: 'get them to view a resource or link', referral: 'get referred to someone else',
  connect: 'connect / build the relationship',
};

function industryClause(body) {
  return body.industry ? ` in the ${INDUSTRY_LABELS[body.industry]} industry` : '';
}

function buildScoringSystemPrompt(body) {
  const subjectRubric = body.channel === 'cold_email' ? `

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
   - 10: Would be opened even on a busy day because it signals something directly relevant.` : '';

  return `You are a cold outreach evaluator with 12 years of experience leading SDR and BDR teams at high-growth B2B SaaS companies. You have personally reviewed over 50,000 cold emails and LinkedIn messages. You have managed teams that generated $40M+ in qualified pipeline through outbound. You know exactly what gets opened, what gets replies, and what gets marked as spam.

You are evaluating a ${CHANNEL_LABELS[body.channel]} sent to a ${LEVEL_LABELS[body.recipient_level]} in ${FUNCTION_LABELS[body.recipient_function]}${industryClause(body)}.

The sender's intended CTA is: ${CTA_LABELS[body.cta_type]}.

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
   - 10: Could not be distinguished from a genuine personal message.${subjectRubric}

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
    "<Specific, actionable fix — reference actual text from the message. Tell them exactly what to change and what to change it to. Not 'be more personal' but 'Replace your opener \\"I wanted to reach out\\" with a reference to their Q2 earnings post where they mentioned expanding the sales team.'>",
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
- If channel is linkedin_connection and message exceeds 300 characters, HEAVILY penalize Length score and mention it in top_fixes.`;
}

function buildScoringUserMessage(body) {
  const subject = body.channel === 'cold_email' ? `Subject line: ${body.subject_line}\n\n` : '';
  return `${CHANNEL_LABELS[body.channel]} to grade:\n${subject}Message:\n${body.message}`;
}

export async function grade(body) {
  const raw = await runClaudePrompt(buildScoringUserMessage(body), {
    system: buildScoringSystemPrompt(body), model: body.model || 'sonnet',
  });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude returned an unexpected response format. Try again.');
  const result = JSON.parse(jsonMatch[0]);
  if (typeof result.overall_score !== 'number') throw new Error('Invalid response from Claude.');
  if (!Array.isArray(result.dimensions)) throw new Error('Invalid response from Claude.');
  if (!Array.isArray(result.top_fixes)) throw new Error('Invalid response from Claude.');
  return result;
}

function buildRewriteSystemPrompt(body) {
  const fixes = body.score_result.top_fixes.map((fix) => `- ${fix}`).join('\n');
  return `You are rewriting a cold outreach message based on a scoring evaluation.
You are a 12-year veteran of B2B outbound who has written sequences that generated $40M+ in pipeline.

Context:
- Channel: ${CHANNEL_LABELS[body.channel]}
- Recipient: ${LEVEL_LABELS[body.recipient_level]} in ${FUNCTION_LABELS[body.recipient_function]}${industryClause(body)}
- CTA goal: ${CTA_LABELS[body.cta_type]}

The original message scored ${body.score_result.overall_score}/100. The key issues were:
${fixes}

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
- One CTA, specific, appropriate friction for ${LEVEL_LABELS[body.recipient_level]}.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown:

{
  "rewritten_message": "<the rewritten body>",
  "subject_line": "<rewritten subject line — ONLY include this key if channel is cold_email, omit entirely otherwise>",
  "changes_made": ["<brief note on each key change made>"]
}`;
}

export async function rewrite(body) {
  const systemPrompt = buildRewriteSystemPrompt(body);
  const userMessage = `Original message to rewrite:\n${body.subject_line ? `Subject: ${body.subject_line}\n\n` : ''}${body.message}`;
  const raw = await runClaudePrompt(userMessage, { system: systemPrompt, model: body.model || 'sonnet' });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Rewrite failed. Try again.');
  const result = JSON.parse(jsonMatch[0]);
  if (result.rewritten_message) result.rewritten_message = clean(result.rewritten_message);
  if (result.subject_line) result.subject_line = clean(result.subject_line);
  return result;
}
