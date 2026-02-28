<h1 align="center">Mikk</h1>

<p align="center">
  <strong>The Codebase Nervous System. Instant AI Context. 100% Local. 100% Fast.</strong><br>
  <strong>Understand your architecture. See the impact of your changes. Feed your LLMs the perfect context.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg" alt="License: Apache 2.0" /></a>
</p>

The ultimate tool for codebase comprehension and safe refactoring. Mikk acts as your project's nervous system, mapping out dependencies, enforcing architectural contracts, and giving your AI tools the exact context they need to shine.

```
Instant Context · Mermaid Architecture Diagrams · Impact Analysis · VS Code Extension
```

### Features

- **Architectural Visualization:** Automatically generate Flow, Impact, and Health diagrams inside your editor or terminal.
- **AI Context Builder:** Pull in the *exact* context your LLMs need. Automatically trim irrelevant code to save tokens and improve reasoning.
- **Impact Analysis:** See what breaks *before* you change it. Mikk traces upstream and downstream dependencies for safe refactoring.
- **Strict Contracts:** Enforce module boundaries defined in `mikk.json`. CI fails if an import violates your defined architecture.
- **Lightning Fast:** Built on top of Bun and Turborepo. Everything is cached, incremental, and highly optimized.

### Why Mikk?

- **See the Matrix:** Most teams build hidden technical debt because they can't visualize their dependencies. Mikk makes the invisible visible.
- **Supercharge your AI:** Instead of dumping an entire codebase into an LLM, Mikk uses intelligent heuristics to trace only the relevant execution paths for a specific prompt or file.
- **Catch boundary violations early:** Prevent spaghetti code by formally defining what packages are allowed to import what. 

## Quick Start

```bash
git clone https://github.com/ansh_dhanani/mikk.git
cd mikk
bun install
bun run build

# Quick setup in your project
mikk init

# Ask a question
mikk context query "How does authentication work here?"

# See the impact of modifying a file
mikk context impact packages/cli/src/commands/init.ts

# Get AI context for a task
mikk context for "Add a new backend route for user profile"

# Generate diagrams
mikk visualize all

# Start live watcher
mikk watch
```

## Architecture

Mikk is a monorepo built for speed and strict modularity.

| Package | Purpose |
|-----------|-----------|
| **`@mikk/core`** | AST parsing, graph building, hashing, and core utilities. |
| **`@mikk/ai-context`** | intelligent tracing algorithms for distilling context payloads. |
| **`@mikk/diagram-generator`** | Mermaid.js chart generation (module, flow, health, impact). |
| **`@mikk/watcher`** | Chokidar-powered daemon for incremental, live updates. |
| **`@mikk/cli`** | The main terminal interface for `mikk`. |
| **`@mikk/vscode-extension`** | Native VS Code integration (sidebar view + context tools). |
| **`@mikk/intent-engine`** | AI pre-flight system for suggesting safe automated changes. |

## Contract Management (`mikk.json`)

Mikk enforces structural integrity via a contract. Run `mikk contract generate` to create the initial boundary map.

- **Validate your code:** `mikk contract validate` fails if unexpected cycles or illegal cross-module imports are found.
- **Update the contract:** `mikk contract update` to intentionally lock in new dependency relations.

## Visualizations

Mikk can generate Mermaid.js diagrams so you have an always-up-to-date visual map:

- **Flow Diagram:** Shows how data/execution moves through a specific module.
- **Impact Diagram:** Shows what other modules rely on a specific file or component.
- **Health Diagram:** Highlights cyclical dependencies or overly complex modules.

## Documentation

For a complete reference, view our [User Guide](USER_GUIDE.md).

## Development

```bash
bun install
bun run build
bun run test
```

## License

Apache License 2.0 — see [LICENSE](LICENSE)

---

**Mikk** — The Codebase Nervous System. Understand faster.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ansh-dhanani/mikk&type=date&legend=top-left)](https://www.star-history.com/#ansh-dhanani/mikk&type=date&legend=top-left)
