# MIKK Stress Test Suite — Integration Guide

## Structure

```
mikk/scripts/stress-test/
├── run-all.ts                    ← Main runner (start here)
├── runner.ts                     ← Framework: runTest(), printSummary()
├── corpus-generators.ts          ← Synthetic codebase builders
├── suite-01-performance.ts       ← T01–T07: Performance & Scalability
├── suite-02-data-integrity.ts    ← T08–T13: Data Integrity & Malformed Input
├── suite-03-security.ts          ← T14–T18: Security & Taint Analysis
├── suite-04-fault-tolerance.ts   ← T19–T25: Fault Tolerance & Concurrency
├── suite-05-logic-bombs.ts       ← T26–T30: Logic Bombs & Incorrect Assumptions
└── INTEGRATION.md                ← This file
```

---

## Quick Start (Dry Run — No MIKK Required)

```bash
cd mikk/scripts/stress-test
npm install
npx ts-node run-all.ts --dry-run
```

This prints all 30 tests with descriptions without executing anything.

---

## Wiring Up Your MIKK MCP Client

Each suite file contains a local `callTool()` stub:

```typescript
async function callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  throw new Error(`[STUB] callTool('${toolName}')`);
}
```

Replace this with your actual MCP client call. Example using `@modelcontextprotocol/sdk`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client;

async function initClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["../../../dist/index.js"], // path to your MIKK server
  });
  client = new Client({ name: "stress-tester", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
}

async function callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  if (!client) await initClient();
  const result = await client.callTool({ name: toolName, arguments: args });
  if (result.isError) throw new Error(result.content[0]?.text ?? "Tool error");
  return JSON.parse(result.content[0]?.text ?? "null");
}
```

Then run:

```bash
npx ts-node run-all.ts
```

---

## Running Individual Suites / Tests

```bash
# Only performance tests
npx ts-node run-all.ts --suite 1

# Only security tests
npx ts-node run-all.ts --suite 3

# Single test
npx ts-node run-all.ts --test T17

# All tests with extended memory
node --max-old-space-size=8192 -r ts-node/register run-all.ts
```

---

## Test Catalog

| ID  | Name | Category | Key Risk |
|-----|------|----------|----------|
| T01 | 10K File Semantic Index Flood | PERFORMANCE | OOM / O(n²) indexing |
| T02 | Single 10MB+ File Parse | PERFORMANCE | Heap overflow |
| T03 | Circular Deps Ring (500 modules) | PERFORMANCE | Infinite loop in DFS |
| T04 | Diamond Deps 1000-Wide | PERFORMANCE | Combinatorial explosion |
| T05 | 100 Concurrent Queries | PERFORMANCE | Race condition / deadlock |
| T06 | Call Chain Depth 10000 | PERFORMANCE | Stack overflow |
| T07 | Rapid File Churn Re-index | PERFORMANCE | Stale cache |
| T08 | Null Byte in Path | DATA_INTEGRITY | Path confusion / bypass |
| T09 | Path Traversal Attack | DATA_INTEGRITY | `/etc/passwd` read |
| T10 | Corrupted Lock File (6 modes) | DATA_INTEGRITY | Startup crash |
| T11 | UTF-16 / BOM / RTL Encoding | DATA_INTEGRITY | Mojibake / bad parse |
| T12 | Malformed JSON Tool Args | DATA_INTEGRITY | Unhandled TypeError |
| T13 | Symlink Loop + Hardlink Trap | DATA_INTEGRITY | Infinite crawl |
| T14 | Secrets Scanner Obfuscation | SECURITY | False negatives |
| T15 | 5-Hop Indirect Taint Flow | SECURITY | Missed SQL injection |
| T16 | Secrets in node_modules | SECURITY | False positives drowning |
| T17 | ReDoS on Scanner Regex | SECURITY | CPU hang |
| T18 | Prototype Pollution via Taint | SECURITY | Missed bracket-access sink |
| T19 | Disk Full Mid-Write | FAULT_TOLERANCE | Corrupt index |
| T20 | 5 Tools in Parallel | CONCURRENCY | Race / deadlock |
| T21 | Interrupted Execution Recovery | FAULT_TOLERANCE | Corrupt state persistence |
| T22 | Memory Leak (1000 queries) | CONCURRENCY | Unbounded cache |
| T23 | Index + Delete Race | CONCURRENCY | ENOENT kills indexer |
| T24 | Windows Path Separators | FAULT_TOLERANCE | Cross-platform breakage |
| T25 | Worker Thread Orphan | FAULT_TOLERANCE | Zombie workers |
| T26 | TS Overloads in Call Graph | LOGIC | Duplicate nodes |
| T27 | Monorepo Multi-tsconfig | LOGIC | Wrong root assumption |
| T28 | Rename Breaks String Refs | LOGIC | Silent runtime breakage |
| T29 | Semantic Search Query Inject | LOGIC | Prompt injection |
| T30 | COMBINED CHAOS (5 modes) | LOGIC | Boss fight |

---

## Expected Output When Stubbed

All tests will show `FAIL` with `[STUB]` messages — this is correct.
Wire up `callTool()` to see real results.

```
❌ [T01] 10K File Semantic Index Flood — FAIL (3ms, Δmem: 0.00MB)
   ↳ [STUB] callTool('semantic_search', {"projectRoot":"/tmp/mikk-t01-xxx","query":"auth...
```

---

## Iteration Protocol

After running against real MIKK:

1. Note all `FAIL` / `CRASH` / `TIMEOUT` results
2. Fix the underlying system issue
3. Re-run specific failing test: `npx ts-node run-all.ts --test T03`
4. Once fixed, run full suite to check for regressions
5. Report back here — next iteration will add even more aggressive tests based on failures found

---

## Adding New Tests

```typescript
// In the appropriate suite file:
export const T31: TestCase = {
  id: "T31",
  name: "Your Test Name",
  category: "PERFORMANCE", // or DATA_INTEGRITY, SECURITY, FAULT_TOLERANCE, LOGIC
  scenario: "...",
  attackVector: "...",
  expectedFailure: "...",
  idealBehavior: "...",
  suggestedFix: "...",
  timeoutMs: 30_000, // optional
  run: async () => {
    // Your test implementation
    await callTool("some_tool", { ... });
  },
};
```

Then add to `run-all.ts` suite array.
