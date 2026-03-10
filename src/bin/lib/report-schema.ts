export interface AuditFinding {
  lineContent: string
  lineNumber: string
  rule: string
  suggestion: string
}

export type AuditResult = Record<string, AuditFinding[]>

export interface CodexAuditOutput {
  findings: AuditFinding[]
}

const auditFindingSchema = {
  additionalProperties: false,
  required: ['lineNumber', 'lineContent', 'rule', 'suggestion'],
  type: 'object',
  properties: {
    lineContent: { type: 'string' },
    lineNumber: { type: 'string' },
    rule: { type: 'string' },
    suggestion: { type: 'string' },
  },
} as const

export const auditResultsSchema = {
  type: 'object',
  additionalProperties: {
    items: auditFindingSchema,
    type: 'array',
  },
} as const

export const codexAuditOutputSchema = {
  additionalProperties: false,
  required: ['findings'],
  type: 'object',
  properties: {
    findings: {
      items: auditFindingSchema,
      type: 'array',
    },
  },
} as const

export const auditResultsSchemaText = JSON.stringify(
  auditResultsSchema,
  null,
  2,
)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseJsonValue = (
  input: string,
  sourceLabel: string,
): { error: string; ok: false } | { ok: true; value: unknown } => {
  try {
    return {
      ok: true,
      value: JSON.parse(input),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      error: `${sourceLabel} is not valid JSON: ${message}`,
      ok: false,
    }
  }
}

export const validateAuditResults = (
  value: unknown,
):
  | {
      errors: string[]
      ok: false
    }
  | {
      ok: true
      value: AuditResult
    } => {
  const errors: string[] = []
  if (!isPlainObject(value)) {
    errors.push('root: expected an object keyed by file path')
  } else {
    for (const [filePath, entries] of Object.entries(value)) {
      if (!Array.isArray(entries)) {
        errors.push(`${filePath}: expected an array of violations`)
        continue
      }
      entries.forEach((entry, index) => {
        if (!isPlainObject(entry)) {
          errors.push(`${filePath}[${index}]: expected an object`)
          return
        }
        const requiredKeys = [
          'lineNumber',
          'lineContent',
          'rule',
          'suggestion',
        ] as const
        for (const key of requiredKeys) {
          if (typeof entry[key] !== 'string') {
            errors.push(`${filePath}[${index}].${key}: expected a string`)
          }
        }
      })
    }
  }

  if (errors.length !== 0) {
    return { errors, ok: false }
  }

  return {
    ok: true,
    value: value as AuditResult,
  }
}

export const validateCodexAuditOutput = (
  value: unknown,
):
  | {
      errors: string[]
      ok: false
    }
  | {
      ok: true
      value: CodexAuditOutput
    } => {
  const errors: string[] = []
  if (!isPlainObject(value)) {
    errors.push('root: expected an object')
  } else {
    if (!Array.isArray(value.findings)) {
      errors.push('findings: expected an array')
    } else {
      value.findings.forEach((entry, index) => {
        if (!isPlainObject(entry)) {
          errors.push(`findings[${index}]: expected an object`)
          return
        }
        const requiredKeys = [
          'lineNumber',
          'lineContent',
          'rule',
          'suggestion',
        ] as const
        for (const key of requiredKeys) {
          if (typeof entry[key] !== 'string') {
            errors.push(`findings[${index}].${key}: expected a string`)
          }
        }
      })
    }
  }

  if (errors.length !== 0) {
    return { errors, ok: false }
  }

  return {
    ok: true,
    value: value as CodexAuditOutput,
  }
}

export const codexAuditOutputToAuditResult = (
  filePath: string,
  output: CodexAuditOutput,
): AuditResult => ({
  [filePath]: output.findings,
})

export const mergeAuditResults = (
  existing: AuditResult,
  incoming: AuditResult,
): AuditResult => {
  const merged: AuditResult = { ...existing }

  for (const [filePath, entries] of Object.entries(incoming)) {
    if (!Object.prototype.hasOwnProperty.call(merged, filePath)) {
      merged[filePath] = [...entries]
      continue
    }
    merged[filePath] = [...merged[filePath], ...entries]
  }

  return merged
}
