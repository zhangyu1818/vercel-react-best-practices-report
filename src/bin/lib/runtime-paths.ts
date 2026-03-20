import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const buildFindArgs = (baseDir: string): string[] => [
  baseDir,
  '-type',
  'f',
  '(',
  '-name',
  '*.ts',
  '-o',
  '-name',
  '*.tsx',
  ')',
  '-not',
  '-path',
  '*/node_modules/*',
  '-not',
  '-path',
  '*/__tests__/*',
  '-not',
  '-path',
  '*/mock/*',
  '-not',
  '-path',
  '*/types/*',
  '-not',
  '-name',
  '*.test.*',
  '-not',
  '-name',
  '*.spec.*',
  '-not',
  '-name',
  '*.d.ts',
]

export const resolveReportDir = (baseDir: string): string =>
  path.join(baseDir, 'react-best-practices-report')

export const ensureReportDir = (reportDir: string): void => {
  fs.mkdirSync(reportDir, { recursive: true })
}

export const discoverAuditFiles = (baseDir: string): string[] => {
  const output = execFileSync('find', buildFindArgs(baseDir), {
    encoding: 'utf8',
  })
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
