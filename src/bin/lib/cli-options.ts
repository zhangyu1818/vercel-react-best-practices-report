import path from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export interface ParsedCliArgs {
  '--concurrency': null | number
  '--model': null | string
  '--reasoning-effort': null | string
}

export interface ResolvedCliOptions {
  concurrency: number
  model: string
  reasoningEffort: ModelReasoningEffort
}

export class CliUsageError extends Error {}

const defaultConcurrency = 1
const defaultReasoningEffort: ModelReasoningEffort = 'high'

export const usage = (scriptPath = process.argv[1]): string => {
  const scriptName = path.basename(
    scriptPath || 'vercel-react-best-practices-report',
  )
  return [
    `Usage: ${scriptName} --model <model-id> [--reasoning-effort <level>] [--concurrency <n>]`,
    '',
    'Notes:',
    '  --model must be a Codex-supported model id such as gpt-5.3-codex or gpt-5.4.',
    '  --reasoning-effort defaults to high and is passed through to Codex model_reasoning_effort.',
    '  Common values are minimal, low, medium, high, and xhigh.',
    '  --concurrency defaults to 1 and should be increased cautiously.',
  ].join('\n')
}

export const resolveCliOptions = ({
  '--concurrency': concurrencyValue,
  '--model': modelValue,
  '--reasoning-effort': reasoningEffortValue,
}: ParsedCliArgs): ResolvedCliOptions => {
  const model = modelValue?.trim() ?? ''
  if (model.length === 0) {
    throw new CliUsageError('--model is required.')
  }
  if (model.includes('/')) {
    throw new CliUsageError(
      '--model must be a Codex-supported model id like "gpt-5.3-codex" or "gpt-5.4", not provider/model.',
    )
  }

  const concurrency = concurrencyValue ?? defaultConcurrency
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new CliUsageError('--concurrency must be a positive integer.')
  }

  const normalizedReasoningEffort = reasoningEffortValue?.trim() ?? ''
  const reasoningEffort =
    normalizedReasoningEffort === ''
      ? defaultReasoningEffort
      : normalizedReasoningEffort

  return {
    concurrency,
    model,
    reasoningEffort: reasoningEffort as ModelReasoningEffort,
  }
}
