# vercel-react-best-practices-report

A CLI/TUI tool powered by [Codex](https://developers.openai.com/codex/) to audit React and Next.js codebases against the `$vercel-react-best-practices` skill.

## Installation

```bash
npm install -g vercel-react-best-practices-report
```

Or run directly with `npx`.

## Prerequisites

- A working Codex CLI environment on the machine.
- Valid Codex/OpenAI authentication for the current shell session.
- The `$vercel-react-best-practices` skill installed either in `$HOME/.agents/skills` or the compatible legacy Codex skills location.

## Usage

```bash
vercel-react-best-practices-report --model <model-id> [--reasoning-effort <level>] [--concurrency <n>]
```

By default the tool runs with a single worker. Increase concurrency only when you explicitly pass `--concurrency`.

### Options

| Option | Description |
| --- | --- |
| `--model`, `-m` | Required. Codex-supported model id, for example `gpt-5.3-codex` or `gpt-5.4` |
| `--reasoning-effort`, `-r` | Optional. Passed through to Codex `model_reasoning_effort`. Defaults to `high`. |
| `--concurrency`, `-c` | Optional. Number of parallel workers. Default is `1` |

### Example

```bash
vercel-react-best-practices-report --model gpt-5.3-codex
vercel-react-best-practices-report --model gpt-5.4
vercel-react-best-practices-report --model gpt-5.3-codex --reasoning-effort xhigh
vercel-react-best-practices-report --model gpt-5.3-codex --concurrency 2
```

## Output

Results are saved to `react-best-practices-report/reports.json` in the current working directory.

The tool relies on Codex's normal environment inheritance, so repository `AGENTS.md`, global skills, and Codex home configuration are discovered the same way they are for the Codex CLI.

## Visualize Results

Drag and drop `reports.json` into the viewer:

[Vercel Best Practices Report Viewer](https://vercel-best-practices-report-viewer.vercel.app/)
