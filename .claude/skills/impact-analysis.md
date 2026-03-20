---
name: Impact Analysis
description: Analyze blast radius before making changes using Mikk's safety tools
---

# Impact Analysis with Mikk

Use this workflow BEFORE making any code changes to understand the blast radius and avoid breaking downstream code.

## Pre-Edit Safety Check (MANDATORY)

**Always** call `mikk_before_edit` before modifying any file:

```
mikk_before_edit({ files: ["src/auth/verify.ts", "src/auth/session.ts"] })
```

This returns:
- **Blast radius** — how many functions depend on code in these files
- **Exported functions at risk** — public API that other modules consume
- **Constraint violations** — boundary rules that would be broken
- **Circular dependencies** — cycles in the call graph

## Full Blast Radius Analysis

For deeper analysis of a specific file:

```
mikk_impact_analysis({ file: "src/auth/verify.ts" })
```

Returns classified impact:
- **Critical** — will definitely break (direct callers)
- **High** — very likely affected (1 hop away)
- **Medium** — may need testing (2 hops)
- **Low** — minimal risk (3+ hops)

## Checking Constraints

```
mikk_get_constraints()
```

Review all architectural rules before making cross-module changes. Common constraint types:
- `no-import` — module A must not import from module B
- `no-call` — module A must not call functions in module B
- `must-use` — module A must use a specific function for certain operations
- `layer` — enforce layered architecture (UI → API → DB, never backwards)
- `naming` — enforce naming conventions
- `max-files` — limit module size

## Workflow

1. `mikk_before_edit({ files: [...] })` — safety check
2. Review blast radius and violations
3. If violations exist → redesign your approach
4. If safe → make changes
5. `mikk_get_changes()` → verify what changed
6. Run `mikk analyze` to update the lock

## Key Principles

- NEVER skip `mikk_before_edit` — it's your safety net
- Pay special attention to **exported functions at risk** — those are the public API
- If blast radius is high, consider a more targeted approach
- Check constraints BEFORE writing code, not after
