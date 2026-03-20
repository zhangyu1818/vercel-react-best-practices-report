import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  CliUsageError,
  parseCliArgs,
  resolveCliOptions,
  usage,
} from '../src/bin/lib/cli-options.js'

test('usage documents adapter-aware arguments', () => {
  const text = usage('/tmp/vercel-react-best-practices-report')

  assert.match(text, /--adapter <codex\|claude>/)
  assert.match(text, /--model <model-id>/)
  assert.match(text, /--reasoning-effort/)
  assert.match(text, /--effort/)
  assert.match(text, /--directory <path>/)
  assert.doesNotMatch(text, /--merge/)
})

test('parseCliArgs maps directory aliases to --directory', () => {
  assert.equal(
    parseCliArgs(['--dir', 'packages/app'])['--directory'],
    'packages/app',
  )
  assert.equal(
    parseCliArgs(['-d', 'packages/app'])['--directory'],
    'packages/app',
  )
})

test('resolveCliOptions requires --adapter', () => {
  assert.throws(
    () =>
      resolveCliOptions(
        {
          '--adapter': null,
          '--concurrency': null,
          '--directory': null,
          '--effort': null,
          '--model': 'gpt-5.4',
          '--reasoning-effort': null,
        },
        '/tmp/project',
      ),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--adapter is required.',
  )
})

test('resolveCliOptions requires --model', () => {
  assert.throws(
    () =>
      resolveCliOptions(
        {
          '--adapter': 'codex',
          '--concurrency': null,
          '--directory': null,
          '--effort': null,
          '--model': null,
          '--reasoning-effort': null,
        },
        '/tmp/project',
      ),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--model is required.',
  )
})

test('resolveCliOptions resolves codex options with default reasoning effort', () => {
  const result = resolveCliOptions(
    {
      '--adapter': 'codex',
      '--concurrency': 4,
      '--directory': 'packages/app',
      '--effort': null,
      '--model': 'gpt-5.4',
      '--reasoning-effort': null,
    },
    '/tmp/project',
  )

  assert.deepEqual(result, {
    adapter: 'codex',
    concurrency: 4,
    directory: path.join('/tmp/project', 'packages/app'),
    model: 'gpt-5.4',
    reasoningEffort: 'high',
  })
})

test('resolveCliOptions resolves claude options with default effort', () => {
  const result = resolveCliOptions(
    {
      '--adapter': 'claude',
      '--concurrency': null,
      '--directory': null,
      '--effort': null,
      '--model': 'claude-sonnet-4-6',
      '--reasoning-effort': null,
    },
    '/tmp/project',
  )

  assert.deepEqual(result, {
    adapter: 'claude',
    concurrency: 1,
    directory: '/tmp/project',
    effort: 'high',
    model: 'claude-sonnet-4-6',
  })
})

test('resolveCliOptions rejects --effort for codex', () => {
  assert.throws(
    () =>
      resolveCliOptions(
        {
          '--adapter': 'codex',
          '--concurrency': null,
          '--directory': null,
          '--effort': 'high',
          '--model': 'gpt-5.4',
          '--reasoning-effort': null,
        },
        '/tmp/project',
      ),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--effort is only supported for --adapter claude.',
  )
})

test('resolveCliOptions rejects --reasoning-effort for claude', () => {
  assert.throws(
    () =>
      resolveCliOptions(
        {
          '--adapter': 'claude',
          '--concurrency': null,
          '--directory': null,
          '--effort': null,
          '--model': 'claude-sonnet-4-6',
          '--reasoning-effort': 'high',
        },
        '/tmp/project',
      ),
    (error) =>
      error instanceof CliUsageError &&
      error.message ===
        '--reasoning-effort is only supported for --adapter codex.',
  )
})

test('resolveCliOptions rejects unknown --effort for claude', () => {
  assert.throws(
    () =>
      resolveCliOptions(
        {
          '--adapter': 'claude',
          '--concurrency': null,
          '--directory': null,
          '--effort': 'hgh',
          '--model': 'claude-sonnet-4-6',
          '--reasoning-effort': null,
        },
        '/tmp/project',
      ),
    (error) =>
      error instanceof CliUsageError &&
      error.message === '--effort must be one of: low, medium, high, max.',
  )
})

test('resolveCliOptions rejects absolute --directory paths', () => {
  assert.throws(
    () =>
      resolveCliOptions(
        {
          '--adapter': 'codex',
          '--concurrency': null,
          '--directory': '/tmp/project/packages/app',
          '--effort': null,
          '--model': 'gpt-5.4',
          '--reasoning-effort': null,
        },
        '/tmp/project',
      ),
    (error) =>
      error instanceof CliUsageError &&
      error.message ===
        '--directory must be a relative path within the current working directory.',
  )
})

test('resolveCliOptions rejects --directory paths outside the current working directory', () => {
  assert.throws(
    () =>
      resolveCliOptions(
        {
          '--adapter': 'codex',
          '--concurrency': null,
          '--directory': '../outside',
          '--effort': null,
          '--model': 'gpt-5.4',
          '--reasoning-effort': null,
        },
        '/tmp/project',
      ),
    (error) =>
      error instanceof CliUsageError &&
      error.message ===
        '--directory must be a relative path within the current working directory.',
  )
})

test('resolveCliOptions allows relative directories that begin with two dots', () => {
  const result = resolveCliOptions(
    {
      '--adapter': 'codex',
      '--concurrency': null,
      '--directory': '..cache',
      '--effort': null,
      '--model': 'gpt-5.4',
      '--reasoning-effort': null,
    },
    '/tmp/project',
  )

  assert.equal(result.directory, path.join('/tmp/project', '..cache'))
})
