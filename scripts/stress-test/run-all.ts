#!/usr/bin/env npx ts-node
/**
 * MIKK STRESS TEST MAIN RUNNER
 *
 * Usage:
 *   npx ts-node run-all.ts              — Run all 30 tests
 *   npx ts-node run-all.ts --suite 1    — Run only suite 1 (performance)
 *   npx ts-node run-all.ts --test T01   — Run single test
 *   npx ts-node run-all.ts --dry-run    — Show test list without running
 *
 * NOTE: Tests use a [STUB] callTool() that throws immediately.
 *       To run against a real MIKK instance, replace callTool() in each suite
 *       with your actual MCP client invocation.
 *       See: INTEGRATION.md for wiring instructions.
 */

import { runTest, printSummary, TestCase } from "./runner";
import { SUITE_1 } from "./suite-01-performance";
import { SUITE_2 } from "./suite-02-data-integrity";
import { SUITE_3 } from "./suite-03-security";
import { SUITE_4 } from "./suite-04-fault-tolerance";
import { SUITE_5 } from "./suite-05-logic-bombs";

const ALL_SUITES: { name: string; tests: TestCase[] }[] = [
  { name: "PERFORMANCE & SCALABILITY", tests: SUITE_1 },
  { name: "DATA INTEGRITY & MALFORMED INPUT", tests: SUITE_2 },
  { name: "SECURITY & TAINT ANALYSIS", tests: SUITE_3 },
  { name: "FAULT TOLERANCE & CONCURRENCY", tests: SUITE_4 },
  { name: "LOGIC BOMBS & INCORRECT ASSUMPTIONS", tests: SUITE_5 },
];

const ALL_TESTS = ALL_SUITES.flatMap((s) => s.tests);

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const suiteArg = args.indexOf("--suite");
  const testArg = args.indexOf("--test");

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       MIKK RELIABILITY STRESS TEST SUITE             ║");
  console.log("║       Senior Systems Engineer Edition                ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Total tests: ${ALL_TESTS.length}`);
  console.log(`  Node: ${process.version}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Heap limit: ${(require("v8").getHeapStatistics().heap_size_limit / 1024 / 1024).toFixed(0)}MB\n`);

  if (dryRun) {
    console.log("DRY RUN — Test Catalog:\n");
    for (const suite of ALL_SUITES) {
      console.log(`\n▶ ${suite.name}`);
      for (const t of suite.tests) {
        console.log(`  [${t.id}] ${t.name}`);
        console.log(`         Scenario: ${t.scenario.slice(0, 80)}...`);
        console.log(`         Attack:   ${t.attackVector.slice(0, 80)}...`);
        console.log(`         Failure:  ${t.expectedFailure.slice(0, 80)}...`);
      }
    }
    return;
  }

  let testsToRun: TestCase[] = ALL_TESTS;

  if (suiteArg !== -1) {
    const suiteNum = parseInt(args[suiteArg + 1], 10) - 1;
    if (suiteNum >= 0 && suiteNum < ALL_SUITES.length) {
      testsToRun = ALL_SUITES[suiteNum].tests;
      console.log(`Running suite ${suiteNum + 1}: ${ALL_SUITES[suiteNum].name}`);
    }
  } else if (testArg !== -1) {
    const testId = args[testArg + 1];
    const found = ALL_TESTS.find((t) => t.id === testId);
    if (found) {
      testsToRun = [found];
      console.log(`Running single test: ${found.name}`);
    } else {
      console.error(`Test ID not found: ${testId}`);
      process.exit(1);
    }
  }

  // Run tests
  for (const suite of ALL_SUITES) {
    const inScope = suite.tests.filter((t) => testsToRun.includes(t));
    if (inScope.length === 0) continue;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`SUITE: ${suite.name} (${inScope.length} tests)`);
    console.log("─".repeat(60));

    for (const test of inScope) {
      console.log(`\n▶ [${test.id}] ${test.name}`);
      console.log(`  Scenario: ${test.scenario.slice(0, 100)}...`);
      await runTest(test);
    }
  }
  printSummary();
  process.exit(0);
}

main().catch((e) => {
  console.error("RUNNER CRASHED:", e);
  process.exit(1);
});
