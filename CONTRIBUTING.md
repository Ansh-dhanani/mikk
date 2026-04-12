# Contributing to Mikk

Thanks for taking the time to contribute. All types of contributions are welcome — bug reports, feature requests, code, and documentation.

## Before You Start

Check the [Issues](https://github.com/getmikk/mikk/issues) tab first. If your bug or feature request isn't already tracked, open a new issue describing what you found or want.

## Development Setup

**Prerequisites:**
- [Bun](https://bun.sh) ≥ 1.x (preferred runtime and package manager)
- Node.js ≥ 20 (for compatibility checks)

```bash
git clone https://github.com/getmikk/mikk.git
cd mikk
bun install
bun run build
```

The repo is a Turborepo monorepo. All packages live in `packages/`.

## Workflow

1. Create a branch from `main`: `git checkout -b fix/your-description`
2. Make your changes
3. Run tests: `bun run test`
4. Run lint: `bun run lint`
5. Open a Pull Request against `main`

## Running Mikk Against Itself

```bash
# Analyze the repo
node packages/cli/dist/index.js analyze

# Verify no architectural violations
node packages/cli/dist/index.js ci --strict
```

## Adding a Language

To add tree-sitter support for a new language:

1. Add the grammar to `packages/core/src/parser/tree-sitter/`
2. Add the language config in `packages/core/src/utils/language-registry.ts`
3. Add fixture files in `benchmarks/fixtures/`
4. Add tests that assert function/class extraction is accurate

## Code of Conduct

By participating in this project, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
