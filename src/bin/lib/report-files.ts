import fs from 'node:fs'
import path from 'node:path'

import {
  auditResultsSchemaText,
  mergeAuditResults,
  parseJsonValue,
  validateAuditResults,
  type AuditResult,
} from './report-schema.js'

interface ReportWriteFailure {
  includeSchema: boolean
  messages: string[]
  ok: false
}

interface ValidatedAuditResults {
  ok: true
  value: AuditResult
}

export type ReportWriteResult = ReportWriteFailure | { ok: true }

const lockRetryMs = 50
const lockTimeoutMs = 30000

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' && error !== null && 'code' in error

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const acquireMergeLock = async (lockPath: string): Promise<number> => {
  const reportDir = path.dirname(lockPath)
  fs.mkdirSync(reportDir, { recursive: true })
  const start = Date.now()
  for (;;) {
    try {
      return fs.openSync(lockPath, 'wx')
    } catch (error) {
      if (isErrnoException(error) && error.code === 'EEXIST') {
        if (Date.now() - start > lockTimeoutMs) {
          throw new Error('Timed out waiting for merge lock.')
        }
        await delay(lockRetryMs)
        continue
      }
      throw error
    }
  }
}

const releaseMergeLock = (lockHandle: number, lockPath: string) => {
  try {
    fs.closeSync(lockHandle)
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(lockPath)
  } catch {
    // ignore
  }
}

const invalidJsonResult = (message: string): ReportWriteFailure => ({
  includeSchema: true,
  messages: [message, 'Expected JSON schema:', auditResultsSchemaText],
  ok: false,
})

const invalidSchemaResult = (errors: string[]): ReportWriteFailure => ({
  includeSchema: true,
  ok: false,
  messages: [
    'Merge JSON failed schema validation.',
    ...errors,
    'Expected JSON schema:',
    auditResultsSchemaText,
  ],
})

const parseAndValidateAuditResults = (
  input: string,
): ReportWriteFailure | ValidatedAuditResults => {
  const parsed = parseJsonValue(input, 'reports.json')
  if (!parsed.ok) {
    return invalidJsonResult(parsed.error)
  }

  const validation = validateAuditResults(parsed.value)
  if (!validation.ok) {
    return invalidSchemaResult(validation.errors)
  }

  return validation
}

const loadExistingAuditResults = (
  outputPath: string,
): ReportWriteFailure | ValidatedAuditResults => {
  if (!fs.existsSync(outputPath)) {
    return {
      ok: true,
      value: {},
    }
  }

  const existingContents = fs.readFileSync(outputPath, 'utf8')
  const parsed = parseAndValidateAuditResults(existingContents)
  if (!parsed.ok) {
    return {
      includeSchema: parsed.includeSchema,
      messages: ['Existing reports.json is invalid.', ...parsed.messages],
      ok: false,
    }
  }

  return parsed
}

export const mergeAuditResultsIntoReport = async (
  reportDir: string,
  newResults: AuditResult,
): Promise<ReportWriteResult> => {
  const outputPath = path.join(reportDir, 'reports.json')
  const lockPath = path.join(reportDir, 'reports.lock')
  let lockHandle: null | number = null

  try {
    lockHandle = await acquireMergeLock(lockPath)
    const existingResults = loadExistingAuditResults(outputPath)
    if (!existingResults.ok) {
      return existingResults
    }

    const mergedResults = mergeAuditResults(existingResults.value, newResults)
    fs.mkdirSync(reportDir, { recursive: true })
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(mergedResults, null, 2)}\n`,
      'utf8',
    )
    return { ok: true }
  } catch (error) {
    return {
      includeSchema: false,
      messages: [error instanceof Error ? error.message : String(error)],
      ok: false,
    }
  } finally {
    if (lockHandle !== null) {
      releaseMergeLock(lockHandle, lockPath)
    }
  }
}
