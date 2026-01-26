# vercel-react-best-practices-report

A CLI tool for [OpenCode](https://opencode.ai) to audit your React/Next.js codebase against the `vercel-react-best-practices` skill.

## Installation

```bash
npm install -g vercel-react-best-practices-report
```

Or run directly with npx (no install required).

## Usage

```bash
vercel-react-best-practices-report --model <provider/model> [--concurrency <n>]
```

### Options

| Option                | Description                                  |
| --------------------- | -------------------------------------------- |
| `--model`, `-m`       | Required. Model to use, e.g. `openai/gpt-4o` |
| `--concurrency`, `-c` | Number of parallel workers (default: 10)     |

### Example

```bash
vercel-react-best-practices-report --model openai/gpt-4o --concurrency 20
```

## Output

Results are saved to `react-best-practices-report/reports.json` in your current directory.

### Visualize Results

Drag and drop `reports.json` to the viewer:

[Vercel Best Practices Report Viewer](https://vercel-best-practices-report-viewer.vercel.app/)
