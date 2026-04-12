# Mikk for VS Code

> Live architectural intelligence for your editor — dead code, hotspots, sync status, and AI context, always current.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Features

| Feature | Description |
|---|---|
| **Architecture Dashboard** | Live webview: module count, function count, dead code %, sync status, top hotspots |
| **Dead Code View** | Sidebar list of unreferenced functions — click to jump to source |
| **Hotspots** | Top 10 most-called functions ranked by caller count |
| **Status Bar** | Always-visible sync status — green when clean, amber when drifted |
| **Auto-Refresh** | Watches `mikk.json` and `mikk.lock.json` — updates everything automatically on change |
| **Context Switching** | Detects the correct project root when switching files in a monorepo |
| **CodeLens** | Inline caller counts above every function |
| **Dead Code Highlighting** | Unreferenced functions appear faded in the editor |

---

## Getting Started

**1. Install the Mikk CLI**

```bash
npm install -g @getmikk/cli
```

**2. Initialize your project**

```bash
cd your-project
mikk init
```

**3. Open any file in the project**

The extension detects the project root automatically and populates the sidebar.

---

## Commands

| Command | Description |
|---|---|
| `Mikk: Open Dashboard` | Open the architecture dashboard webview |
| `Mikk: Analyze` | Re-scan the codebase and update the lock file |
| `Mikk: Refresh` | Manually refresh all views |
| `Mikk: Initialize` | Set up Mikk in a new project |

---

## Requirements

- Node.js 18 or later
- `@getmikk/cli` installed globally or as a dev dependency

---

## License

[Apache-2.0](../../LICENSE)
