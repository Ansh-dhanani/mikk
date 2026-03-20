---
name: Debugging
description: Trace bugs through call chains using Mikk's dependency graph
---

# Debugging with Mikk

Use this workflow when you need to trace a bug, understand error propagation, or find the root cause of an issue.

## Step 1: Locate the Symptom

Find the function where the bug manifests:

```
mikk_search_functions({ query: "handleLogin" })
```

## Step 2: Understand the Function

```
mikk_get_function_detail({ name: "handleLogin" })
```

This shows:
- **params** and **returnType** — does the interface match expectations?
- **calls** — what functions does it depend on?
- **calledBy** — what calls it (could be passing bad data)?
- **errorHandling** — are errors caught or swallowed?
- **edgeCases** — what conditions are guarded?

## Step 3: Trace the Call Chain

Use `mikk_query_context` to see the full execution flow:

```
mikk_query_context({ question: "login authentication flow", maxHops: 6 })
```

## Step 4: Check Upstream Callers

```
mikk_find_usages({ name: "handleLogin" })
```

Are callers passing the right arguments? Are they handling the return value correctly?

## Step 5: Read the Actual Code

```
mikk_read_file({
  file: "src/auth/login.ts",
  functions: ["handleLogin", "validateCredentials"]
})
```

## Step 6: Check for Breaking Changes

If you suspect a recent change broke something:

```
mikk_get_changes()
```

Then check the impact of modified files:

```
mikk_impact_analysis({ file: "src/auth/login.ts" })
```

## Key Principles

- Trace downward (what does the buggy function call?) AND upward (what calls it?)
- Check `errorHandling` — swallowed errors are a common source of mystery bugs
- Use `mikk_get_changes` to see if recent modifications correlate with the bug
- Always check `edgeCases` — missing guard clauses cause most runtime errors
