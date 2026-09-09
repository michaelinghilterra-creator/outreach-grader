import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRewriteSystemPrompt, buildScoringSystemPrompt } from '../lib/prompt.mjs';

const body = {
  recipient_level: 'vp',
  recipient_function: 'sales',
  industry: 'saas',
  channel: 'cold_email',
  cta_type: 'reply',
  score_result: { overall_score: 50, top_fixes: ['Improve the opener.'] },
};

const research_intel = {
  contact_signals: ['Contact signal from an interview.'],
  company_signals: ['Company signal from a press release.'],
  suggested_hooks: ['A specific suggested hook.'],
};

test('scoring prompt omits research section without research intel', () => {
  assert.equal(buildScoringSystemPrompt(body).includes('RESEARCH CONDUCTED'), false);
});

test('scoring prompt includes research section and signal text with intel', () => {
  const prompt = buildScoringSystemPrompt({ ...body, research_intel });
  assert.equal(prompt.includes('RESEARCH CONDUCTED'), true);
  assert.equal(prompt.includes(research_intel.contact_signals[0]), true);
});

test('rewrite prompt omits research section without research intel', () => {
  assert.equal(buildRewriteSystemPrompt(body).includes('AVAILABLE INTEL'), false);
});

test('rewrite prompt includes research section and signal text with intel', () => {
  const prompt = buildRewriteSystemPrompt({ ...body, research_intel });
  assert.equal(prompt.includes('AVAILABLE INTEL'), true);
  assert.equal(prompt.includes(research_intel.company_signals[0]), true);
});
