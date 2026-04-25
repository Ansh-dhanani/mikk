/**
 * MIKK STRESS TESTS — SUITE 3: SECURITY, SECRETS & TAINT ANALYSIS
 * Tests 14–18
 *
 * Attack: Does the security tooling itself have security holes?
 *         Can we blind the scanner? Can we extract data through it?
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { TestCase } from "./runner";

import { callTool } from "./mcp-client";

function tmpDir(suffix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mikk-${suffix}-`));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 14: Secrets Scanner — Obfuscation Bypass Attempts
// ─────────────────────────────────────────────────────────────────────────────
export const T14: TestCase = {
  id: "T14",
  name: "Secrets Scanner Obfuscation Bypass",
  category: "SECURITY",
  scenario:
    "Test whether the secrets scanner catches secrets hidden via common obfuscation: " +
    "(a) base64 encoded API key, (b) split across variable assignments, " +
    "(c) reversed string, (d) hex encoded, (e) template literal concatenation, " +
    "(f) stored in object spread, (g) in a comment disguised as docs.",
  attackVector:
    "Developers accidentally commit secrets via obfuscation that fools naive regex scanners. " +
    "Real-world: prod incidents from exactly these patterns.",
  expectedFailure:
    "Scanner misses all obfuscated forms and reports 0 secrets. " +
    "False negative → real secret leaks to git.",
  idealBehavior:
    "Semantic secret detection beyond regex: entropy analysis, " +
    "value reconstruction across assignments, base64 decode + re-scan.",
  suggestedFix:
    "Add Shannon entropy check on string literals >20 chars. " +
    "Base64-decode all matching literals and re-scan. " +
    "Track variable reassignment chains.",
  run: async () => {
    const dir = tmpDir("t14");
    const fakeKey = `sk-proj-${crypto.randomBytes(24).toString("hex")}`;
    const b64Key = Buffer.from(fakeKey).toString("base64");
    const hexKey = Buffer.from(fakeKey).toString("hex");
    const reversedKey = fakeKey.split("").reverse().join("");
    const splitA = fakeKey.slice(0, 20);
    const splitB = fakeKey.slice(20);

    const code = `
// ===== OBFUSCATED SECRETS =====
// (a) Base64 encoded
const encodedKey = "${b64Key}";
const decodedKey = Buffer.from(encodedKey, 'base64').toString();

// (b) Split across two vars
const keyPartA = "${splitA}";
const keyPartB = "${splitB}";
const fullKey = keyPartA + keyPartB;

// (c) Reversed
const reversed = "${reversedKey}".split('').reverse().join('');

// (d) Hex encoded
const hexEncoded = "${hexKey}";
const fromHex = Buffer.from(hexEncoded, 'hex').toString();

// (e) Template literal concat
const apiKey = \`sk-proj-\${process.env.FAKE || "${fakeKey.slice(8)}"}\`;

// (f) In comment — AWS style
// config: access_key=AKIAIOSFODNN7EXAMPLE secret=${fakeKey}

// (g) Object spread
const config = { ...{ apiSecret: "${fakeKey}" } };
`;

    fs.writeFileSync(path.join(dir, "secrets_obfuscated.ts"), code);
    await callTool("index_project", { projectRoot: dir });

    const result = (await callTool("scan_secrets", {
      projectRoot: dir,
    })) as any;

    const found = result?.findings ?? [];
    // We expect at minimum the direct string literal (f) to be found
    if (found.length === 0) {
      throw new Error(
        `scan_secrets found 0 secrets in a file with 7 obfuscated secrets — scanner is blind`
      );
    }
    // Bonus: check if any obfuscated forms were caught
    const methods = ["base64", "hex", "split", "reversed", "comment"];
    const caught = found.filter((f: any) =>
      methods.some((m) => f.context?.includes(m) || f.reason?.includes(m))
    );
    console.log(
      `    Scanner caught ${found.length} findings, ${caught.length} obfuscated forms`
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 15: Taint Analysis — Data Exfiltration via Indirect Paths
// ─────────────────────────────────────────────────────────────────────────────
export const T15: TestCase = {
  id: "T15",
  name: "Taint Analysis — Multi-Hop Indirect Data Flow",
  category: "SECURITY",
  scenario:
    "User input flows through: (1) req.body.data → (2) helper transform → " +
    "(3) object merge → (4) 3rd-party callback → (5) SQL query string. " +
    "5 hops of indirection before reaching the sink.",
  attackVector:
    "Taint trackers that only follow direct assignments miss indirect flows " +
    "through intermediate transforms, destructuring, and callbacks.",
  expectedFailure:
    "Taint analysis reports 0 paths from source to sink. " +
    "SQL injection vulnerability goes undetected.",
  idealBehavior:
    "Full inter-procedural taint flow. " +
    "Detects source→sink chain across all 5 hops. " +
    "Reports complete path, not just source and sink.",
  suggestedFix:
    "Implement inter-procedural data flow graph (IDFG). " +
    "Track taint through function arguments, return values, and callbacks. " +
    "Use TypeScript type narrowing to reduce false positives.",
  run: async () => {
    const dir = tmpDir("t15");
    const code = `
import { Request, Response } from 'express';
import { query } from './db';

// Source: user input
function getInput(req: Request) {
  return req.body.data; // TAINT SOURCE
}

// Hop 1: transform
function transform(value: string): string {
  return value.trim().toLowerCase();
}

// Hop 2: object merge
function buildParams(transformed: string): Record<string, string> {
  return { ...{ userInput: transformed }, timestamp: Date.now().toString() };
}

// Hop 3: callback indirection
function processParams(
  params: Record<string, string>,
  callback: (p: Record<string, string>) => string
): string {
  return callback(params);
}

// Hop 4: builder
function buildQuery(params: Record<string, string>): string {
  return \`SELECT * FROM users WHERE name = '\${params.userInput}'\`; // SINK: SQL injection
}

// Entry point
export function handleRequest(req: Request, res: Response) {
  const raw = getInput(req);
  const trimmed = transform(raw);
  const params = buildParams(trimmed);
  const sql = processParams(params, buildQuery);
  query(sql).then(r => res.json(r));
}
`;
    fs.writeFileSync(path.join(dir, "taint_indirect.ts"), code);
    await callTool("index_project", { projectRoot: dir });

    const result = (await callTool("taint_analysis", {
      projectRoot: dir,
      sources: ["req.body"],
      sinks: ["query("],
    })) as any;

    const paths = result?.paths ?? [];
    if (paths.length === 0) {
      throw new Error(
        "Taint analysis found 0 paths for a clear 5-hop SQL injection — missed indirect flow"
      );
    }

    const completePath = paths.find(
      (p: any) => p.hops?.length >= 4 || p.chain?.length >= 4
    );
    if (!completePath) {
      throw new Error(
        `Taint paths found but none show full 5-hop chain. Found: ${JSON.stringify(paths[0]).slice(0, 200)}`
      );
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 16: Secrets in Node_Modules (Should Not Index)
// ─────────────────────────────────────────────────────────────────────────────
export const T16: TestCase = {
  id: "T16",
  name: "Secrets in node_modules — Must Not Be Indexed",
  category: "SECURITY",
  scenario:
    "Place real-looking secrets in node_modules/some-lib/index.js. " +
    "Verify scanner does NOT report them (node_modules must be excluded). " +
    "Then verify the scanner does NOT miss secrets in src/ adjacent to node_modules.",
  attackVector:
    "If node_modules are indexed, scanner floods results with false positives " +
    "from minified lib code, drowning real secrets. " +
    "Alternatively, overly aggressive exclusion might skip src/ files.",
  expectedFailure:
    "Scanner reports secrets FROM node_modules (false positives), " +
    "OR reports nothing because it incorrectly also excludes src/.",
  idealBehavior:
    "node_modules excluded by default. .gitignore patterns respected. " +
    "Custom excludes configurable. src/ secrets still reported.",
  suggestedFix:
    "Use .mikk-ignore or .gitignore integration. " +
    "Default excludes: node_modules/, .git/, dist/, build/. " +
    "Make excludes configurable, not hardcoded.",
  run: async () => {
    const dir = tmpDir("t16");
    const srcDir = path.join(dir, "src");
    const nmDir = path.join(dir, "node_modules", "some-lib");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(nmDir, { recursive: true });

    const fakeKey = `sk-proj-${crypto.randomBytes(24).toString("hex")}`;
    const srcKey = `sk-proj-${crypto.randomBytes(24).toString("hex")}`;

    // Secret in node_modules (should NOT be reported)
    fs.writeFileSync(
      path.join(nmDir, "index.js"),
      `module.exports = { apiKey: "${fakeKey}" };`
    );

    // Secret in src/ (MUST be reported)
    fs.writeFileSync(
      path.join(srcDir, "config.ts"),
      `export const API_KEY = "${srcKey}";`
    );

    await callTool("index_project", { projectRoot: dir });

    const result = (await callTool("scan_secrets", {
      projectRoot: dir,
    })) as any;

    const findings = result?.findings ?? [];
    const nodeModuleFindings = findings.filter((f: any) =>
      f.file?.includes("node_modules")
    );
    const srcFindings = findings.filter((f: any) => f.file?.includes("src/"));

    if (nodeModuleFindings.length > 0) {
      throw new Error(
        `Scanner reported ${nodeModuleFindings.length} secrets from node_modules — false positive storm`
      );
    }
    if (srcFindings.length === 0) {
      throw new Error(
        "Scanner found 0 secrets in src/ — over-aggressive exclusion hiding real secrets"
      );
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 17: Regex DoS (ReDoS) in Secret Pattern Matching
// ─────────────────────────────────────────────────────────────────────────────
export const T17: TestCase = {
  id: "T17",
  name: "ReDoS Attack on Secret Scanner Regex",
  category: "SECURITY",
  scenario:
    "Pass strings crafted to cause catastrophic backtracking in common secret-scanning regexes. " +
    "Pattern: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaab' against regex like /^(a+)+$/",
  attackVector:
    "Secret scanners use regexes like /(api[_-]?key|secret)[\\s]*=[\\s]*['\"][A-Za-z0-9+/=]{20,}/i. " +
    "Crafted input causes O(2^n) regex backtracking. " +
    "Result: scanner hangs for seconds per file, DoS on large codebases.",
  expectedFailure:
    "Scanner hangs for >10s per file, effectively DoSing itself. " +
    "CPU pegs at 100% indefinitely.",
  idealBehavior:
    "Regexes are tested for catastrophic backtracking. " +
    "Hard timeout per-file scan (e.g. 500ms). " +
    "Use linear-time regex engines or RE2.",
  suggestedFix:
    "Replace vulnerable regexes with RE2-compatible patterns. " +
    "Wrap each file scan in a 500ms timeout. " +
    "Use node-re2 package for safe regex evaluation.",
  timeoutMs: 15_000,
  run: async () => {
    const dir = tmpDir("t17");
    // Craft strings that trigger backtracking in naive secret patterns
    const redosStrings = [
      // Triggers (a+)+ style patterns
      "apiKey=" + "a".repeat(50) + "!",
      // Triggers (a|aa)+ patterns
      "secret=" + "aa".repeat(30) + "b",
      // Very long lines that force regex to scan entire string
      "const x = '" + "A".repeat(100_000) + "'",
      // Alternation explosion
      "token=" + Array(30).fill("abc|abc").join("") + "X",
    ];

    fs.writeFileSync(
      path.join(dir, "redos.ts"),
      redosStrings.map((s, i) => `const v${i} = "${s}";`).join("\n")
    );

    await callTool("index_project", { projectRoot: dir });

    const start = Date.now();
    await callTool("scan_secrets", { projectRoot: dir });
    const elapsed = Date.now() - start;

    if (elapsed > 10_000) {
      throw new Error(
        `scan_secrets took ${elapsed}ms on ReDoS file — catastrophic backtracking confirmed`
      );
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST 18: Taint Source in Dynamic Property Access
// ─────────────────────────────────────────────────────────────────────────────
export const T18: TestCase = {
  id: "T18",
  name: "Taint via Dynamic Property Access (Prototype Pollution Path)",
  category: "SECURITY",
  scenario:
    "User-controlled key used in dynamic object property access: obj[userInput]. " +
    "This is a prototype pollution vector. Does taint analysis catch it?",
  attackVector:
    "obj[req.body.key] = req.body.value allows setting __proto__ properties. " +
    "Most taint trackers don't model bracket-access as a sink.",
  expectedFailure:
    "Taint analysis reports no issue because it only tracks string sinks " +
    "like eval() and query(), missing dynamic property assignment entirely.",
  idealBehavior:
    "Dynamic property assignment with tainted key is flagged as " +
    "potential prototype pollution. Specific severity: HIGH.",
  suggestedFix:
    "Add bracket-access assignment as a taint sink. " +
    "Suggest hasOwnProperty check or Object.create(null) pattern.",
  run: async () => {
    const dir = tmpDir("t18");
    const code = `
import { Request } from 'express';

const store: any = {};

export function dangerousHandler(req: Request) {
  const key = req.body.key;   // TAINT SOURCE
  const val = req.body.value; // TAINT SOURCE

  // SINK: prototype pollution via bracket access
  store[key] = val;

  // Also dangerous: __proto__ assignment
  const target: any = {};
  Object.assign(target, JSON.parse(req.body.config)); // SINK: arbitrary merge
}
`;
    fs.writeFileSync(path.join(dir, "proto_pollution.ts"), code);
    await callTool("index_project", { projectRoot: dir });

    const result = (await callTool("taint_analysis", {
      projectRoot: dir,
      sources: ["req.body"],
      sinks: ["dynamic_property_assignment", "Object.assign"],
    })) as any;

    const paths = result?.paths ?? [];
    const hasBracketSink = paths.some(
      (p: any) =>
        p.sink?.includes("bracket") ||
        p.sink?.includes("dynamic") ||
        p.sink?.includes("store[")
    );

    if (!hasBracketSink) {
      throw new Error(
        "Taint analysis missed prototype pollution via bracket-access assignment"
      );
    }
  },
};

export const SUITE_3 = [T14, T15, T16, T17, T18];
