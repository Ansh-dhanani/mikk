# Mikk User Guide

Welcome to Mikk! Mikk is an intelligent, codebase nervous system designed to help you instantly understand architecture, pull context for your AI assistants, and safely manage changes with impact analysis.

This guide will walk you through the core CLI commands and demonstrate how to use Mikk effectively in your day-to-day workflow.

---

## 🚀 Getting Started

To get started with Mikk in your existing project, run:

```bash
mikk init
```

This will initialize Mikk in your project, generate a skeleton `mikk.json` contract file, and create an initial lockfile (`mikk.lock`) to track the current state of your codebase.

---

## 🔍 Core Commands

### 1. Analyzing your Codebase
When you make extensive additions or structural changes, you can re-analyze the codebase to update the Mikk lockfile.

```bash
mikk analyze
```
*Description: Parses your project, updates internal graphs, and regenerates the lockfile.*

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
2. **Commit `mikk.json` and `mikk.lock`**: Treat them like `package.json` and `package-lock.json`. These files serve as the source of truth for your codebase's architectural boundaries.
3. **Use with VS Code**: Check out the `@mikk/vscode-extension` to get visual charts and context tools directly in your editor's sidebar!
