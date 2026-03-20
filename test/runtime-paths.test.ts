import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  discoverAuditFiles,
  resolveReportDir,
} from '../src/bin/lib/runtime-paths.js'

test('discoverAuditFiles only returns auditable files under the target directory', (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-paths-test.'))
  t.after(() => {
    fs.rmSync(rootDir, { force: true, recursive: true })
  })

  const targetDir = path.join(rootDir, 'packages', 'app')
  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(targetDir, '__tests__'), { recursive: true })
  fs.mkdirSync(path.join(targetDir, 'mock'), { recursive: true })
  fs.mkdirSync(path.join(targetDir, 'types'), { recursive: true })
  fs.mkdirSync(path.join(targetDir, 'node_modules', 'ignored'), {
    recursive: true,
  })
  fs.writeFileSync(path.join(rootDir, 'root.tsx'), 'export const root = true\n')
  fs.writeFileSync(
    path.join(targetDir, 'src', 'keep.ts'),
    'export const keep = true\n',
  )
  fs.writeFileSync(
    path.join(targetDir, 'src', 'keep.tsx'),
    'export const keepTsx = true\n',
  )
  fs.writeFileSync(
    path.join(targetDir, 'src', 'skip.test.ts'),
    'export const skipTest = true\n',
  )
  fs.writeFileSync(
    path.join(targetDir, 'src', 'skip.spec.tsx'),
    'export const skipSpec = true\n',
  )
  fs.writeFileSync(
    path.join(targetDir, 'src', 'skip.d.ts'),
    'export type Skip = string\n',
  )
  fs.writeFileSync(
    path.join(targetDir, '__tests__', 'skip.ts'),
    'export const skipTestsDir = true\n',
  )
  fs.writeFileSync(
    path.join(targetDir, 'mock', 'skip.ts'),
    'export const skipMock = true\n',
  )
  fs.writeFileSync(
    path.join(targetDir, 'types', 'skip.ts'),
    'export const skipTypes = true\n',
  )
  fs.writeFileSync(
    path.join(targetDir, 'node_modules', 'ignored', 'skip.ts'),
    'export const skipNodeModules = true\n',
  )

  const files = discoverAuditFiles(targetDir)

  assert.deepEqual(files.sort(), [
    path.join(targetDir, 'src', 'keep.ts'),
    path.join(targetDir, 'src', 'keep.tsx'),
  ])
})

test('resolveReportDir places reports inside the target directory', () => {
  assert.equal(
    resolveReportDir('/tmp/project/packages/app'),
    '/tmp/project/packages/app/react-best-practices-report',
  )
})

test('discoverAuditFiles treats the target directory as a literal path', (t) => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'runtime-paths-literal.'),
  )
  t.after(() => {
    fs.rmSync(rootDir, { force: true, recursive: true })
  })

  const injectedPath = path.join(rootDir, 'injected.txt')
  const targetDir = path.join(rootDir, `safe"; touch ${injectedPath}; #`)
  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(targetDir, 'src', 'keep.ts'),
    'export const keep = true\n',
  )

  const files = discoverAuditFiles(targetDir)

  assert.deepEqual(files, [path.join(targetDir, 'src', 'keep.ts')])
  assert.equal(fs.existsSync(injectedPath), false)
})
