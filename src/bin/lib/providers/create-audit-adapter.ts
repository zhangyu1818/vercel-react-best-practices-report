import { createClaudeAdapter } from './claude-adapter.js'
import { createCodexAdapter } from './codex-adapter.js'

import type { ResolvedCliOptions } from '../cli-options.js'
import type { AuditAdapter } from './types.js'

type ResolvedAdapterOptions = ResolvedCliOptions & {
  workingDirectory?: string
}

export interface CreateAuditAdapterDependencies {
  createClaudeAdapter: typeof createClaudeAdapter
  createCodexAdapter: typeof createCodexAdapter
}

const defaultDependencies: CreateAuditAdapterDependencies = {
  createClaudeAdapter,
  createCodexAdapter,
}

export const createAuditAdapter = (
  options: ResolvedAdapterOptions,
  dependencies: CreateAuditAdapterDependencies = defaultDependencies,
): AuditAdapter => {
  const workingDirectory = options.workingDirectory ?? process.cwd()

  if (options.adapter === 'codex') {
    return dependencies.createCodexAdapter({
      ...options,
      workingDirectory,
    })
  }

  return dependencies.createClaudeAdapter({
    ...options,
    workingDirectory,
  })
}
