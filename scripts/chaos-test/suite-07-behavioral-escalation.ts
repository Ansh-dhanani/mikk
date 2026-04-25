/**
 * MIKK CHAOS TESTS — SUITE 7: BEHAVIORAL ESCALATION & USER FLOW CHAOS
 * Tests T41–T50
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These tests simulate REAL developer workflows under adversarial conditions.
 * They escalate from isolated tool failures to multi-step workflow breakdowns
 * where the failure only manifests after several operations.
 *
 * Evolution from Suite 6: Instead of testing individual tool trust,
 * these tests break the CHAIN of trust across a developer session.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ChaosTestCase, reportIssue, tmpDir } from "./chaos-runner";
import { writeMikkJson } from "./corpus-chaos";

import { callTool } from "../stress-test/mcp-client";

// ─────────────────────────────────────────────────────────────────────────────
// T41: Full Developer Workflow — Search → Context → Rename → Analyze → Search
// Evolution: All previous tests were isolated. T41 is the first end-to-end workflow test.
// ─────────────────────────────────────────────────────────────────────────────
export const T41: ChaosTestCase = {
  id: "T41",
  name: "Full Dev Workflow: Search → Context → Rename → Re-index → Search",
  category: "WORKFLOW",
  evolutionPath:
    "Individual tool tests showed each tool works in isolation. " +
    "T41 runs a complete realistic workflow: find function → check impact → " +
    "rename it → re-index → search for new name. " +
    "Trust failure: any step silently breaking the next step's correctness.",
  failureTypes: ["STALE_CACHE", "PARTIAL_RESULT", "MISLEADING_SUCCESS"],
  severity: "HIGH",
  timeoutMs: 120_000,
  run: async () => {
    const dir = tmpDir("t41");
    try {
      // Setup: realistic auth module
      writeMikkJson(dir);
      fs.writeFileSync(
        path.join(dir, "auth.ts"),
        `
export function validateToken(token: string): boolean {
  return token.startsWith('Bearer ') && token.length > 20;
}
export function refreshSession(userId: string, token: string): string {
  return validateToken(token) ? 'new_' + userId : '';
}
export function checkPermission(role: string, resource: string): boolean {
  const allowed = ['admin', 'editor'];
  return allowed.includes(role);
}
`
      );
      fs.writeFileSync(
        path.join(dir, "api.ts"),
        `
import { validateToken, checkPermission } from './auth';
export function handleRequest(req: any) {
  if (!validateToken(req.headers.auth)) throw new Error('Unauthorized');
  if (!checkPermission(req.user.role, req.path)) throw new Error('Forbidden');
  return { status: 200 };
}
`
      );

      // STEP 1: Index
      await callTool("index_project", { projectRoot: dir });

      // STEP 2: Search for the function we'll rename
      const step2 = await callTool("search_functions", {
        projectRoot: dir,
        query: "validateToken",
        limit: 5,
      }) as any;
      const step2Results = step2?.results ?? step2?.functions ?? [];
      if (step2Results.length === 0) {
        throw new Error("WORKFLOW_BREAK at Step 2: validateToken not found after indexing");
      }

      // STEP 3: Check impact of changing validateToken
      const step3 = await callTool("impact_analysis", {
        projectRoot: dir,
        changedFile: "auth.ts",
      }) as any;
      const impactedFiles = step3?.affectedFiles ?? [];
      // api.ts should be impacted (it imports validateToken)
      const apiImpacted = impactedFiles.some((f: string) => f.includes("api"));
      if (!apiImpacted) {
        reportIssue({
          id: "T41-A",
          name: "Impact Analysis Misses Importer (api.ts) Before Rename",
          evolutionPath: "Full workflow step 3: impact_analysis before rename",
          commandsUsed: ["mikk_impact_analysis changedFile=auth.ts"],
          input: "auth.ts exports validateToken. api.ts imports it.",
          observedOutput: `api.ts not in affectedFiles: ${JSON.stringify(impactedFiles).slice(0, 200)}`,
          expectedOutput: "api.ts in affectedFiles (it imports validateToken)",
          failureType: "PARTIAL_RESULT",
          whyDangerous: "Developer thinks only 1 file is affected. Renames. Breaks api.ts silently.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis: "Import graph not fully built for cross-file references",
          suggestedFix: "Ensure import graph is built from all files in projectRoot, not just the changed file",
        });
      }

      // STEP 4: Rename validateToken → verifyToken in source
      const authCode = fs.readFileSync(path.join(dir, "auth.ts"), "utf8");
      const apiCode = fs.readFileSync(path.join(dir, "api.ts"), "utf8");
      fs.writeFileSync(path.join(dir, "auth.ts"), authCode.replace(/validateToken/g, "verifyToken"));
      fs.writeFileSync(path.join(dir, "api.ts"), apiCode.replace(/validateToken/g, "verifyToken"));

      // STEP 5: Re-index
      await callTool("index_project", { projectRoot: dir });

      // STEP 6: Search for new name — must be found
      const step6 = await callTool("search_functions", {
        projectRoot: dir,
        query: "verifyToken",
        limit: 5,
      }) as any;
      const step6Results = step6?.results ?? step6?.functions ?? [];
      if (!step6Results.some((r: any) => r.name === "verifyToken")) {
        throw new Error("WORKFLOW_BREAK at Step 6: verifyToken not found after rename + re-index");
      }

      // STEP 7: Search for old name — must be GONE
      const step7 = await callTool("search_functions", {
        projectRoot: dir,
        query: "validateToken",
        limit: 5,
      }) as any;
      const step7Results = step7?.results ?? step7?.functions ?? [];
      if (step7Results.some((r: any) => r.name === "validateToken")) {
        throw new Error(
          "STALE_CACHE in workflow: validateToken still in index after rename and full re-index"
        );
      }

      console.log("    ✓ Full workflow completed: search→impact→rename→reindex→search all consistent");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T42: Delete → Search → Re-index → Search (Tombstone Problem)
// Evolution: T32 tested deletion without re-index. T42 adds re-index to complete the loop.
// ─────────────────────────────────────────────────────────────────────────────
export const T42: ChaosTestCase = {
  id: "T42",
  name: "Delete → Search → Re-index → Search: Tombstone Must Be Clean",
  category: "WORKFLOW",
  evolutionPath:
    "T32 confirmed stale results survive deletion without re-index. " +
    "T42 completes the loop: after re-index, are tombstones fully cleared? " +
    "And during the window between delete and re-index, " +
    "can the system clearly indicate which results are potentially stale?",
  failureTypes: ["STALE_CACHE", "DATA_LOSS"],
  severity: "HIGH",
  timeoutMs: 90_000,
  run: async () => {
    const dir = tmpDir("t42");
    try {
      const { generateTombstoneCorpus } = await import("./corpus-chaos");
      const { sentinel } = generateTombstoneCorpus(dir);
      await callTool("index_project", { projectRoot: dir });

      // Phase 1: Verify sentinel is indexed
      const phase1 = await callTool("search_functions", {
        projectRoot: dir,
        query: "sentinelFunction",
        limit: 5,
      }) as any;
      const phase1Found = (phase1?.results ?? phase1?.functions ?? []).some(
        (r: any) => r.name?.includes("sentinelFunction")
      );
      if (!phase1Found) {
        throw new Error("TEST_SETUP_FAILURE: sentinelFunction not indexed initially");
      }

      // Phase 2: Delete sentinel, search WITHOUT re-index
      fs.unlinkSync(sentinel);
      const phase2 = await callTool("search_functions", {
        projectRoot: dir,
        query: "sentinelFunction",
        limit: 5,
      }) as any;

      // Phase 3: Re-index
      await callTool("index_project", { projectRoot: dir });

      // Phase 4: Search AFTER re-index — sentinel must be gone
      const phase4 = await callTool("search_functions", {
        projectRoot: dir,
        query: "sentinelFunction",
        limit: 5,
      }) as any;
      const phase4Found = (phase4?.results ?? phase4?.functions ?? []).some(
        (r: any) => r.name?.includes("sentinelFunction")
      );

      if (phase4Found) {
        reportIssue({
          id: "T42-A",
          name: "Tombstone Persists After Re-index — Ghost Symbol",
          evolutionPath: "Delete file → re-index → search still returns deleted symbol",
          commandsUsed: [
            "fs.unlinkSync(sentinel)",
            "mikk_index_project",
            "mikk_search_functions query='sentinelFunction'",
          ],
          input: "sentinel_auth_module.ts deleted. Full re-index run. Search for deleted function.",
          observedOutput: "sentinelFunction still appears in results after deletion AND re-index",
          expectedOutput: "0 results. Deleted file's symbols fully purged from all indices.",
          failureType: "STALE_CACHE",
          whyDangerous:
            "Ghost functions in the index are not theoretical. " +
            "They represent deleted/deprecated code. " +
            "An LLM using MIKK may suggest importing and calling a function that no longer exists. " +
            "Production deployment fails. The failure is blamed on the LLM, not the stale index.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "Re-indexing is additive (adds new/changed files) but not subtractive. " +
            "Files that disappeared between runs are not detected and their entries are not deleted. " +
            "A true re-index must diff the file list against the stored index.",
          suggestedFix:
            "Re-index must track: files_in_previous_index - files_currently_on_disk = files_to_tombstone. " +
            "For each tombstoned file: delete all symbols from search index, embedding store, and call graph.",
        });
        throw new Error("STALE_CACHE: ghost function survives deletion AND re-index — tombstone failure");
      }

      console.log("    ✓ Tombstone lifecycle clean: found→deleted→reindexed→gone");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T43: 100 Interleaved Read/Write Pairs — Consistency Under Churn
// Evolution: T20 tested parallel read tools. T43 interleaves reads with writes.
// ─────────────────────────────────────────────────────────────────────────────
export const T43: ChaosTestCase = {
  id: "T43",
  name: "100 Interleaved Read/Write Pairs — No Torn Reads",
  category: "WORKFLOW",
  evolutionPath:
    "T20 ran 5 reads in parallel — all the same version of code. " +
    "T43 escalates: 100 rounds of write-then-read. " +
    "After each write, the read must see EITHER the old OR the new state — never a mix.",
  failureTypes: ["CONCURRENCY_ISSUE", "NON-DETERMINISM"],
  severity: "HIGH",
  timeoutMs: 300_000,
  run: async () => {
    const dir = tmpDir("t43");
    const targetFile = path.join(dir, "target.ts");

    try {
      writeMikkJson(dir);
      fs.writeFileSync(targetFile, `export function version0(): string { return 'v0'; }\n`);
      await callTool("index_project", { projectRoot: dir });

      const tornReads: string[] = [];

      for (let round = 1; round <= 100; round++) {
        // Write new version
        fs.writeFileSync(
          targetFile,
          `export function version${round}(): string { return 'v${round}'; }\n`
        );

        // Immediately re-index and search
        await callTool("index_project", { projectRoot: dir });

        const result = await callTool("search_functions", {
          projectRoot: dir,
          query: `version${round}`,
          limit: 3,
        }) as any;

        const results = result?.results ?? result?.functions ?? [];
        const found = results.some((r: any) => r.name === `version${round}`);
        const oldFound = results.some(
          (r: any) => r.name && r.name.startsWith("version") && r.name !== `version${round}`
        );

        if (oldFound) {
          tornReads.push(
            `Round ${round}: found ${results.find((r: any) => r.name?.startsWith("version") && r.name !== `version${round}`)?.name} alongside version${round}`
          );
        }

        if (tornReads.length >= 3) break; // Report first 3 torn reads
      }

      if (tornReads.length > 0) {
        reportIssue({
          id: "T43-A",
          name: "Torn Reads — Old and New Versions Coexist in Index",
          evolutionPath:
            "100 write-then-read rounds. Old version symbols visible alongside new version symbols.",
          commandsUsed: [
            "fs.writeFileSync(versionN)",
            "mikk_index_project",
            "mikk_search_functions query='versionN'",
          ],
          input: "100 sequential writes, each followed by re-index and search",
          observedOutput: `Torn reads detected: ${tornReads.slice(0, 3).join("; ")}`,
          expectedOutput:
            "After re-index of versionN, only versionN exists. All prior versions gone.",
          failureType: "CONCURRENCY_ISSUE",
          whyDangerous:
            "Developer writes v2 of a function. MIKK still shows v1 alongside v2. " +
            "LLM sees both, uses v1 context to understand v2. Makes wrong recommendations. " +
            "Code review based on stale analysis.",
          reproducibility: "intermittent",
          severity: "HIGH",
          rootCauseHypothesis:
            "Re-indexing updates the index entry for the changed file's new symbols " +
            "but doesn't atomically replace the old entries. " +
            "Window between delete-old and add-new where both exist.",
          suggestedFix:
            "Use an atomic swap: build the new index entry in a shadow structure, " +
            "then atomically replace the old entry. Never have a 'partial update' window.",
        });
        throw new Error(
          `CONCURRENCY_ISSUE: ${tornReads.length} torn reads in 100 write-reindex-read cycles`
        );
      }

      console.log("    ✓ 100 write/read cycles: no torn reads detected");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T44: Misleading Search on Misnamed Functions (Semantic Trust)
// Evolution: T33 compared search modes. T44 tests if semantic search is too trusting of names.
// ─────────────────────────────────────────────────────────────────────────────
export const T44: ChaosTestCase = {
  id: "T44",
  name: "Misleading Corpus — Does Semantic Search Rank by Name or Behavior?",
  category: "WORKFLOW",
  evolutionPath:
    "T33 found semantic vs BM25 can contradict. " +
    "T44 uses a corpus where function NAMES suggest one thing but BODIES do another. " +
    "Query: 'authenticate user'. Correct answer: the function that actually does auth. " +
    "Wrong answer: the function whose name contains 'authenticate' but actually does SQL.",
  failureTypes: ["MISLEADING_SUCCESS", "TRUST_VIOLATION"],
  severity: "MEDIUM",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t44");
    try {
      const { generateMisleadingCorpus } = await import("./corpus-chaos");
      generateMisleadingCorpus(dir, 20);

      // Add a correctly named AND correctly behaved function
      fs.writeFileSync(
        path.join(dir, "correct_auth.ts"),
        `
import * as bcrypt from 'bcrypt';
export function verifyCredentials(email: string, password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
`
      );

      await callTool("index_project", { projectRoot: dir });

      const result = await callTool("semantic_search", {
        projectRoot: dir,
        query: "authenticate user with password and hash verification",
        limit: 5,
      }) as any;

      const results = result?.results ?? [];
      if (results.length > 0) {
        const topResult = results[0];
        // Check: is the top result the correctly implemented auth function,
        // or a misleadingly-named function that actually does SQL?
        const isCorrect = topResult.file?.includes("correct_auth") ||
          topResult.name?.includes("verifyCredentials");

        const hasMisleadingTop = !isCorrect && (
          topResult.name?.includes("authUser") ||
          topResult.name?.includes("validateToken")
        );

        if (hasMisleadingTop) {
          console.log(
            `    ⚠️  TOP RESULT: ${topResult.name} from ${topResult.file} — ` +
            `name matches query but body may not. Score: ${topResult.score ?? "N/A"}`
          );
          console.log(
            `    (correct answer: verifyCredentials in correct_auth.ts)`
          );
          // This is not a hard failure — semantic search legitimately uses names too.
          // But: does the result include a confidence score?
          if (topResult.score === undefined && topResult.similarity === undefined) {
            reportIssue({
              id: "T44-A",
              name: "Semantic Search Top Result Has No Confidence Score",
              evolutionPath:
                "Misleading corpus: top result may be wrong. No score to help user judge.",
              commandsUsed: [
                "generateMisleadingCorpus(dir, 20)",
                "mikk_semantic_search query='authenticate user with password'",
              ],
              input: "Query about password auth. Corpus has misleadingly-named functions.",
              observedOutput: `Top result: ${topResult.name} with no score field`,
              expectedOutput: "Every result includes score/similarity (0-1) for user to judge relevance",
              failureType: "MISLEADING_SUCCESS",
              whyDangerous:
                "Without a confidence score, the user cannot tell if the top result is 95% confident " +
                "or 15% confident. An LLM will treat both identically, potentially using wrong function.",
              reproducibility: "always",
              severity: "MEDIUM",
              rootCauseHypothesis: "Response schema omits score field",
              suggestedFix:
                "Every search result MUST include: { name, file, score: 0.0-1.0, " +
                "matchBasis: 'semantic'|'keyword'|'hybrid' }",
            });
          }
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T45: Index Drift Under 30% File Modification — Does Quality Degrade Gracefully?
// Evolution: T07 tested churn recovery via re-index. T45 tests no re-index, gradual drift.
// ─────────────────────────────────────────────────────────────────────────────
export const T45: ChaosTestCase = {
  id: "T45",
  name: "Index Drift — 30% File Modification, No Re-index, Quality Should Degrade Visibly",
  category: "WORKFLOW",
  evolutionPath:
    "T07 tested: mutate → re-index → verify. " +
    "T45 asks: what happens if the user DOESN'T re-index after 30% of files change? " +
    "The system must quantify and communicate its own staleness.",
  failureTypes: ["STALE_CACHE", "MISLEADING_SUCCESS"],
  severity: "MEDIUM",
  timeoutMs: 120_000,
  run: async () => {
    const dir = tmpDir("t45");
    try {
      const { generateDriftingCorpus } = await import("./corpus-chaos");

      // Initial corpus: version 0
      generateDriftingCorpus(dir, 0, 60);
      await callTool("index_project", { projectRoot: dir });

      // Overwrite with version 5 (significant drift)
      generateDriftingCorpus(dir, 5, 60);

      // WITHOUT re-indexing, search for a version-5-specific term
      const result = await callTool("semantic_search", {
        projectRoot: dir,
        query: "v5 changed logic",
        limit: 5,
      }) as any;

      // The question: does the response indicate the index may be stale?
      const stalenessDisclosed =
        result?.metadata?.modifiedFilesSinceIndex > 0 ||
        result?.metadata?.stale === true ||
        result?.metadata?.indexAge !== undefined ||
        result?.metadata?.fresh === false;

      if (!stalenessDisclosed) {
        reportIssue({
          id: "T45-A",
          name: "30% Code Drift Not Disclosed in Search Metadata",
          evolutionPath:
            "Index version 0, overwrite 30% of files with version 5 content, search without re-indexing",
          commandsUsed: [
            "generateDriftingCorpus(dir, 0, 60) + mikk_index_project",
            "generateDriftingCorpus(dir, 5, 60) (overwrites files)",
            "mikk_semantic_search (no re-index)",
          ],
          input: "30% of files modified. Search results based on stale index.",
          observedOutput:
            `Results returned. Metadata: ${result?.metadata ? JSON.stringify(result.metadata).slice(0, 200) : "undefined"}. ` +
            "No staleness indicator.",
          expectedOutput:
            "Response includes: { metadata: { modifiedFilesSinceIndex: N, fresh: false, " +
            "hint: 'N files have changed since last index. Run mikk_index_project.' } }",
          failureType: "MISLEADING_SUCCESS",
          whyDangerous:
            "In a busy codebase, 30% of files change in an hour. " +
            "Without staleness disclosure, the developer doesn't know their MIKK results are stale. " +
            "They make architectural decisions based on an hour-old snapshot. " +
            "This is the most common real-world failure mode.",
          reproducibility: "always",
          severity: "MEDIUM",
          rootCauseHypothesis:
            "The system has no file watcher or change detection. " +
            "It doesn't know files have changed unless explicitly re-indexed. " +
            "The response schema has no freshness metadata field.",
          suggestedFix:
            "On each response, run a lightweight diff: compare file mtimes in projectRoot " +
            "against the index's recorded mtimes. Report count of modified files. " +
            "This is O(n) on file count but O(1) per file (just mtime comparison).",
        });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T46: TOCTOU Race in mikk_before_edit + Architectural Constraint
// Evolution: T20 found parallel tool race. T46 targets the SPECIFIC safety tool.
// ─────────────────────────────────────────────────────────────────────────────
export const T46: ChaosTestCase = {
  id: "T46",
  name: "TOCTOU in mikk_before_edit — Constraint Satisfied at Check, Violated at Edit",
  category: "WORKFLOW",
  evolutionPath:
    "T20 showed parallel tools can race. " +
    "T46 specifically attacks mikk_before_edit, which is the SAFETY tool. " +
    "If the constraint check passes but the constraint is violated between check and edit, " +
    "the safety mechanism is defeated.",
  failureTypes: ["CONCURRENCY_ISSUE", "TRUST_VIOLATION"],
  severity: "CRITICAL",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t46");
    try {
      writeMikkJson(dir, {
        declared: {
          modules: [
            { id: "shared", name: "Shared", description: "Shared utility module", paths: ["shared/**"] },
            { id: "app", name: "App", description: "Main application module", paths: ["app/**"] },
          ],
          constraints: ["shared module must not import from app module"],
          decisions: [],
        },
      });

      fs.mkdirSync(path.join(dir, "shared"), { recursive: true });
      fs.mkdirSync(path.join(dir, "app"), { recursive: true });

      fs.writeFileSync(
        path.join(dir, "shared", "utils.ts"),
        `export function sharedUtil() { return 'shared'; }\n`
      );
      fs.writeFileSync(
        path.join(dir, "app", "service.ts"),
        `export function appService() { return 'app'; }\n`
      );

      await callTool("index_project", { projectRoot: dir });

      // Check constraints PASS currently
      const beforeEdit = await callTool("mikk_before_edit", {
        projectRoot: dir,
        files: ["shared/utils.ts"],
        description: "Add import from app module",
      }) as any;

      const constraintsPassed = !beforeEdit?.violations?.length;

      if (constraintsPassed) {
        // Now: between the check and the actual edit, constraints change
        // Simulate this by modifying mikk.json to add a blocking constraint
        // (race condition: another agent/process changed the project config)

        // Actually perform the edit that would violate the constraint
        const currentUtils = fs.readFileSync(path.join(dir, "shared", "utils.ts"), "utf8");
        fs.writeFileSync(
          path.join(dir, "shared", "utils.ts"),
          `import { appService } from '../app/service';\n${currentUtils}`
        );

        // Re-check AFTER the edit — does mikk_before_edit catch this violation now?
        const afterEdit = await callTool("mikk_before_edit", {
          projectRoot: dir,
          files: ["shared/utils.ts"],
          description: "Already added import from app — checking post-hoc",
        }) as any;

        const violationsCaught = afterEdit?.violations?.length > 0;

        if (!violationsCaught) {
          reportIssue({
            id: "T46-A",
            name: "mikk_before_edit Misses Existing Constraint Violation",
            evolutionPath:
              "Add violating import to shared module. Call mikk_before_edit again. " +
              "Should detect violation in current file state.",
            commandsUsed: [
              "mikk_before_edit files=['shared/utils.ts'] (returns PASS)",
              "fs.writeFileSync (add violating import)",
              "mikk_before_edit files=['shared/utils.ts'] (should return VIOLATION)",
            ],
            input:
              "shared/utils.ts now contains: import { appService } from '../app/service'. " +
              "Constraint: shared must not import from app.",
            observedOutput:
              "mikk_before_edit returns no violations even after constraint-violating import added",
            expectedOutput:
              "{ violations: [{ constraint: 'C1', message: 'shared imports app — forbidden', severity: 'ERROR' }] }",
            failureType: "TRUST_VIOLATION",
            whyDangerous:
              "The entire point of mikk_before_edit is to catch constraint violations before they're committed. " +
              "If it misses existing violations, it provides FALSE SAFETY ASSURANCE. " +
              "Developers trust it as a guard. It's not guarding.",
            reproducibility: "always",
            severity: "CRITICAL",
            rootCauseHypothesis:
              "mikk_before_edit checks constraints against the STORED INDEX, not the current file state. " +
              "If the file was modified after the last index, the constraint check is stale.",
            suggestedFix:
              "mikk_before_edit MUST parse the target files fresh before constraint checking. " +
              "Never use stale index for safety-critical checks. " +
              "This is the one tool where performance cannot trump correctness.",
          });
          throw new Error(
            "TRUST_VIOLATION: mikk_before_edit missed constraint violation in current file — safety tool is blind"
          );
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T47: Confidence Score Lying — High Confidence, Wrong Answer
// Evolution: T31 found non-determinism. T47 tests calibration: confidence vs correctness.
// ─────────────────────────────────────────────────────────────────────────────
export const T47: ChaosTestCase = {
  id: "T47",
  name: "Confidence Score Lying — High Score on Wrong Answer",
  category: "WORKFLOW",
  evolutionPath:
    "T31 measured score drift. T47 asks the harder question: " +
    "when a result is objectively WRONG (misnamed function), does it still get a high score? " +
    "An uncalibrated confidence system is worse than no confidence — it creates false certainty.",
  failureTypes: ["MISLEADING_SUCCESS", "TRUST_VIOLATION"],
  severity: "HIGH",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t47");
    try {
      writeMikkJson(dir);
      // Function with strong keyword match but wrong behavior
      fs.writeFileSync(
        path.join(dir, "keyword_stuffed.ts"),
        `
// authenticate login user password verify token session
export function authenticate_login_verify(x: string): string {
  // IMPORTANT: this function actually does nothing related to auth
  return x.split('').reverse().join(''); // string reversal
}
`
      );
      // Correct function with no keyword match
      fs.writeFileSync(
        path.join(dir, "real_auth.ts"),
        `
import crypto from 'crypto';
export function checkCredential(plain: string, hash: string): boolean {
  const computed = crypto.createHash('sha256').update(plain).digest('hex');
  return computed === hash;
}
`
      );

      await callTool("index_project", { projectRoot: dir });

      const result = await callTool("semantic_search", {
        projectRoot: dir,
        query: "authenticate user with hashed password",
        limit: 5,
      }) as any;

      const results = result?.results ?? [];
      const wrongResult = results.find(
        (r: any) => r.name?.includes("authenticate_login_verify")
      );
      const correctResult = results.find(
        (r: any) => r.name?.includes("checkCredential")
      );

      if (wrongResult?.score !== undefined && correctResult?.score !== undefined) {
        if (wrongResult.score > correctResult.score) {
          reportIssue({
            id: "T47-A",
            name: "Keyword-Stuffed Function Scores Higher Than Correctly Implemented One",
            evolutionPath:
              "Keyword-stuffed function vs. correctly implemented auth. Wrong one ranked higher.",
            commandsUsed: [
              "mikk_semantic_search query='authenticate user with hashed password' topK=5",
            ],
            input:
              "Two functions: (1) keyword-stuffed name, does string reversal. " +
              "(2) correct name, actually does SHA256 hash comparison.",
            observedOutput:
              `Wrong: ${wrongResult.name} score=${wrongResult.score.toFixed(3)}. ` +
              `Correct: ${correctResult.name} score=${correctResult.score.toFixed(3)}.`,
            expectedOutput:
              "checkCredential should score higher for 'hashed password' query. " +
              "Semantic search should understand BEHAVIOR, not just names.",
            failureType: "MISLEADING_SUCCESS",
            whyDangerous:
              "LLM asks MIKK 'how is password auth done?'. Gets keyword-stuffed string reversal function. " +
              "Uses it as the auth model for new code. Ships security vulnerability.",
            reproducibility: "always",
            severity: "HIGH",
            rootCauseHypothesis:
              "Embedding model weights names more than function bodies, " +
              "or the body content is not included in the embedding input.",
            suggestedFix:
              "Include function body (first 200 chars) in the embedding input, not just the signature. " +
              "Downweight pure name matching. Use hybrid re-ranking that penalizes comment-keyword-stuffing.",
          });
          // This is a warning, not a hard failure — semantic search can legitimately prefer names
          console.log("    ⚠️  WARNING T47: keyword-stuffed function ranks above correct implementation");
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T48: Escalating Secrets — Does Scanner Keep Up Across 6 Obfuscation Levels?
// Evolution: T14 tested 7 obfuscation patterns in one file. T48 escalates per level.
// ─────────────────────────────────────────────────────────────────────────────
export const T48: ChaosTestCase = {
  id: "T48",
  name: "Escalating Secret Obfuscation — Level 0 to Level 5",
  category: "WORKFLOW",
  evolutionPath:
    "T14 tested 7 obfuscation patterns simultaneously. " +
    "T48 escalates INCREMENTALLY: add one obfuscation level at a time. " +
    "The question: at which level does the scanner go blind? " +
    "Document the exact threshold.",
  failureTypes: ["PARTIAL_RESULT", "MISLEADING_SUCCESS"],
  severity: "HIGH",
  timeoutMs: 120_000,
  run: async () => {
    const blindAtLevel: number[] = [];

    for (let level = 0; level <= 5; level++) {
      const dir = tmpDir(`t48-level${level}`);
      try {
        const { generateEscalatingSecretsCorpus } = await import("./corpus-chaos");
        generateEscalatingSecretsCorpus(dir, level);
        await callTool("index_project", { projectRoot: dir });

        const result = await callTool("scan_secrets", { projectRoot: dir }) as any;
        const findings = result?.findings ?? [];

        if (findings.length === 0) {
          blindAtLevel.push(level);
          console.log(`    Level ${level}: SCANNER BLIND — 0 findings`);
        } else {
          console.log(`    Level ${level}: Found ${findings.length} findings`);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    if (blindAtLevel.length > 0) {
      const firstBlind = Math.min(...blindAtLevel);
      reportIssue({
        id: "T48-A",
        name: `Secret Scanner Blind at Obfuscation Level ${firstBlind}`,
        evolutionPath: "Incremental obfuscation levels 0-5. Scanner fails at level N.",
        commandsUsed: [
          "generateEscalatingSecretsCorpus(dir, N) for N in 0..5",
          "mikk_scan_secrets (each level)",
        ],
        input: `6 obfuscation levels: plain text, base64, split, hex-escape, object spread, deep nesting`,
        observedOutput:
          `Scanner found secrets at levels: ${[0, 1, 2, 3, 4, 5].filter(l => !blindAtLevel.includes(l)).join(",")}. ` +
          `BLIND at levels: ${blindAtLevel.join(",")}`,
        expectedOutput: "Scanner finds secrets at ALL levels, or clearly documents which obfuscation patterns it cannot detect",
        failureType: "PARTIAL_RESULT",
        whyDangerous:
          `Level ${firstBlind} obfuscation is trivially applied by any developer who knows the scanner. ` +
          "Attackers deliberately use these patterns to bypass secret scanning in CI. " +
          "False confidence: CI passes, secret committed, production breach.",
        reproducibility: "always",
        severity: "HIGH",
        rootCauseHypothesis:
          "Scanner is regex-based and matches only level 0 (plain text patterns). " +
          "Higher-level obfuscation defeats all regex matching.",
        suggestedFix:
          "Add entropy analysis (Shannon entropy > 3.5 on strings >20 chars → flag). " +
          "Add base64 decode + re-scan pass. " +
          "Add string concatenation tracking (var = partA + partB → reconstruct and scan). " +
          "Most importantly: document which patterns ARE and ARE NOT detected.",
      });
      throw new Error(
        `PARTIAL_RESULT: secret scanner blind at obfuscation level ${firstBlind}+`
      );
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T49: Concurrent mikk_before_edit + mikk_index_project = Constraint Race
// Evolution: T46 showed before_edit can miss violations. T49 adds concurrency.
// ─────────────────────────────────────────────────────────────────────────────
export const T49: ChaosTestCase = {
  id: "T49",
  name: "Concurrent before_edit + index_project — Constraint Race Window",
  category: "WORKFLOW",
  evolutionPath:
    "T46 found before_edit uses stale index. " +
    "T49 escalates: run before_edit WHILE index_project is running. " +
    "The index is being rebuilt — before_edit gets a partially-built constraint graph.",
  failureTypes: ["CONCURRENCY_ISSUE", "TRUST_VIOLATION"],
  severity: "HIGH",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t49");
    try {
      writeMikkJson(dir, {
        declared: {
          modules: [
            { id: "shared", name: "Shared", description: "Shared utility module", paths: ["shared/**"] },
            { id: "app", name: "App", description: "Main application module", paths: ["app/**"] },
          ],
          constraints: ["shared module must not import from app module"],
          decisions: [],
        },
      });

      fs.mkdirSync(path.join(dir, "core"), { recursive: true });
      fs.mkdirSync(path.join(dir, "plugin"), { recursive: true });

      // Build corpus large enough for index to take some time
      for (let i = 0; i < 50; i++) {
        fs.writeFileSync(
          path.join(dir, "core", `service_${i}.ts`),
          `export function coreFunc_${i}(x: number): number { return x * ${i}; }\n`
        );
        fs.writeFileSync(
          path.join(dir, "plugin", `plugin_${i}.ts`),
          `export function pluginFunc_${i}(x: string): string { return x + '_${i}'; }\n`
        );
      }

      await callTool("index_project", { projectRoot: dir });

      // Launch re-index AND before_edit concurrently
      const [indexResult, beforeEditResult] = await Promise.allSettled([
        callTool("index_project", { projectRoot: dir }),
        // Run before_edit against core module while indexing
        callTool("mikk_before_edit", {
          projectRoot: dir,
          files: ["core/service_0.ts"],
          description: "Adding import from plugin during re-index",
        }),
      ]);

      // Check: did before_edit succeed AND return a meaningful constraint check?
      if (beforeEditResult.status === "rejected") {
        throw new Error(
          `CONCURRENCY_ISSUE: before_edit crashed while index_project running: ${(beforeEditResult as PromiseRejectedResult).reason?.message}`
        );
      }

      const beforeEditValue = (beforeEditResult as PromiseFulfilledResult<any>).value;
      const hasConstraints =
        beforeEditValue?.violations !== undefined ||
        beforeEditValue?.constraints !== undefined ||
        beforeEditValue?.safe !== undefined;

      if (!hasConstraints) {
        reportIssue({
          id: "T49-A",
          name: "before_edit Returns No Constraint Data During Concurrent Re-index",
          evolutionPath:
            "before_edit runs while index_project is rebuilding the constraint graph",
          commandsUsed: [
            "mikk_index_project (async, no await)",
            "mikk_before_edit files=['core/service_0.ts'] (concurrent)",
          ],
          input: "Concurrent: re-indexing 100 files while before_edit runs",
          observedOutput:
            `before_edit returned: ${JSON.stringify(beforeEditValue).slice(0, 200)}. No constraint data.`,
          expectedOutput:
            "before_edit should either: (a) wait for index lock before checking, or " +
            "(b) use snapshot of last complete index and note it's checking against a snapshot",
          failureType: "CONCURRENCY_ISSUE",
          whyDangerous:
            "before_edit is the last line of defense before an edit is made. " +
            "If it silently returns no constraint data during concurrent operations, " +
            "the LLM proceeds with the edit assuming it's safe.",
          reproducibility: "intermittent",
          severity: "HIGH",
          rootCauseHypothesis:
            "before_edit reads the index file directly. During re-indexing, the file is in a transitional state. " +
            "The lock (if any) prevents the read, returning empty data instead of blocking and retrying.",
          suggestedFix:
            "Use read-write locking. before_edit acquires a READ lock. " +
            "index_project acquires a WRITE lock. " +
            "before_edit blocks until current write completes, then proceeds with fresh index.",
        });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T50: The Complete Escalation Boss Fight — All Behavioral Failures Combined
// Evolution: T30 was the Suite 5 boss fight (crashes). T50 is the Suite 7 boss fight (trust).
// ─────────────────────────────────────────────────────────────────────────────
export const T50: ChaosTestCase = {
  id: "T50",
  name: "BEHAVIORAL CHAOS BOSS FIGHT — 6 Trust Violations Simultaneously",
  category: "WORKFLOW",
  evolutionPath:
    "All T31-T49 tests found individual trust violations. " +
    "T50 combines them: " +
    "(1) cross-project bleed + (2) deleted file stale cache + " +
    "(3) rename chain + re-index + (4) 20 concurrent queries + " +
    "(5) misleading corpus + (6) constraint check during re-index. " +
    "Any SILENT incorrect result = system is untrustworthy.",
  failureTypes: ["TRUST_VIOLATION", "STALE_CACHE", "NON-DETERMINISM", "CONCURRENCY_ISSUE"],
  severity: "CRITICAL",
  timeoutMs: 300_000,
  run: async () => {
    const dirA = tmpDir("t50-alpha");
    const dirB = tmpDir("t50-beta");

    try {
      const { generateTwoProjectCorpus, generateMisleadingCorpus } = await import("./corpus-chaos");
      generateTwoProjectCorpus(dirA, dirB);
      generateMisleadingCorpus(dirA, 30);

      // Index both
      await Promise.all([
        callTool("index_project", { projectRoot: dirA }),
        callTool("index_project", { projectRoot: dirB }),
      ]);

      // Add a sentinel to dirA, index, then delete it
      const sentinel = path.join(dirA, "sentinel.ts");
      fs.writeFileSync(sentinel, `export function ghostFunc_T50(): string { return 'ghost'; }\n`);
      await callTool("index_project", { projectRoot: dirA });
      fs.unlinkSync(sentinel);

      // Now launch all chaos simultaneously:
      const operations = [
        // Check 1: Cross-project bleed (B symbols in A query)
        callTool("semantic_search", { projectRoot: dirA, query: "PROJECT_BETA processPayment", limit: 3 }),
        // Check 2: Ghost symbol still visible?
        callTool("search_functions", { projectRoot: dirA, query: "ghostFunc_T50", limit: 3 }),
        // Check 3-7: 5 concurrent identical queries (non-determinism check)
        ...Array(5).fill(null).map(() =>
          callTool("semantic_search", { projectRoot: dirA, query: "authenticate user", limit: 3 })
        ),
        // Check 8: Re-index dirA during all queries
        callTool("index_project", { projectRoot: dirA }),
        // Check 9: before_edit during re-index
        callTool("mikk_before_edit", { projectRoot: dirA, files: ["auth_latin.ts"], description: "chaos check" }),
        // Check 10: Impact analysis during re-index
        callTool("impact_analysis", { projectRoot: dirA, changedFile: "auth_latin.ts" }),
      ];

      const results = await Promise.allSettled(operations);
      const failures = results.filter(r => r.status === "rejected") as PromiseRejectedResult[];
      const realFailures = failures.filter(r => !r.reason?.message?.includes("STUB"));

      if (realFailures.length === results.length) {
        throw new Error("ALL operations failed under behavioral chaos — zero fault tolerance");
      }

      // Analyze results
      const [bleedCheck, ghostCheck, ...concurrentChecks] = results;

      // Cross-project bleed
      if (bleedCheck.status === "fulfilled") {
        const bleedResults = (bleedCheck.value as any)?.results ?? [];
        const aBleeds = bleedResults.some((r: any) => JSON.stringify(r).includes("BETA"));
        if (aBleeds) throw new Error("BOSS FIGHT: cross-project state bleed confirmed");
      }

      // Ghost symbol
      if (ghostCheck.status === "fulfilled") {
        const ghostResults = (ghostCheck.value as any)?.results ?? (ghostCheck.value as any)?.functions ?? [];
        const ghostFound = ghostResults.some((r: any) => r.name?.includes("ghostFunc_T50"));
        if (ghostFound) throw new Error("BOSS FIGHT: ghost function survived deletion");
      }

      // Non-determinism across concurrent queries
      const concurrentValues = concurrentChecks
        .slice(0, 5)
        .filter(r => r.status === "fulfilled")
        .map(r => (r as PromiseFulfilledResult<any>).value);

      if (concurrentValues.length >= 2) {
        const extractNames = (r: any) => (r?.results ?? []).map((x: any) => x.name ?? "").sort();
        const first = JSON.stringify(extractNames(concurrentValues[0]));
        const diverged = concurrentValues.filter(
          (v, i) => i > 0 && JSON.stringify(extractNames(v)) !== first
        );
        if (diverged.length > 1) {
          throw new Error(
            `BOSS FIGHT: ${diverged.length}/5 concurrent queries returned different results — NON-DETERMINISM`
          );
        }
      }

      console.log(`    Boss fight survived: ${results.length - realFailures.length}/${results.length} ops succeeded`);
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  },
};

export const SUITE_7 = [T41, T42, T43, T44, T45, T46, T47, T48, T49, T50];
