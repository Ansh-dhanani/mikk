/**
 * MIKK STRESS TESTS — SUITE 2: DATA INTEGRITY & MALFORMED INPUTS
 * Tests 08–13
 *
 * Attack: Garbage in → garbage out, crashes, or silent data corruption?
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { TestCase } from "./runner";
import {
  generateCorpus,
  generateCorruptedLockFile,
  pathologicalJSON,
} from "./corpus-generators";

import { callTool } from "./mcp-client";

function tmpDir(suffix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mikk-${suffix}-`));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 08: Null Byte Injection in File Path
// ─────────────────────────────────────────────────────────────────────────────
export const T08: TestCase = {
  id: "T08",
  name: "Null Byte Injection in File Path",
  category: "DATA_INTEGRITY",
  scenario:
    "Pass a file path containing a null byte: '/src/app.ts\\x00.evil'. " +
    "On some systems, C-level APIs truncate at null byte, creating path confusion.",
  attackVector:
    "Null byte causes path string to be truncated at OS level. " +
    "'/src/app.ts\\x00.evil' → opens '/src/app.ts'. " +
    "Can bypass extension checks or access unintended files.",
  expectedFailure:
    "System reads wrong file silently, or throws unhandled TypeError " +
    "instead of clean validation error.",
  idealBehavior:
    "Input validation rejects paths containing null bytes before any FS call. " +
    "Returns structured error: { code: 'INVALID_PATH', message: '...' }",
  suggestedFix:
    "Add path.normalize() + null byte check before every fs.* call. " +
    "Use a path allowlist (project root only). Reject paths with \\x00.",
  run: async () => {
    const evilPaths = [
      "/src/app.ts\x00.evil",
      "../../etc/passwd\x00.ts",
      "/valid/path.ts\x00",
      "\x00",
    ];
    for (const p of evilPaths) {
      try {
        const result = await callTool("analyze_file", { filePath: p });
        // If it didn't throw, it must return a validation error
        if ((result as any)?.error !== "INVALID_PATH") {
          throw new Error(
            `Path "${p.replace(/\x00/g, "\\x00")}" was accepted without error — SECURITY HOLE`
          );
        }
      } catch (e: any) {
        if (e.message.includes("STUB")) throw e; // propagate stub
        // A clean rejection is acceptable — verify it's structured
        if (!e.message && !e.code) {
          throw new Error(
            `Unstructured error on null byte path: ${JSON.stringify(e)}`
          );
        }
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 09: Path Traversal Attack
// ─────────────────────────────────────────────────────────────────────────────
export const T09: TestCase = {
  id: "T09",
  name: "Path Traversal — Read /etc/passwd via Tool",
  category: "DATA_INTEGRITY",
  scenario:
    "Attempt to read files outside the project root using path traversal. " +
    "MCP tool invoked with: ../../../../etc/shadow",
  attackVector:
    "If the tool does not canonicalize and jail paths to project root, " +
    "an attacker (or confused LLM) can exfiltrate arbitrary system files.",
  expectedFailure:
    "Tool returns content of /etc/passwd, shadow, private keys, etc. " +
    "Silent success with no access control check.",
  idealBehavior:
    "All paths are normalized with path.resolve() and checked against " +
    "allowed project root. Any path outside root → EACCES error, logged.",
  suggestedFix:
    "Implement path jail: assert(resolvedPath.startsWith(projectRoot)). " +
    "Run MCP server in separate process with restricted filesystem access (seccomp/chroot).",
  run: async () => {
    const traversalPaths = [
      "../../../../etc/passwd",
      "../../../etc/shadow",
      "/etc/passwd",
      "~/.ssh/id_rsa",
      "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    ];

    for (const p of traversalPaths) {
      let result: any;
      try {
        result = await callTool("read_file", { filePath: p });
      } catch (e: any) {
        if (e.message.includes("STUB")) throw e;
        continue; // Clean rejection is correct
      }
      if (typeof result?.content === "string" && result.content.length > 0) {
        throw new Error(
          `PATH TRAVERSAL SUCCEEDED for "${p}" — returned ${result.content.length} bytes!`
        );
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 10: Corrupted Lock File — All Modes
// ─────────────────────────────────────────────────────────────────────────────
export const T10: TestCase = {
  id: "T10",
  name: "Corrupted Lock File — All 6 Corruption Modes",
  category: "DATA_INTEGRITY",
  scenario:
    "Replace the MIKK cache/lock file with 6 different corrupted variants: " +
    "empty, truncated JSON, wrong types, 100K-entry blob, binary data, future timestamp.",
  attackVector:
    "Lock file corruption can occur after power loss, disk full, or concurrent write. " +
    "If the system JSON.parses without try-catch, any malform → unhandled exception → " +
    "full system failure on next startup.",
  expectedFailure:
    "SyntaxError crash at startup, or worse: system uses corrupt data and " +
    "invalidates valid index entries.",
  idealBehavior:
    "Detect corrupt lock file, log warning, delete it, and start fresh. " +
    "Never crash. Never trust corrupt data.",
  suggestedFix:
    "Wrap all lock file reads in try-catch. " +
    "Validate schema with Zod/AJV after parse. " +
    "Write lock files atomically (write to .tmp, rename). " +
    "Keep one backup: mikk.lock.bak",
  run: async () => {
    const dir = tmpDir("t10");
    const lockPath = path.join(dir, "mikk.lock");
    const modes = [
      "empty",
      "truncated",
      "wrong_type",
      "huge",
      "binary",
      "stale_future",
    ];

    for (const mode of modes) {
      generateCorruptedLockFile(lockPath, mode);
      try {
        await callTool("load_index", {
          projectRoot: dir,
          lockFile: lockPath,
        });
        // If no error thrown, check that system recovered gracefully
        // (not that it used the corrupt data)
      } catch (e: any) {
        if (e.message.includes("STUB")) throw e;
        // Any error here should be a clean, structured error
        if (
          e.message.toLowerCase().includes("syntaxerror") &&
          !e.message.includes("handled")
        ) {
          throw new Error(
            `[mode=${mode}] Unhandled SyntaxError from corrupt lock file — system crash!`
          );
        }
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 11: Encoding Chaos — UTF-16, Null Bytes, RTL Override
// ─────────────────────────────────────────────────────────────────────────────
export const T11: TestCase = {
  id: "T11",
  name: "Encoding Chaos — UTF-16, BOM, RTL, Null Bytes in Source",
  category: "DATA_INTEGRITY",
  scenario:
    "Files with UTF-16 encoding, BOM markers, null bytes mid-content, " +
    "right-to-left override characters, and 100KB-long single lines.",
  attackVector:
    "Parser assumes UTF-8. UTF-16 file read as UTF-8 → mojibake. " +
    "RTL override in identifier names can create security-relevant visual spoofing. " +
    "100KB line may overflow line-buffer-limited parsers.",
  expectedFailure:
    "Parse error, wrong symbol names in index, " +
    "or RTL-renamed symbol not flagged as suspicious.",
  idealBehavior:
    "Detect encoding via BOM/heuristic. " +
    "Flag files with non-printable or bidirectional control chars. " +
    "Handle long lines without buffer overflow.",
  suggestedFix:
    "Use chardet or iconv for encoding detection. " +
    "Strip/reject bidi control chars in symbol names. " +
    "Line length guard in tokenizer.",
  run: async () => {
    const dir = tmpDir("t11");
    generateCorpus(dir, {
      fileCount: 1,
      functionsPerFile: 1,
      includeEncodingEdges: true,
    });
    await callTool("index_project", { projectRoot: dir });

    const edgeFiles = fs.readdirSync(dir).map((f) => path.join(dir, f));
    for (const f of edgeFiles) {
      try {
        await callTool("analyze_file", { filePath: f });
      } catch (e: any) {
        if (e.message.includes("STUB")) throw e;
        // Encoding errors must be graceful, not unhandled
        if (
          e.message.includes("Unexpected token") ||
          e.message.includes("Invalid UTF")
        ) {
          throw new Error(
            `Unhandled encoding error on ${path.basename(f)}: ${e.message}`
          );
        }
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 12: Malformed JSON in All Tool Arguments
// ─────────────────────────────────────────────────────────────────────────────
export const T12: TestCase = {
  id: "T12",
  name: "Malformed JSON Tool Arguments",
  category: "DATA_INTEGRITY",
  scenario:
    "Every MIKK tool receives malformed/edge-case JSON arguments: " +
    "null values, wrong types, missing required fields, extra unknown fields, " +
    "number precision edge cases, duplicate keys.",
  attackVector:
    "Tool argument parsing without schema validation crashes on unexpected shapes. " +
    "Type coercion bugs (null treated as empty string, etc.).",
  expectedFailure:
    "Unhandled TypeError, Cannot read property of null, or worse: " +
    "tool operates on undefined with no error.",
  idealBehavior:
    "All tools validate arguments against strict schema (Zod/AJV). " +
    "Return structured validation error immediately. Never reach business logic with invalid input.",
  suggestedFix:
    "Add Zod schema to every tool's input handler. " +
    "Fail fast with descriptive error. " +
    "Never use optional chaining as a substitute for validation.",
  run: async () => {
    const tools = [
      "semantic_search",
      "get_call_graph",
      "taint_analysis",
      "scan_secrets",
      "impact_analysis",
    ];

    const dir = tmpDir("t12");
    generateCorpus(dir, { fileCount: 1, functionsPerFile: 1 });
    await callTool("index_project", { projectRoot: dir });

    const badArgSets = [
      {},
      { projectRoot: null },
      { projectRoot: 42 },
      { projectRoot: "/valid", query: null },
      { projectRoot: "/valid", limit: "not-a-number" },
      { projectRoot: "/valid", maxDepth: -1 },
      { projectRoot: "/valid", maxDepth: Infinity },
      { projectRoot: "/valid", extraField: { nested: { deep: true } } },
    ];

    for (const tool of tools) {
      for (const args of badArgSets) {
        try {
          await callTool(tool, args);
          // Must either return validation error or throw structured error
        } catch (e: any) {
          if (e.message.includes("STUB")) throw e;
          // Acceptable if structured. Not acceptable if unhandled runtime error.
          const msg = e.message ?? "";
          if (
            msg.includes("Cannot read propert") ||
            msg.includes("is not a function") ||
            msg.includes("undefined is not")
          ) {
            throw new Error(
              `[${tool}] Unhandled runtime error on bad args: ${msg}`
            );
          }
        }
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 13: Symlink Loops and Hardlink Traps
// ─────────────────────────────────────────────────────────────────────────────
export const T13: TestCase = {
  id: "T13",
  name: "Symlink Loop and Hardlink Trap",
  category: "DATA_INTEGRITY",
  scenario:
    "Project directory contains: (a) symlink loop: dir_a→dir_b, dir_b→dir_a. " +
    "(b) symlink to /etc/passwd renamed as utils.ts. " +
    "(c) 1000 hardlinks to the same file with different names.",
  attackVector:
    "Recursive directory walker follows symlinks → infinite loop. " +
    "Symlink to sensitive file gets indexed. " +
    "Hardlinks cause same file to be indexed/processed 1000 times.",
  expectedFailure:
    "Infinite loop in file crawler, EMFILE (too many open files), " +
    "or sensitive file content leaked into index.",
  idealBehavior:
    "Directory walker tracks visited inodes. Symlinks followed only within project root. " +
    "Hardlinks deduplicated by inode. Symlinks outside root → skipped + logged.",
  suggestedFix:
    "Track visited inodes in Set<number>. " +
    "Use fs.lstat() not fs.stat(). " +
    "Resolve symlinks and verify they stay within project root before indexing.",
  run: async () => {
    const dir = tmpDir("t13");
    const subA = path.join(dir, "dir_a");
    const subB = path.join(dir, "dir_b");

    try {
      fs.mkdirSync(subA);
      fs.mkdirSync(subB);

      // Symlink loop
      try {
        fs.symlinkSync(subA, path.join(subB, "link_to_a"));
        fs.symlinkSync(subB, path.join(subA, "link_to_b"));
      } catch {}

      // Symlink to sensitive file (simulated — point to /tmp/secret.txt)
      const secretFile = path.join(os.tmpdir(), "mikk_test_secret.txt");
      fs.writeFileSync(secretFile, "SUPER_SECRET_DATA");
      try {
        fs.symlinkSync(secretFile, path.join(dir, "utils.ts"));
      } catch {}

      // 100 hardlinks to same file
      const original = path.join(dir, "original.ts");
      fs.writeFileSync(original, "export const x = 1;");
      for (let i = 0; i < 100; i++) {
        try {
          fs.linkSync(original, path.join(dir, `hardlink_${i}.ts`));
        } catch {} // may fail on some platforms
      }

      await callTool("index_project", {
        projectRoot: dir,
        followSymlinks: true,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      try {
        fs.unlinkSync(path.join(os.tmpdir(), "mikk_test_secret.txt"));
      } catch {}
    }
  },
};

export const SUITE_2 = [T08, T09, T10, T11, T12, T13];
