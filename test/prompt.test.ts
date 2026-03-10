import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPrompt } from '../src/bin/lib/prompt.js'

test('buildPrompt appends only the dynamic file context', () => {
  const prompt = buildPrompt(
    '# Audit Instructions\n\nReturn findings only.',
    '/tmp/project/App.tsx',
    "import { Check } from 'lucide-react'\n",
  )

  assert.match(prompt, /# Audit Instructions/)
  assert.match(prompt, /## Target File\n\/tmp\/project\/App\.tsx/)
  assert.match(
    prompt,
    /## File Contents\n```tsx\nimport \{ Check \} from 'lucide-react'/,
  )
  assert.doesNotMatch(prompt, /## Runtime Notes/)
  assert.doesNotMatch(prompt, /## Required Output JSON Shape/)
  assert.doesNotMatch(prompt, /Do not return `filePath`/)
})
