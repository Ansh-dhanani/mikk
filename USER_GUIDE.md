# Mikk User Guide

Welcome to Mikk! Mikk is an intelligent, codebase nervous system designed to help you instantly understand architecture across **13+ programming languages** (TypeScript, Python, Java, Go, Rust, C++, etc.), pull context for your AI assistants, and safely manage changes with impact analysis.

This guide will walk you through the core CLI commands and demonstrate how to use Mikk effectively in your day-to-day workflow.

---

## 🚀 Getting Started

To get started with Mikk in your existing project, run:

```bash
mikk init
```

This will initialize Mikk in your project, generate a skeleton `mikk.json` contract file, and create an initial lockfile (`mikk.lock.json`) to track the current state of your codebase.

---

## 🔍 Core Commands

### 1. Analyzing your Codebase
When you make extensive additions or structural changes, you can re-analyze the codebase to update the Mikk lockfile.

```bash
mikk analyze
```
*Description: Parses your project, updates internal graphs, and regenerates the lockfile.*

For CI-grade accuracy checks, use strict parse mode:

```bash
mikk analyze --strict-parsing
```
*Description: Fails if any file had parser/read/import-resolution diagnostics and avoids silent fallback parsing.*

Before strict mode in CI, run doctor preflight:

```bash
mikk doctor
```
*Description: Runs health checks including parser runtime preflight for Tree-sitter-backed languages.*

### 2. Live Watching
Instead of constantly running `analyze`, you can run Mikk in watch mode to incrementally analyze changes as you save your files.

```bash
mikk watch
```
*Description: Starts a background daemon that listens for file changes and incrementally updates the project architecture graph.*

### 3. Reviewing Changes (Diff)
Curious what architectural changes you've made since the last analysis? 

```bash
mikk diff
```
*Description: Shows what modules or dependencies changed since the last fully-analyzed state.*

---

## 🤖 AI Context Generation

The `mikk context` command suite is specifically built for AI assistants to grab the exact necessary context from the codebase.

- **Ask an architecture question**:
  ```bash
  mikk context query "How does authentication work here?"
  ```
  *Mikk will retrieve the relevant modules and functions to answer.*

- **Analyze the impact of modifying a file**:
  ```bash
  mikk context impact packages/cli/src/commands/init.ts
  ```
  *Mikk will trace upstream and downstream dependencies to tell you what breaks if this file changes.*

- **Grab context for a specific task**:
  ```bash
  mikk context for "Add a new backend route for user profile"
  ```
  *Mikk will output a streamlined context payload you can paste directly into an LLM prompt.*

---

## 🛠️ Refactoring & Version Control

Mikk now deeply understands your refactoring intents and text-level VCS changes.

- **Perform a coordinated multi-file rename**:
  ```bash
  mikk rename
  ```
  *Finds a function definition and all of its call sites and imports, generating a precise step-by-step edit plan.*

- **See the architectural impact of a Git diff**:
  ```bash
  mikk git-diff-impact
  ```
  *Maps raw git diff hunks to the actual functions and modules that were changed, allowing you to see what processes were genuinely affected.*

---

## 📊 Visualization

Mikk can generate Mermaid.js diagrams so you have an always-up-to-date visual map of your architecture.

- **Regenerate all diagrams**:
  ```bash
  mikk visualize all
  ```

- **Visualize a specific module**:
  ```bash
  mikk visualize module <module-id>
  ```

- **Generate an impact diagram for current changes**:
  ```bash
  mikk visualize impact
  ```

---

## 🛡️ Contract Management

Mikk enforces module boundaries using a contract (`mikk.json`).

- **Validate your code against the contract**:
  ```bash
  mikk contract validate
  ```
  *Fails if there are unexpected dependency cycles or restricted cross-module imports.*

- **Update the contract to reflect new dependencies**:
  ```bash
  mikk contract update
  ```

- **Regenerate the contract skeleton completely**:
  ```bash
  mikk contract generate
  ```

---

## 🧠 AI Intent Preflight

You can use the intent engine to prompt Mikk to suggest code changes and run a preflight impact analysis before actually executing them:

```bash
mikk intent "Extract the user validation logic into a shared module"
```
*Description: Interprets your prompt, suggests changes, and validates the architectural safety of those changes before applying.*

---

## 📝 Tips for Best Results

1. **Keep Mikk Watched**: Run `mikk watch` in a separate terminal while developing so your diagrams and contexts are always real-time.
2. **Commit `mikk.json` and `mikk.lock.json`**: Treat them like `package.json` and `package-lock.json`. These files serve as the source of truth for your codebase's architectural boundaries.
3. **Use with VS Code**: Check out the `@mikk/vscode-extension` to get visual charts and context tools directly in your editor's sidebar!

---

## ✅ CI Profile (Strict + Preflight)

Use this sequence for release pipelines:

```bash
mikk doctor
mikk analyze --strict-parsing
mikk ci --strict
```

If `mikk doctor` reports missing parser runtime on non-TS/JS projects, install parser runtime dependencies and rerun doctor before continuing.

CI uses two lanes on purpose:

- `quality-gates`: build/lint/tests plus MCP docs-registry consistency checks.
- `strict-cli-preflight`: runs `mikk doctor` and `mikk analyze --strict-parsing` using built CLI output.

This separation keeps MCP metadata integrity checks distinct from runtime parser readiness checks.

---

## 🔄 Updating Mikk CLI

Mikk supports interactive and scripted self-update modes:

```bash
mikk update
```

Scripted modes:

```bash
mikk update --channel stable
mikk update --channel latest
mikk update --channel version --version 2.1.0
```

Use `--yes` to skip confirmation prompts in automation.

---

## 🧭 Standard Workflows

### Developer Workflow

Use this sequence for day-to-day development:

```bash
mikk analyze
mikk context query "How does this module connect?"
mikk ci --strict
```

### AI-Assisted Workflow

Use this sequence before and during agent-assisted edits:

```bash
mikk analyze
mikk context for "Describe the planned refactor"
mikk intent "Validate safety and impact for this change"
```

For enterprise rollout, incidents, and upgrade process, see `ENTERPRISE_RUNBOOK.md`.
