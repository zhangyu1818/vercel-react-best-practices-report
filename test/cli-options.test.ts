import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CliUsageError,
  resolveCliOptions,
  usage,
} from '../src/bin/lib/cli-options.js'

test('usage documents adapter-aware arguments', () => {
  const text = usage('/tmp/vercel-react-best-practices-report')

  assert.match(text, /--adapter <codex\|claude>/)
  assert.match(text, /--model <model-id>/)
  assert.match(text, /--reasoning-effort/)
  assert.match(text, /--effort/)
  assert.doesNotMatch(text, /--merge/)
})

test('resolveCliOptions requires --adapter', () => {
  assert.throws(
    () =>
      resolveCliOptions({
        '--adapter': null,
        '--concurrency': null,
        '--effort': null,
        '--model': 'gpt-5.4',
        '--reasoning-effort': null,
      }),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--adapter is required.',
  )
})

test('resolveCliOptions requires --model', () => {
  assert.throws(
    () =>
      resolveCliOptions({
        '--adapter': 'codex',
        '--concurrency': null,
        '--effort': null,
        '--model': null,
        '--reasoning-effort': null,
      }),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--model is required.',
  )
})

test('resolveCliOptions resolves codex options with default reasoning effort', () => {
  const result = resolveCliOptions({
    '--adapter': 'codex',
    '--concurrency': 4,
    '--effort': null,
    '--model': 'gpt-5.4',
    '--reasoning-effort': null,
  })

  assert.deepEqual(result, {
    adapter: 'codex',
    concurrency: 4,
    model: 'gpt-5.4',
    reasoningEffort: 'high',
  })
})

test('resolveCliOptions resolves claude options with default effort', () => {
  const result = resolveCliOptions({
    '--adapter': 'claude',
    '--concurrency': null,
    '--effort': null,
    '--model': 'claude-sonnet-4-6',
    '--reasoning-effort': null,
  })

  assert.deepEqual(result, {
    adapter: 'claude',
    concurrency: 1,
    effort: 'high',
    model: 'claude-sonnet-4-6',
  })
})

test('resolveCliOptions rejects --effort for codex', () => {
  assert.throws(
    () =>
      resolveCliOptions({
        '--adapter': 'codex',
        '--concurrency': null,
        '--effort': 'high',
        '--model': 'gpt-5.4',
        '--reasoning-effort': null,
      }),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--effort is only supported for --adapter claude.',
  )
})

test('resolveCliOptions rejects --reasoning-effort for claude', () => {
  assert.throws(
    () =>
      resolveCliOptions({
        '--adapter': 'claude',
        '--concurrency': null,
        '--effort': null,
        '--model': 'claude-sonnet-4-6',
        '--reasoning-effort': 'high',
      }),
    (error) =>
      error instanceof CliUsageError &&
      error.message ===
        '--reasoning-effort is only supported for --adapter codex.',
  )
})

test('resolveCliOptions rejects unknown --effort for claude', () => {
  assert.throws(
    () =>
      resolveCliOptions({
        '--adapter': 'claude',
        '--concurrency': null,
        '--effort': 'hgh',
        '--model': 'claude-sonnet-4-6',
        '--reasoning-effort': null,
      }),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--effort must be one of: low, medium, high, max.',
  )
})
