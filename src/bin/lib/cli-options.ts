import path from 'node:path'

import arg from 'arg'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

import type { ClaudeEffort } from './providers/claude-adapter.js'

export interface ParsedCliArgs {
  '--adapter': null | string
  '--concurrency': null | number
  '--directory': null | string
  '--effort': null | string
  '--model': null | string
  '--reasoning-effort': null | string
}

export interface ParsedCliOptions extends ParsedCliArgs {
  '--help': boolean
}

interface ResolvedCliOptionsBase {
  concurrency: number
  directory: string
}

export interface ResolvedClaudeCliOptions {
  adapter: 'claude'
  effort: ClaudeEffort
  model: string
}

export interface ResolvedCodexCliOptions {
  adapter: 'codex'
  model: string
  reasoningEffort: ModelReasoningEffort
}

export type ResolvedCliOptions =
  | (ResolvedClaudeCliOptions & ResolvedCliOptionsBase)
  | (ResolvedCliOptionsBase & ResolvedCodexCliOptions)

export class CliUsageError extends Error {}

const defaultConcurrency = 1
const claudeEfforts = ['low', 'medium', 'high', 'max'] as const
const defaultClaudeEffort: ClaudeEffort = 'high'
const defaultReasoningEffort: ModelReasoningEffort = 'high'

export const parseCliArgs = (
  argv: string[] = process.argv.slice(2),
): ParsedCliOptions =>
  arg(
    {
      '--adapter': String,
      '--concurrency': Number,
      '--dir': '--directory',
      '--directory': String,
      '--effort': String,
      '--help': Boolean,
      '--model': String,
      '--reasoning-effort': String,
      '-a': '--adapter',
      '-c': '--concurrency',
      '-d': '--directory',
      '-e': '--effort',
      '-h': '--help',
      '-m': '--model',
      '-r': '--reasoning-effort',
    },
    { argv },
  ) as ParsedCliOptions

export const usage = (scriptPath = process.argv[1]): string => {
  const scriptName = path.basename(
    scriptPath || 'vercel-react-best-practices-report',
  )

  return [
    `Usage: ${scriptName} --adapter <codex|claude> --model <model-id> [--directory <path>] [--concurrency <n>] [provider options]`,
    '',
    'General options:',
    '  --directory, --dir, -d <path>  Relative path under the current working directory to audit. Defaults to .',
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

const parseDirectory = (
  value: null | string,
  launchDirectory: string,
): string => {
  const directory = value?.trim() ?? ''
  if (directory === '') {
    return launchDirectory
  }
  if (path.isAbsolute(directory)) {
    throw new CliUsageError(
      '--directory must be a relative path within the current working directory.',
    )
  }

  const resolvedDirectory = path.resolve(launchDirectory, directory)
  const relativeDirectory = path.relative(launchDirectory, resolvedDirectory)
  if (
    relativeDirectory.startsWith('..') ||
    path.isAbsolute(relativeDirectory)
  ) {
    throw new CliUsageError(
      '--directory must be a relative path within the current working directory.',
    )
  }

  return resolvedDirectory
}

const parseClaudeEffort = (value: string): ClaudeEffort => {
  if (value === '') {
    return defaultClaudeEffort
  }
  if (!claudeEfforts.includes(value as ClaudeEffort)) {
    throw new CliUsageError('--effort must be one of: low, medium, high, max.')
  }
  return value as ClaudeEffort
}

export const resolveCliOptions = (
  {
    '--adapter': adapterValue,
    '--concurrency': concurrencyValue,
    '--directory': directoryValue,
    '--effort': effortValue,
    '--model': modelValue,
    '--reasoning-effort': reasoningEffortValue,
  }: ParsedCliArgs,
  launchDirectory = process.cwd(),
): ResolvedCliOptions => {
  const adapter = parseAdapter(adapterValue)
  const model = parseModel(modelValue)
  const concurrency = parseConcurrency(concurrencyValue)
  const directory = parseDirectory(directoryValue, launchDirectory)
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
      directory,
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
    directory,
    effort: parseClaudeEffort(effort),
    model,
  }
}
