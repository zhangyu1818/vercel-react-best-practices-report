import assert from 'node:assert/strict'
import test from 'node:test'

import {
  auditOutputSchema,
  mergeAuditResults,
  parseJsonValue,
  validateAuditOutput,
  validateAuditResults,
} from '../src/bin/lib/report-schema.js'

test('auditOutputSchema uses fixed root properties', () => {
  assert.equal(auditOutputSchema.additionalProperties, false)
  assert.deepEqual(auditOutputSchema.required, ['findings'])
})

test('auditOutputSchema marks finding objects as closed schemas', () => {
  assert.equal(
    auditOutputSchema.properties.findings.items.additionalProperties,
    false,
  )
})

test('validateAuditResults accepts empty arrays per file', () => {
  assert.equal(
    validateAuditResults({
      '/abs/path/App.tsx': [],
    }).ok,
    true,
  )
})

test('validateAuditOutput accepts findings-only payloads', () => {
  const result = validateAuditOutput({
    findings: [],
  })

  assert.equal(result.ok, true)
})

test('validateAuditResults rejects malformed findings', () => {
  const result = validateAuditResults({
    '/abs/path/App.tsx': [{ lineNumber: 12 }],
  })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /lineNumber: expected a string/)
  assert.match(result.errors.join('\n'), /lineContent: expected a string/)
})

test('parseJsonValue reports invalid structured output json with source label', () => {
  const result = parseJsonValue('{', 'Structured output')

  assert.equal(result.ok, false)
  assert.match(result.error, /Structured output is not valid JSON/)
})

test('mergeAuditResults appends findings for duplicate files', () => {
  const merged = mergeAuditResults(
    {
      '/abs/path/App.tsx': [
        {
          lineContent: 'const a = 1',
          lineNumber: '1',
          rule: 'rule-a',
          suggestion: 'const a = 2',
        },
      ],
    },
    {
      '/abs/path/Page.tsx': [],
      '/abs/path/App.tsx': [
        {
          lineContent: 'const b = 1',
          lineNumber: '2',
          rule: 'rule-b',
          suggestion: 'const b = 2',
        },
      ],
    },
  )

  assert.deepEqual(merged, {
    '/abs/path/Page.tsx': [],
    '/abs/path/App.tsx': [
      {
        lineContent: 'const a = 1',
        lineNumber: '1',
        rule: 'rule-a',
        suggestion: 'const a = 2',
      },
      {
        lineContent: 'const b = 1',
        lineNumber: '2',
        rule: 'rule-b',
        suggestion: 'const b = 2',
      },
    ],
  })
})
