---
name: Parser issue
about: A function, import, or class is missing from the graph or incorrectly attributed
title: "[parser] "
labels: parser, bug
assignees: ""
---

## Language

- [ ] TypeScript
- [ ] JavaScript / JSX
- [ ] Go

## What is missing or wrong

<!-- Describe the function / import / class that is incorrectly parsed -->

## Minimal reproduction

```typescript
// Paste the smallest possible code snippet that demonstrates the issue
export function example({ param }: SomeType): void {
  doSomething()
}
```

## What mikk extracts

```json
// paste: mikk_get_function_detail with the function name
// or: check mikk.lock.json directly
```

## What mikk should extract

<!-- Describe the correct expected output -->

## Mikk version

```
mikk --version
```