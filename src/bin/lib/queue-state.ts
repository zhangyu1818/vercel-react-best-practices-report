import fs from 'node:fs'
import path from 'node:path'

import { withFileLock } from './file-lock.js'
import { parseJsonValue, validateAuditResults } from './report-schema.js'

interface QueueState {
  failed: string[]
  inProgress: string[]
  pending: string[]
}

const createEmptyQueueState = (): QueueState => ({
  failed: [],
  inProgress: [],
  pending: [],
})

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const validateQueueState = (value: unknown): QueueState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('queue-state.json must be an object.')
  }

  const record = value as Record<string, unknown>
  const pending = record.pending
  const inProgress = record.inProgress
  const failed = record.failed

  if (!isStringArray(pending)) {
    throw new Error('queue-state.json pending must be an array of file paths.')
  }
  if (!isStringArray(inProgress)) {
    throw new Error(
      'queue-state.json inProgress must be an array of file paths.',
    )
  }
  if (!isStringArray(failed)) {
    throw new Error('queue-state.json failed must be an array of file paths.')
  }

  return { failed, inProgress, pending }
}

const loadQueueState = (statePath: string): QueueState => {
  if (!fs.existsSync(statePath)) {
    return createEmptyQueueState()
  }

  const contents = fs.readFileSync(statePath, 'utf8')
  const parsed = parseJsonValue(contents, 'queue-state.json')
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }

  return validateQueueState(parsed.value)
}

const persistQueueState = (statePath: string, state: QueueState) => {
  if (
    state.pending.length === 0 &&
    state.inProgress.length === 0 &&
    state.failed.length === 0
  ) {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath)
    }
    return
  }

  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  const tempPath = `${statePath}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, statePath)
}

const loadCompletedFiles = (reportDir: string): Set<string> => {
  const reportPath = path.join(reportDir, 'reports.json')
  if (!fs.existsSync(reportPath)) {
    return new Set<string>()
  }

  const contents = fs.readFileSync(reportPath, 'utf8')
  const parsed = parseJsonValue(contents, 'reports.json')
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }

  const validation = validateAuditResults(parsed.value)
  if (!validation.ok) {
    throw new Error(validation.errors.join('\n'))
  }

  return new Set(Object.keys(validation.value))
}

const removeFileFromState = (
  state: QueueState,
  filePath: string,
): QueueState => ({
  failed: state.failed.filter((entry) => entry !== filePath),
  inProgress: state.inProgress.filter((entry) => entry !== filePath),
  pending: state.pending.filter((entry) => entry !== filePath),
})

const getQueueStatePaths = (reportDir: string) => ({
  lockPath: path.join(reportDir, 'queue.lock'),
  statePath: path.join(reportDir, 'queue-state.json'),
})

export const initializeQueueState = async (
  reportDir: string,
  discoveredFiles: string[],
): Promise<number> => {
  const { lockPath, statePath } = getQueueStatePaths(reportDir)

  return withFileLock(lockPath, () => {
    const completedFiles = loadCompletedFiles(reportDir)
    const discoveredFileSet = new Set(discoveredFiles)
    const previousState = loadQueueState(statePath)
    const pending: string[] = []
    const seen = new Set<string>()

    for (const filePath of [
      ...previousState.pending,
      ...previousState.inProgress,
      ...previousState.failed,
      ...discoveredFiles,
    ]) {
      if (seen.has(filePath)) {
        continue
      }
      if (!discoveredFileSet.has(filePath) || completedFiles.has(filePath)) {
        continue
      }
      seen.add(filePath)
      pending.push(filePath)
    }

    persistQueueState(statePath, {
      failed: [],
      inProgress: [],
      pending,
    })

    return pending.length
  })
}

export const claimNextQueueFile = async (
  reportDir: string,
): Promise<null | string> => {
  const { lockPath, statePath } = getQueueStatePaths(reportDir)

  return withFileLock(lockPath, () => {
    const state = loadQueueState(statePath)
    const nextFile = state.pending[0]
    if (!nextFile) {
      return null
    }

    persistQueueState(statePath, {
      failed: state.failed,
      inProgress: [...state.inProgress, nextFile],
      pending: state.pending.slice(1),
    })

    return nextFile
  })
}

export const markQueueFileDone = async (
  reportDir: string,
  filePath: string,
): Promise<void> => {
  const { lockPath, statePath } = getQueueStatePaths(reportDir)

  await withFileLock(lockPath, () => {
    const state = loadQueueState(statePath)
    persistQueueState(statePath, removeFileFromState(state, filePath))
  })
}

export const markQueueFileFailed = async (
  reportDir: string,
  filePath: string,
): Promise<void> => {
  const { lockPath, statePath } = getQueueStatePaths(reportDir)

  await withFileLock(lockPath, () => {
    const state = removeFileFromState(loadQueueState(statePath), filePath)
    persistQueueState(statePath, {
      ...state,
      failed: [...state.failed, filePath],
    })
  })
}
