import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAuditAdapter,
  type CreateAuditAdapterDependencies,
} from '../../src/bin/lib/providers/create-audit-adapter.js'

test('createAuditAdapter dispatches codex options to the codex provider', () => {
  const calls: string[] = []
  const dependencies: CreateAuditAdapterDependencies = {
    createClaudeAdapter() {
      throw new Error('claude adapter should not be created')
    },
    createCodexAdapter(options) {
      calls.push(JSON.stringify(options))
      return {
        async runFileAudit() {
          throw new Error('not needed')
        },
      }
    },
  }

  createAuditAdapter(
    {
      adapter: 'codex',
      concurrency: 1,
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
    },
    dependencies,
  )

  assert.equal(calls.length, 1)
  assert.match(calls[0] ?? '', /"adapter":"codex"/)
  assert.match(calls[0] ?? '', /"reasoningEffort":"medium"/)
})

test('createAuditAdapter dispatches claude options to the claude provider', () => {
  const calls: string[] = []
  const dependencies: CreateAuditAdapterDependencies = {
    createClaudeAdapter(options) {
      calls.push(JSON.stringify(options))
      return {
        async runFileAudit() {
          throw new Error('not needed')
        },
      }
    },
    createCodexAdapter() {
      throw new Error('codex adapter should not be created')
    },
  }

  createAuditAdapter(
    {
      adapter: 'claude',
      concurrency: 1,
      effort: 'max',
      model: 'claude-opus-4-1',
    },
    dependencies,
  )

  assert.equal(calls.length, 1)
  assert.match(calls[0] ?? '', /"adapter":"claude"/)
  assert.match(calls[0] ?? '', /"effort":"max"/)
})
