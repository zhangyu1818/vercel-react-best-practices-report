import { execSync } from 'node:child_process'
/* eslint-disable react-refresh/only-export-components */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

import { Badge, Spinner, StatusMessage } from '@inkjs/ui'
import { createOpencode } from '@opencode-ai/sdk'
import arg from 'arg'
import { Box, render, Text, useApp, useInput, useStdout } from 'ink'

import type {
  ApiError,
  BadRequestError,
  Event,
  MessageAbortedError,
  MessageOutputLengthError,
  Part,
  ProviderAuthError,
  SessionCreateError,
  SessionPromptAsyncError,
  SessionPromptError,
  UnknownError,
} from '@opencode-ai/sdk/client'

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

const usage = (): string => {
  const scriptName = path.basename(
    process.argv[1] || 'vercel-react-best-practices-report',
  )
  return [
    `Usage: ${scriptName} --model <provider/model> [--concurrency <n>]`,
    `       ${scriptName} --merge '<json>'`,
    '',
    'Notes:',
    '  --merge is mutually exclusive with --model/--concurrency.',
  ].join('\n')
}

const parseArgs = () => {
  try {
    return arg(
      {
        '--concurrency': Number,
        '--help': Boolean,
        '--merge': String,
        '--model': String,
        '-c': '--concurrency',
        '-h': '--help',
        '-m': '--model',
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

const parsed = parseArgs()
const mergeValue = parsed['--merge'] ?? null
const modelValue = parsed['--model'] ?? null
const concurrencyValue = parsed['--concurrency'] ?? null
const wantsHelp = parsed['--help'] ?? false

const mergeSchema = {
  type: 'object',
  additionalProperties: {
    type: 'array',
    items: {
      additionalProperties: true,
      required: ['lineNumber', 'lineContent', 'rule', 'suggestion'],
      type: 'object',
      properties: {
        lineContent: { type: 'string' },
        lineNumber: { type: 'string' },
        rule: { type: 'string' },
        suggestion: { type: 'string' },
      },
    },
  },
} as const
const mergeSchemaText = JSON.stringify(mergeSchema, null, 2)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type SessionEventError =
  | ApiError
  | MessageAbortedError
  | MessageOutputLengthError
  | ProviderAuthError
  | UnknownError

const safeJsonStringify = (value: unknown): null | string => {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

const formatUnknownValue = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message
  }
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value)
    case 'symbol':
      return value.description ?? 'Unknown error'
    default:
      break
  }
  const serialized = safeJsonStringify(value)
  return serialized ?? 'Unknown error'
}

const formatBadRequestError = (error: BadRequestError): string => {
  if (error.errors.length !== 0) {
    const details = safeJsonStringify(error.errors)
    if (details) {
      return `Bad request: ${details}`
    }
  }
  if (error.data !== undefined) {
    return `Bad request: ${formatUnknownValue(error.data)}`
  }
  return 'Bad request'
}

const formatRequestError = (
  error: SessionCreateError | SessionPromptAsyncError | SessionPromptError,
): string => {
  if ('errors' in error) {
    return formatBadRequestError(error)
  }
  return error.data.message
}

const formatSessionEventError = (error: SessionEventError): string => {
  switch (error.name) {
    case 'ProviderAuthError':
      return `${error.data.providerID}: ${error.data.message}`
    case 'UnknownError':
      return error.data.message
    case 'MessageAbortedError':
      return error.data.message
    case 'APIError':
      return error.data.statusCode
        ? `${error.data.message} (status ${error.data.statusCode})`
        : error.data.message
    case 'MessageOutputLengthError':
      return 'Message output length exceeded limit.'
    default:
      return 'Session error'
  }
}

const printSchema = () => {
  console.error('Expected JSON schema:')
  console.error(mergeSchemaText)
}

const validateMergeInput = (
  value: unknown,
): value is Record<string, Record<string, string>[]> => {
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
    console.error('Merge JSON failed schema validation.')
    errors.forEach((error) => console.error(error))
    printSchema()
    return false
  }
  return true
}

const parseJsonInput = (input: string): unknown => {
  try {
    return JSON.parse(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Merge JSON is not valid JSON: ${message}`)
    printSchema()
    return null
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' && error !== null && 'code' in error

const lockPath = path.join(reportDir, 'reports.lock')
const lockRetryMs = 50
const lockTimeoutMs = 30000

const acquireMergeLock = async (): Promise<number> => {
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

const releaseMergeLock = (handle: number) => {
  try {
    fs.closeSync(handle)
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(lockPath)
  } catch {
    // ignore
  }
}

const mergeInput = async (input: string): Promise<{ ok: boolean }> => {
  const newResults = parseJsonInput(input)
  if (!newResults) {
    return { ok: false }
  }
  if (!validateMergeInput(newResults)) {
    return { ok: false }
  }

  let lockHandle: null | number = null
  try {
    lockHandle = await acquireMergeLock()
    const outputPath = path.join(reportDir, 'reports.json')
    let existingResults: Record<string, Record<string, string>[]> = {}
    if (fs.existsSync(outputPath)) {
      const contents = fs.readFileSync(outputPath, 'utf8')
      const parsedExisting = parseJsonInput(contents)
      if (!parsedExisting || !validateMergeInput(parsedExisting)) {
        return { ok: false }
      }
      existingResults = parsedExisting
    }

    const mergedResults: Record<string, Record<string, string>[]> = {
      ...existingResults,
    }
    for (const [filePath, entries] of Object.entries(newResults)) {
      if (!Object.prototype.hasOwnProperty.call(mergedResults, filePath)) {
        mergedResults[filePath] = entries
        continue
      }
      mergedResults[filePath] = [...mergedResults[filePath], ...entries]
    }

    fs.mkdirSync(reportDir, { recursive: true })
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(mergedResults, null, 2)}\n`,
      'utf8',
    )
    return { ok: true }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return { ok: false }
  } finally {
    if (lockHandle !== null) {
      releaseMergeLock(lockHandle)
    }
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
  modelID: string
  promptTemplate: string
  providerID: string
  queueLines: string[]
}

type SessionStatus = 'done' | 'error' | 'idle' | 'running'

interface SessionLine {
  id: string
  text: string
}

interface SessionView {
  buffer: string
  error?: string
  filePath?: string
  lines: SessionLine[]
  sessionID?: string
  slot: number
  status: SessionStatus
  taskNumber?: number
}

type SessionPartKind = 'reasoning' | 'text'

interface SessionPartEntry {
  kind: SessionPartKind
  text: string
}

interface SessionPartState {
  order: string[]
  partsById: Map<string, SessionPartEntry>
}

interface Stats {
  assigned: number
  completed: number
  errors: number
  total: number
}

const maxStoredLines = 400
const maxPartEntries = 200
const maxPartTextChars = 60000
const debugMemEnabled = process.env.DEBUG_MEM === '1'
const debugMemEvery = Math.max(
  1,
  Number(process.env.DEBUG_MEM_EVERY ?? 50) || 50,
)

const initSessions = (count: number): SessionView[] =>
  Array.from({ length: count }, (_, index) => ({
    buffer: '',
    lines: [],
    slot: index,
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

const truncateMiddle = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value
  }
  const head = Math.max(1, Math.floor(maxLength / 2) - 2)
  const tail = Math.max(1, Math.floor(maxLength / 2) - 1)
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

const buildPrompt = (
  promptTemplate: string,
  filePath: string,
  fileContent: string,
): string => {
  const header = [
    '## Runtime Notes',
    '- File discovery is already handled; do not run file discovery commands.',
    '- Only CLI allowed in this session is:',
    "  npx -y vercel-react-best-practices-report --merge '<json>'",
    '- Do NOT write JSON to a file first. Pass the JSON string directly to the --merge argument.',
    '- Do not wrap the JSON output in Markdown or code fences.',
    String.raw`- If the JSON contains a single quote character, escape it as \u0027 so the shell command remains valid.`,
    '- Always include the file path key even if there are zero violations (use []).',
    '- Return JSON only, then run the merge command with that JSON.',
  ].join('\n')

  const schema = [
    '## Required Output JSON Schema',
    '{',
    `  \"${filePath}\": [`,
    '    {',
    '      \\\"lineNumber\\\": \\\"12-18\\\",',
    '      \\\"lineContent\\\": \\\"...\\\",',
    '      \\\"rule\\\": \\\"RuleName\\\",',
    '      \\\"suggestion\\\": \\\"...\\\"',
    '    }',
    '  ]',
    '}',
  ].join('\n')

  return [
    promptTemplate.trim(),
    '',
    header,
    '',
    '## Target File',
    filePath,
    '',
    '## File Contents',
    '```tsx',
    fileContent,
    '```',
    '',
    schema,
  ].join('\n')
}

const App = ({
  baseDir,
  checkFilePath,
  concurrency,
  modelID,
  promptTemplate,
  providerID,
  queueLines,
}: AppProps) => {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [stdoutWidth, setStdoutWidth] = useState(stdout.columns)
  const [stdoutHeight, setStdoutHeight] = useState(stdout.rows)
  const [sessions, setSessions] = useState<SessionView[]>(() =>
    initSessions(concurrency),
  )
  const [stats, setStats] = useState<Stats>({
    assigned: 0,
    completed: 0,
    errors: 0,
    total: queueLines.length,
  })
  const [fatalError, setFatalError] = useState<null | string>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [slotOrder, setSlotOrder] = useState<number[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isRightFocused, setIsRightFocused] = useState(false)
  const [scrollOffset, setScrollOffset] = useState(0)

  const queueRef = useRef(createQueue(queueLines, checkFilePath))
  const sessionSlotMap = useRef(new Map<string, number>())
  const sessionCompletion = useRef(new Map<string, () => void>())
  const completedSessions = useRef(new Set<string>())
  const slotOrderSet = useRef(new Set<number>())
  const lineIdRef = useRef(0)
  const taskCounterRef = useRef(0)
  const completedCounterRef = useRef(0)
  const sessionPartsRef = useRef(new Map<string, SessionPartState>())

  const headerHeight = 3
  const footerHeight = 1
  const availableHeight = Math.max(
    10,
    stdoutHeight - headerHeight - footerHeight,
  )
  const leftWidth = 26
  const mainHeight = Math.max(10, availableHeight - 4)
  const logHeight = Math.max(1, mainHeight - 6)

  const updateSlot = useCallback(
    (slotIndex: number, patch: Partial<SessionView>) => {
      setSessions((prev: SessionView[]) => {
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

  const registerSlot = useCallback((slotIndex: number) => {
    if (slotOrderSet.current.has(slotIndex)) {
      return
    }
    slotOrderSet.current.add(slotIndex)
    setSlotOrder((prev) => [...prev, slotIndex])
  }, [])

  const nextLineId = useCallback(() => {
    lineIdRef.current += 1
    return `line-${lineIdRef.current}`
  }, [])

  const nextTaskNumber = useCallback(() => {
    taskCounterRef.current += 1
    return taskCounterRef.current
  }, [])

  const getSessionParts = useCallback((sessionID: string): SessionPartState => {
    const existing = sessionPartsRef.current.get(sessionID)
    if (existing) {
      return existing
    }
    const created: SessionPartState = { order: [], partsById: new Map() }
    sessionPartsRef.current.set(sessionID, created)
    return created
  }, [])

  const trimEntryText = useCallback(
    (entry: SessionPartEntry): SessionPartEntry => {
      if (entry.kind !== 'text' && entry.kind !== 'reasoning') {
        return entry
      }
      if (entry.text.length <= maxPartTextChars) {
        return entry
      }
      return { ...entry, text: entry.text.slice(-maxPartTextChars) }
    },
    [],
  )

  const pruneSessionParts = useCallback((state: SessionPartState) => {
    if (state.order.length <= maxPartEntries) {
      return
    }
    const overflow = state.order.length - maxPartEntries
    const removed = state.order.splice(0, overflow)
    for (const partID of removed) {
      state.partsById.delete(partID)
    }
  }, [])

  const buildCombinedText = useCallback((state: SessionPartState): string => {
    return state.order
      .map((partID) => state.partsById.get(partID)?.text ?? '')
      .filter(Boolean)
      .join('\n')
  }, [])

  const partToEntry = useCallback((part: Part): null | SessionPartEntry => {
    if (part.type === 'text') {
      return { kind: 'text', text: part.text }
    }
    if (part.type === 'reasoning') {
      return { kind: 'reasoning', text: part.text }
    }
    return null
  }, [])

  const setFullText = useCallback(
    (sessionID: string, text: string) => {
      const slotIndex = sessionSlotMap.current.get(sessionID)
      if (slotIndex === undefined) {
        return
      }
      const parts = text.split('\n')
      const buffer = parts.pop() ?? ''
      const lines = parts.slice(-maxStoredLines).map((line) => ({
        id: nextLineId(),
        text: line,
      }))
      updateSlot(slotIndex, { buffer, lines })
    },
    [nextLineId, updateSlot],
  )

  const upsertSessionPart = useCallback(
    (
      sessionID: string,
      partID: string,
      entry: SessionPartEntry,
      append: boolean,
    ) => {
      const state = getSessionParts(sessionID)
      if (!state.partsById.has(partID)) {
        state.order.push(partID)
      }
      const existing = state.partsById.get(partID)
      const nextText =
        append && existing ? `${existing.text}${entry.text}` : entry.text
      const nextEntry = trimEntryText({ kind: entry.kind, text: nextText })
      state.partsById.set(partID, nextEntry)
      pruneSessionParts(state)
      const combined = buildCombinedText(state)
      setFullText(sessionID, combined)
    },
    [
      buildCombinedText,
      getSessionParts,
      pruneSessionParts,
      setFullText,
      trimEntryText,
    ],
  )

  const removeSessionPart = useCallback(
    (sessionID: string, partID: string) => {
      const state = sessionPartsRef.current.get(sessionID)
      if (!state) {
        return
      }
      state.partsById.delete(partID)
      state.order = state.order.filter((id) => id !== partID)
      const combined = buildCombinedText(state)
      setFullText(sessionID, combined)
    },
    [buildCombinedText, setFullText],
  )

  const completeSession = useCallback(
    (sessionID: string | undefined, status: SessionStatus, error?: string) => {
      if (!sessionID) {
        return
      }
      if (!sessionSlotMap.current.has(sessionID)) {
        return
      }
      if (completedSessions.current.has(sessionID)) {
        return
      }
      completedSessions.current.add(sessionID)
      sessionPartsRef.current.delete(sessionID)
      const slotIndex = sessionSlotMap.current.get(sessionID)
      sessionSlotMap.current.delete(sessionID)
      if (slotIndex !== undefined) {
        updateSlot(slotIndex, { error, status })
      }
      const resolver = sessionCompletion.current.get(sessionID)
      if (resolver) {
        sessionCompletion.current.delete(sessionID)
        resolver()
      }
      updateStats((prev: Stats) => ({
        ...prev,
        completed: prev.completed + 1,
        errors: status === 'error' ? prev.errors + 1 : prev.errors,
      }))
      completedSessions.current.delete(sessionID)
    },
    [updateSlot, updateStats],
  )

  const onResize = useEffectEvent(() => {
    setStdoutWidth(stdout.columns)
    setStdoutHeight(stdout.rows)
  })

  const onEvent = useEffectEvent((event: Event) => {
    if (event.type === 'message.part.updated') {
      const part = event.properties?.part
      if (!part || !sessionSlotMap.current.has(part.sessionID)) {
        return
      }
      const entry = partToEntry(part)
      if (!entry) {
        return
      }
      const isTextual = entry.kind === 'text' || entry.kind === 'reasoning'
      if (isTextual && typeof event.properties?.delta === 'string') {
        upsertSessionPart(
          part.sessionID,
          part.id,
          { ...entry, text: event.properties.delta },
          true,
        )
        return
      }
      upsertSessionPart(part.sessionID, part.id, entry, false)
      return
    }

    if (event.type === 'message.part.removed') {
      const sessionID = event.properties?.sessionID
      if (!sessionID || !sessionSlotMap.current.has(sessionID)) {
        return
      }
      removeSessionPart(sessionID, event.properties.partID)
      return
    }

    if (event.type === 'session.status') {
      if (event.properties.status.type === 'idle') {
        completeSession(event.properties.sessionID, 'done')
      }
      return
    }

    if (event.type === 'session.idle') {
      completeSession(event.properties?.sessionID, 'done')
      return
    }

    if (event.type === 'session.error') {
      const sessionID = event.properties?.sessionID
      if (sessionID) {
        if (!sessionSlotMap.current.has(sessionID)) {
          return
        }
        const sessionError = event.properties?.error
        const message = sessionError
          ? formatSessionEventError(sessionError)
          : 'Session error'
        completeSession(sessionID, 'error', message)
      }
    }
  })

  useEffect(() => {
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  const listSlots = slotOrder.length !== 0 ? slotOrder : []
  const selectedSlotIndex = listSlots[selectedIndex] ?? listSlots[0] ?? 0
  const selectedSession = sessions[selectedSlotIndex] ?? sessions[0]
  const selectedLines = selectedSession?.lines ?? []
  const bufferLine = selectedSession?.buffer
    ? {
        id: selectedSession.sessionID
          ? `buffer-${selectedSession.sessionID}`
          : `buffer-slot-${selectedSession?.slot ?? 0}`,
        text: selectedSession.buffer,
      }
    : null
  const combinedLines = bufferLine
    ? [...selectedLines, bufferLine]
    : [...selectedLines]
  const maxScrollOffset = Math.max(0, combinedLines.length - logHeight)

  useInput((_input, key) => {
    if (key.tab) {
      setIsRightFocused((prev) => !prev)
      return
    }
    if (isRightFocused) {
      if (key.upArrow) {
        setScrollOffset((prev) => Math.min(prev + 1, maxScrollOffset))
      }
      if (key.downArrow) {
        setScrollOffset((prev) => Math.max(prev - 1, 0))
      }
      return
    }
    if (listSlots.length === 0) {
      return
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(prev + 1, listSlots.length - 1))
    }
  })

  useEffect(() => {
    if (listSlots.length === 0) {
      return
    }
    setSelectedIndex((prev) => Math.min(prev, listSlots.length - 1))
  }, [listSlots.length])

  useEffect(() => {
    const maxScrollOffset = Math.max(0, combinedLines.length - logHeight)
    if (!isRightFocused) {
      setScrollOffset(0)
      return
    }
    setScrollOffset((prev) => Math.min(prev, maxScrollOffset))
  }, [combinedLines.length, isRightFocused, logHeight])

  useEffect(() => {
    let isActive = true
    let server: null | { close: () => void } = null
    const abortController = new AbortController()

    const start = async () => {
      if (queueLines.length === 0) {
        setFatalError('No files found to process.')
        setIsComplete(true)
        exit()
        return
      }

      const opencode = await createOpencode()
      const client = opencode.client
      server = opencode.server

      const events = await client.event.subscribe({
        query: { directory: baseDir },
        signal: abortController.signal,
      })

      void (async () => {
        try {
          for await (const event of events.stream) {
            if (!isActive) {
              break
            }
            onEvent(event)
          }
        } catch (error) {
          if (!isActive) {
            return
          }
          setFatalError(
            error instanceof Error ? error.message : 'Event stream error.',
          )
          setIsComplete(true)
          exit()
        }
      })()

      const worker = async (slotIndex: number) => {
        for (;;) {
          const filePath = queueRef.current.popNext()
          if (!filePath) {
            return
          }
          const taskNumber = nextTaskNumber()
          updateStats((prev) => ({ ...prev, assigned: prev.assigned + 1 }))
          updateSlot(slotIndex, {
            buffer: '',
            error: undefined,
            filePath,
            lines: [],
            sessionID: undefined,
            status: 'running',
            taskNumber,
          })

          const sessionResult = await client.session.create({
            body: { title: `best-practices:${path.basename(filePath)}` },
            query: { directory: baseDir },
          })

          if ('error' in sessionResult && sessionResult.error) {
            updateSlot(slotIndex, {
              error: formatRequestError(sessionResult.error),
              status: 'error',
            })
            updateStats((prev) => ({
              ...prev,
              completed: prev.completed + 1,
              errors: prev.errors + 1,
            }))
            continue
          }

          if (!sessionResult.data) {
            updateSlot(slotIndex, {
              error: 'Failed to create session.',
              status: 'error',
            })
            updateStats((prev) => ({
              ...prev,
              completed: prev.completed + 1,
              errors: prev.errors + 1,
            }))
            continue
          }

          const sessionID = sessionResult.data.id
          sessionSlotMap.current.set(sessionID, slotIndex)
          updateSlot(slotIndex, { sessionID })

          const timeoutId = setTimeout(
            () => {
              completeSession(
                sessionID,
                'error',
                'Session timed out after 10 minutes.',
              )
            },
            10 * 60 * 1000,
          )

          const donePromise = new Promise<void>((resolve) => {
            sessionCompletion.current.set(sessionID, () => {
              clearTimeout(timeoutId)
              resolve()
            })
          })

          const fileContent = fs.readFileSync(filePath, 'utf8')
          const prompt = buildPrompt(promptTemplate, filePath, fileContent)

          const promptResult = await client.session.promptAsync({
            path: { id: sessionID },
            query: { directory: baseDir },
            body: {
              model: { modelID, providerID },
              parts: [{ text: prompt, type: 'text' }],
            },
          })

          if ('error' in promptResult && promptResult.error) {
            completeSession(
              sessionID,
              'error',
              formatRequestError(promptResult.error),
            )
            continue
          }

          await donePromise

          if (debugMemEnabled) {
            completedCounterRef.current += 1
            if (completedCounterRef.current % debugMemEvery === 0) {
              let activeParts = 0
              let activePartChars = 0
              for (const state of sessionPartsRef.current.values()) {
                activeParts += state.partsById.size
                for (const entry of state.partsById.values()) {
                  activePartChars += entry.text.length
                }
              }
              const { heapUsed, rss } = process.memoryUsage()
              const logLine = `[debug] completed=${completedCounterRef.current} total=${queueLines.length} heapMB=${Math.round(
                heapUsed / 1024 / 1024,
              )} rssMB=${Math.round(rss / 1024 / 1024)} activeSessions=${sessionSlotMap.current.size} pendingResolvers=${sessionCompletion.current.size} activeParts=${activeParts} partsCharsMB=${Math.round(
                activePartChars / 1024 / 1024,
              )}`
              console.error(logLine)
              fs.appendFileSync(
                path.join(reportDir, 'debug.txt'),
                `${new Date().toISOString()} ${logLine}\n`,
                'utf8',
              )
            }
          }
        }
      }

      const workers: Promise<void>[] = []
      for (let i = 0; i < concurrency; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        registerSlot(i)
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
      abortController.abort()
      if (server) {
        server.close()
      }
    }
  }, [
    baseDir,
    checkFilePath,
    completeSession,
    concurrency,
    exit,
    modelID,
    nextTaskNumber,
    providerID,
    promptTemplate,
    queueLines.length,
    registerSlot,
    updateSlot,
    updateStats,
  ])

  const activeCount = sessions.filter(
    (session: SessionView) => session.status === 'running',
  ).length
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

  const renderListItem = (slotIndex: number, listIndex: number) => {
    const session = sessions[slotIndex]
    const isSelected = listIndex === selectedIndex
    const prefix = isSelected ? '›' : ' '
    const name = session?.taskNumber ? `Task ${session.taskNumber}` : 'Idle'
    return (
      <Box key={`slot-${slotIndex}`} flexDirection='row'>
        <Text color={isSelected ? 'cyan' : undefined}>
          {prefix} {name}
        </Text>
      </Box>
    )
  }

  const clampedScrollOffset = Math.min(scrollOffset, maxScrollOffset)
  const startIndex = Math.max(
    0,
    combinedLines.length - logHeight - clampedScrollOffset,
  )
  const endIndex = Math.max(0, combinedLines.length - clampedScrollOffset)
  const visibleLines = combinedLines.slice(startIndex, endIndex)

  const detailHeader = selectedSession?.filePath
    ? truncateMiddle(
        `.../${path.basename(selectedSession.filePath)}`,
        Math.max(24, stdoutWidth - leftWidth - 8),
      )
    : 'No session selected'
  const detailBorderColor =
    selectedSession?.status === 'error'
      ? 'red'
      : isRightFocused
        ? 'green'
        : 'cyan'

  return (
    <Box flexDirection='column' height={stdoutHeight} width='100%'>
      <Box borderColor='magenta' borderStyle='round' paddingX={1}>
        <Box flexDirection='column'>
          <Box flexDirection='row' flexGrow={1} gap={2}>
            <Text>
              Model: {providerID}/{modelID}
            </Text>
            <Text>
              Progress: {stats.completed}/{stats.total}
            </Text>
            <Text>Running: {activeCount}</Text>
            <Text>Remaining: {remainingCount}</Text>
            <Text>Errors: {stats.errors}</Text>
          </Box>
          <Text dimColor>
            Tab: {isRightFocused ? 'Focus list' : 'Focus log'} | ↑/↓:{' '}
            {isRightFocused ? 'Scroll' : 'Select'}
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
            All sessions completed.
          </StatusMessage>
        </Box>
      ) : null}

      <Box flexDirection='row' flexGrow={1} marginTop={1}>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          flexShrink={0}
          paddingX={1}
          width={leftWidth}
        >
          <Text bold>Sessions</Text>
          <Text dimColor>
            Tab: {isRightFocused ? 'Focus list' : 'Focus log'}
          </Text>
          <Box flexDirection='column' marginTop={1}>
            {listSlots.length !== 0 ? (
              listSlots.map((slotIndex, listIndex) =>
                renderListItem(slotIndex, listIndex),
              )
            ) : (
              <Text dimColor>Starting workers...</Text>
            )}
          </Box>
        </Box>

        <Box
          borderColor={detailBorderColor}
          borderStyle='round'
          flexDirection='column'
          flexGrow={1}
          paddingX={1}
        >
          <Box justifyContent='space-between'>
            <Text bold>{detailHeader}</Text>
            {selectedSession ? renderStatusBadge(selectedSession.status) : null}
          </Box>
          {selectedSession?.error ? (
            <Text color='red'>
              {truncateMiddle(
                selectedSession.error,
                stdoutWidth - leftWidth - 6,
              )}
            </Text>
          ) : null}
          <Box
            flexDirection='column'
            height={logHeight}
            justifyContent='flex-end'
          >
            {visibleLines.map((line) => (
              <Text key={line.id} dimColor>
                {line.text}
              </Text>
            ))}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  )
}

const main = async () => {
  if (wantsHelp) {
    process.stdout.write(`${usage()}\n`)
    process.exit(0)
  }

  if (mergeValue) {
    if (modelValue || concurrencyValue) {
      console.error('--merge cannot be used with --model or --concurrency.')
      process.exit(1)
    }
    const result = await mergeInput(mergeValue)
    if (!result.ok) {
      process.exit(1)
    }
    process.exit(0)
  }

  if (!modelValue) {
    console.error('--model is required when not using --merge.')
    process.exit(1)
  }

  const concurrency =
    typeof concurrencyValue === 'number' && Number.isFinite(concurrencyValue)
      ? concurrencyValue
      : 10
  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    console.error('--concurrency must be a positive integer.')
    process.exit(1)
  }

  const [providerID, modelID] = modelValue.split('/')
  if (!providerID || !modelID) {
    console.error('--model must be in the format providerID/modelID.')
    process.exit(1)
  }

  ensureReportDir()
  ensureCheckFile()

  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found at ${promptPath}`)
  }

  const queueLines = loadQueue()
  const promptTemplate = fs.readFileSync(promptPath, 'utf8')

  const instance = render(
    <App
      baseDir={baseDir}
      checkFilePath={checkFilePath}
      concurrency={concurrency}
      modelID={modelID}
      promptTemplate={promptTemplate}
      providerID={providerID}
      queueLines={queueLines}
    />,
    { exitOnCtrlC: true },
  )

  await instance.waitUntilExit()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
