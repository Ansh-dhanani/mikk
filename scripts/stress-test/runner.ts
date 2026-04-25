#!/usr/bin/env npx ts-node
/**
 * MIKK STRESS TEST RUNNER
 * Senior Systems Engineer / Reliability Tester
 * Mission: Find and expose every weakness before production does.
 */

import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface TestResult {
  id: string;
  name: string;
  category: string;
  status: "PASS" | "FAIL" | "CRASH" | "TIMEOUT" | "SKIP";
  durationMs: number;
  errorMessage?: string;
  memoryDeltaMB?: number;
  notes?: string;
}

export interface TestCase {
  id: string;
  name: string;
  category: string;
  scenario: string;
  attackVector: string;
  expectedFailure: string;
  idealBehavior: string;
  suggestedFix: string;
  run: () => Promise<void>;
  timeoutMs?: number;
}

const RESULTS: TestResult[] = [];

export async function runTest(tc: TestCase): Promise<TestResult> {
  const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
  const start = Date.now();
  let status: TestResult["status"] = "PASS";
  let errorMessage: string | undefined;

  const timeout = tc.timeoutMs ?? 30_000;
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
    } else if (err?.message?.includes("CRASH")) {
      status = "CRASH";
      errorMessage = err.message;
    } else {
      status = "FAIL";
      errorMessage = err?.message ?? String(err);
    }
  }

  const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
  const result: TestResult = {
    id: tc.id,
    name: tc.name,
    category: tc.category,
    status,
    durationMs: Date.now() - start,
    memoryDeltaMB: parseFloat((memAfter - memBefore).toFixed(2)),
    errorMessage,
    notes: status !== "PASS" ? tc.suggestedFix : undefined,
  };

  RESULTS.push(result);
  const icon =
    status === "PASS"
      ? "✅"
      : status === "TIMEOUT"
      ? "⏱️"
      : status === "CRASH"
      ? "💥"
      : "❌";
  console.log(
    `${icon} [${tc.id}] ${tc.name} — ${status} (${result.durationMs}ms, Δmem: ${result.memoryDeltaMB}MB)`
  );
  if (errorMessage) console.log(`   ↳ ${errorMessage}`);
  return result;
}

export function printSummary() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  MIKK STRESS TEST SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  const grouped: Record<string, TestResult[]> = {};
  for (const r of RESULTS) {
    (grouped[r.category] ??= []).push(r);
  }
  for (const [cat, results] of Object.entries(grouped)) {
    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status !== "PASS").length;
    console.log(
      `\n[${cat}] ${pass}/${results.length} passed  (${fail} failures)`
    );
    for (const r of results.filter((r) => r.status !== "PASS")) {
      console.log(`  ❌ ${r.name}: ${r.status} — ${r.errorMessage}`);
      if (r.notes) console.log(`     Fix: ${r.notes}`);
    }
  }
  const total = RESULTS.length;
  const passed = RESULTS.filter((r) => r.status === "PASS").length;
  console.log(
    `\nTOTAL: ${passed}/${total} passed  |  ${total - passed} FAILURES`
  );

  // Write JSON report
  const reportPath = path.join(__dirname, "stress-test-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(RESULTS, null, 2));
  console.log(`\nFull report written to: ${reportPath}`);
}

export const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mikk-stress-"));
process.on("exit", () => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {}
});
