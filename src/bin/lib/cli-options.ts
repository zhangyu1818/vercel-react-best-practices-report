import path from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

import type { ClaudeEffort } from './providers/claude-adapter.js'

export interface ParsedCliArgs {
  '--adapter': null | string
  '--concurrency': null | number
  '--effort': null | string
  '--model': null | string
  '--reasoning-effort': null | string
}

export interface ResolvedClaudeCliOptions {
  adapter: 'claude'
  concurrency: number
  effort: ClaudeEffort
  model: string
}

export interface ResolvedCodexCliOptions {
  adapter: 'codex'
  concurrency: number
  model: string
  reasoningEffort: ModelReasoningEffort
}

export type ResolvedCliOptions =
  | ResolvedClaudeCliOptions
  | ResolvedCodexCliOptions

export class CliUsageError extends Error {}

const defaultConcurrency = 1
const defaultClaudeEffort: ClaudeEffort = 'high'
const defaultReasoningEffort: ModelReasoningEffort = 'high'

export const usage = (scriptPath = process.argv[1]): string => {
  const scriptName = path.basename(
    scriptPath || 'vercel-react-best-practices-report',
  )

  return [
    `Usage: ${scriptName} --adapter <codex|claude> --model <model-id> [--concurrency <n>] [provider options]`,
    '',
    'Provider options:',
    '  Codex:  --reasoning-effort <minimal|low|medium|high|xhigh>',
    '  Claude: --effort <low|medium|high|max>',
    '',
    'Notes:',
    '  --adapter and --model are required.',
    '  --concurrency defaults to 1 and should be increased cautiously.',
  ].join('\n')
}

const parseAdapter = (value: null | string): 'claude' | 'codex' => {
  const adapter = value?.trim() ?? ''
  if (adapter.length === 0) {
    throw new CliUsageError('--adapter is required.')
  }
  if (adapter !== 'claude' && adapter !== 'codex') {
    throw new CliUsageError('--adapter must be one of: codex, claude.')
  }
  return adapter
}

const parseModel = (value: null | string): string => {
  const model = value?.trim() ?? ''
  if (model.length === 0) {
    throw new CliUsageError('--model is required.')
  }
  return model
}

const parseConcurrency = (value: null | number): number => {
  const concurrency = value ?? defaultConcurrency
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new CliUsageError('--concurrency must be a positive integer.')
  }
  return concurrency
}

export const resolveCliOptions = ({
  '--adapter': adapterValue,
  '--concurrency': concurrencyValue,
  '--effort': effortValue,
  '--model': modelValue,
  '--reasoning-effort': reasoningEffortValue,
}: ParsedCliArgs): ResolvedCliOptions => {
  const adapter = parseAdapter(adapterValue)
  const model = parseModel(modelValue)
  const concurrency = parseConcurrency(concurrencyValue)
  const effort = effortValue?.trim() ?? ''
  const reasoningEffort = reasoningEffortValue?.trim() ?? ''

  if (adapter === 'codex') {
    if (effort !== '') {
      throw new CliUsageError(
        '--effort is only supported for --adapter claude.',
      )
    }

    return {
      adapter,
      concurrency,
      model,
      reasoningEffort:
        reasoningEffort === ''
          ? defaultReasoningEffort
          : (reasoningEffort as ModelReasoningEffort),
    }
  }

  if (reasoningEffort !== '') {
    throw new CliUsageError(
      '--reasoning-effort is only supported for --adapter codex.',
    )
  }

  return {
    adapter,
    concurrency,
    effort: effort === '' ? defaultClaudeEffort : (effort as ClaudeEffort),
    model,
  }
}
