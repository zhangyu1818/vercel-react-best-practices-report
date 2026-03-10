import type { Usage } from '@openai/codex-sdk'

import type { AuditResult } from './report-schema.js'

export type TuiSessionState = 'done' | 'error' | 'idle' | 'running'

export interface TuiSessionSnapshot {
  error?: string
  filePath?: string
  findingsCount?: null | number
  finishedAtMs?: null | number
  startedAtMs?: null | number
  status: TuiSessionState
  taskNumber?: number
  usage?: null | Usage
}

const formatSeconds = (ms: number): string =>
  `${(Math.max(0, ms) / 1000).toFixed(1)}s`

export const countAuditFindings = (result: AuditResult): number =>
  Object.values(result).reduce((total, findings) => total + findings.length, 0)

const buildTaskLabel = (session: TuiSessionSnapshot): string =>
  session.taskNumber ? `Task ${session.taskNumber}` : 'Task'

const buildDurationLabel = (
  session: TuiSessionSnapshot,
  nowMs: number = Date.now(),
): string =>
  session.status === 'running'
    ? formatSeconds(nowMs - (session.startedAtMs ?? nowMs))
    : formatSeconds(
        (session.finishedAtMs ?? nowMs) - (session.startedAtMs ?? nowMs),
      )

export const buildSessionProgressLine = (
  session: TuiSessionSnapshot,
  nowMs: number = Date.now(),
): string => {
  const taskLabel = buildTaskLabel(session)
  const filePath = session.filePath ?? 'Waiting for assignment'
  return `${taskLabel} [RUN ${buildDurationLabel(session, nowMs)}] ${filePath}`
}

export const buildSessionOutcomeLine = (
  session: TuiSessionSnapshot,
  nowMs: number = Date.now(),
): string => {
  const taskLabel = buildTaskLabel(session)
  const filePath = session.filePath ?? 'Unknown file'
  const durationLabel = buildDurationLabel(session, nowMs)

  if (session.status === 'done') {
    const findingsCount = session.findingsCount ?? 0
    const findingLabel =
      findingsCount === 1 ? '1 finding' : `${findingsCount} findings`
    return `Last finished: ${taskLabel} [DONE ${durationLabel}] ${filePath} (${findingLabel})`
  }

  if (session.status === 'error') {
    const errorMessage = session.error ?? 'Unknown error'
    return `Last error: ${taskLabel} [ERR ${durationLabel}] ${filePath} (${errorMessage})`
  }

  return `${taskLabel} [IDLE] ${filePath}`
}
