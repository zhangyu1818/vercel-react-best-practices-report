import {
  query as sdkQuery,
  type Options as ClaudeOptions,
  type Query as ClaudeQueryHandle,
  type SDKResultError,
  type SDKResultSuccess,
} from '@anthropic-ai/claude-agent-sdk'

import { buildPrompt } from '../prompt.js'
import {
  auditOutputSchema,
  auditOutputToAuditResult,
  validateAuditOutput,
} from '../report-schema.js'

import type {
  AuditAdapter,
  AuditRunOutcome,
  RunFileAuditOptions,
} from './types.js'

export type ClaudeEffort = 'high' | 'low' | 'max' | 'medium'

type ClaudeResultMessage =
  | Pick<SDKResultError, 'errors' | 'session_id' | 'subtype' | 'type' | 'usage'>
  | Pick<
      SDKResultSuccess,
      | 'result'
      | 'session_id'
      | 'structured_output'
      | 'subtype'
      | 'type'
      | 'usage'
    >

export type ClaudeQueryMessage = ClaudeResultMessage | { type: string }

type ClaudeQuery = (params: {
  options?: ClaudeOptions
  prompt: string
}) => AsyncIterable<ClaudeQueryMessage> &
  Partial<Pick<ClaudeQueryHandle, 'close'>>

interface CreateClaudeAdapterOptions {
  effort?: ClaudeEffort
  model: string
  query?: ClaudeQuery
  workingDirectory?: string
}

const abortErrorMessage = 'Claude query was aborted.'

export const createClaudeAdapter = ({
  effort = 'high',
  model,
  query = sdkQuery as ClaudeQuery,
  workingDirectory = process.cwd(),
}: CreateClaudeAdapterOptions): AuditAdapter => ({
  async runFileAudit({
    fileContent,
    filePath,
    promptTemplate,
    signal,
  }: RunFileAuditOptions): Promise<AuditRunOutcome> {
    const abortController = new AbortController()
    const prompt = buildPrompt(promptTemplate, filePath, fileContent)
    const queryHandle = query({
      prompt,
      options: {
        abortController,
        allowedTools: ['Skill', 'Read'],
        cwd: workingDirectory,
        effort,
        model,
        permissionMode: 'dontAsk',
        settingSources: ['user', 'project'],
        tools: ['Skill', 'Read'],
        outputFormat: {
          schema: auditOutputSchema,
          type: 'json_schema',
        },
        systemPrompt: {
          preset: 'claude_code',
          type: 'preset',
        },
      },
    })

    const handleAbort = () => {
      abortController.abort()
      queryHandle.close?.()
    }

    if (signal?.aborted) {
      handleAbort()
      return {
        error: abortErrorMessage,
        ok: false,
        sessionID: null,
        usage: null,
      }
    }

    signal?.addEventListener('abort', handleAbort, { once: true })

    try {
      let resultMessage: ClaudeResultMessage | null = null

      for await (const message of queryHandle) {
        if (signal?.aborted) {
          return {
            error: abortErrorMessage,
            ok: false,
            sessionID: null,
            usage: null,
          }
        }
        if (message.type === 'result') {
          resultMessage = message as ClaudeResultMessage
        }
      }

      if (resultMessage === null) {
        return {
          error: 'Claude did not return a result.',
          ok: false,
          sessionID: null,
          usage: null,
        }
      }

      if (resultMessage.subtype !== 'success') {
        return {
          error: `Claude returned an unsuccessful result: ${resultMessage.subtype}`,
          ok: false,
          sessionID: resultMessage.session_id,
          usage: resultMessage.usage ?? null,
        }
      }

      if (resultMessage.structured_output === undefined) {
        return {
          error: 'Claude did not return structured output.',
          ok: false,
          sessionID: resultMessage.session_id,
          usage: resultMessage.usage ?? null,
        }
      }

      const validation = validateAuditOutput(resultMessage.structured_output)
      if (!validation.ok) {
        return {
          error: validation.errors.join('\n'),
          ok: false,
          sessionID: resultMessage.session_id,
          usage: resultMessage.usage ?? null,
        }
      }

      return {
        ok: true,
        output: auditOutputToAuditResult(filePath, validation.value),
        sessionID: resultMessage.session_id,
        usage: resultMessage.usage ?? null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        error: message,
        ok: false,
        sessionID: null,
        usage: null,
      }
    } finally {
      signal?.removeEventListener('abort', handleAbort)
    }
  },
})
