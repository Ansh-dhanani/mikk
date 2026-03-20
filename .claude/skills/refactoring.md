---
name: Refactoring
description: Plan safe refactors using Mikk's dependency mapping and constraint enforcement
---

# Refactoring with Mikk

Use this workflow when restructuring code, moving functions between modules, or cleaning up dependencies.

## Step 1: Understand Current State

```
mikk_get_session_context()
```

Review module structure, constraint status, and recent changes.

## Step 2: Identify Dead Code

Before refactoring, clean up what's unused:

```
mikk_dead_code()
mikk_dead_code({ moduleId: "packages-core" })  // filter by module
```

Dead code includes functions with zero callers (after exempting exports, entry points, route handlers, tests, and constructors).

## Step 3: Check the Blast Radius

```
mikk_before_edit({ files: ["src/auth/verify.ts"] })
```

## Step 4: Understand Dependencies

```
mikk_find_usages({ name: "verifyToken" })
```

Know every caller before moving or renaming a function.

## Step 5: Check Architectural Constraints

```
mikk_get_constraints()
```

Will your refactor violate any boundary rules? Check:
- Module boundaries — are you moving code across boundaries?
- Naming conventions — does the new name follow patterns?
- Layer enforcement — does the movement respect the architecture?

## Step 6: Track ADRs

If your refactor changes an architectural decision, document it:

```
mikk_manage_adr({
  action: "add",
  id: "ADR-005",
  title: "Extract validation into shared utils",
  reason: "Reduces duplication across auth and payments modules"
})
```

## Step 7: Verify After Refactoring

```
mikk_get_changes()          // see what changed
mikk_before_edit({ ... })   // re-check constraints
```

Then run `mikk analyze` to update the lock file.

## Key Principles

- Remove dead code BEFORE restructuring — it simplifies the blast radius
- Always check `mikk_find_usages` before moving or renaming
- Document significant architectural changes as ADRs
- Run `mikk_before_edit` both before AND after refactoring
- Use `mikk_dead_code` to verify your refactor didn't create new orphans
