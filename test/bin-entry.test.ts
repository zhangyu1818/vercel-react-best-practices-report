import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('bin entry starts with a node shebang', () => {
  const source = fs.readFileSync(
    new URL(
      '../src/bin/vercel-react-best-practices-report.tsx',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(source, /^#!\/usr\/bin\/env node/)
})
