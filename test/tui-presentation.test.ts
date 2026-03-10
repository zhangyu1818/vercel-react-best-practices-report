import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSessionOutcomeLine,
  buildSessionProgressLine,
  countAuditFindings,
} from '../src/bin/lib/tui-presentation.js'

test('countAuditFindings sums findings across all files', () => {
  assert.equal(
    countAuditFindings({
      '/tmp/a.tsx': [
        {
          lineContent: 'const a = 1',
          lineNumber: '1',
          rule: 'example-a',
          suggestion: 'fix a',
        },
      ],
      '/tmp/b.tsx': [
        {
          lineContent: 'const b = 1',
          lineNumber: '2',
          rule: 'example-b',
          suggestion: 'fix b',
        },
        {
          lineContent: 'const c = 1',
          lineNumber: '3',
          rule: 'example-c',
          suggestion: 'fix c',
        },
      ],
    }),
    3,
  )
})

test('buildSessionProgressLine shows full running file path without truncation', () => {
  assert.equal(
    buildSessionProgressLine(
      {
        filePath: '/tmp/app/src/components/very/deep/path/App.tsx',
        findingsCount: null,
        finishedAtMs: null,
        startedAtMs: 1000,
        status: 'running',
        taskNumber: 1,
      },
      2500,
    ),
    'Task 1 [RUN 1.5s] /tmp/app/src/components/very/deep/path/App.tsx',
  )
})

test('buildSessionProgressLine clamps running elapsed time to zero', () => {
  assert.equal(
    buildSessionProgressLine(
      {
        filePath: '/tmp/app/App.tsx',
        findingsCount: null,
        finishedAtMs: null,
        startedAtMs: 2000,
        status: 'running',
        taskNumber: 1,
      },
      1000,
    ),
    'Task 1 [RUN 0.0s] /tmp/app/App.tsx',
  )
})

test('buildSessionOutcomeLine shows full completed file path and findings summary', () => {
  assert.equal(
    buildSessionOutcomeLine({
      filePath: '/tmp/app/App.tsx',
      findingsCount: 2,
      finishedAtMs: 4500,
      startedAtMs: 1000,
      status: 'done',
      taskNumber: 4,
    }),
    'Last finished: Task 4 [DONE 3.5s] /tmp/app/App.tsx (2 findings)',
  )
})

test('buildSessionOutcomeLine shows error summary with full path', () => {
  assert.equal(
    buildSessionOutcomeLine({
      error: 'Session timed out after 10 minutes.',
      filePath: '/tmp/app/Component.tsx',
      findingsCount: null,
      finishedAtMs: 4600,
      startedAtMs: 1000,
      status: 'error',
      taskNumber: 6,
    }),
    'Last error: Task 6 [ERR 3.6s] /tmp/app/Component.tsx (Session timed out after 10 minutes.)',
  )
})
