import { execSync } from 'node:child_process'
/* eslint-disable react-refresh/only-export-components */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge, Spinner, StatusMessage } from '@inkjs/ui'
import arg from 'arg'
import { Box, render, Text, useApp } from 'ink'

import { CliUsageError, resolveCliOptions, usage } from './lib/cli-options.js'
import {
  createCodexRunner,
  type CodexSessionState,
} from './lib/codex-runner.js'
import { mergeAuditResultsIntoReport } from './lib/report-files.js'
import {
  buildSessionOutcomeLine,
  buildSessionProgressLine,
  countAuditFindings,
} from './lib/tui-presentation.js'

const baseDir = process.cwd()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const reportDir = path.join(baseDir, 'react-best-practices-report')
const checkFilePath = path.join(reportDir, 'check-files.txt')
const promptPath = path.join(
  __dirname,
  '..',
  'prompts',
  'vercel-react-best-practices-report.md',
)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const parseArgs = () => {
  try {
    return arg(
      {
        '--concurrency': Number,
        '--help': Boolean,
        '--model': String,
        '--reasoning-effort': String,
        '-c': '--concurrency',
        '-h': '--help',
        '-m': '--model',
        '-r': '--reasoning-effort',
      },
      { argv: process.argv.slice(2) },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    console.error(usage())
    process.exit(1)
  }
}

const ensureReportDir = () => {
  fs.mkdirSync(reportDir, { recursive: true })
}

const buildFindCommand = () =>
  `${String.raw`find "${baseDir}" -type f \( -name "*.ts" -o -name "*.tsx" \) `}-not -path "*/node_modules/*" ` +
  `-not -path "*/__tests__/*" ` +
  `-not -path "*/mock/*" ` +
  `-not -path "*/types/*" ` +
  `-not -name "*.test.*" ` +
  `-not -name "*.spec.*" ` +
  `-not -name "*.d.ts"`

const ensureCheckFile = () => {
  if (fs.existsSync(checkFilePath)) {
    return
  }
  const output = execSync(buildFindCommand(), { encoding: 'utf8' })
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const content = lines.length !== 0 ? `${lines.join('\n')}\n` : ''
  fs.writeFileSync(checkFilePath, content, 'utf8')
}

const loadQueue = (): string[] => {
  if (!fs.existsSync(checkFilePath)) {
    return []
  }
  const content = fs.readFileSync(checkFilePath, 'utf8')
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

interface AppProps {
  baseDir: string
  checkFilePath: string
  concurrency: number
  model: string
  promptTemplate: string
  queueLines: string[]
  reasoningEffort: string
  reportDir: string
}

type SessionStatus = CodexSessionState

interface SessionView {
  error?: string
  filePath?: string
  findingsCount?: null | number
  finishedAtMs?: null | number
  startedAtMs?: null | number
  status: SessionStatus
  taskNumber?: number
}

interface Stats {
  assigned: number
  completed: number
  errors: number
  findings: number
  total: number
}

const initSessions = (count: number): SessionView[] =>
  Array.from({ length: count }, () => ({
    findingsCount: null,
    finishedAtMs: null,
    startedAtMs: null,
    status: 'idle',
  }))

const createQueue = (lines: string[], queueFilePath: string) => {
  let index = 0
  const popNext = (): null | string => {
    if (index >= lines.length) {
      return null
    }
    const next = lines[index]
    index += 1
    const remaining = lines.slice(index)
    const tempPath = `${queueFilePath}.tmp`
    const content = remaining.length !== 0 ? `${remaining.join('\n')}\n` : ''
    fs.writeFileSync(tempPath, content, 'utf8')
    fs.renameSync(tempPath, queueFilePath)
    return next
  }
  return { popNext }
}

const App = ({
  baseDir,
  checkFilePath,
  concurrency,
  model,
  promptTemplate,
  queueLines,
  reasoningEffort,
  reportDir,
}: AppProps) => {
  const { exit } = useApp()
  const [sessions, setSessions] = useState<SessionView[]>(() =>
    initSessions(concurrency),
  )
  const [stats, setStats] = useState<Stats>({
    assigned: 0,
    completed: 0,
    errors: 0,
    findings: 0,
    total: queueLines.length,
  })
  const [fatalError, setFatalError] = useState<null | string>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [lastErrorLine, setLastErrorLine] = useState<null | string>(null)
  const [lastFinishedLine, setLastFinishedLine] = useState<null | string>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const queueRef = useRef(createQueue(queueLines, checkFilePath))
  const activeAbortControllers = useRef(new Set<AbortController>())
  const taskCounterRef = useRef(0)

  const updateSlot = useCallback(
    (slotIndex: number, patch: Partial<SessionView>) => {
      setSessions((prev) => {
        const next = [...prev]
        const current = next[slotIndex]
        if (!current) {
          return prev
        }
        next[slotIndex] = { ...current, ...patch }
        return next
      })
    },
    [],
  )

  const updateStats = useCallback((updater: (prev: Stats) => Stats) => {
    setStats(updater)
  }, [])

  const nextTaskNumber = useCallback(() => {
    taskCounterRef.current += 1
    return taskCounterRef.current
  }, [])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let isActive = true
    const controllers = activeAbortControllers.current
    const runner = createCodexRunner({
      model,
      reasoningEffort,
      workingDirectory: baseDir,
    })

    const finishTask = (status: SessionStatus, findingsCount: number = 0) => {
      updateStats((prev) => ({
        ...prev,
        completed: prev.completed + 1,
        errors: status === 'error' ? prev.errors + 1 : prev.errors,
        findings:
          status === 'done' ? prev.findings + findingsCount : prev.findings,
      }))
    }

    const worker = async (slotIndex: number) => {
      for (;;) {
        if (!isActive) {
          return
        }

        const filePath = queueRef.current.popNext()
        if (!filePath) {
          return
        }

        const taskNumber = nextTaskNumber()
        const startedAtMs = Date.now()
        updateStats((prev) => ({ ...prev, assigned: prev.assigned + 1 }))
        updateSlot(slotIndex, {
          error: undefined,
          filePath,
          findingsCount: null,
          finishedAtMs: null,
          startedAtMs,
          status: 'running',
          taskNumber,
        })

        let didTimeout = false
        const abortController = new AbortController()
        controllers.add(abortController)
        const timeoutId = setTimeout(
          () => {
            didTimeout = true
            abortController.abort()
          },
          10 * 60 * 1000,
        )

        try {
          const fileContent = fs.readFileSync(filePath, 'utf8')
          const result = await runner.runFileAudit({
            fileContent,
            filePath,
            promptTemplate,
            signal: abortController.signal,
          })

          if (!isActive) {
            return
          }

          if (!result.ok) {
            const errorMessage = didTimeout
              ? 'Session timed out after 10 minutes.'
              : result.error
            const finishedAtMs = Date.now()
            updateSlot(slotIndex, {
              error: errorMessage,
              finishedAtMs,
              status: 'error',
            })
            setLastErrorLine(
              buildSessionOutcomeLine({
                error: errorMessage,
                filePath,
                findingsCount: null,
                finishedAtMs,
                startedAtMs,
                status: 'error',
                taskNumber,
              }),
            )
            finishTask('error')
            continue
          }

          const findingsCount = countAuditFindings(result.output)
          const mergeResult = await mergeAuditResultsIntoReport(
            reportDir,
            result.output,
          )
          if (!mergeResult.ok) {
            const finishedAtMs = Date.now()
            updateSlot(slotIndex, {
              error: mergeResult.messages[0] ?? 'Failed to merge reports.',
              findingsCount,
              finishedAtMs,
              status: 'error',
            })
            setLastErrorLine(
              buildSessionOutcomeLine({
                error: mergeResult.messages[0] ?? 'Failed to merge reports.',
                filePath,
                findingsCount,
                finishedAtMs,
                startedAtMs,
                status: 'error',
                taskNumber,
              }),
            )
            finishTask('error')
            continue
          }

          const finishedAtMs = Date.now()
          updateSlot(slotIndex, {
            findingsCount,
            finishedAtMs,
            status: 'done',
          })
          setLastFinishedLine(
            buildSessionOutcomeLine({
              filePath,
              findingsCount,
              finishedAtMs,
              startedAtMs,
              status: 'done',
              taskNumber,
            }),
          )
          finishTask('done', findingsCount)
        } catch (error) {
          if (!isActive) {
            return
          }
          const message = didTimeout
            ? 'Session timed out after 10 minutes.'
            : error instanceof Error
              ? error.message
              : String(error)
          const finishedAtMs = Date.now()
          updateSlot(slotIndex, {
            error: message,
            finishedAtMs,
            status: 'error',
          })
          setLastErrorLine(
            buildSessionOutcomeLine({
              error: message,
              filePath,
              findingsCount: null,
              finishedAtMs,
              startedAtMs,
              status: 'error',
              taskNumber,
            }),
          )
          finishTask('error')
        } finally {
          clearTimeout(timeoutId)
          controllers.delete(abortController)
        }
      }
    }

    const start = async () => {
      if (queueLines.length === 0) {
        setFatalError('No files found to process.')
        setIsComplete(true)
        exit()
        return
      }

      const workers: Promise<void>[] = []
      for (let i = 0; i < concurrency; i += 1) {
        if (i > 0) {
          await delay(1000)
        }
        workers.push(worker(i))
      }

      await Promise.all(workers)

      if (isActive) {
        setIsComplete(true)
        exit()
      }
    }

    start().catch((error) => {
      if (!isActive) {
        return
      }
      setFatalError(error instanceof Error ? error.message : String(error))
      setIsComplete(true)
      exit()
    })

    return () => {
      isActive = false
      controllers.forEach((controller) => controller.abort())
      controllers.clear()
    }
  }, [
    baseDir,
    checkFilePath,
    concurrency,
    exit,
    model,
    nextTaskNumber,
    promptTemplate,
    queueLines.length,
    reasoningEffort,
    reportDir,
    updateSlot,
    updateStats,
  ])

  const activeCount = sessions.filter(
    (session: SessionView) => session.status === 'running',
  ).length
  const runningSessions = sessions.filter(
    (session: SessionView) => session.status === 'running',
  )
  const remainingCount = Math.max(stats.total - stats.assigned, 0)

  const renderStatusBadge = (status: SessionStatus) => {
    if (status === 'running') {
      return <Spinner label='Running' />
    }
    if (status === 'done') {
      return <Badge color='green'>Done</Badge>
    }
    if (status === 'error') {
      return <Badge color='red'>Error</Badge>
    }
    return <Badge color='gray'>Idle</Badge>
  }

  const reportPath = path.join(reportDir, 'reports.json')

  return (
    <Box flexDirection='column' width='100%'>
      <Box borderColor='magenta' borderStyle='round' paddingX={1}>
        <Box flexDirection='column'>
          <Box flexDirection='row' flexGrow={1} gap={2}>
            <Text>Model: {model}</Text>
            <Text>Reasoning: {reasoningEffort}</Text>
            <Text>Concurrency: {concurrency}</Text>
          </Box>
          <Box flexDirection='row' flexGrow={1} gap={2}>
            <Text>
              Done: {stats.completed}/{stats.total}
            </Text>
            <Text>Running: {activeCount}</Text>
            <Text>Queued: {remainingCount}</Text>
            <Text>Findings: {stats.findings}</Text>
            <Text>Errors: {stats.errors}</Text>
          </Box>
          <Text dimColor>
            Running structured audits. Wait for reports.json.
          </Text>
        </Box>
      </Box>

      {fatalError ? (
        <Box marginTop={1}>
          <StatusMessage variant='error'>{fatalError}</StatusMessage>
        </Box>
      ) : null}

      {isComplete && !fatalError ? (
        <Box marginTop={1}>
          <StatusMessage variant='success'>
            Finished. reports.json written.
          </StatusMessage>
        </Box>
      ) : null}

      <Box
        borderColor='cyan'
        borderStyle='round'
        flexDirection='column'
        marginTop={1}
        paddingX={1}
      >
        <Text bold>
          {runningSessions.length !== 0
            ? 'Running'
            : isComplete
              ? 'Complete'
              : 'Waiting'}
        </Text>
        {runningSessions.length !== 0 ? (
          runningSessions.map((session) => (
            <Box
              key={`running-${session.taskNumber ?? session.filePath}`}
              flexDirection='column'
              marginTop={1}
            >
              <Box>{renderStatusBadge(session.status)}</Box>
              <Text>{buildSessionProgressLine(session, nowMs)}</Text>
            </Box>
          ))
        ) : isComplete ? (
          <Text>Report: {reportPath}</Text>
        ) : (
          <Text dimColor>Preparing the next file...</Text>
        )}
        {lastFinishedLine ? (
          <Text color='green'>{lastFinishedLine}</Text>
        ) : null}
        {lastErrorLine ? <Text color='red'>{lastErrorLine}</Text> : null}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  )
}

const main = async () => {
  const parsed = parseArgs()
  if (parsed['--help']) {
    process.stdout.write(`${usage()}\n`)
    process.exit(0)
  }

  let cliOptions
  try {
    cliOptions = resolveCliOptions({
      '--concurrency': parsed['--concurrency'] ?? null,
      '--model': parsed['--model'] ?? null,
      '--reasoning-effort': parsed['--reasoning-effort'] ?? null,
    })
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message)
      console.error(usage())
      process.exit(1)
    }
    throw error
  }

  ensureReportDir()
  ensureCheckFile()
  const queueLines = loadQueue()
  const promptTemplate = fs.readFileSync(promptPath, 'utf8')

  render(
    <App
      baseDir={baseDir}
      checkFilePath={checkFilePath}
      concurrency={cliOptions.concurrency}
      model={cliOptions.model}
      promptTemplate={promptTemplate}
      queueLines={queueLines}
      reasoningEffort={cliOptions.reasoningEffort}
      reportDir={reportDir}
    />,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
