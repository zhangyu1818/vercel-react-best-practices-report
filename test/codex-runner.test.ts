import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectRunOutcome,
  createCodexRunner,
} from '../src/bin/lib/codex-runner.js'

test('collectRunOutcome returns parsed structured results from completed turn', () => {
  const result = collectRunOutcome(
    [
      { thread_id: 'thread-1', type: 'thread.started' },
      { type: 'turn.started' },
      {
        type: 'item.completed',
        item: {
          id: 'reasoning-1',
          text: 'check skill',
          type: 'reasoning',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'agent-1',
          text: '{"findings":[]}',
          type: 'agent_message',
        },
      },
      {
        type: 'turn.completed',
        usage: {
          cached_input_tokens: 0,
          input_tokens: 10,
          output_tokens: 20,
        },
      },
    ],
    '/abs/path/App.tsx',
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.threadID, 'thread-1')
    assert.deepEqual(result.output, {
      '/abs/path/App.tsx': [],
    })
  }
})

test('collectRunOutcome surfaces turn failures', () => {
  const result = collectRunOutcome(
    [
      { thread_id: 'thread-1', type: 'thread.started' },
      { type: 'turn.started' },
      {
        error: { message: 'approval denied' },
        type: 'turn.failed',
      },
    ],
    '/abs/path/App.tsx',
  )

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'approval denied')
  }
})

test('createCodexRunner sets a supported reasoning effort on each thread', async () => {
  let threadOptions: Record<string, unknown> | undefined

  const runner = createCodexRunner({
    model: 'gpt-5.3-codex',
    reasoningEffort: 'high',
    workingDirectory: '/tmp/project',
    codex: {
      startThread(options: Record<string, unknown>) {
        threadOptions = options
        return {
          async runStreamed() {
            return {
              events: (async function* () {
                yield { thread_id: 'thread-1', type: 'thread.started' } as const
                yield {
                  type: 'item.completed',
                  item: {
                    id: 'agent-1',
                    text: '{"findings":[]}',
                    type: 'agent_message',
                  },
                } as const
                yield {
                  type: 'turn.completed',
                  usage: {
                    cached_input_tokens: 0,
                    input_tokens: 10,
                    output_tokens: 20,
                  },
                } as const
              })(),
            }
          },
        }
      },
    } as never,
  })

  const result = await runner.runFileAudit({
    fileContent: 'export {}',
    filePath: '/abs/path/App.tsx',
    promptTemplate: 'Audit this file.',
  })

  assert.equal(result.ok, true)
  assert.equal(threadOptions?.modelReasoningEffort, 'high')
})

test('createCodexRunner passes through explicit reasoning effort overrides', async () => {
  let threadOptions: Record<string, unknown> | undefined

  const runner = createCodexRunner({
    model: 'gpt-5.3-codex',
    reasoningEffort: 'xhigh',
    workingDirectory: '/tmp/project',
    codex: {
      startThread(options: Record<string, unknown>) {
        threadOptions = options
        return {
          async runStreamed() {
            return {
              events: (async function* () {
                yield { thread_id: 'thread-2', type: 'thread.started' } as const
                yield {
                  type: 'item.completed',
                  item: {
                    id: 'agent-2',
                    text: '{"findings":[]}',
                    type: 'agent_message',
                  },
                } as const
                yield {
                  type: 'turn.completed',
                  usage: {
                    cached_input_tokens: 0,
                    input_tokens: 10,
                    output_tokens: 20,
                  },
                } as const
              })(),
            }
          },
        }
      },
    } as never,
  })

  const result = await runner.runFileAudit({
    fileContent: 'export {}',
    filePath: '/abs/path/App.tsx',
    promptTemplate: 'Audit this file.',
  })

  assert.equal(result.ok, true)
  assert.equal(threadOptions?.modelReasoningEffort, 'xhigh')
})
