## What this changes

<!-- One paragraph. What problem does this PR solve? -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Parser improvement
- [ ] Performance
- [ ] Docs / README
- [ ] Refactor

## How to test

```bash
# Commands to verify the fix
cd packages/core
bun test

mikk analyze
mikk ci
```

## Test project

<!-- If this affects parsing or analysis, describe the test case -->

## Checklist

- [ ] `bun run build` passes with no TypeScript errors
- [ ] `bun run test` passes (363+ tests, 0 failures)
- [ ] If parser change: tested against real TypeScript / JS / Go code
- [ ] If MCP tool change: tested with an actual MCP client session
- [ ] If constraint change: `mikk ci` correctly exits non-zero on violations
- [ ] Lock file format unchanged (or migration path documented)
- [ ] README updated if behavior changed

## Breaking changes

<!-- Does this change the lock file format, CLI flags, MCP tool output schema, or mikk.json schema? -->
None / describe here