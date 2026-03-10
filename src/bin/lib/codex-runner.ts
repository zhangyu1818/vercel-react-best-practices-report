import {
  Codex,
  type ModelReasoningEffort,
  type ThreadEvent,
  type Usage,
} from '@openai/codex-sdk'

import { buildPrompt } from './prompt.js'
import {
  codexAuditOutputSchema,
  codexAuditOutputToAuditResult,
  parseJsonValue,
  validateCodexAuditOutput,
  type AuditResult,
} from './report-schema.js'

export type CodexSessionState = 'done' | 'error' | 'idle' | 'running'

export type CodexRunOutcome =
  | {
      error: string
      ok: false
      threadID: null | string
      usage: null | Usage
    }
  | {
      ok: true
      output: AuditResult
      threadID: null | string
      usage: null | Usage
    }

interface RunFileAuditOptions {
  fileContent: string
  filePath: string
  promptTemplate: string
  signal?: AbortSignal
}

interface CreateCodexRunnerOptions {
  codex?: Codex
  model: string
  reasoningEffort?: string
  workingDirectory: string
}

export const collectRunOutcome = (
  events: ThreadEvent[],
  filePath: string,
): CodexRunOutcome => {
  let finalResponse: null | string = null
  let threadID: null | string = null
  let usage: null | Usage = null

  for (const event of events) {
    if (event.type === 'thread.started') {
      threadID = event.thread_id
      continue
    }
    if (
      event.type === 'item.completed' &&
      event.item.type === 'agent_message'
    ) {
      finalResponse = event.item.text
      continue
    }
    if (event.type === 'turn.completed') {
      usage = event.usage
      continue
    }
    if (event.type === 'turn.failed') {
      return {
        error: event.error.message,
        ok: false,
        threadID,
        usage,
      }
    }
    if (event.type === 'error') {
      return {
        error: event.message,
        ok: false,
        threadID,
        usage,
      }
    }
  }

  if (finalResponse === null) {
    return {
      error: 'Codex did not return structured output.',
      ok: false,
      threadID,
      usage,
    }
  }

  const parsed = parseJsonValue(finalResponse, 'Structured output')
  if (!parsed.ok) {
    return {
      error: parsed.error,
      ok: false,
      threadID,
      usage,
    }
  }

  const validation = validateCodexAuditOutput(parsed.value)
  if (!validation.ok) {
    return {
      error: validation.errors.join('\n'),
      ok: false,
      threadID,
      usage,
    }
  }

  return {
    ok: true,
    output: codexAuditOutputToAuditResult(filePath, validation.value),
    threadID,
    usage,
  }
}

export const createCodexRunner = ({
  codex = new Codex(),
  model,
  reasoningEffort = 'high',
  workingDirectory,
}: CreateCodexRunnerOptions) => {
  return {
    async runFileAudit({
      fileContent,
      filePath,
      promptTemplate,
      signal,
    }: RunFileAuditOptions): Promise<CodexRunOutcome> {
      try {
        const thread = codex.startThread({
          approvalPolicy: 'never',
          model,
          modelReasoningEffort: reasoningEffort as ModelReasoningEffort,
          sandboxMode: 'read-only',
          webSearchMode: 'disabled',
          workingDirectory,
        })
        const prompt = buildPrompt(promptTemplate, filePath, fileContent)
        const { events } = await thread.runStreamed(prompt, {
          outputSchema: codexAuditOutputSchema,
          signal,
        })

        const collected: ThreadEvent[] = []
        for await (const event of events) {
          collected.push(event)
        }

        return collectRunOutcome(collected, filePath)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          error: message,
          ok: false,
          threadID: null,
          usage: null,
        }
      }
    },
  }
}
