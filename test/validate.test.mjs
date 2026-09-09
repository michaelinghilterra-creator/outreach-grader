import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGrade, validateResearch } from '../lib/validate.mjs';

const validGrade = {
  message: 'Would it be useful to compare notes?',
  subject_line: 'A relevant question',
  recipient_level: 'vp',
  recipient_function: 'sales',
  industry: 'saas',
  channel: 'cold_email',
  cta_type: 'reply',
};

test('validateResearch accepts a minimal body', () => {
  assert.equal(validateResearch({ contact_name: 'Ada Lovelace', company: 'Analytical Engines' }), null);
});

test('validateResearch rejects invalid contact names', () => {
  for (const contact_name of [undefined, '', '   ', 'a'.repeat(101)]) {
    assert.equal(typeof validateResearch({ contact_name, company: 'Analytical Engines' }), 'string');
  }
});

test('validateResearch rejects invalid companies', () => {
  for (const company of [undefined, '', '   ', 'a'.repeat(101)]) {
    assert.equal(typeof validateResearch({ contact_name: 'Ada Lovelace', company }), 'string');
  }
});

test('validateResearch accepts absent optional recipient fields', () => {
  assert.equal(validateResearch({ contact_name: 'Ada Lovelace', company: 'Analytical Engines' }), null);
});

test('validateResearch rejects recipient values outside the allow lists', () => {
  const base = { contact_name: 'Ada Lovelace', company: 'Analytical Engines' };
  assert.equal(typeof validateResearch({ ...base, recipient_level: 'chief_mage' }), 'string');
  assert.equal(typeof validateResearch({ ...base, recipient_function: 'alchemy' }), 'string');
});

test('validateGrade accepts a research_intel object', () => {
  assert.equal(validateGrade({ ...validGrade, research_intel: {} }), null);
});

test('validateGrade rejects non-object research_intel', () => {
  assert.equal(typeof validateGrade({ ...validGrade, research_intel: 'not an object' }), 'string');
});
