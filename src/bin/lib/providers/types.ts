import type { AuditResult } from '../report-schema.js'

export interface RunFileAuditOptions {
  fileContent: string
  filePath: string
  promptTemplate: string
  signal?: AbortSignal
}

export type AuditRunOutcome =
  | {
      error: string
      ok: false
      sessionID: null | string
      usage: null | object
    }
  | {
      ok: true
      output: AuditResult
      sessionID: null | string
      usage: null | object
    }

export interface AuditAdapter {
  runFileAudit: (options: RunFileAuditOptions) => Promise<AuditRunOutcome>
}
