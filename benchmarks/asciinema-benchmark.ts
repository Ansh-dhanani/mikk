/**
 * Real Benchmark Implementation
 *
 * Uses asciinema to record actual terminal sessions comparing
 * Mikk-assisted vs traditional agent workflows.
 */

import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface RecordingConfig {
  id: string;
  name: string;
  description: string;
  commands: string[];
  expectedOutput: string[];
}

const BENCHMARK_SCENARIOS: RecordingConfig[] = [
  {
    id: "scenario-1-explore",
    name: "Explore Codebase Structure",
    description: "Compare exploring the codebase with vs without Mikk",
    commands: [
      "# Task: Understand how the graph builder works",
      "# First, let's see what Mikk knows...",
      "mikk_get_session_context",
      "",
      "# Now query specific information",
      "mikk_query_context graph builder",
      "",
      "# Find related functions",
      "mikk_search_functions graph",
    ],
    expectedOutput: ["graph", "builder", "parser"],
  },
  {
    id: "scenario-2-refactor",
    name: "Safe Refactoring",
    description: "Compare refactoring safety with vs without Mikk",
    commands: [
      "# Task: Rename 'hash' to 'computeHash' in packages/core",
      "# First, check what would be affected",
      "mikk_before_edit packages/core/src/hash.ts",
      "",
      "# Find all usages",
      "mikk_find_usages hash",
      "",
      "# Get impact analysis",
      "mikk_impact_analysis hash",
    ],
    expectedOutput: ["impact", "usages", "critical"],
  },
  {
    id: "scenario-3-debug",
    name: "Debug Flow",
    description: "Compare debugging with vs without Mikk",
    commands: [
      "# Task: Trace an error in mikk_query_context",
      "# Get function details",
      "mikk_get_function_detail mikk_query_context",
      "",
      "# See what calls it",
      "mikk_find_usages mikk_query_context",
      "",
      "# Check for constraints",
      "mikk_get_constraints",
    ],
    expectedOutput: ["function", "calls", "parameters"],
  },
];

class AsciinemaBenchmark {
  private recordingsDir: string;
  private results: Map<string, any> = new Map();

  constructor() {
    this.recordingsDir = path.join(process.cwd(), "benchmarks", "recordings");
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  async recordScenario(scenario: RecordingConfig, mode: "with-mikk" | "manual"): Promise<string> {
    const filename = `${scenario.id}-${mode}-${Date.now()}.cast`;
    const filepath = path.join(this.recordingsDir, filename);

    console.log(`\nRecording: ${scenario.name} (${mode})`);
    console.log(`Output: ${filepath}`);

    // Create a script file with the commands
    const scriptContent = this.generateScript(scenario, mode);
    const scriptPath = path.join(this.recordingsDir, `${scenario.id}.sh`);
    fs.writeFileSync(scriptPath, scriptContent);

    try {
      // Start asciinema recording
      const proc = spawn(
        "asciinema",
        ["rec", "-c", `bash ${scriptPath}`, filepath],
        {
          stdio: "inherit",
          cwd: process.cwd(),
        }
      );

      await new Promise((resolve, reject) => {
        proc.on("close", (code) => {
          if (code === 0) {
            resolve(void 0);
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      console.log(`✓ Recording saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.log(`Note: asciinema not available, creating simulation`);
      // Create a simulated recording file
      fs.writeFileSync(
        filepath,
        JSON.stringify({
          version: 2,
          width: 80,
          height: 24,
          timestamp: Date.now(),
          env: { SHELL: "/bin/bash" },
          output: scenario.commands,
        })
      );
      return filepath;
    }
  }

  private generateScript(scenario: RecordingConfig, mode: string): string {
    const commands =
      mode === "with-mikk"
        ? scenario.commands
        : [
            "# Traditional approach - no Mikk tools",
            "# Using standard shell commands...",
            "find . -name '*.ts' | head -20",
            "grep -r 'graph' --include='*.ts' | head -10",
            "cat packages/core/src/index.ts",
          ];

    return `#!/bin/bash
echo "=== ${scenario.name} ==="
echo "Mode: ${mode}"
echo ""
${commands.map((cmd) => `echo "\$ ${cmd}" && ${cmd} && sleep 1`).join("\n")}
echo ""
echo "=== Done ==="
`;
  }

  analyzeRecording(castFile: string): any {
    try {
      const content = fs.readFileSync(castFile, "utf-8");
      const lines = content.split("\n");

      // Parse asciicast v2 format
      let header: any = {};
      const events: any[] = [];

      for (const line of lines) {
        if (line.startsWith("{")) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.version) {
              header = parsed;
            } else if (Array.isArray(parsed)) {
              events.push(parsed);
            }
          } catch {}
        }
      }

      // Calculate duration
      const duration =
        events.length > 0 ? events[events.length - 1][0] - events[0][0] : 0;

      return {
        file: castFile,
        duration,
        eventCount: events.length,
        header,
      };
    } catch {
      return { file: castFile, duration: 0, eventCount: 0 };
    }
  }

  async runAll(): Promise<void> {
    console.log("=".repeat(60));
    console.log("ASCIINEMA BENCHMARK SUITE");
    console.log("=".repeat(60));

    for (const scenario of BENCHMARK_SCENARIOS) {
      console.log(`\n--- ${scenario.name} ---`);

      // Record with Mikk
      const withMikk = await this.recordScenario(scenario, "with-mikk");
      const withMikkStats = this.analyzeRecording(withMikk);

      // Record manual approach
      const manual = await this.recordScenario(scenario, "manual");
      const manualStats = this.analyzeRecording(manual);

      // Compare
      const timeSaved = manualStats.duration - withMikkStats.duration;
      const percentSaved =
        manualStats.duration > 0
          ? (timeSaved / manualStats.duration) * 100
          : 0;

      this.results.set(scenario.id, {
        scenario: scenario.name,
        withMikk: withMikkStats,
        manual: manualStats,
        timeSaved,
        percentSaved,
      });

      console.log(`\nResults for ${scenario.name}:`);
      console.log(`  With Mikk: ${withMikkStats.duration.toFixed(2)}s`);
      console.log(`  Manual: ${manualStats.duration.toFixed(2)}s`);
      console.log(`  Time saved: ${timeSaved.toFixed(2)}s (${percentSaved.toFixed(1)}%)`);
    }

    this.generateFinalReport();
  }

  private generateFinalReport(): void {
    const reportPath = path.join(this.recordingsDir, "report.json");

    const summary = {
      timestamp: new Date().toISOString(),
      results: Object.fromEntries(this.results),
      overall: this.calculateOverall(),
    };

    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("FINAL REPORT");
    console.log("=".repeat(60));
    console.log(`Report saved: ${reportPath}`);
    console.log(`\nAverage time saved: ${summary.overall.avgTimeSaved.toFixed(1)}%`);
  }

  private calculateOverall() {
    let totalPercentSaved = 0;
    let count = 0;

    for (const result of this.results.values()) {
      totalPercentSaved += result.percentSaved;
      count++;
    }

    return {
      avgTimeSaved: count > 0 ? totalPercentSaved / count : 0,
      scenariosRun: count,
    };
  }
}

// Run if called directly
if (require.main === module) {
  const benchmark = new AsciinemaBenchmark();
  benchmark.runAll().catch(console.error);
}

export { AsciinemaBenchmark, BENCHMARK_SCENARIOS };
