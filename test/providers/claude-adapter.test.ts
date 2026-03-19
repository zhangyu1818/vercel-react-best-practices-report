import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createClaudeAdapter,
  type ClaudeQueryMessage,
} from '../../src/bin/lib/providers/claude-adapter.js'

const makeQuery = (messages: ClaudeQueryMessage[]) => {
  return ({
    options,
    prompt,
  }: {
    options: Record<string, unknown>
    prompt: string
  }) => {
    return {
      options,
      prompt,
      async *[Symbol.asyncIterator]() {
        for (const message of messages) {
          yield message
        }
      },
    }
  }
}

test('createClaudeAdapter uses sdk structured output and returns findings', async () => {
  let capturedOptions: Record<string, unknown> | undefined
  let capturedPrompt: string | undefined

  const adapter = createClaudeAdapter({
    effort: 'max',
    model: 'claude-opus-4-1',
    workingDirectory: '/tmp/project',
    query(args) {
      capturedOptions = args.options as Record<string, unknown>
      capturedPrompt = args.prompt
      return makeQuery([
        {
          session_id: 'session-1',
          subtype: 'success',
          type: 'result',
          structured_output: {
            findings: [],
          },
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
        },
      ])(args as never)
    },
  })

  const result = await adapter.runFileAudit({
    fileContent: 'export {}',
    filePath: '/tmp/project/App.tsx',
    promptTemplate: 'Audit this file.',
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.sessionID, 'session-1')
    assert.deepEqual(result.output, {
      '/tmp/project/App.tsx': [],
    })
  }

  assert.equal(capturedOptions?.cwd, '/tmp/project')
  assert.equal(capturedOptions?.model, 'claude-opus-4-1')
  assert.equal(capturedOptions?.effort, 'max')
  assert.equal(capturedOptions?.permissionMode, 'dontAsk')
  assert.deepEqual(capturedOptions?.settingSources, ['user', 'project'])
  assert.deepEqual(capturedOptions?.tools, ['Skill', 'Read'])
  assert.deepEqual(capturedOptions?.allowedTools, ['Skill', 'Read'])
  assert.deepEqual(capturedOptions?.outputFormat, {
    type: 'json_schema',
    schema: {
      additionalProperties: false,
      required: ['findings'],
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            additionalProperties: false,
            required: ['lineNumber', 'lineContent', 'rule', 'suggestion'],
            type: 'object',
            properties: {
              lineContent: { type: 'string' },
              lineNumber: { type: 'string' },
              rule: { type: 'string' },
              suggestion: { type: 'string' },
            },
          },
        },
      },
    },
  })
  assert.match(capturedPrompt ?? '', /## Target File\n\/tmp\/project\/App\.tsx/)
})

test('createClaudeAdapter fails when the sdk result omits structured output', async () => {
  const adapter = createClaudeAdapter({
    effort: 'high',
    model: 'claude-sonnet-4-6',
    workingDirectory: '/tmp/project',
    query: makeQuery([
      {
        result: 'done',
        session_id: 'session-2',
        subtype: 'success',
        type: 'result',
      },
    ]),
  })

  const result = await adapter.runFileAudit({
    fileContent: 'export {}',
    filePath: '/tmp/project/App.tsx',
    promptTemplate: 'Audit this file.',
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'Claude did not return structured output.')
  }
})

test('createClaudeAdapter surfaces error result subtypes', async () => {
  const adapter = createClaudeAdapter({
    effort: 'high',
    model: 'claude-sonnet-4-6',
    workingDirectory: '/tmp/project',
    query: makeQuery([
      {
        session_id: 'session-3',
        subtype: 'error_max_structured_output_retries',
        type: 'result',
      },
    ]),
  })

  const result = await adapter.runFileAudit({
    fileContent: 'export {}',
    filePath: '/tmp/project/App.tsx',
    promptTemplate: 'Audit this file.',
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(
      result.error,
      'Claude returned an unsuccessful result: error_max_structured_output_retries',
    )
  }
})

test('createClaudeAdapter catches synchronous query initialization failures', async () => {
  const adapter = createClaudeAdapter({
    effort: 'high',
    model: 'claude-sonnet-4-6',
    workingDirectory: '/tmp/project',
    query() {
      throw new Error('sync boom')
    },
  })

  const result = await adapter.runFileAudit({
    fileContent: 'export {}',
    filePath: '/tmp/project/App.tsx',
    promptTemplate: 'Audit this file.',
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'sync boom')
    assert.equal(result.sessionID, null)
    assert.equal(result.usage, null)
  }
})
