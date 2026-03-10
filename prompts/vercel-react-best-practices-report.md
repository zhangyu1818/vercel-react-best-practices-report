# Vercel React Best Practices Report

You must explicitly use `$vercel-react-best-practices` and strictly follow only the rules defined in that skill. Do not invent new rules, do not apply general React opinions, and do not enforce stylistic preferences unless they are explicitly part of the Vercel Best Practices skill.

## Overview

Use these instructions to inspect one React-family source file against only the rules defined in `$vercel-react-best-practices`. Return structured findings for that single file.

## Auditing Guidelines

1. Strict adherence: only report violations that directly map to a rule in `$vercel-react-best-practices`.
2. Ignore irrelevance: if a file violates a generic clean-code principle but not a Vercel rule, ignore it.
3. No hallucinations: do not make up rule names. Use the exact rule names from the skill documentation.
4. Context aware: ensure the rule actually applies to the specific framework context in the provided file.

## Inputs

- The prompt provides `filePath` and the full file contents.

## Rules

- Do not run file discovery commands.
- Do not write files.
- Do not execute merge commands.
- Only evaluate the file path and file contents provided in the prompt.

## Required Output

- Return one JSON object with:
  - `findings`: an array of violations for that file
- Do not return `filePath`; the host application already knows which file is being audited.
- If the file has no violations, return an empty `findings` array.
- For each violation, include:
  - `lineNumber`: line range as `start-end` (1-based; use a single line number for a single-line issue)
  - `lineContent`: exact source line or lines for the reported range, joined with `\n` when needed
  - `rule`: exact rule name from `$vercel-react-best-practices`
  - `suggestion`: concise replacement snippet that resolves the issue

## Example

```json
{
  "findings": [
    {
      "lineNumber": "1",
      "lineContent": "import { Check, X, Menu } from 'lucide-react';",
      "rule": "bundle-barrel-imports",
      "suggestion": "import Check from 'lucide-react/dist/esm/icons/check';\nimport X from 'lucide-react/dist/esm/icons/x';\nimport Menu from 'lucide-react/dist/esm/icons/menu';"
    }
  ]
}
```
