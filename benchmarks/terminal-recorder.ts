/**
 * Cross-platform Terminal Recorder
 * Generates asciicast v2 compatible files on Windows
 */

import * as fs from "fs";
import * as path from "path";
import { spawn, execSync } from "child_process";

interface RecordingOptions {
  outputFile: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

interface RecordingSession {
  startTime: number;
  events: [number, "o" | "i", string][];
  header: {
    version: 2;
    width: number;
    height: number;
    timestamp: number;
    env: {
      SHELL: string;
      TERM: string;
    };
  };
}

class TerminalRecorder {
  private session: RecordingSession | null = null;

  startRecording(width = 120, height = 40): void {
    this.session = {
      startTime: Date.now(),
      events: [],
      header: {
        version: 2,
        width,
        height,
        timestamp: Math.floor(Date.now() / 1000),
        env: {
          SHELL: process.env.SHELL || "/bin/bash",
          TERM: process.env.TERM || "xterm-256color",
        },
      },
    };
  }

  addOutput(text: string): void {
    if (!this.session) return;
    const time = (Date.now() - this.session.startTime) / 1000;
    // Split by lines and add each
    this.session.events.push([time, "o", text]);
  }

  addInput(text: string): void {
    if (!this.session) return;
    const time = (Date.now() - this.session.startTime) / 1000;
    this.session.events.push([time, "i", text]);
  }

  saveToFile(outputPath: string): void {
    if (!this.session) return;

    const lines: string[] = [JSON.stringify(this.session.header)];
    for (const event of this.session.events) {
      lines.push(JSON.stringify(event));
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, lines.join("\n"));
  }

  async recordCommand(
    command: string,
    outputFile: string,
    options: { cwd?: string; silent?: boolean } = {}
  ): Promise<{ duration: number; exitCode: number; output: string }> {
    this.startRecording();

    // Add header comment
    this.addOutput(
      `\r\n\x1b[1;36m=== MIKK Benchmark Recording ===\x1b[0m\r\n`
    );
    this.addOutput(`\x1b[90mCommand: ${command}\x1b[0m\r\n`);
    this.addOutput(`\x1b[90mTime: ${new Date().toISOString()}\x1b[0m\r\n\r\n`);

    const startTime = Date.now();

    return new Promise((resolve) => {
      const args = command.includes(" ") ? command.split(" ") : [command];
      const cmd = args.shift() || "";

      const proc = spawn(cmd, args, {
        cwd: options.cwd || process.cwd(),
        shell: true,
        env: { ...process.env, FORCE_COLOR: "1" },
      });

      let output = "";

      proc.stdout?.on("data", (data) => {
        const text = data.toString();
        output += text;
        this.addOutput(text);
        if (!options.silent) process.stdout.write(data);
      });

      proc.stderr?.on("data", (data) => {
        const text = data.toString();
        output += text;
        this.addOutput(`\x1b[31m${text}\x1b[0m`);
        if (!options.silent) process.stderr.write(data);
      });

      proc.on("close", (code) => {
        const duration = Date.now() - startTime;

        this.addOutput(
          `\r\n\x1b[90m=== Completed in ${duration}ms (exit code: ${code}) ===\x1b[0m\r\n`
        );
        this.saveToFile(outputFile);

        resolve({
          duration,
          exitCode: code || 0,
          output,
        });
      });
    });
  }
}

// Export for use in benchmarks
export { TerminalRecorder };

// Run directly
if (require.main === module) {
  const recorder = new TerminalRecorder();
  console.log("Terminal Recorder ready");
}
