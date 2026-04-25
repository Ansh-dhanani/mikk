/**
 * MIKK STRESS TEST — CORPUS GENERATORS
 * Generates pathological synthetic codebases designed to break assumptions.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface CorpusOptions {
  fileCount: number;
  functionsPerFile: number;
  callDepth: number;
  includeCycles: boolean;
  includeSecrets: boolean;
  includeEncodingEdges: boolean;
  hugeFiles: number; // files > 10MB
  emptyFiles: number;
  binaryFiles: number;
}

/** Helper to write a default mikk.json so the MCP server can recognize the project */
export function writeMikkJson(rootDir: string) {
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(path.join(rootDir, "mikk.json"), JSON.stringify({
    version: "1.0.0",
    project: { name: "stress-test-project", description: "Stress testing MIKK", language: "typescript" },
    declared: { modules: [], constraints: [], decisions: [] }
  }, null, 2));
}

/** Generate a realistic but enormous TypeScript codebase */
export function generateCorpus(
  rootDir: string,
  opts: Partial<CorpusOptions> = {}
): string[] {
  const o: CorpusOptions = {
    fileCount: 100,
    functionsPerFile: 10,
    callDepth: 5,
    includeCycles: false,
    includeSecrets: false,
    includeEncodingEdges: false,
    hugeFiles: 0,
    emptyFiles: 0,
    binaryFiles: 0,
    ...opts,
  };

  fs.mkdirSync(rootDir, { recursive: true });
  writeMikkJson(rootDir);

  const allFiles: string[] = [];
  const moduleNames: string[] = [];

  // Generate normal TS files
  for (let i = 0; i < o.fileCount; i++) {
    const modName = `module_${i.toString().padStart(5, "0")}`;
    moduleNames.push(modName);
  }

  for (let i = 0; i < o.fileCount; i++) {
    const modName = moduleNames[i];
    const filePath = path.join(rootDir, `${modName}.ts`);
    const imports: string[] = [];

    // Regular imports (no cycle by default)
    if (i > 0 && !o.includeCycles) {
      const depIdx = Math.floor(Math.random() * i);
      imports.push(
        `import { func_${depIdx}_0 } from './${moduleNames[depIdx]}';`
      );
    }

    // Cycles: file i imports from file i+1 (mod N)
    if (o.includeCycles && i < o.fileCount - 1) {
      const nextMod = moduleNames[(i + 1) % o.fileCount];
      imports.push(`import { func_${(i + 1) % o.fileCount}_0 } from './${nextMod}';`);
    }

    let code = `// AUTO-GENERATED MODULE ${modName}\n`;
    code += imports.join("\n") + "\n\n";

    for (let f = 0; f < o.functionsPerFile; f++) {
      const fname = `func_${i}_${f}`;
      code += `export function ${fname}(x: number, y: string = "default"): string {\n`;
      if (o.callDepth > 1 && f > 0) {
        code += `  const prev = func_${i}_${f - 1}(x + 1, y);\n`;
      }
      if (o.includeSecrets && Math.random() < 0.05) {
        // Inject secrets with realistic-looking names
        code += `  const apiKey = "sk-proj-${crypto.randomBytes(24).toString("hex")}";\n`;
        code += `  const awsSecret = "wJalrXUtnFEMI/${crypto.randomBytes(12).toString("base64")}/bPxRfiCYEXAMPLEKEY";\n`;
        code += `  const dbPassword = "P@ssw0rd!${crypto.randomBytes(4).toString("hex")}";\n`;
      }
      code += `  return \`result_\${x}_\${y}\`;\n`;
      code += `}\n\n`;
    }

    fs.writeFileSync(filePath, code);
    allFiles.push(filePath);
  }

  // Huge files
  for (let h = 0; h < o.hugeFiles; h++) {
    const filePath = path.join(rootDir, `huge_file_${h}.ts`);
    const chunks: string[] = [];
    // ~12MB of valid TS
    for (let j = 0; j < 50_000; j++) {
      chunks.push(
        `export function huge_func_${h}_${j}(a: number, b: number): number { return a + b + ${j}; }\n`
      );
    }
    fs.writeFileSync(filePath, chunks.join(""));
    allFiles.push(filePath);
  }

  // Empty files
  for (let e = 0; e < o.emptyFiles; e++) {
    const filePath = path.join(rootDir, `empty_${e}.ts`);
    fs.writeFileSync(filePath, "");
    allFiles.push(filePath);
  }

  // Binary files (mis-named as .ts)
  for (let b = 0; b < o.binaryFiles; b++) {
    const filePath = path.join(rootDir, `binary_${b}.ts`);
    fs.writeFileSync(filePath, crypto.randomBytes(4096));
    allFiles.push(filePath);
  }

  // Encoding edge files
  if (o.includeEncodingEdges) {
    const edgePath = path.join(rootDir, "encoding_edge.ts");
    const content = [
      "// File with encoding edge cases",
      "const emoji = '🚀💀🔥';",
      "const arabic = 'مرحبا';",
      "const chinese = '你好世界';",
      "const nullByte = 'before\x00after';",
      "const rtl = '\u202Eevil_reverse';",
      "const bom = '\uFEFFwith_bom';",
      "const longLine = 'x'.repeat(100_000);",
      "export function unicode_func(s: string) { return s; }",
    ].join("\n");
    fs.writeFileSync(edgePath, content, "utf8");
    allFiles.push(edgePath);

    // UTF-16 file disguised as UTF-8
    const utf16Path = path.join(rootDir, "utf16_disguised.ts");
    const buf = Buffer.from("export function test() {}\n", "utf16le");
    fs.writeFileSync(utf16Path, buf);
    allFiles.push(utf16Path);
  }

  return allFiles;
}

/** Generate deeply nested object/call structures */
export function generateDeeplyNested(depth: number): object {
  if (depth <= 0) return { value: "leaf" };
  return { child: generateDeeplyNested(depth - 1), level: depth };
}

/** Generate pathological JSON edge cases */
export function pathologicalJSON(): string[] {
  return [
    // Valid but weird
    "null",
    "true",
    "[]",
    "{}",
    '{"a":null,"b":null}',
    // Deeply nested
    "{" + '"a":'.repeat(1000) + "1" + "}".repeat(1000),
    // Huge array
    "[" + Array(10_000).fill("1").join(",") + "]",
    // Unicode keys
    '{"🔑":"value","\\u0000":"null_key"}',
    // Number precision edge cases
    '{"n":9007199254740993}',
    '{"n":1e308}',
    '{"n":-1e308}',
    // Duplicate keys (behavior undefined in JSON spec)
    '{"a":1,"a":2,"a":3}',
    // Trailing comma (invalid JSON — should be rejected cleanly)
    '{"a":1,}',
    // Single quote (invalid)
    "{'a':1}",
    // Malformed
    '{"unclosed":',
    "",
    "   ",
    "\x00\x01\x02",
  ];
}

/** Generate a circular dependency graph of N modules */
export function generateCircularDeps(
  rootDir: string,
  size: number
): string[] {
  fs.mkdirSync(rootDir, { recursive: true });
  writeMikkJson(rootDir);
  const files: string[] = [];
  for (let i = 0; i < size; i++) {
    const next = (i + 1) % size;
    const filePath = path.join(rootDir, `circular_${i}.ts`);
    fs.writeFileSync(
      filePath,
      `import { f${next} } from './circular_${next}';\nexport function f${i}() { return f${next}(); }\n`
    );
    files.push(filePath);
  }
  return files;
}

/** Generate a diamond dependency (common base imported by many) */
export function generateDiamondDeps(rootDir: string, width: number): string[] {
  fs.mkdirSync(rootDir, { recursive: true });
  writeMikkJson(rootDir);
  const files: string[] = [];

  // Base module
  const base = path.join(rootDir, "diamond_base.ts");
  fs.writeFileSync(base, "export const BASE = 42;\n");
  files.push(base);

  // Middle layer
  const middles: string[] = [];
  for (let i = 0; i < width; i++) {
    const mid = path.join(rootDir, `diamond_mid_${i}.ts`);
    fs.writeFileSync(
      mid,
      `import { BASE } from './diamond_base';\nexport const MID_${i} = BASE + ${i};\n`
    );
    files.push(mid);
    middles.push(`diamond_mid_${i}`);
  }

  // Top module imports all middles
  const top = path.join(rootDir, "diamond_top.ts");
  const imports = middles
    .map((m, i) => `import { MID_${i} } from './${m}';`)
    .join("\n");
  fs.writeFileSync(top, `${imports}\nexport const TOP = ${middles.map((_, i) => `MID_${i}`).join(" + ")};\n`);
  files.push(top);

  return files;
}

/** Simulate a corrupted lock file */
export function generateCorruptedLockFile(targetPath: string, mode: string) {
  const modes: Record<string, string | Buffer> = {
    empty: "",
    truncated: '{"version":1,"files":{',
    wrong_type: JSON.stringify({ version: "not-a-number", files: null }),
    huge: JSON.stringify({
      version: 1,
      files: Object.fromEntries(
        Array.from({ length: 100_000 }, (_, i) => [`file_${i}.ts`, { hash: "abc", mtime: Date.now() }])
      ),
    }),
    binary: crypto.randomBytes(512),
    stale_future: JSON.stringify({
      version: 1,
      created: new Date(Date.now() + 1_000_000_000).toISOString(), // Future timestamp
    }),
  };
  const content = modes[mode] ?? modes["truncated"];
  fs.writeFileSync(targetPath, content as any);
}
