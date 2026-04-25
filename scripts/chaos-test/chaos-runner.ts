/**
 * MIKK CHAOS TEST RUNNER
 * ─────────────────────────────────────────────────────────────────────────────
 * Senior distributed systems researcher, chaos engineer, adversarial tester.
 *
 * This is NOT a checklist runner.
 * This is an AUTONOMOUS SYSTEM that discovers failure modes, escalates,
 * and only declares victory when new failure classes stop emerging.
 *
 * Core question: "When does MIKK become UNTRUSTWORTHY?"
 *   → Not when it crashes — when it gives SILENT, MISLEADING, INCONSISTENT results.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ── Types ────────────────────────────────────────────────────────────────────

export type FailureType =
  | "NON-DETERMINISM"
  | "STALE_CACHE"
  | "PARTIAL_RESULT"
  | "MISLEADING_SUCCESS"
  | "CONCURRENCY_ISSUE"
  | "FALLBACK_ERROR"
  | "DATA_LOSS"
  | "TRUST_VIOLATION";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ChaosIssue {
  id: string;
  name: string;
  evolutionPath: string;
  commandsUsed: string[];
  input: string;
  observedOutput: string;
  expectedOutput: string;
  failureType: FailureType;
  whyDangerous: string;
  reproducibility: "always" | "intermittent" | "rare";
  severity: Severity;
  rootCauseHypothesis: string;
  suggestedFix: string;
}

export interface ChaosTestCase {
  id: string;
  name: string;
  category: string;
  evolutionPath: string;
  failureTypes: FailureType[];
  severity: Severity;
  run: () => Promise<void>;
  timeoutMs?: number;
}

export interface ChaosResult {
  id: string;
  name: string;
  category: string;
  status: "PASS" | "FAIL" | "CRASH" | "TIMEOUT" | "SKIP";
  durationMs: number;
  issues: ChaosIssue[];
  errorMessage?: string;
  memoryDeltaMB?: number;
}

// ── Discovered Issues Registry ───────────────────────────────────────────────

const ALL_RESULTS: ChaosResult[] = [];
const DISCOVERED_ISSUE_CLASSES = new Set<string>();

// ── Runner ───────────────────────────────────────────────────────────────────

export async function runChaosTest(tc: ChaosTestCase): Promise<ChaosResult> {
  const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
  const start = Date.now();
  let status: ChaosResult["status"] = "PASS";
  let errorMessage: string | undefined;
  const issues: ChaosIssue[] = [];

  const timeout = tc.timeoutMs ?? 45_000;

  try {
    await Promise.race([
      tc.run(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), timeout)
      ),
    ]);
  } catch (err: any) {
    if (err?.message === "TIMEOUT") {
      status = "TIMEOUT";
      errorMessage = `Exceeded ${timeout}ms`;
    } else if (err?.message?.startsWith("CHAOS:")) {
      // Structured chaos issue thrown by test
      status = "FAIL";
      errorMessage = err.message.slice(6);
      // Parse embedded issue if present
      try {
        const issueData = JSON.parse(err.message.slice(6));
        issues.push(issueData);
        DISCOVERED_ISSUE_CLASSES.add(issueData.failureType);
      } catch {
        // Raw error message
      }
    } else {
      status = "FAIL";
      errorMessage = err?.message ?? String(err);
    }
  }

  const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
  const result: ChaosResult = {
    id: tc.id,
    name: tc.name,
    category: tc.category,
    status,
    durationMs: Date.now() - start,
    memoryDeltaMB: parseFloat((memAfter - memBefore).toFixed(2)),
    errorMessage,
    issues,
  };

  ALL_RESULTS.push(result);

  const icon =
    status === "PASS" ? "✅" :
    status === "TIMEOUT" ? "⏱️" :
    status === "FAIL" ? "🔴" : "💥";

  console.log(`${icon} [${tc.id}] ${tc.name} — ${status} (${result.durationMs}ms, Δmem: ${result.memoryDeltaMB}MB)`);
  if (errorMessage) console.log(`   ↳ ${errorMessage}`);

  return result;
}

// ── Issue Reporter (the structured format from the chaos prompt) ──────────────

export function reportIssue(issue: ChaosIssue): void {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`🔴 Issue #${issue.id}`);
  console.log(`\n**Test Evolution Path**\n${issue.evolutionPath}`);
  console.log(`\n**Commands Used**\n${issue.commandsUsed.join("\n")}`);
  console.log(`\n**Input**\n${issue.input}`);
  console.log(`\n**Observed Output**\n${issue.observedOutput}`);
  console.log(`\n**Expected Output**\n${issue.expectedOutput}`);
  console.log(`\n**Failure Type**: ${issue.failureType}`);
  console.log(`\n**Why This Is Dangerous**\n${issue.whyDangerous}`);
  console.log(`\n**Reproducibility**: ${issue.reproducibility}`);
  console.log(`\n**Severity**: ${issue.severity}`);
  console.log(`\n**Root Cause Hypothesis**\n${issue.rootCauseHypothesis}`);
  console.log(`\n**Suggested Fix**\n${issue.suggestedFix}`);
  console.log(`${"─".repeat(70)}\n`);
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

export function assertConsistent(
  label: string,
  results: any[],
  extractKey: (r: any) => string[]
): void {
  const sets = results.map((r) => extractKey(r).sort());
  const baseline = JSON.stringify(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    if (JSON.stringify(sets[i]) !== baseline) {
      const overlap = sets[0].filter((x) => sets[i].includes(x)).length;
      const total = Math.max(sets[0].length, sets[i].length);
      const similarity = total === 0 ? 1 : overlap / total;
      throw new Error(
        `${label}: NON-DETERMINISM detected across ${results.length} runs. ` +
        `Run 0 vs Run ${i} similarity: ${(similarity * 100).toFixed(0)}%. ` +
        `Run 0 top: [${sets[0].slice(0, 3).join(", ")}] ` +
        `Run ${i} top: [${sets[i].slice(0, 3).join(", ")}]`
      );
    }
  }
}

export function assertResultsNotEmpty(
  label: string,
  results: any,
  extractList: (r: any) => any[]
): void {
  const list = extractList(results);
  if (!list || list.length === 0) {
    throw new Error(`${label}: returned empty results — MISLEADING_SUCCESS (silent failure)`);
  }
}

export function assertNotStale(
  label: string,
  results: any,
  forbiddenContent: string
): void {
  const str = JSON.stringify(results ?? "");
  if (str.includes(forbiddenContent)) {
    throw new Error(
      `${label}: STALE_CACHE — found "${forbiddenContent}" in results after it was removed from source`
    );
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

export function printChaosSummary(): void {
  console.log("\n" + "═".repeat(70));
  console.log("  MIKK CHAOS TEST SUMMARY — TRUST ANALYSIS");
  console.log("═".repeat(70));

  const grouped: Record<string, ChaosResult[]> = {};
  for (const r of ALL_RESULTS) {
    (grouped[r.category] ??= []).push(r);
  }

  for (const [cat, results] of Object.entries(grouped)) {
    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status !== "PASS").length;
    console.log(`\n[${cat}] ${pass}/${results.length} passed  (${fail} trust violations)`);
    for (const r of results.filter((r) => r.status !== "PASS")) {
      console.log(`  🔴 ${r.name}: ${r.status}`);
      if (r.errorMessage) console.log(`     ↳ ${r.errorMessage}`);
    }
  }

  const total = ALL_RESULTS.length;
  const passed = ALL_RESULTS.filter((r) => r.status === "PASS").length;
  const failedTypes = new Set(
    ALL_RESULTS
      .filter((r) => r.status !== "PASS")
      .flatMap((r) => r.issues.map((i) => i.failureType))
  );

  console.log(`\nTOTAL: ${passed}/${total} passed  |  ${total - passed} TRUST VIOLATIONS`);
  if (failedTypes.size > 0) {
    console.log(`Failure classes discovered: ${[...failedTypes].join(", ")}`);
  }

  if (total - passed === 0) {
    console.log("\n🏆 SYSTEM DECLARED PRODUCTION-GRADE: No new failure classes discovered.");
    console.log("   All chaos scenarios survived. System is predictable under chaos.");
  } else {
    console.log("\n⚠️  TRUST VIOLATIONS DETECTED — system not yet production-grade.");
    console.log("   Fix all CRITICAL and HIGH severity issues before deployment.");
  }

  // Write JSON report
  const reportPath = path.join(__dirname, "chaos-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        summary: { total, passed, failed: total - passed },
        discoveredFailureClasses: [...failedTypes],
        results: ALL_RESULTS,
      },
      null,
      2
    )
  );
  console.log(`\nFull report: ${reportPath}`);
}

// ── Temp dir helper ───────────────────────────────────────────────────────────

export const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "mikk-chaos-"));
process.on("exit", () => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
});

export function tmpDir(suffix: string): string {
  const d = path.join(TMP_ROOT, suffix + "-" + Date.now());
  fs.mkdirSync(d, { recursive: true });
  return d;
}
