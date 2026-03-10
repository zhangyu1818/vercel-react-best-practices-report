import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CliUsageError,
  resolveCliOptions,
  usage,
} from '../src/bin/lib/cli-options.js'

test('resolveCliOptions accepts Codex model ids without provider prefix', () => {
  const result = resolveCliOptions({
    '--concurrency': 4,
    '--model': 'gpt-5.3-codex',
    '--reasoning-effort': null,
  })

  assert.deepEqual(result, {
    concurrency: 4,
    model: 'gpt-5.3-codex',
    reasoningEffort: 'high',
  })
})

test('usage no longer exposes merge mode', () => {
  assert.doesNotMatch(
    usage('/tmp/vercel-react-best-practices-report'),
    /--merge/,
  )
})

test('resolveCliOptions rejects missing --model', () => {
  assert.throws(
    () =>
      resolveCliOptions({
        '--concurrency': null,
        '--model': null,
        '--reasoning-effort': null,
      }),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--model is required.',
  )
})

test('resolveCliOptions defaults to single-thread execution', () => {
  const result = resolveCliOptions({
    '--concurrency': null,
    '--model': 'gpt-5.3-codex',
    '--reasoning-effort': null,
  })

  assert.deepEqual(result, {
    concurrency: 1,
    model: 'gpt-5.3-codex',
    reasoningEffort: 'high',
  })
})

test('resolveCliOptions rejects slash-delimited provider model values', () => {
  assert.throws(
    () =>
      resolveCliOptions({
        '--concurrency': null,
        '--model': 'openai/gpt-5.3-codex',
        '--reasoning-effort': null,
      }),
    (error) =>
      error instanceof CliUsageError &&
      error.message ===
        '--model must be a Codex-supported model id like "gpt-5.3-codex" or "gpt-5.4", not provider/model.',
  )
})

test('resolveCliOptions accepts explicit reasoning effort overrides', () => {
  const result = resolveCliOptions({
    '--concurrency': null,
    '--model': 'gpt-5.3-codex',
    '--reasoning-effort': 'xhigh',
  })

  assert.deepEqual(result, {
    concurrency: 1,
    model: 'gpt-5.3-codex',
    reasoningEffort: 'xhigh',
  })
})
