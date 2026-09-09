import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArgs } from '../lib/claude-cli.mjs';

const sonnetArgs = ['-p', '--output-format', 'json', '--no-session-persistence', '--model', 'sonnet'];

test('buildArgs builds the existing sonnet arguments without tools', () => {
  assert.deepEqual(buildArgs('sonnet'), sonnetArgs);
});

test('buildArgs builds the existing arguments without a model or tools', () => {
  assert.deepEqual(buildArgs(), ['-p', '--output-format', 'json', '--no-session-persistence']);
});

test('buildArgs appends comma-joined allowed tools as one value', () => {
  assert.deepEqual(
    buildArgs('sonnet', ['WebSearch', 'WebFetch']),
    [...sonnetArgs, '--allowedTools', 'WebSearch,WebFetch'],
  );
});

test('buildArgs treats empty and undefined tool lists like no tools', () => {
  assert.deepEqual(buildArgs('sonnet', []), sonnetArgs);
  assert.deepEqual(buildArgs('sonnet', undefined), sonnetArgs);
});
