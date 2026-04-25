import * as process from "process";
import { runChaosTest, printChaosSummary } from "./chaos-runner";
import { closeClient } from "../stress-test/mcp-client";
import * as suite06 from "./suite-06-trust-violations";
import * as suite07 from "./suite-07-behavioral-escalation";
import * as suite08 from "./suite-08-adversarial-inputs";

async function main() {
    console.log("🚀 STARTING MIKK CHAOS TEST RECAP...");

    const suites = [suite06, suite07, suite08];
    const testCases: any[] = [];

    for (const suite of suites) {
        for (const [key, value] of Object.entries(suite)) {
            if (key.startsWith('T') && typeof value === 'object') {
                testCases.push(value);
            }
        }
    }

    // Sort by ID
    testCases.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

    // Support filtering by ID (e.g. bun run run-chaos.ts T52)
    const filterId = process.argv[2];
    let filtered = testCases;
    if (filterId) {
        filtered = testCases.filter(tc => tc.id === filterId);
        console.log(`🎯 Filtering for test ${filterId}. Found ${filtered.length} matches.`);
    }

    for (const tc of filtered) {
        await runChaosTest(tc);
    }

    printChaosSummary();
    await closeClient();
    process.exit(0);
}

main().catch(async (err) => {
    console.error("💥 CHAOS RUNNER FATAL ERROR:", err);
    await closeClient();
    process.exit(1);
});
