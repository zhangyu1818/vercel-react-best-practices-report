# Directory Option Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional CLI directory parameter so audits can target a relative subdirectory instead of always using the launch cwd.

**Architecture:** Extend CLI parsing to accept `--directory` with `--dir` and `-d` aliases, validate that the value is a relative path, and resolve it against the launch cwd. Thread the resolved target directory through file discovery, report output, and adapter working directory so the audit runs entirely inside the selected subtree.

**Tech Stack:** TypeScript, arg, Node.js test runner, tsx

---

### Task 1: Lock the CLI contract with tests

**Files:**
- Modify: `test/cli-options.test.ts`
- Modify: `test/bin-entry.test.ts`

- [ ] Step 1: Add failing tests for `--directory` defaults, alias support, and absolute-path rejection.
- [ ] Step 2: Run the focused CLI tests and confirm they fail for the new behavior.

### Task 2: Implement directory resolution in CLI options

**Files:**
- Modify: `src/bin/lib/cli-options.ts`
- Modify: `src/bin/vercel-react-best-practices-report.tsx`

- [ ] Step 1: Add parsed and resolved CLI fields for the target directory.
- [ ] Step 2: Resolve relative paths against launch cwd and reject absolute paths.
- [ ] Step 3: Route scan directory, report directory, and provider working directory through the resolved target directory.
- [ ] Step 4: Run the focused tests and confirm they pass.

### Task 3: Document the new option

**Files:**
- Modify: `README.md`

- [ ] Step 1: Update usage, options table, examples, and output description for `--directory`.

### Task 4: Verify and ship

**Files:**
- Modify: `package.json` if formatting requires it

- [ ] Step 1: Run the full test suite.
- [ ] Step 2: Run lint and build validation.
- [ ] Step 3: Review the diff for correctness.
- [ ] Step 4: Commit the feature branch changes.
- [ ] Step 5: Push the branch and create a pull request.
