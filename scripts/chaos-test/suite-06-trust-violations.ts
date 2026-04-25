/**
 * MIKK CHAOS TESTS — SUITE 6: TRUST VIOLATIONS & NON-DETERMINISM
 * Tests T31–T40
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CORE QUESTION: When does MIKK give confidently WRONG, INCONSISTENT,
 * or MISLEADING results?
 *
 * Every test here escalated from a passing stress-test scenario.
 * Where stress-tests confirmed "it works under load",
 * these tests ask "does it work CORRECTLY and CONSISTENTLY?"
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ChaosTestCase, assertConsistent, assertNotStale, reportIssue, tmpDir } from "./chaos-runner";
import {
  generateMisleadingCorpus,
  generateDuplicateSymbolCorpus,
  generateHomographCorpus,
  generateTombstoneCorpus,
  generateTwoProjectCorpus,
} from "./corpus-chaos";

// Reuse MCP client from stress-test
import { callTool } from "../stress-test/mcp-client";

// ─────────────────────────────────────────────────────────────────────────────
// T31: Search Non-Determinism — Same Query, Different Results
// Evolution: T05 showed concurrent queries survive. T31 asks: are results stable?
// ─────────────────────────────────────────────────────────────────────────────
export const T31: ChaosTestCase = {
  id: "T31",
  name: "Search Non-Determinism — Same Query, 20 Sequential Runs",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T05 confirmed 100 concurrent queries complete without crash. " +
    "T31 escalates: does the SAME query return IDENTICAL results across 20 runs? " +
    "A system that gives different answers to the same question is untrustworthy.",
  failureTypes: ["NON-DETERMINISM"],
  severity: "CRITICAL",
  timeoutMs: 120_000,
  run: async () => {
    const dir = tmpDir("t31");
    try {
      // Corpus with well-defined semantic content
      for (let i = 0; i < 30; i++) {
        fs.writeFileSync(
          path.join(dir, `module_${i}.ts`),
          `export function ${i < 10 ? "authenticateUser" : "processPayment"}_${i}(token: string): boolean {
  return token.length > 0;
}\n`
        );
      }
      await callTool("index_project", { projectRoot: dir });

      const query = "authenticate user token validation";
      const runs: any[] = [];

      for (let i = 0; i < 20; i++) {
        const result = await callTool("semantic_search", {
          projectRoot: dir,
          query,
          limit: 5,
        }) as any;
        runs.push(result);
      }

      // Extract top function names from each run
      assertConsistent("semantic_search", runs, (r) =>
        (r?.results ?? []).slice(0, 3).map((x: any) => x.name ?? x.id ?? "")
      );

      // Also check: are score deltas reasonable? (scores shouldn't vary > 0.05)
      const scores = runs.map((r) =>
        (r?.results ?? []).slice(0, 1).map((x: any) => x.score ?? x.similarity ?? 0)
      );
      const allScores = scores.flat().filter((s) => typeof s === "number");
      if (allScores.length >= 2) {
        const maxScore = Math.max(...allScores);
        const minScore = Math.min(...allScores);
        if (maxScore - minScore > 0.1) {
          reportIssue({
            id: "T31-A",
            name: "Confidence Score Drift Across Identical Queries",
            evolutionPath: "Same query across 20 runs — top result scores vary",
            commandsUsed: [`mikk_semantic_search query="${query}" topK=5 (×20)`],
            input: `Query: "${query}", 20 sequential runs`,
            observedOutput: `Score range: ${minScore.toFixed(3)} – ${maxScore.toFixed(3)} (delta: ${(maxScore - minScore).toFixed(3)})`,
            expectedOutput: "Scores identical or within ±0.01 across runs",
            failureType: "NON-DETERMINISM",
            whyDangerous:
              "Confidence scores that drift mean the user cannot trust 'high confidence' results. " +
              "An LLM using this data will make different architectural decisions on different invocations.",
            reproducibility: "intermittent",
            severity: "HIGH",
            rootCauseHypothesis:
              "Embedding normalization uses floating-point operations with non-deterministic rounding, " +
              "or the vector store uses approximate nearest neighbor with random tiebreaking.",
            suggestedFix:
              "Seed any randomness in ANN search. Use deterministic tiebreaking (sort by id when scores tie). " +
              "Normalize scores to 3 decimal places.",
          });
          throw new Error(
            `NON-DETERMINISM: confidence scores vary ${(maxScore - minScore).toFixed(3)} across 20 identical queries`
          );
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T32: Stale Cache — Results Survive Code Deletion
// Evolution: T07 tested stale cache on mutation. T32 tests DELETION — the harder case.
// ─────────────────────────────────────────────────────────────────────────────
export const T32: ChaosTestCase = {
  id: "T32",
  name: "Stale Cache — Deleted File's Symbols Survive in Search Index",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T07 found that mutations ARE reflected after re-index. " +
    "T32 escalates: what happens when we DELETE a file and search WITHOUT re-indexing? " +
    "The system should either serve cached results OR clearly warn — never silently lie.",
  failureTypes: ["STALE_CACHE", "MISLEADING_SUCCESS"],
  severity: "HIGH",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t32");
    try {
      const { sentinel } = generateTombstoneCorpus(dir);
      await callTool("index_project", { projectRoot: dir });

      // Verify sentinel is findable
      const beforeDelete = await callTool("semantic_search", {
        projectRoot: dir,
        query: "SENTINEL_XYZ_12345 sentinelFunction",
        limit: 5,
      }) as any;

      const beforeResults = beforeDelete?.results ?? [];
      const foundBefore = beforeResults.some(
        (r: any) => r.file?.includes("sentinel") || r.name?.includes("sentinel")
      );

      // Delete the sentinel file
      fs.unlinkSync(sentinel);

      // Search WITHOUT re-indexing — what does the system return?
      const afterDelete = await callTool("semantic_search", {
        projectRoot: dir,
        query: "SENTINEL_XYZ_12345 sentinelFunction",
        limit: 5,
      }) as any;

      const afterResults = afterDelete?.results ?? [];
      const foundAfter = afterResults.some(
        (r: any) => r.file?.includes("sentinel") || r.name?.includes("sentinel")
      );

      if (foundBefore && foundAfter) {
        // Check if there's any indication the result is stale
        const hasStaleWarning = afterDelete?.metadata?.stale === true ||
          afterDelete?.metadata?.warning?.includes("stale") ||
          afterDelete?.mode?.includes("stale");

        if (!hasStaleWarning) {
          reportIssue({
            id: "T32-A",
            name: "Deleted File Symbols Served Without Staleness Warning",
            evolutionPath: "Delete sentinel file, search returns it without any staleness warning",
            commandsUsed: [
              "generateTombstoneCorpus(dir)",
              "mikk_index_project projectRoot=dir",
              "fs.unlinkSync(sentinel)",
              "mikk_semantic_search query='SENTINEL_XYZ_12345'",
            ],
            input: "File deleted from disk; search query targeting deleted file's unique symbol",
            observedOutput:
              `Results still include sentinel_auth_module.ts without any stale/warning metadata. ` +
              `metadata = ${afterDelete?.metadata ? JSON.stringify(afterDelete.metadata).slice(0, 100) : "undefined"}`,
            expectedOutput:
              "Either (a) empty results after deletion, or " +
              "(b) stale results clearly marked with metadata.stale=true and a re-index hint",
            failureType: "STALE_CACHE",
            whyDangerous:
              "An LLM using MIKK gets confidently pointed to a deleted function. " +
              "It tries to call/edit it. Runtime error. Developer trust destroyed. " +
              "In a CI pipeline, this silently passes analysis while the code is gone.",
            reproducibility: "always",
            severity: "HIGH",
            rootCauseHypothesis:
              "The search index is a write-through cache keyed by file path and mtime. " +
              "Deletion is not an mtime change — it's an inode disappearance. " +
              "The cache key still exists; file existence is never rechecked at query time.",
            suggestedFix:
              "At query time, verify that result files still exist on disk. " +
              "If file is gone, mark result as stale in metadata and optionally trigger background re-index. " +
              "Add 'ghost detection' pass: files in index but not on disk → tombstone them.",
          });
          throw new Error(
            "STALE_CACHE: deleted file's symbols returned without staleness warning"
          );
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T33: Semantic vs BM25 vs Hybrid — Contradictory Relevance Rankings
// Evolution: From T05's multi-mode queries. Now we COMPARE modes for consistency.
// ─────────────────────────────────────────────────────────────────────────────
export const T33: ChaosTestCase = {
  id: "T33",
  name: "Search Mode Contradiction — Semantic vs BM25 vs Hybrid Diverge",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T05 ran 100 concurrent queries without checking consistency between modes. " +
    "T33 asks: if semantic says 'func_A is most relevant' and BM25 says 'func_B is most relevant', " +
    "which should the user trust? And does the system tell them?",
  failureTypes: ["MISLEADING_SUCCESS", "NON-DETERMINISM"],
  severity: "MEDIUM",
  timeoutMs: 90_000,
  run: async () => {
    const dir = tmpDir("t33");
    try {
      // Corpus where BM25 (keyword) and semantic meaning diverge:
      // func with perfect keyword match but semantically unrelated
      fs.writeFileSync(
        path.join(dir, "keyword_match.ts"),
        `
// This file has ALL the keywords but does nothing useful
export function authenticate_validate_token_session_user(x: string): string {
  // authenticate validate token session user — keyword stuffed
  return x;
}
`
      );

      // Semantic match: correct behavior, no keyword match
      fs.writeFileSync(
        path.join(dir, "semantic_match.ts"),
        `
import * as jwt from 'jsonwebtoken';
export function verifyAccess(credential: string, secret: string): boolean {
  try {
    const payload = jwt.verify(credential, secret);
    return !!payload;
  } catch {
    return false;
  }
}
`
      );

      await callTool("index_project", { projectRoot: dir });

      const query = "authenticate user token";
      const [semanticResult, bm25Result] = await Promise.all([
        callTool("semantic_search", { projectRoot: dir, query, limit: 3 }) as Promise<any>,
        callTool("search_functions", { projectRoot: dir, query, limit: 3 }) as Promise<any>,
      ]);

      const semanticTop = (semanticResult?.results ?? [])[0]?.name ?? "";
      const bm25Top = (bm25Result?.results ?? (bm25Result?.functions ?? []))[0]?.name ?? "";

      if (semanticTop && bm25Top && semanticTop !== bm25Top) {
        const hasModeDisclosure =
          semanticResult?.metadata?.mode || bm25Result?.metadata?.mode;

        if (!hasModeDisclosure) {
          reportIssue({
            id: "T33-A",
            name: "Contradictory Rankings Across Search Modes Without Disclosure",
            evolutionPath:
              "Built corpus with deliberate keyword/semantic mismatch, ran both search modes",
            commandsUsed: [
              `mikk_semantic_search query="${query}" topK=3`,
              `mikk_search_functions query="${query}" limit=3`,
            ],
            input: `Query: "${query}" against corpus with keyword-stuffed vs semantically correct functions`,
            observedOutput:
              `Semantic top: "${semanticTop}" | BM25 top: "${bm25Top}" | ` +
              `Neither result includes mode metadata to tell user which to trust`,
            expectedOutput:
              "Each result clearly discloses its mode (semantic/bm25/hybrid) and confidence. " +
              "When modes contradict, a 'conflicting signals' warning should be surfaced.",
            failureType: "MISLEADING_SUCCESS",
            whyDangerous:
              "An LLM gets two different 'best matches' from two tools and doesn't know which to use. " +
              "It picks one arbitrarily. The wrong pick leads to editing the wrong function. " +
              "The correct function remains vulnerable.",
            reproducibility: "always",
            severity: "MEDIUM",
            rootCauseHypothesis:
              "Search modes are independent pipelines with no cross-validation. " +
              "Neither mode knows the other exists, so neither can warn of contradictions.",
            suggestedFix:
              "In hybrid mode, always include both semantic and bm25 scores in metadata. " +
              "When top results diverge between modes, include a 'low_consensus' flag. " +
              "Response: { results, metadata: { mode, semantic_top, bm25_top, consensus: 'low' } }",
          });
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T34: Cross-Project State Bleed — Project B Results in Project A Query
// Evolution: New failure class. No stress test covered this.
// ─────────────────────────────────────────────────────────────────────────────
export const T34: ChaosTestCase = {
  id: "T34",
  name: "Cross-Project State Bleed — Project B Symbols Appear in Project A Query",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "All stress tests used a single project. T34 is the first multi-project test. " +
    "Real-world: a developer switches between projects in the same IDE session. " +
    "If the MCP server shares index state across projects, results bleed.",
  failureTypes: ["TRUST_VIOLATION", "STALE_CACHE"],
  severity: "CRITICAL",
  timeoutMs: 120_000,
  run: async () => {
    const dirA = tmpDir("t34-alpha");
    const dirB = tmpDir("t34-beta");
    try {
      generateTwoProjectCorpus(dirA, dirB);

      // Index Project A
      await callTool("index_project", { projectRoot: dirA });

      // Index Project B
      await callTool("index_project", { projectRoot: dirB });

      // Query Project A for A-specific symbol
      const resultA = await callTool("semantic_search", {
        projectRoot: dirA,
        query: "PROJECT_ALPHA loginUser verifySession",
        limit: 5,
      }) as any;

      // Query Project A for B-specific symbol (should return nothing)
      const resultAforB = await callTool("semantic_search", {
        projectRoot: dirA,
        query: "PROJECT_BETA processPayment refundTransaction",
        limit: 5,
      }) as any;

      const aBleeds = (resultAforB?.results ?? []).some(
        (r: any) =>
          r.file?.includes(dirB) ||
          r.name?.includes("processPayment") ||
          r.name?.includes("refundTransaction") ||
          JSON.stringify(r).includes("PROJECT_BETA")
      );

      if (aBleeds) {
        reportIssue({
          id: "T34-A",
          name: "Project B Symbols Leaked into Project A Search Results",
          evolutionPath:
            "Index project A, then project B. Query project A for B-specific symbols.",
          commandsUsed: [
            `mikk_index_project projectRoot=${dirA}`,
            `mikk_index_project projectRoot=${dirB}`,
            `mikk_semantic_search projectRoot=${dirA} query="PROJECT_BETA processPayment"`,
          ],
          input: `Two separate projects indexed. Query project A with project B's unique symbols.`,
          observedOutput: `Results from project B (${dirB}) appear in project A (${dirA}) query`,
          expectedOutput:
            "Project A query returns 0 results for B-exclusive symbols. " +
            "Index is strictly scoped to projectRoot parameter.",
          failureType: "TRUST_VIOLATION",
          whyDangerous:
            "Developer working on auth service gets results from payment service in their IDE. " +
            "They see 'processPayment' as relevant to auth work — completely wrong context. " +
            "In the worst case, they refactor the wrong codebase thinking it's their own.",
          reproducibility: "always",
          severity: "CRITICAL",
          rootCauseHypothesis:
            "The index/embedding cache uses content-based keys (function hash) without project-root scoping. " +
            "Two projects with similar code share cache entries. Or: the MCP server holds a global index " +
            "and projectRoot is only used for initial indexing, not filtering at query time.",
          suggestedFix:
            "Scope ALL cache keys as `{projectRoot}:{contentHash}`. " +
            "Filter search results by `file.startsWith(resolvedProjectRoot)` before returning. " +
            "Never share embedding vectors across project roots.",
        });
        throw new Error("TRUST_VIOLATION: project state bleed confirmed — B symbols in A results");
      }
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T35: Misleading Success — Duplicate Symbol Disambiguation Failure
// Evolution: T12 tested bad args. T35 tests: correct args, wrong answer (silent).
// ─────────────────────────────────────────────────────────────────────────────
export const T35: ChaosTestCase = {
  id: "T35",
  name: "Duplicate Symbol Disambiguation — 100 files, same function name",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T12 tested malformed inputs. T35 creates a valid codebase where 100 files " +
    "all export a function named `processRequest`. " +
    "The system must disambiguate — if it silently returns only one, " +
    "the developer has an incomplete picture.",
  failureTypes: ["PARTIAL_RESULT", "MISLEADING_SUCCESS"],
  severity: "HIGH",
  timeoutMs: 90_000,
  run: async () => {
    const dir = tmpDir("t35");
    try {
      generateDuplicateSymbolCorpus(dir, 100);
      await callTool("index_project", { projectRoot: dir });

      const result = await callTool("search_functions", {
        projectRoot: dir,
        query: "processRequest",
        limit: 20,
      }) as any;

      const results = result?.results ?? result?.functions ?? [];
      const count = results.length;

      if (count === 0) {
        throw new Error(
          "MISLEADING_SUCCESS: 100 files with processRequest, search returned 0 results"
        );
      }

      if (count < 5) {
        reportIssue({
          id: "T35-A",
          name: "Duplicate Symbol Search Returns Dangerously Few Results",
          evolutionPath: "100 files each export processRequest. Search returns <5.",
          commandsUsed: [
            "generateDuplicateSymbolCorpus(dir, 100)",
            "mikk_index_project",
            "mikk_search_functions query='processRequest' limit=20",
          ],
          input: "Query: 'processRequest' | 100 matching symbols across 100 files",
          observedOutput: `Only ${count} results returned out of 100 matching symbols`,
          expectedOutput:
            "At minimum 20 results (the requested limit), with a totalCount field showing 100. " +
            "Or: a disambiguation warning that multiple definitions exist.",
          failureType: "PARTIAL_RESULT",
          whyDangerous:
            "Developer searching for processRequest sees only 3 results. " +
            "Thinks those are the only implementations. " +
            "Misses 97 services that also implement this interface. " +
            "Refactors the wrong contract. Breaks all hidden implementations silently.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "BM25 deduplicates on function name — returns only one entry per unique name. " +
            "Or: semantic search collapses identical-named symbols to a single embedding centroid. " +
            "File-level disambiguation is lost.",
          suggestedFix:
            "Search results must be scoped by (fileName, functionName) not just functionName. " +
            "Add result count: 'Showing X of Y matches'. " +
            "Add disambiguation note when >1 definition exists for same name.",
        });
        throw new Error(
          `PARTIAL_RESULT: 100 processRequest symbols, only ${count} returned — silent truncation`
        );
      }

      // Also check: if we get results, do they have different files?
      const files = new Set(results.map((r: any) => r.file ?? ""));
      if (files.size < Math.min(count, 5)) {
        throw new Error(
          `MISLEADING_SUCCESS: ${count} results but only ${files.size} distinct files — deduplication collapse`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T36: Read-Your-Writes Consistency
// Evolution: T07 tested re-index reflects mutations. T36 tests: NO re-index, immediate read.
// ─────────────────────────────────────────────────────────────────────────────
export const T36: ChaosTestCase = {
  id: "T36",
  name: "Read-Your-Writes — New Symbol Not Visible Without Re-Index",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T07 showed mutations ARE visible after explicit re-index. " +
    "T36 asks: after writing a new function, is the user told they must re-index? " +
    "Or does the system silently return stale results, making the user think their new code doesn't exist?",
  failureTypes: ["STALE_CACHE", "MISLEADING_SUCCESS"],
  severity: "MEDIUM",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t36");
    try {
      // Index initial codebase
      fs.writeFileSync(
        path.join(dir, "existing.ts"),
        "export function existingFunc() { return 1; }\n"
      );
      await callTool("index_project", { projectRoot: dir });

      // Write a brand new file (NOT re-indexing)
      const uniqueName = `newFunc_${Date.now()}`;
      fs.writeFileSync(
        path.join(dir, "new_addition.ts"),
        `export function ${uniqueName}() { return "brand_new"; }\n`
      );

      // Search for the new function immediately (without re-index)
      const result = await callTool("semantic_search", {
        projectRoot: dir,
        query: uniqueName,
        limit: 5,
      }) as any;

      const found = (result?.results ?? []).some(
        (r: any) => r.name?.includes(uniqueName) || r.file?.includes("new_addition")
      );

      if (!found) {
        // This is expected — BUT: does the system indicate that its index may be stale?
        const hasFreshnessWarning =
          result?.metadata?.indexAge !== undefined ||
          result?.metadata?.fresh === false ||
          result?.metadata?.lastIndexed !== undefined;

        if (!hasFreshnessWarning) {
          reportIssue({
            id: "T36-A",
            name: "Missing Index Freshness Metadata on Search Results",
            evolutionPath:
              "New file added, search before re-index, no staleness indication in response",
            commandsUsed: [
              "mikk_index_project (initial)",
              "fs.writeFileSync (new file added)",
              `mikk_semantic_search query="${uniqueName}"`,
            ],
            input: `New file added post-index. Search for ${uniqueName} without re-indexing.`,
            observedOutput:
              "0 results. No metadata.indexAge or metadata.lastIndexed in response. " +
              `metadata = ${result?.metadata ? JSON.stringify(result.metadata).slice(0, 150) : "undefined"}`,
            expectedOutput:
              "0 results WITH metadata: { lastIndexed: <timestamp>, filesChangedSinceIndex: 1, " +
              "hint: 'Run mikk_index_project to pick up new files' }",
            failureType: "MISLEADING_SUCCESS",
            whyDangerous:
              "Developer adds a new utility function. Searches for it to verify it's indexed. " +
              "Gets 0 results. Thinks their code has a bug or wrong function name. " +
              "Spends 30 minutes debugging their own correctly-written function " +
              "because MIKK silently lied about its knowledge freshness.",
            reproducibility: "always",
            severity: "MEDIUM",
            rootCauseHypothesis:
              "Response schema doesn't include index metadata. " +
              "The server has no mechanism to detect files modified after last index.",
            suggestedFix:
              "Include in every response: { metadata: { lastIndexed: ISO8601, " +
              "modifiedFilesSinceIndex: number } }. " +
              "Use a lightweight file watcher (chokidar) to track dirty files between index runs.",
          });
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T37: Impact Analysis Blind Spot — Rename + Impact = Wrong Blast Radius
// Evolution: T28 tested rename missed string refs. T37 chains rename → impact.
// ─────────────────────────────────────────────────────────────────────────────
export const T37: ChaosTestCase = {
  id: "T37",
  name: "Post-Rename Impact Analysis — Stale Call Graph Reports Wrong Callers",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T28 found rename misses string references. " +
    "T37 escalates: after a rename, does impact_analysis correctly report " +
    "callers of the NEW name or the OLD name? " +
    "If it uses a stale call graph, the blast radius is WRONG — missing real callers.",
  failureTypes: ["STALE_CACHE", "PARTIAL_RESULT"],
  severity: "HIGH",
  timeoutMs: 90_000,
  run: async () => {
    const dir = tmpDir("t37");
    try {
      // Original code
      fs.writeFileSync(
        path.join(dir, "service.ts"),
        `
export function getUser(id: string) { return { id }; }
export function caller1() { return getUser('1'); }
export function caller2() { return getUser('2'); }
export function caller3() { return getUser('3'); }
`
      );
      await callTool("index_project", { projectRoot: dir });

      // Get baseline impact
      const beforeRename = await callTool("impact_analysis", {
        projectRoot: dir,
        changedFile: "service.ts",
      }) as any;

      // Perform rename: getUser → fetchUser
      const code = fs.readFileSync(path.join(dir, "service.ts"), "utf8");
      fs.writeFileSync(
        path.join(dir, "service.ts"),
        code
          .replace(/function getUser/g, "function fetchUser")
          .replace(/getUser\(/g, "fetchUser(")
      );

      // Get impact WITHOUT re-indexing
      const afterRename = await callTool("impact_analysis", {
        projectRoot: dir,
        changedFile: "service.ts",
      }) as any;

      const beforeFiles = (beforeRename?.affectedFiles ?? []).length;
      const afterFiles = (afterRename?.affectedFiles ?? []).length;

      // After rename, callers still exist but impact_analysis may report fewer
      // because it's using the stale index where functions had the old name
      if (afterFiles < beforeFiles) {
        reportIssue({
          id: "T37-A",
          name: "Post-Rename Impact Analysis Shrinks — Stale Call Graph",
          evolutionPath: "getUser renamed to fetchUser. impact_analysis reports fewer callers afterward.",
          commandsUsed: [
            "mikk_index_project (initial)",
            "fs.writeFileSync (rename getUser→fetchUser in code)",
            "mikk_impact_analysis changedFile=service.ts (post-rename, no re-index)",
          ],
          input: "Rename getUser→fetchUser in source. Run impact_analysis without re-indexing.",
          observedOutput:
            `Before rename: ${beforeFiles} affected files. ` +
            `After rename (no re-index): ${afterFiles} affected files. ` +
            `Impact SHRANK — stale graph missed callers of new name.`,
          expectedOutput:
            "Impact analysis should either (a) return same count (using live parse), " +
            "or (b) clearly mark results as 'based on index from <timestamp>' " +
            "with a re-index recommendation.",
          failureType: "STALE_CACHE",
          whyDangerous:
            "Developer renames a function and immediately checks impact. " +
            "Gets a SMALLER blast radius than before. Feels safe. " +
            "Actually 3 callers are now broken (calling the old name). " +
            "They ship a production crash because MIKK gave them false confidence.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "Impact analysis uses the stored call graph from the last index run. " +
            "After rename, the call graph entries for the new name don't exist yet. " +
            "Old entries (for getUser) are gone from the source but still in the index. " +
            "Result: empty intersection = artificially low impact.",
          suggestedFix:
            "Impact analysis should trigger a lightweight re-parse of the changed file " +
            "before running graph traversal. " +
            "OR: include index_age in impact result metadata and warn if >0 files have changed since.",
        });
        throw new Error(
          `STALE_CACHE: impact analysis post-rename shows ${afterFiles} vs ${beforeFiles} — call graph stale`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T38: Unicode Homograph — System Conflates аuth (Cyrillic) With auth (Latin)
// Evolution: T11 tested encoding issues. T38 escalates to semantic identity attack.
// ─────────────────────────────────────────────────────────────────────────────
export const T38: ChaosTestCase = {
  id: "T38",
  name: "Unicode Homograph — Cyrillic аuth Conflated With Latin auth",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T11 confirmed encoding edge cases are handled without crash. " +
    "T38 escalates to a TRUST question: if а (U+0430 Cyrillic) and a (U+0061 Latin) " +
    "look identical in most fonts, does MIKK distinguish them? " +
    "If not, a trojan function is invisible in search results.",
  failureTypes: ["TRUST_VIOLATION", "MISLEADING_SUCCESS"],
  severity: "CRITICAL",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t38");
    try {
      generateHomographCorpus(dir);
      await callTool("index_project", { projectRoot: dir });

      // Search for "auth" — should find ONLY the Latin version
      const result = await callTool("search_functions", {
        projectRoot: dir,
        query: "auth",
        limit: 10,
      }) as any;

      const results = result?.results ?? result?.functions ?? [];

      // Check if Cyrillic homograph appears in results
      const cyrillicAuth = "аuth"; // U+0430
      const cyrillicFound = results.some(
        (r: any) => r.name === cyrillicAuth || r.file?.includes("cyrillic")
      );
      const latinFound = results.some(
        (r: any) => r.name === "auth" || r.file?.includes("latin")
      );

      if (cyrillicFound && latinFound) {
        // Both found — but are they differentiated?
        const cyrillicEntry = results.find(
          (r: any) => r.name === cyrillicAuth || r.file?.includes("cyrillic")
        );
        const hasHomographWarning =
          cyrillicEntry?.warnings?.includes("homograph") ||
          cyrillicEntry?.suspicious === true ||
          cyrillicEntry?.encoding?.includes("non-ascii");

        if (!hasHomographWarning) {
          reportIssue({
            id: "T38-A",
            name: "Cyrillic Homograph Returns Without Security Warning",
            evolutionPath:
              "Corpus has аuth (Cyrillic) alongside auth (Latin). " +
              "Search returns both but Cyrillic entry has no security annotation.",
            commandsUsed: [
              "generateHomographCorpus(dir)",
              "mikk_index_project",
              "mikk_search_functions query='auth'",
            ],
            input: "Search for 'auth'. Corpus has аuth (U+0430, Cyrillic a) disguised as auth.",
            observedOutput:
              `Results include Cyrillic homograph at ${cyrillicEntry?.file ?? "auth_cyrillic.ts"} ` +
              `without any suspicious/homograph warning. Entry: ${JSON.stringify(cyrillicEntry).slice(0, 150)}`,
            expectedOutput:
              "Cyrillic homograph entry should be flagged: " +
              "{ warnings: ['non-ascii-identifier', 'possible-homograph'], suspicious: true }",
            failureType: "TRUST_VIOLATION",
            whyDangerous:
              "A supply-chain attacker replaces a legitimate function with a homograph version. " +
              "Developer searches for 'auth', gets both results, both look identical in most fonts. " +
              "They assume both are legitimate. The malicious one steals auth tokens to an external server. " +
              "MIKK had the data to warn about this but didn't.",
            reproducibility: "always",
            severity: "CRITICAL",
            rootCauseHypothesis:
              "Function names are indexed as raw Unicode strings without bidirectional " +
              "or homograph normalization. The search pipeline has no security annotation layer.",
            suggestedFix:
              "On indexing, flag any identifier containing non-ASCII characters in the Basic Latin range. " +
              "Apply Unicode confusable detection (ICU confusables table or Homoglyph library). " +
              "Add warnings: ['non-ascii-identifier'] to any such symbol's index entry.",
          });
          throw new Error(
            "TRUST_VIOLATION: Cyrillic homograph 'аuth' returned in 'auth' search without security warning"
          );
        }
      }

      // Worst case: both Cyrillic and Latin map to same index entry
      if (!latinFound && !cyrillicFound) {
        reportIssue({
          id: "T38-B",
          name: "Both auth Variants Lost — Unicode Normalization Collapse",
          evolutionPath:
            "Unicode normalization collapsed both аuth and auth to the same token, " +
            "making one or both invisible.",
          commandsUsed: ["mikk_search_functions query='auth'"],
          input: "Corpus has both auth (Latin) and аuth (Cyrillic). Neither found.",
          observedOutput: "0 results for 'auth' query despite two matching functions",
          expectedOutput: "At minimum the Latin 'auth' function found",
          failureType: "MISLEADING_SUCCESS",
          whyDangerous:
            "Legitimate auth function invisible in search. Developer can't find their own code.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "NFC/NFKC normalization collapses Cyrillic-a and Latin-a to same code point during indexing. " +
            "Then both become 'uth' or similar.",
          suggestedFix:
            "Index raw Unicode bytes for identifiers, not normalized forms. " +
            "Search in normalized space but store in original.",
        });
        throw new Error(
          "MISLEADING_SUCCESS: both auth variants collapsed — Unicode normalization broke search"
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T39: Dynamic Dispatch Completeness Disclosure
// Evolution: T18 tested taint via dynamic access. T39 asks: does the tool ADMIT
//            its analysis is incomplete on dynamic code, or does it silently skip?
// ─────────────────────────────────────────────────────────────────────────────
export const T39: ChaosTestCase = {
  id: "T39",
  name: "Dynamic Dispatch Completeness — Does Tool Admit It Can't See Everything?",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T18 found taint via dynamic property access is missed. " +
    "T39 generalizes: for ANY dynamic pattern (eval, require(), bracket dispatch, callbacks), " +
    "does the tool return a partial result WITH a completeness warning, " +
    "or does it silently return a 'clean' result implying complete analysis?",
  failureTypes: ["MISLEADING_SUCCESS", "PARTIAL_RESULT"],
  severity: "HIGH",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t39");
    try {
      const { generateDynamicDispatchCorpus } = await import("./corpus-chaos");
      generateDynamicDispatchCorpus(dir);
      await callTool("index_project", { projectRoot: dir });

      const callGraphResult = await callTool("get_call_graph", {
        projectRoot: dir,
        entryPoint: "dynamic_dispatch.ts",
        startFunction: "dispatch",
      }) as any;

      const taintResult = await callTool("taint_analysis", {
        projectRoot: dir,
        sources: ["eval"],
        sinks: ["evalDispatch"],
      }) as any;

      // Check: does call graph warn about dynamic dispatch limitation?
      const hasCallGraphWarning =
        callGraphResult?.warnings?.some((w: string) => /dynamic|incomplete|eval|runtime/i.test(w)) ||
        callGraphResult?.metadata?.complete === false ||
        callGraphResult?.metadata?.dynamicCallsDetected === true;

      if (!hasCallGraphWarning) {
        reportIssue({
          id: "T39-A",
          name: "Call Graph Reports Complete Analysis on Dynamic Dispatch Code",
          evolutionPath:
            "Code uses eval(), dynamic require(), bracket dispatch, runtime callbacks. " +
            "Call graph returns result without incompleteness warning.",
          commandsUsed: [
            "generateDynamicDispatchCorpus(dir)",
            "mikk_get_call_graph startFunction=dispatch",
          ],
          input:
            "Function `dispatch` uses handlers[action]?.(data) — runtime-only dispatch. " +
            "Function `evalDispatch` uses eval(code). " +
            "Static analysis CANNOT determine call targets.",
          observedOutput:
            `Call graph returned without warnings. ` +
            `metadata.complete = ${callGraphResult?.metadata?.complete}, ` +
            `warnings = ${JSON.stringify(callGraphResult?.warnings)}`,
          expectedOutput:
            "{ nodes, edges, metadata: { complete: false, dynamicCallsDetected: true, " +
            "warnings: ['dynamic-dispatch-at:dispatch/L4', 'eval-call-at:evalDispatch/L7'] } }",
          failureType: "MISLEADING_SUCCESS",
          whyDangerous:
            "Developer runs impact analysis before deleting `handleCreate` handler. " +
            "MIKK says 0 callers. Deletes it. Breaks production for all POST /create requests. " +
            "The dynamic dispatch was invisible but real. MIKK gave false confidence of completeness.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "The call graph builder resolves only statically determinable calls. " +
            "It has no mechanism to detect patterns it CANNOT resolve and annotate them. " +
            "Silence is treated as completeness.",
          suggestedFix:
            "Detect patterns that defeat static analysis: eval(), Function(), bracket-access calls, " +
            "require(variable), dynamic import(expr). " +
            "For each, add to warnings array and set metadata.complete = false. " +
            "This is honest uncertainty, which is far more trustworthy than false certainty.",
        });
        throw new Error(
          "MISLEADING_SUCCESS: call graph on dynamic dispatch code returned without incompleteness warning"
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T40: Escalating Rename Chain — 5 Sequential Renames, Final State Must Be Correct
// Evolution: T37 tested rename + impact (one rename). T40 chains 5 renames.
// ─────────────────────────────────────────────────────────────────────────────
export const T40: ChaosTestCase = {
  id: "T40",
  name: "5-Rename Chain — Each Rename Uses Previous as Input",
  category: "TRUST_VIOLATION",
  evolutionPath:
    "T28 found rename misses string references. T37 found post-rename impact is stale. " +
    "T40 chains 5 sequential renames: A→B→C→D→E→F. " +
    "After all 5, can the system find function F? " +
    "Can it trace the full rename history?",
  failureTypes: ["STALE_CACHE", "DATA_LOSS"],
  severity: "HIGH",
  timeoutMs: 90_000,
  run: async () => {
    const dir = tmpDir("t40");
    try {
      const names = ["funcAlpha", "funcBeta", "funcGamma", "funcDelta", "funcEpsilon", "funcZeta"];

      fs.writeFileSync(
        path.join(dir, "service.ts"),
        `export function ${names[0]}(x: number): number { return x * 2; }\n` +
        `export function caller() { return ${names[0]}(42); }\n`
      );
      await callTool("index_project", { projectRoot: dir });

      // Perform 5 sequential renames
      for (let i = 0; i < names.length - 1; i++) {
        const from = names[i];
        const to = names[i + 1];

        const code = fs.readFileSync(path.join(dir, "service.ts"), "utf8");
        fs.writeFileSync(
          path.join(dir, "service.ts"),
          code.replace(new RegExp(from, "g"), to)
        );

        await callTool("index_project", { projectRoot: dir });

        // Each rename: verify the NEW name is findable
        const result = await callTool("search_functions", {
          projectRoot: dir,
          query: to,
          limit: 5,
        }) as any;

        const found = (result?.results ?? result?.functions ?? []).some(
          (r: any) => r.name === to
        );

        if (!found) {
          throw new Error(
            `DATA_LOSS: After rename ${from}→${to} (step ${i + 1}/5), function "${to}" not found in search`
          );
        }

        // Verify OLD name is gone
        const oldResult = await callTool("search_functions", {
          projectRoot: dir,
          query: from,
          limit: 5,
        }) as any;

        const oldFound = (oldResult?.results ?? oldResult?.functions ?? []).some(
          (r: any) => r.name === from
        );

        if (oldFound) {
          reportIssue({
            id: `T40-${i}`,
            name: `Old Name "${from}" Still In Index After Rename to "${to}"`,
            evolutionPath: `Rename chain step ${i + 1}/5: ${from}→${to}`,
            commandsUsed: [
              `fs.writeFileSync (rename ${from}→${to})`,
              "mikk_index_project",
              `mikk_search_functions query="${from}"`,
            ],
            input: `Renamed ${from} to ${to} in source code and re-indexed`,
            observedOutput: `Old name "${from}" still appears in search results after re-index`,
            expectedOutput: `"${from}" should return 0 results after rename and re-index`,
            failureType: "STALE_CACHE",
            whyDangerous:
              "Developer renames for clarity. MIKK keeps pointing to the old name. " +
              "Colleague searches, finds both old and new name, confused about canonical name. " +
              "Over 5 renames this creates ghost function entries that pollute the index indefinitely.",
            reproducibility: "always",
            severity: "HIGH",
            rootCauseHypothesis:
              "Re-index adds new entries for renamed function but doesn't tombstone/delete old entries. " +
              "The index is append-only with no cleanup of removed symbols.",
            suggestedFix:
              "Re-index must perform a diff: symbols in old index not in new parse → delete them. " +
              "Use a two-pass strategy: parse all files → diff against stored index → apply deletions.",
          });
          throw new Error(
            `STALE_CACHE: old name "${from}" persists in index after rename to "${to}"`
          );
        }
      }

      // Final: the full chain must be traceable
      const finalResult = await callTool("search_functions", {
        projectRoot: dir,
        query: names[names.length - 1],
        limit: 5,
      }) as any;

      const finalFound = (finalResult?.results ?? finalResult?.functions ?? []).some(
        (r: any) => r.name === names[names.length - 1]
      );

      if (!finalFound) {
        throw new Error(
          `DATA_LOSS: After 5-rename chain, final function "${names[names.length - 1]}" not in index`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const SUITE_6 = [T31, T32, T33, T34, T35, T36, T37, T38, T39, T40];
