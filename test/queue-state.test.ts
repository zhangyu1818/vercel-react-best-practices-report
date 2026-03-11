import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  claimNextQueueFile,
  initializeQueueState,
  markQueueFileDone,
  markQueueFileFailed,
} from '../src/bin/lib/queue-state.js'

const createTempReportDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'queue-state-test.'))

const readQueueState = (reportDir: string) => {
  const statePath = path.join(reportDir, 'queue-state.json')
  if (!fs.existsSync(statePath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
    failed: string[]
    inProgress: string[]
    pending: string[]
  }
}

test('initializeQueueState requeues interrupted files and skips completed ones', async () => {
  const reportDir = createTempReportDir()
  const completedFile = '/tmp/project/done.tsx'
  const pendingFile = '/tmp/project/pending.tsx'
  const interruptedFile = '/tmp/project/interrupted.tsx'
  const failedFile = '/tmp/project/failed.tsx'
  const newFile = '/tmp/project/new.tsx'

  fs.writeFileSync(
    path.join(reportDir, 'reports.json'),
    `${JSON.stringify({ [completedFile]: [] }, null, 2)}\n`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(reportDir, 'queue-state.json'),
    `${JSON.stringify(
      {
        failed: [failedFile],
        inProgress: [interruptedFile],
        pending: [pendingFile],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  const total = await initializeQueueState(reportDir, [
    completedFile,
    failedFile,
    interruptedFile,
    newFile,
    pendingFile,
  ])

  assert.equal(total, 4)
  assert.deepEqual(readQueueState(reportDir), {
    failed: [],
    inProgress: [],
    pending: [pendingFile, interruptedFile, failedFile, newFile],
  })
})

test('claimNextQueueFile claims pending files exactly once and markQueueFileDone prunes them', async () => {
  const reportDir = createTempReportDir()
  const firstFile = '/tmp/project/a.tsx'
  const secondFile = '/tmp/project/b.tsx'

  await initializeQueueState(reportDir, [firstFile, secondFile])

  assert.equal(await claimNextQueueFile(reportDir), firstFile)
  assert.deepEqual(readQueueState(reportDir), {
    failed: [],
    inProgress: [firstFile],
    pending: [secondFile],
  })

  assert.equal(await claimNextQueueFile(reportDir), secondFile)
  assert.deepEqual(readQueueState(reportDir), {
    failed: [],
    inProgress: [firstFile, secondFile],
    pending: [],
  })

  await markQueueFileDone(reportDir, firstFile)
  assert.deepEqual(readQueueState(reportDir), {
    failed: [],
    inProgress: [secondFile],
    pending: [],
  })
})

test('markQueueFileFailed preserves failed files for the next invocation', async () => {
  const reportDir = createTempReportDir()
  const filePath = '/tmp/project/error.tsx'

  await initializeQueueState(reportDir, [filePath])
  assert.equal(await claimNextQueueFile(reportDir), filePath)

  await markQueueFileFailed(reportDir, filePath)
  assert.deepEqual(readQueueState(reportDir), {
    failed: [filePath],
    inProgress: [],
    pending: [],
  })

  const total = await initializeQueueState(reportDir, [filePath])
  assert.equal(total, 1)
  assert.deepEqual(readQueueState(reportDir), {
    failed: [],
    inProgress: [],
    pending: [filePath],
  })
})

test('markQueueFileDone removes the queue-state file when nothing remains', async () => {
  const reportDir = createTempReportDir()
  const filePath = '/tmp/project/only.tsx'

  await initializeQueueState(reportDir, [filePath])
  assert.equal(await claimNextQueueFile(reportDir), filePath)
  await markQueueFileDone(reportDir, filePath)

  assert.equal(readQueueState(reportDir), null)
})
