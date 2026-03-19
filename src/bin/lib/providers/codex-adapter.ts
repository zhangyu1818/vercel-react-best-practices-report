import {
  Codex,
  type ModelReasoningEffort,
  type ThreadEvent,
  type Usage,
} from '@openai/codex-sdk'

import { buildPrompt } from '../prompt.js'
import {
  auditOutputSchema,
  auditOutputToAuditResult,
  parseJsonValue,
  validateAuditOutput,
} from '../report-schema.js'

import type {
  AuditAdapter,
  AuditRunOutcome,
  RunFileAuditOptions,
} from './types.js'

interface CreateCodexAdapterOptions {
  adapter: 'codex'
  codex?: Codex
  model: string
  reasoningEffort?: string
  workingDirectory?: string
}

export const collectCodexRunOutcome = (
  events: ThreadEvent[],
  filePath: string,
): AuditRunOutcome => {
  let finalResponse: null | string = null
  let sessionID: null | string = null
  let usage: null | Usage = null

  for (const event of events) {
    if (event.type === 'thread.started') {
      sessionID = event.thread_id
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
        sessionID,
        usage,
      }
    }
    if (event.type === 'error') {
      return {
        error: event.message,
        ok: false,
        sessionID,
        usage,
      }
    }
  }

  if (finalResponse === null) {
    return {
      error: 'Codex did not return structured output.',
      ok: false,
      sessionID,
      usage,
    }
  }

  const parsed = parseJsonValue(finalResponse, 'Structured output')
  if (!parsed.ok) {
    return {
      error: parsed.error,
      ok: false,
      sessionID,
      usage,
    }
  }

  const validation = validateAuditOutput(parsed.value)
  if (!validation.ok) {
    return {
      error: validation.errors.join('\n'),
      ok: false,
      sessionID,
      usage,
    }
  }

  return {
    ok: true,
    output: auditOutputToAuditResult(filePath, validation.value),
    sessionID,
    usage,
  }
}

export const createCodexAdapter = ({
  codex = new Codex(),
  model,
  reasoningEffort = 'high',
  workingDirectory = process.cwd(),
}: CreateCodexAdapterOptions): AuditAdapter => ({
  async runFileAudit({
    fileContent,
    filePath,
    promptTemplate,
    signal,
  }: RunFileAuditOptions): Promise<AuditRunOutcome> {
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
        outputSchema: auditOutputSchema,
        signal,
      })

      const collected: ThreadEvent[] = []
      for await (const event of events) {
        collected.push(event)
      }

      return collectCodexRunOutcome(collected, filePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        error: message,
        ok: false,
        sessionID: null,
        usage: null,
      }
    }
  },
})
