# @getmikk/vscode-extension

> Full architectural intelligence inside VS Code — module tree, impact analysis, AI context, and real-time sync without leaving your editor.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)](https://code.visualstudio.com/)

The Mikk VS Code extension brings the full Mikk workflow into your editor. Browse your module tree in the Activity Bar, run impact analysis on the active file with one command, generate AI context for any task, and see your lock file sync status live in the status bar — all without switching to a terminal.

> Part of [Mikk](../../README.md) — the codebase nervous system for AI-assisted development.

---

## Features

### 📊 Module Tree View

A dedicated **Mikk** panel in the Activity Bar sidebar shows your project's modules as a tree:

- Module names with descriptions
- Expand to see individual files within each module
- Auto-refreshes when `mikk.json` changes

### 🔍 Architecture Diagrams

Open Mermaid architecture diagrams directly in VS Code:

- Main architecture overview
- Per-module detail diagrams
- Health dashboard
- Dependency matrix

### 🤖 AI Context

Get graph-traced AI context for any task, right from the command palette:

- Query architecture questions
- Get impact analysis for the current file
- Context formatted for Claude or other AI models

### 📡 Status Bar

The status bar shows a **$(sync) Mikk** indicator. At a glance, see whether your lock file is in sync with your codebase.

---

## Getting Started

1. **Install the extension** from the VS Code Marketplace (search: "Mikk")
2. **Open a project** that has a `mikk.json` file (or run `Mikk: Initialize` to create one)
3. The extension activates automatically when `mikk.json` is detected

---

## Commands

Access all commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | ID | Description |
|---------|-----|-------------|
| **Mikk: Initialize** | `mikk.init` | Run `mikk init` in the integrated terminal — scans the codebase, generates contract, lock file, diagrams, and AI context files |
| **Mikk: Analyze** | `mikk.analyze` | Run `mikk analyze` — re-analyze the codebase and update all generated artifacts |
| **Mikk: Show Architecture Diagram** | `mikk.showDiagram` | Open the main architecture diagram (`.mikk/diagrams/main.mmd`) |
| **Mikk: Show Impact Analysis** | `mikk.showImpact` | Run impact analysis on the currently active file and show results |
| **Mikk: Get AI Context** | `mikk.getContext` | Prompt for a task description, then generate and display graph-traced AI context |

---

## Sidebar Views

The extension adds a **Mikk** view container to the Activity Bar with three panels:

### Modules

Displays all modules defined in `mikk.json` as a tree:

```
📦 Mikk
  └─ Modules
      ├─ 📁 auth — Handle user authentication
      │   ├─ src/auth/login.ts
      │   ├─ src/auth/session.ts
      │   └─ src/auth/middleware.ts
      ├─ 📁 payments — Payment processing
      │   ├─ src/payments/stripe.ts
      │   └─ src/payments/billing.ts
      └─ 📁 users — User management
          └─ src/users/profile.ts
```

### Functions *(coming soon)*

Will display a tree of all functions organized by module, with quick navigation.

### Health *(coming soon)*

Will display module health metrics (cohesion, coupling, function count) with color-coded indicators.

---

## Activation

The extension activates when:
- The workspace contains a `mikk.json` file (`workspaceContains:mikk.json`)

It registers:
- 5 commands
- 1 status bar item
- 3 tree view providers (modules, functions, health)

---

## Prerequisites

- **VS Code** ≥ 1.85.0
- **Node.js** ≥ 18 (for running `mikk` CLI commands)
- **@getmikk/cli** installed globally or in the project:
  ```bash
  npm install -g @getmikk/cli
  ```

---

## Extension Settings

Currently, the extension uses the default Mikk configuration from `mikk.json`. Future versions will add VS Code settings for:

- Custom diagram output paths
- Auto-analyze on save
- AI provider selection
- Token budget defaults

---

## Architecture

```
src/
├── extension.ts          ← Activation entry point
├── modules-tree.ts       ← ModulesTreeProvider — reads mikk.json, builds tree
└── (future)
    ├── functions-tree.ts
    ├── health-tree.ts
    └── status-bar.ts
```

**Internal dependencies:**
- `@getmikk/core` — Contract/lock reading, types
- `@getmikk/diagram-generator` — Diagram generation
- `@getmikk/ai-context` — Context building

---

## Development

```bash
# From the monorepo root
cd apps/vscode-extension

# Build
bun run build    # or: npx turbo build --filter=@getmikk/vscode-extension

# Debug
# Press F5 in VS Code to launch Extension Development Host
```

### Packaging for the Marketplace

```bash
# Install vsce
npm install -g @vscode/vsce

# Package
vsce package

# Publish
vsce publish
```

---

## License

[Apache-2.0](../../LICENSE)
