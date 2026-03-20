# vercel-react-best-practices-report

A CLI/TUI tool powered by provider adapters to audit React and Next.js codebases against the `$vercel-react-best-practices` skill.

## Installation

```bash
npm install -g vercel-react-best-practices-report
```

Or run directly with `npx`.

## Prerequisites

### Codex adapter

- A working Codex CLI environment on the machine.
- Valid Codex/OpenAI authentication for the current shell session.
- The `$vercel-react-best-practices` skill installed in the Codex-compatible skill location.

### Claude adapter

- Claude Code CLI installed and authenticated in the current shell session.
- The `$vercel-react-best-practices` skill installed at `~/.claude/skills/vercel-react-best-practices/SKILL.md`.

## Usage

```bash
vercel-react-best-practices-report --adapter <codex|claude> --model <model-id> [--directory <path>] [--concurrency <n>] [provider options]
```

By default the tool runs with a single worker. Increase concurrency only when you explicitly pass `--concurrency`.

### Options

| Option | Description |
| --- | --- |
| `--adapter`, `-a` | Required. Provider adapter: `codex` or `claude` |
| `--model`, `-m` | Required. Model id for the selected adapter |
| `--directory`, `--dir`, `-d` | Optional. Relative path under the current working directory to audit. Defaults to `.` |
| `--concurrency`, `-c` | Optional. Number of parallel workers. Default is `1` |
| `--reasoning-effort`, `-r` | Codex only. Passed through to Codex `model_reasoning_effort`. Defaults to `high` |
| `--effort`, `-e` | Claude only. Passed through to Claude Agent SDK `effort`. Defaults to `high` |

### Examples

```bash
vercel-react-best-practices-report --adapter codex --model gpt-5.4
vercel-react-best-practices-report --adapter codex --model gpt-5.4 --directory packages/web
vercel-react-best-practices-report --adapter codex --model gpt-5.3-codex --reasoning-effort xhigh
vercel-react-best-practices-report --adapter claude --model claude-sonnet-4-6
vercel-react-best-practices-report --adapter claude --model claude-opus-4-1 --effort max --concurrency 2
```

## Output

Results are saved to `react-best-practices-report/reports.json` inside the audited directory. With the default `--directory .`, that means the current working directory.

The tool keeps the audit output contract fixed across providers: each file audit must resolve to a JSON object with a single `findings` array, and the host process validates and merges those results into the final report.

## Visualize Results

Drag and drop `reports.json` into the viewer:

[Vercel Best Practices Report Viewer](https://vercel-best-practices-report-viewer.vercel.app/)
