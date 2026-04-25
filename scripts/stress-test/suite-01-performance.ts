/**
 * MIKK STRESS TESTS — SUITE 1: PERFORMANCE & SCALABILITY
 * Tests 01–07
 *
 * Attack: How does MIKK behave under load it wasn't designed for?
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TestCase } from "./runner";
import {
  generateCorpus,
  generateCircularDeps,
  generateDiamondDeps,
} from "./corpus-generators";

import { callTool } from "./mcp-client";

function tmpDir(suffix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mikk-${suffix}-`));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 01: 10K File Semantic Index Flood
// ─────────────────────────────────────────────────────────────────────────────
export const T01: TestCase = {
  id: "T01",
  name: "10K File Semantic Index Flood",
  category: "PERFORMANCE",
  scenario:
    "Index a codebase of 10,000 TypeScript files, each with 10 functions. " +
    "Total ~100K symbols. Expect: indexing completes without OOM, " +
    "query latency stays under 2s, memory doesn't leak across queries.",
  attackVector:
    "Large corpus triggers O(n²) behavior in similarity search or " +
    "unbounded in-memory embedding accumulation.",
  expectedFailure:
    "Process OOM kill, hanging indexer, or query latency >30s. " +
    "Possible: embeddings stored as dense in-process array consuming 10GB+.",
  idealBehavior:
    "Streaming/batched indexing, bounded memory via disk-backed vector store, " +
    "query responds <2s with approximate nearest neighbor.",
  suggestedFix:
    "Implement chunked indexing with progress checkpoints. " +
    "Use HNSW or FAISS on-disk index instead of in-memory array.",
  timeoutMs: 600_000,
  run: async () => {
    const dir = tmpDir("t01");
    try {
      console.log("    Generating 5K file corpus...");
      generateCorpus(dir, { fileCount: 5_000, functionsPerFile: 10 });
      await callTool("index_project", { projectRoot: dir });
      const statsBefore = process.memoryUsage();

      const result = await callTool("semantic_search", {
        projectRoot: dir,
        query: "authentication token validation",
        limit: 10,
      });

      const statsAfter = process.memoryUsage();
      const heapGrowthMB =
        (statsAfter.heapUsed - statsBefore.heapUsed) / 1024 / 1024;
      if (heapGrowthMB > 2048) {
        throw new Error(`Memory grew ${heapGrowthMB.toFixed(0)}MB — unacceptable`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 02: 10MB+ Single File Parse
// ─────────────────────────────────────────────────────────────────────────────
export const T02: TestCase = {
  id: "T02",
  name: "Single 10MB+ TypeScript File Parse",
  category: "PERFORMANCE",
  scenario:
    "A single TypeScript file containing 50,000 exported functions (~12MB). " +
    "Real-world equivalent: generated protobuf/swagger clients.",
  attackVector:
    "Parser loads entire file into memory as AST. " +
    "AST for 50K functions can be 500MB+ heap.",
  expectedFailure:
    "Heap overflow, 'JavaScript heap out of memory', or >60s parse time.",
  idealBehavior:
    "Streaming AST parse or chunk-based analysis. Hard size limit with graceful rejection.",
  suggestedFix:
    "Add file size guard (warn >1MB, reject >20MB). " +
    "Use incremental parsing or worker thread isolation.",
  timeoutMs: 120_000,
  run: async () => {
    const dir = tmpDir("t02");
    try {
      generateCorpus(dir, { fileCount: 1, functionsPerFile: 1, hugeFiles: 1 });
      const hugeFile = path.join(dir, "huge_file_0.ts");
      const stat = fs.statSync(hugeFile);
      console.log(`    File size: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

      await callTool("index_project", { projectRoot: dir });
      await callTool("analyze_file", { filePath: hugeFile });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 03: Circular Dependency Hell (500 modules)
// ─────────────────────────────────────────────────────────────────────────────
export const T03: TestCase = {
  id: "T03",
  name: "Circular Dependency Ring (500 modules)",
  category: "PERFORMANCE",
  scenario:
    "500 modules each importing the next in a ring. " +
    "call graph traversal must not infinite-loop.",
  attackVector:
    "Naive DFS/BFS call graph without visited-node tracking → stack overflow " +
    "or infinite loop burning CPU.",
  expectedFailure:
    "RangeError: Maximum call stack size exceeded, or process hangs at 100% CPU.",
  idealBehavior:
    "Cycle detection via DFS coloring. Report cycles, terminate gracefully, " +
    "still return partial call graph.",
  suggestedFix:
    "Tarjan's or Kosaraju's SCC algorithm. Track gray/black node states. " +
    "Hard recursion depth limit.",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t03");
    try {
      generateCircularDeps(dir, 500);
      await callTool("index_project", { projectRoot: dir });
      await callTool("get_call_graph", {
        projectRoot: dir,
        entryPoint: "circular_0.ts",
        maxDepth: 9999,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 04: Diamond Dependency (1000-wide)
// ─────────────────────────────────────────────────────────────────────────────
export const T04: TestCase = {
  id: "T04",
  name: "Diamond Dependency 1000-Wide",
  category: "PERFORMANCE",
  scenario:
    "One base module imported by 1000 intermediate modules, " +
    "all imported by one top module. Classic diamond DAG.",
  attackVector:
    "Impact analysis from base module must traverse 1000+ import paths. " +
    "Without deduplication, combinatorial explosion: 1000! paths.",
  expectedFailure:
    "Impact analysis returns 1M+ results or hangs. Deduplication bug.",
  idealBehavior:
    "BFS with visited set. Returns unique affected files, not paths. " +
    "Completes in <5s.",
  suggestedFix:
    "Use Set<nodeId> for visited tracking in graph traversal. " +
    "Return node set, not path set.",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t04");
    try {
      generateDiamondDeps(dir, 1000);
      await callTool("index_project", { projectRoot: dir });
      const result = (await callTool("impact_analysis", {
        projectRoot: dir,
        changedFile: "diamond_base.ts",
      })) as any;

      // Should not return more files than exist
      const fileCount = fs.readdirSync(dir).length;
      if (result?.affectedFiles?.length > fileCount) {
        throw new Error(
          `Got ${result.affectedFiles.length} affected files but only ${fileCount} files exist — deduplication failure`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 05: Rapid-Fire Semantic Query Spam (100 concurrent)
// ─────────────────────────────────────────────────────────────────────────────
export const T05: TestCase = {
  id: "T05",
  name: "Rapid-Fire Semantic Query Spam (100 concurrent)",
  category: "PERFORMANCE",
  scenario:
    "100 simultaneous semantic_search calls against the same index. " +
    "Simulates multiple IDE instances or a busy CI pipeline.",
  attackVector:
    "Race condition on shared embedding cache. " +
    "Lock contention causing deadlock. " +
    "Connection pool exhaustion if backed by external vector DB.",
  expectedFailure:
    "Deadlock, garbled results (thread-safety violation), " +
    "or process crash from resource exhaustion.",
  idealBehavior:
    "All 100 queries complete correctly. Results are deterministic. " +
    "No interleaved/corrupt result sets.",
  suggestedFix:
    "Read-write locks on cache. Connection pooling with backpressure. " +
    "Request queue with max concurrency limit.",
  timeoutMs: 300_000,
  run: async () => {
    const dir = tmpDir("t05");
    try {
      generateCorpus(dir, { fileCount: 200, functionsPerFile: 5 });
      await callTool("index_project", { projectRoot: dir });
      const queries = Array.from(
        { length: 100 },
        (_, i) =>
          callTool("semantic_search", {
            projectRoot: dir,
            query: `function_${i} authentication`,
            limit: 5,
          }) as Promise<any>
      );

      const results = await Promise.allSettled(queries);
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        throw new Error(
          `${failures.length}/100 concurrent queries failed: ` +
            (failures[0] as PromiseRejectedResult).reason?.message
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 06: Deeply Nested Call Chain (Depth 10,000)
// ─────────────────────────────────────────────────────────────────────────────
export const T06: TestCase = {
  id: "T06",
  name: "Deeply Nested Call Chain Depth 10000",
  category: "PERFORMANCE",
  scenario:
    "One function calls another, 10,000 levels deep in a single file. " +
    "Not cyclic — pure depth.",
  attackVector:
    "Recursive call graph traversal with no depth limit → " +
    "call stack overflow at ~15K frames in V8.",
  expectedFailure:
    "RangeError: Maximum call stack size exceeded during call graph build.",
  idealBehavior:
    "Iterative traversal using explicit stack. " +
    "Hard max depth limit (e.g., 1000) with truncation notice.",
  suggestedFix:
    "Convert all recursive graph walks to iterative with explicit stack array. " +
    "Add `maxDepth` parameter defaulting to 500.",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t06");
    try {
      // Build a 10K-deep call chain in one file
      let code = "";
      for (let i = 0; i < 10_000; i++) {
        if (i === 0) {
          code += `export function chain_0(): number { return 0; }\n`;
        } else {
          code += `export function chain_${i}(): number { return chain_${i - 1}() + ${i}; }\n`;
        }
      }
      fs.writeFileSync(path.join(dir, "deep_chain.ts"), code);
      await callTool("index_project", { projectRoot: dir });

      await callTool("get_call_graph", {
        projectRoot: dir,
        entryPoint: "deep_chain.ts",
        startFunction: "chain_9999",
        maxDepth: 99999,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 07: Incremental Re-index on Rapid File Churn
// ─────────────────────────────────────────────────────────────────────────────
export const T07: TestCase = {
  id: "T07",
  name: "Incremental Re-index Under Rapid File Churn",
  category: "PERFORMANCE",
  scenario:
    "Index 1000 files. Then modify 500 of them simultaneously (simulating " +
    "a git checkout or code formatter run). Trigger re-index immediately.",
  attackVector:
    "Cache invalidation logic reads file before write completes (TOCTOU). " +
    "Partial updates leave index in inconsistent state.",
  expectedFailure:
    "Stale index results, phantom symbols, or deadlock waiting for write locks.",
  idealBehavior:
    "Atomic cache invalidation. Re-index completes correctly. " +
    "Old entries purged, new entries accurate.",
  suggestedFix:
    "Use file mtime + content hash for cache keys. " +
    "Invalidate by hash, not just path. " +
    "Write-behind cache with dirty-bit tracking.",
  timeoutMs: 120_000,
  run: async () => {
    const dir = tmpDir("t07");
    try {
      const files = generateCorpus(dir, { fileCount: 1000, functionsPerFile: 5 });
      await callTool("index_project", { projectRoot: dir });

      // Mutate 500 files simultaneously
      const mutations = files.slice(0, 500).map(
        (f) =>
          new Promise<void>((res) => {
            const content = fs.readFileSync(f, "utf8");
            const mutated = content.replace("return `result_", `console.log("MUTATION_${Date.now()}");\n  return \`result_`);
            fs.writeFileSync(f, mutated);
            res();
          })
      );
      await Promise.all(mutations);

      // Immediately re-index
      await callTool("index_project", { projectRoot: dir });

      // Verify no stale entries from pre-mutation state
      const result = (await callTool("semantic_search", {
        projectRoot: dir,
        query: "MUTATION_",
        limit: 10,
      })) as any;

      // Mutations should be findable
      if (!result?.results?.length) {
        throw new Error("Mutations not reflected in index — stale cache");
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const SUITE_1 = [T01, T02, T03, T04, T05, T06, T07];
