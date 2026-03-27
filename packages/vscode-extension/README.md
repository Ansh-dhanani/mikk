# Mikk

**Deterministic AI Context Engine for VS Code.**

Mikk builds a precise map of your project's architecture — modules, functions, call graphs, and dead code — and surfaces it directly inside VS Code so your AI always has the right context.

---

## Features

| Feature | Description |
|---|---|
| Architecture Dashboard | Live webview showing module count, function count, dead code, sync status, and top hotspots |
| Dead Code View | Expandable sidebar list of all unreferenced functions — click to jump to source |
| Hotspots | Top 10 most-called functions ranked by caller count |
| Status Bar | Always-visible sync status — green when clean, amber when drifted |
| Auto-Refresh | Watches `mikk.json` and `mikk.lock.json` and updates everything automatically |
| Context Shifting | Detects the correct project root when you switch between files in a monorepo |
| CodeLens | Inline caller counts above every function |
| Dead Code Highlighting | Unreferenced functions appear faded in the editor |
| AI Context Forge | Generate precise, scoped AI context for any task |

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
mikk analyze
```

**3. Open any file in the project**

Mikk will detect the project context automatically and populate the sidebar.

---

## Commands

| Command | Description |
|---|---|
| `Mikk: Open Dashboard` | Open the architecture dashboard |
| `Mikk: Analyze` | Re-scan the codebase |
| `Mikk: Get AI Context` | Generate scoped context for a task |
| `Mikk: Refresh` | Manually refresh all views |
| `Mikk: Initialize` | Set up Mikk in a new project |

---

## Requirements

- Node.js 18 or later
- `@getmikk/cli` installed globally or as a dev dependency

---

## Links

- [GitHub](https://github.com/Ansh-dhanani/mikk)
- [Discussions & Support](https://github.com/Ansh-dhanani/mikk/discussions/categories/q-a)
- [Website](https://mikk-web.vercel.app/)
