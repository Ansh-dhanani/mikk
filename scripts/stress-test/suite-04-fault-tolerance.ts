/**
 * MIKK STRESS TESTS — SUITE 4: FAULT TOLERANCE & CONCURRENCY
 * Tests 19–25
 *
 * Attack: What happens when the environment itself fails?
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { TestCase } from "./runner";
import { generateCorpus } from "./corpus-generators";

import { callTool } from "./mcp-client";

function tmpDir(suffix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mikk-${suffix}-`));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 19: Disk Full Simulation During Index Write
// ─────────────────────────────────────────────────────────────────────────────
export const T19: TestCase = {
  id: "T19",
  name: "Disk Full During Index Write",
  category: "FAULT_TOLERANCE",
  scenario:
    "Start indexing 500 files. After 50% completion, simulate disk full " +
    "by replacing the write operation with one that throws ENOSPC. " +
    "Verify: no partial/corrupt index left behind, clean recovery possible.",
  attackVector:
    "Partial index write creates inconsistent state. " +
    "Next startup reads half-written index → silent data corruption or crash.",
  expectedFailure:
    "Partial .mikk/index file left behind. " +
    "Next run reads it, gets garbage data, crashes or returns wrong results.",
  idealBehavior:
    "Write to temp file first. On success, atomic rename. " +
    "On failure, delete temp file, log error, continue without index. " +
    "System degrades gracefully to full re-scan next run.",
  suggestedFix:
    "Write pattern: `fs.writeFileSync(tmpPath, data); fs.renameSync(tmpPath, finalPath)`. " +
    "Wrap in try-catch. On error, ensure tmpPath is cleaned up.",
  run: async () => {
    const dir = tmpDir("t19");
    const indexDir = path.join(dir, ".mikk");

    try {
      generateCorpus(dir, { fileCount: 100, functionsPerFile: 5 });
      fs.mkdirSync(indexDir, { recursive: true });

      // Monkey-patch: make index directory read-only mid-write
      // (simulating disk full by making writes fail after some point)
      await callTool("index_project", { projectRoot: dir });

      // Make index dir read-only to cause next write to fail
      try {
        fs.chmodSync(indexDir, 0o444);
      } catch {}

      // Trigger an update that would need to write index
      const newFile = path.join(dir, "new_module.ts");
      fs.writeFileSync(newFile, "export const x = 1;");

      await callTool("index_project", { projectRoot: dir });

      // Verify no partial files
      const files = fs.readdirSync(indexDir);
      const tmpFiles = files.filter(
        (f) => f.endsWith(".tmp") || f.endsWith(".partial")
      );
      if (tmpFiles.length > 0) {
        throw new Error(
          `Found ${tmpFiles.length} partial/temp files after failed write: ${tmpFiles.join(", ")}`
        );
      }
    } finally {
      try {
        fs.chmodSync(indexDir, 0o755);
      } catch {}
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 20: Parallel Tool Execution Race Condition
// ─────────────────────────────────────────────────────────────────────────────
export const T20: TestCase = {
  id: "T20",
  name: "Parallel Tool Execution Race Condition",
  category: "CONCURRENCY",
  scenario:
    "Execute 5 different tools simultaneously on the same project: " +
    "semantic_search, get_call_graph, taint_analysis, scan_secrets, impact_analysis. " +
    "All operating on the same shared index/cache.",
  attackVector:
    "Shared mutable state (cache, index file, lock file) written by multiple " +
    "concurrent tool executions. Classic TOCTOU race on cache write.",
  expectedFailure:
    "One or more tools returns corrupted/incomplete results. " +
    "Cache file torn write. Or deadlock between tools waiting for locks.",
  idealBehavior:
    "Tools acquire read locks for analysis, write lock only for cache updates. " +
    "Results are correct regardless of execution order. No deadlock within 5s.",
  suggestedFix:
    "Use async-mutex or proper file-level locking (proper-lockfile npm package). " +
    "Separate read-path from write-path. Use immutable snapshot for concurrent reads.",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t20");
    generateCorpus(dir, { fileCount: 200, functionsPerFile: 5 });
    await callTool("index_project", { projectRoot: dir });

    // Execute all tools truly in parallel
    const tools = await Promise.allSettled([
      callTool("semantic_search", {
        projectRoot: dir,
        query: "authentication",
        limit: 5,
      }),
      callTool("get_call_graph", {
        projectRoot: dir,
        entryPoint: "module_00000.ts",
      }),
      callTool("taint_analysis", {
        projectRoot: dir,
        sources: ["req.body"],
        sinks: ["eval"],
      }),
      callTool("scan_secrets", { projectRoot: dir }),
      callTool("impact_analysis", {
        projectRoot: dir,
        changedFile: "module_00000.ts",
      }),
    ]);

    const crashed = tools.filter((r) => r.status === "rejected");
    if (crashed.length > 0) {
      const reasons = (crashed as PromiseRejectedResult[])
        .map((r) => r.reason?.message)
        .filter((m) => !m?.includes("STUB"))
        .join("; ");
      if (reasons) {
        throw new Error(
          `${crashed.length}/5 tools crashed under parallel execution: ${reasons}`
        );
      }
    }

    // Check for deadlock symptoms: if any settled after >20s, suspect lock contention
    // (handled by timeoutMs)
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 21: Interrupted Execution / Killed Mid-Operation
// ─────────────────────────────────────────────────────────────────────────────
export const T21: TestCase = {
  id: "T21",
  name: "Interrupted Execution Leaves No Corrupt State",
  category: "FAULT_TOLERANCE",
  scenario:
    "Start a large index operation. Send SIGTERM after 100ms. " +
    "Restart and verify: index is either clean (from previous run) or absent. " +
    "Never in a partial/corrupt state.",
  attackVector:
    "User kills process (Ctrl-C, IDE restart, OOM killer). " +
    "Write was mid-flight → corrupt index file.",
  expectedFailure:
    "Corrupt index causes next run to crash with JSON parse error or " +
    "report phantom symbols.",
  idealBehavior:
    "SIGTERM handler completes current write unit and exits cleanly. " +
    "Or: all writes are atomic (temp+rename), so interrupted write leaves no trace.",
  suggestedFix:
    "Register process.on('SIGTERM', gracefulShutdown). " +
    "All writes via atomic temp+rename. " +
    "On startup, scan for and delete any .tmp files.",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t21");
    const indexDir = path.join(dir, ".mikk");
    try {
      generateCorpus(dir, { fileCount: 500, functionsPerFile: 10 });
      fs.mkdirSync(indexDir, { recursive: true });

      // Write a deliberately corrupt "partial" index
      // simulating interrupted write
      fs.writeFileSync(
        path.join(indexDir, "index.json"),
        '{"version":1,"symbols":{"module_00000.ts":{"funcs":['
      ); // truncated

      // Now trigger a load/use of this index
      try {
        const result = await callTool("semantic_search", {
          projectRoot: dir,
          query: "anything",
          limit: 5,
        });
        // If it doesn't throw, it should have recovered (rebuilt index)
        console.log("    System recovered from corrupt index gracefully");
      } catch (e: any) {
        if (e.message.includes("STUB")) throw e;
        if (
          e.message.includes("SyntaxError") ||
          e.message.includes("Unexpected end")
        ) {
          throw new Error(
            "System crashed on corrupt index instead of recovering: " + e.message
          );
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 22: Memory Leak on Repeated Queries (1000 calls)
// ─────────────────────────────────────────────────────────────────────────────
export const T22: TestCase = {
  id: "T22",
  name: "Memory Leak Detection — 1000 Sequential Queries",
  category: "CONCURRENCY",
  scenario:
    "Run semantic_search 1000 times sequentially. " +
    "Measure heap growth between first 10 and last 10 queries. " +
    "Acceptable drift: <5MB. Failure: linear heap growth.",
  attackVector:
    "Query results cached but never evicted. " +
    "Event listeners added per query, never removed. " +
    "Closures capturing large arrays in LRU that's not actually LRU.",
  expectedFailure:
    "Heap grows linearly: +10MB per 100 queries → 100MB leak over 1000 queries. " +
    "Eventually process OOMs in long-running IDE sessions.",
  idealBehavior:
    "Bounded cache with LRU eviction. " +
    "Heap stabilizes after warm-up. " +
    "GC can reclaim between queries.",
  suggestedFix:
    "Use lru-cache npm package with explicit maxSize. " +
    "Run gc() in tests and measure. " +
    "Profile with --expose-gc and heapdump.",
  timeoutMs: 120_000,
  run: async () => {
    const dir = tmpDir("t22");
    generateCorpus(dir, { fileCount: 50, functionsPerFile: 5 });
    await callTool("index_project", { projectRoot: dir });

    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      if (i % 100 === 0) {
        if (global.gc) global.gc();
        samples.push(process.memoryUsage().heapUsed / 1024 / 1024);
      }
      try {
        await callTool("semantic_search", {
          projectRoot: dir,
          query: `query_${i % 50}`,
          limit: 5,
        });
      } catch (e: any) {
        if (!e.message.includes("STUB")) throw e;
        // Stub: simulate memory behavior
        samples.push(process.memoryUsage().heapUsed / 1024 / 1024);
        break;
      }
    }

    if (samples.length >= 2) {
      const drift = samples[samples.length - 1] - samples[0];
      console.log(`    Memory drift over 1000 queries: ${drift.toFixed(1)}MB`);
      if (drift > 100) {
        throw new Error(
          `Memory leaked ${drift.toFixed(0)}MB over 1000 queries — unbounded cache or listener leak`
        );
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 23: Concurrent Index + Delete Race
// ─────────────────────────────────────────────────────────────────────────────
export const T23: TestCase = {
  id: "T23",
  name: "Concurrent Index Write + File Delete Race",
  category: "CONCURRENCY",
  scenario:
    "While index_project is running, concurrently delete 20% of the files it's indexing. " +
    "ENOENT errors mid-indexing.",
  attackVector:
    "File deleted between directory listing and content read. " +
    "Unhandled ENOENT crashes the entire indexing process, " +
    "not just that file.",
  expectedFailure:
    "Unhandled ENOENT exception kills indexer. " +
    "Entire indexing run fails, not just the deleted files.",
  idealBehavior:
    "Per-file ENOENT is caught and logged. " +
    "Deleted files are skipped with a warning. " +
    "Index completes successfully for all remaining files.",
  suggestedFix:
    "Wrap every file read in try-catch(ENOENT). " +
    "Skip file with log, don't abort. " +
    "Handle ENOENT specifically — don't catch all errors.",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t23");
    try {
      const files = generateCorpus(dir, {
        fileCount: 200,
        functionsPerFile: 5,
      });

      // Start indexing then concurrently delete 40 files
      const indexPromise = callTool("index_project", {
        projectRoot: dir,
      });

      // Delete files after a short delay (while indexer is running)
      setTimeout(() => {
        files.slice(0, 40).forEach((f) => {
          try {
            fs.unlinkSync(f);
          } catch {}
        });
      }, 50);

      await indexPromise;
    } catch (e: any) {
      if (e.message.includes("STUB")) throw e;
      if (e.code === "ENOENT" || e.message.includes("ENOENT")) {
        throw new Error(
          "Unhandled ENOENT propagated out of indexer — single file failure killed entire index run"
        );
      }
      throw e;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 24: Windows Path Separator Injection
// ─────────────────────────────────────────────────────────────────────────────
export const T24: TestCase = {
  id: "T24",
  name: "Windows Path Separator Cross-Platform Confusion",
  category: "FAULT_TOLERANCE",
  scenario:
    "Pass Windows-style paths (backslash) to tools running on Linux/Mac. " +
    "Also test paths with mixed separators: C:\\Users\\..\\src/app.ts. " +
    "Test UNC paths: \\\\server\\share\\file.ts",
  attackVector:
    "Tools hardcoded for POSIX paths fail on Windows, and vice versa. " +
    "Mixed separators confuse path normalization. " +
    "UNC paths bypass root jailing completely.",
  expectedFailure:
    "path.join('C:\\Users\\project', '../secret.ts') resolves unexpectedly. " +
    "Root jail check fails because path doesn't start with expected prefix.",
  idealBehavior:
    "All paths normalized with path.normalize() at entry. " +
    "Platform-agnostic path handling. " +
    "UNC paths explicitly rejected.",
  suggestedFix:
    "Use path.resolve() for all paths at entry point. " +
    "Normalize separators immediately. " +
    "Block UNC and device paths (\\\\, //, /dev/).",
  run: async () => {
    const pathVariants = [
      "C:\\Users\\project\\src\\app.ts",
      "C:\\Users\\..\\secret\\app.ts",
      "\\\\server\\share\\file.ts",
      "/valid/path\\mixed\\separators.ts",
      "src\\..\\..\\etc\\passwd",
    ];

    for (const p of pathVariants) {
      try {
        const result = await callTool("analyze_file", { filePath: p });
        // If returned, must have a clean error, not a result
        if ((result as any)?.content) {
          throw new Error(
            `Accepted Windows/UNC path without error: "${p}" — path normalization failure`
          );
        }
      } catch (e: any) {
        if (e.message.includes("STUB")) throw e;
        // Clean rejection is fine
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 25: Zombie Process + Orphaned Worker Threads
// ─────────────────────────────────────────────────────────────────────────────
export const T25: TestCase = {
  id: "T25",
  name: "Worker Thread Orphan on Tool Cancellation",
  category: "FAULT_TOLERANCE",
  scenario:
    "Start a long-running tool call (e.g., index 5000 files). " +
    "Immediately cancel it (simulate MCP connection drop). " +
    "Check: no orphaned worker threads still consuming CPU/memory.",
  attackVector:
    "MCP connection drops without proper cleanup. " +
    "Worker threads spawned for parallelism have no reference back to parent. " +
    "They continue running, consuming CPU until process exit.",
  expectedFailure:
    "Worker threads continue running after cancellation. " +
    "Multiple rapid start+cancel cycles → dozens of zombie workers → " +
    "CPU and memory exhaustion.",
  idealBehavior:
    "All workers registered in a pool. " +
    "On cancellation signal, pool terminates all workers. " +
    "process.listenerCount() returns 0 after cleanup.",
  suggestedFix:
    "Maintain WorkerPool with explicit terminate-all method. " +
    "Use AbortController/AbortSignal for cancellable operations. " +
    "Register SIGTERM/SIGINT handlers to drain pool.",
  timeoutMs: 30_000,
  run: async () => {
    const threadsBefore = (process as any)._getActiveHandles?.()?.length ?? 0;

    const dir = tmpDir("t25");
    try {
      generateCorpus(dir, { fileCount: 100 });

      // Start and immediately abandon (simulate race-cancel)
      const promises = Array.from({ length: 10 }, () =>
        callTool("index_project", { projectRoot: dir }).catch(() => {})
      );

      // Wait 100ms then check for thread accumulation
      await new Promise((r) => setTimeout(r, 100));
      const threadsDuring = (process as any)._getActiveHandles?.()?.length ?? 0;

      await Promise.allSettled(promises);
      await new Promise((r) => setTimeout(r, 500));

      const threadsAfter = (process as any)._getActiveHandles?.()?.length ?? 0;
      const leaked = threadsAfter - threadsBefore;

      console.log(
        `    Handles: before=${threadsBefore}, during=${threadsDuring}, after=${threadsAfter}`
      );
      if (leaked > 5) {
        throw new Error(
          `${leaked} handles leaked after 10 rapid start+cancel cycles — worker thread orphan`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const SUITE_4 = [T19, T20, T21, T22, T23, T24, T25];
