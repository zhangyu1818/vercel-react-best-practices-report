# Vercel React Best Practices Report

You must load the `vercel-react-best-practices` skill and strictly follow ONLY the rules defined in that skill. Do not invent new rules, do not apply general React opinions, and do not enforce stylistic preferences (like Prettier/ESLint rules) unless they are explicitly part of the Vercel Best Practices.

skill({ name: "vercel-react-best-practices" })

## Overview

Use these instructions to inspect React/Next.js/React Native source files against **ONLY** the rules defined in the `vercel-react-best-practices` skill. Produce merge-ready findings for `react-best-practices-report/reports.json` using the merge command.

## Auditing Guidelines

1. **Strict Adherence**: Only report violations that directly map to a rule in the `vercel-react-best-practices` skill.
2. **Ignore Irrelevance**: If a file violates a generic "clean code" principle but not a Vercel rule, ignore it.
3. **No Hallucinations**: Do not make up rule names. Use the exact rule names from the skill documentation.
4. **Context Aware**: Ensure the rule actually applies to the specific framework context (e.g., Next.js vs React Native).

## Inputs

- `filePath` and file contents are provided in the prompt.

## Rules

- Do not run file discovery commands.
- Do not write `react-best-practices-report/reports.json` directly.
- The only allowed CLI call is: `npx -y vercel-react-best-practices-report --merge '<json>'`.
- Do not write JSON to any files or use helper CLI tools (no cat/tee/python).

## Workflow

1. Read the file content provided.
2. Evaluate every Vercel React Best Practices rule.
3. For each violation, capture:
   - `lineNumber`: line range as `start-end` (1-based; use a single line for single-line issues).
   - `lineContent`: exact source line(s) for the reported line range (use `\n` between lines for ranges).
   - `rule`: rule name from `vercel-react-best-practices`.
   - `suggestion`: concise replacement snippet that resolves the issue.
4. Build a `newResults` object keyed by file path. Use arrays when a file has multiple violations. If a file has no violations, set its value to an empty array so the report records that it was checked.
5. Output the JSON object only (no Markdown, no extra text).
6. Then execute exactly one CLI command: `npx -y vercel-react-best-practices-report --merge '<json>'`.
7. If the JSON contains a single quote character, escape it as `\u0027` in the JSON string before running the command.

Example only. Do not wrap your output in code fences.

```json
{
  "/abs/path/App.tsx": [
    {
      "lineNumber": "12-18",
      "lineContent": "const Page = async () => {\n  return <Layout />;\n};",
      "rule": "PreferServerComponents",
      "suggestion": "const Page = async () => {\n  return <Layout />;\n};"
    }
  ],
  "/abs/path/Clean.tsx": []
}
```
