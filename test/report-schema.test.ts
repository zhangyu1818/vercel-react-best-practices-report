import assert from 'node:assert/strict'
import test from 'node:test'

import {
  codexAuditOutputSchema,
  mergeAuditResults,
  parseJsonValue,
  validateAuditResults,
  validateCodexAuditOutput,
} from '../src/bin/lib/report-schema.js'

test('codexAuditOutputSchema uses fixed root properties', () => {
  assert.equal(codexAuditOutputSchema.additionalProperties, false)
  assert.deepEqual(codexAuditOutputSchema.required, ['findings'])
})

test('codexAuditOutputSchema marks finding objects as closed schemas', () => {
  assert.equal(
    codexAuditOutputSchema.properties.findings.items.additionalProperties,
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

test('validateCodexAuditOutput accepts findings-only payloads', () => {
  const result = validateCodexAuditOutput({
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
