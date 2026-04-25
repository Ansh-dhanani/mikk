#!/usr/bin/env node
/**
 * mikk-to-obsidian.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads mikk.lock.json → writes a clean Obsidian vault.
 *
 * WHAT YOU GET
 * ────────────
 *   One note per source FILE
 *   One note per FUNCTION (all or exported only)
 *   One note per CLASS
 *   One note per GENERIC/TYPE
 *   One note per ROUTE
 *   One note per CONTEXT FILE (configs, env, etc.)
 *   One MODULE INDEX note per package
 *   graph.json  →  colour-coded by module
 *
 * USAGE
 *   node scripts/mikk-to-obsidian.mjs [lock] [outDir]
 *
 * FLAGS
 *   --all-fns      include all functions (not just exported)
 *   --no-fns       skip functions
 *   --help
 */

import fs from "fs/promises";
import path from "path";

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--")));
const pos = args.filter(a => !a.startsWith("--"));

if (flags.has("--help")) {
  console.log(`
  node mikk-to-obsidian.mjs [lock] [outDir] [flags]

  Defaults: lock=mikk.lock.json  outDir=mikk-vault

  --all-fns   include private/internal functions (more nodes)
  --no-fns    skip functions entirely (files + modules only)
  --help      this message
  `);
  process.exit(0);
}

const LOCK_PATH = pos[0] || "mikk.lock.json";
const OUT_DIR = pos[1] || "mikk-vault";
const ALL_FNS = flags.has("--all-fns");
const NO_FNS = flags.has("--no-fns");

// ─── Colours ───────────────────────────────────────────────────────────────

const PALETTE = [
  0x4f9cf9, 0x56cfb2, 0xf6a623, 0xa78bfa, 0xf87171,
  0x34d399, 0xfb7185, 0x60a5fa, 0xfbbf24, 0x818cf8,
  0x38bdf8, 0x4ade80, 0xf472b6, 0xfacc15, 0xa3e635,
  0xfb923c, 0x22d3ee, 0xe879f9, 0x2dd4bf, 0xf43f5e,
];

// ─── Helpers ───────────────────────────────────────────────────────────────

// Normalise: forward-slashes only, lower-case drive letter, lower-case entire path
// (edge paths in lock are already lower-case; projectRoot may have mixed case on Windows)
const norm = p => String(p || "").replace(/\\/g, "/").toLowerCase();

/** Safe filename: strip illegal chars, collapse dashes, cap at 180 chars */
const slug = s => String(s || "")
  .replace(/[<>"?*|]/g, "")
  .replace(/[/\\:.]/g, "-")
  .replace(/-{2,}/g, "-")
  .replace(/^-|-$/g, "")
  .toLowerCase()
  .slice(0, 180) || "unknown";

/** Simple name from full path - just the immediate parts, no long paths */
const simpleName = (s, isFn = false) => {
  let base = String(s || "");
  // Strip prefixes like fn:, var:, prop:, cls:, class:
  for (const pfx of ["fn:", "var:", "prop:", "cls:", "class:"]) {
    if (base.startsWith(pfx)) { base = base.slice(pfx.length); break; }
  }
  // Strip Windows drive letter (c:) and normalize to forward slashes
  base = base.replace(/^[a-z]:/i, "").replace(/\\/g, "/");
  // For files: get just filename (before any colon for props)
  // For fns: get name after the last colon
  if (isFn) {
    base = base.replace(/^.*[/:]([^/:]+)$/, "$1");
  } else {
    base = base.replace(/:.*$/, "");       // remove property suffix
    base = base.replace(/^.*\//, "");  // get filename
  }
  const result = base.replace(/\.[^.]+$/, "");  // strip extension
  // Fallback: if result is too short or empty, use a portion of the path
  if (!result || result.length <= 1) {
    const parts = base.split("/").filter(Boolean);
    return parts[parts.length - 1] || "unknown";
  }
  return result;
};

/** Get the top-level "package" segment of a relative path  e.g. packages/core */
function pkgSegment(rel) {
  const s = rel.split("/").filter(Boolean);
  if (s[0] === "packages" && s[1]) return s[1];
  if (s[0] === "apps" && s[1]) return `apps/${s[1]}`;
  if (s[0] === "scripts") return "scripts";
  return s[0] || "root";
}

/** Top-level dirs we always skip — benchmarks, test fixtures, tooling noise */
const SKIP_DIRS = new Set([
  "benchmarks", "node_modules", ".mikk", ".obsidian",
  ".turbo", ".git", ".github", ".vscode", ".ruff_cache",
  "samples", "scratch", "dist", "build", ".next",
]);

/** True if this relative path is noise we want to skip */
function isNoise(rel) {
  if (!rel) return true;
  const first = rel.split("/")[0];
  if (SKIP_DIRS.has(first)) return true;
  return false;
}

const last = p => { const s = p.split("/"); return s[s.length - 1] || p; };

// ─── Write helper ──────────────────────────────────────────────────────────

const _dirs = new Set();
async function write(filePath, content) {
  const dir = path.dirname(filePath);
  if (!_dirs.has(dir)) { await fs.mkdir(dir, { recursive: true }); _dirs.add(dir); }
  await fs.writeFile(filePath, content, "utf8");
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load lock
  const lockAbs = path.resolve(LOCK_PATH);
  console.log(`📖  ${lockAbs}`);
  let raw;
  try { raw = JSON.parse(await fs.readFile(lockAbs, "utf8")); }
  catch (e) { console.error("❌  Cannot read lock:", e.message); process.exit(1); }

  const ROOT = norm(raw.projectRoot || "").replace(/\/$/, "") + "/";
  const fnIndex = Array.isArray(raw.fnIndex) ? raw.fnIndex : [];
  const outAbs = path.resolve(OUT_DIR);
  console.log(`🔍  Lock v${raw.version || "?"} — projectRoot: ${ROOT}`);

  // ─── 2. Build file map from graph edges ──────────────────────────────────
  // key = normalised absolute path, value = { pkg, rel, calls: Set, calledBy: Set }
  const files = new Map();

  function getOrAddFile(rawKey) {
    // skip non-file nodes here (fn, var, class, prop)
    if (rawKey.startsWith("fn:") || rawKey.startsWith("var:") ||
      rawKey.startsWith("cls:") || rawKey.startsWith("class:") ||
      rawKey.startsWith("prop:")) return null;
    const fp = norm(rawKey);
    const rel = fp.startsWith(ROOT) ? fp.slice(ROOT.length) : fp.replace(/^[a-z]:\//, "");
    if (isNoise(rel)) return null;
    if (!files.has(fp)) {
      files.set(fp, { fp, rel, pkg: pkgSegment(rel), calls: new Set(), calledBy: new Set() });
    }
    return files.get(fp);
  }

  // Resolve file that owns a fn/var/cls key
  function ownerFile(nodeKey) {
    let body = nodeKey;
    for (const pfx of ["fn:", "var:", "cls:", "class:"]) {
      if (nodeKey.startsWith(pfx)) { body = nodeKey.slice(pfx.length); break; }
    }
    const at = body.lastIndexOf(":");
    const fp = at > 0 ? norm(body.slice(0, at)) : norm(body);
    return fp;
  }

  for (const edge of (raw.graph?.edges || [])) {
    const { from, to, type } = edge;

    // Register file nodes
    getOrAddFile(from);
    getOrAddFile(to);

    // Wire file-level links for calls/imports
    if (type === "calls" || type === "imports") {
      const fromFp = from.startsWith("fn:") || from.startsWith("var:") || from.startsWith("cls:") || from.startsWith("class:")
        ? ownerFile(from) : norm(from);
      const toFp = to.startsWith("fn:") || to.startsWith("var:") || to.startsWith("cls:") || to.startsWith("class:")
        ? ownerFile(to) : norm(to);

      const fromFile = files.get(fromFp);
      const toFile = files.get(toFp);
      if (fromFile && toFile && fromFp !== toFp) {
        fromFile.calls.add(toFp);
        toFile.calledBy.add(fromFp);
      }
    }
  }

  console.log(`    ${files.size} source files found`);

  const fns = new Map();
  if (!NO_FNS) {
    let added = 0;
    for (const [key, entity] of Object.entries(raw.functions || {})) {
      const idx = parseInt(key, 10);
      const fullId = (!isNaN(idx) && fnIndex[idx]) ? fnIndex[idx]
        : (entity.id || `fn::${entity.name || key}`);

      if (!fullId.startsWith("fn:")) continue;

      const body = fullId.slice(3);
      const at = body.lastIndexOf(":");
      if (at <= 0) continue;

      const fp = norm(body.slice(0, at));
      const name = body.slice(at + 1);
      const rel = fp.startsWith(ROOT) ? fp.slice(ROOT.length) : fp.replace(/^[a-z]:\//, "");

      if (!ALL_FNS && !entity.isExported) continue;

      if (!files.has(fp)) {
        files.set(fp, { fp, rel, pkg: pkgSegment(rel), calls: new Set(), calledBy: new Set() });
        added++;
      }

      fns.set(fullId, {
        id: fullId,
        name: entity.name || name,
        fp,
        pkg: pkgSegment(rel),
        isExported: !!entity.isExported,
        purpose: entity.purpose || "",
        role: entity.role || "",
        params: entity.params || [],
        returnType: entity.returnType || "",
        calls: new Set(
          (entity.calls || []).map(r => (typeof r === "number" ? fnIndex[r] : r)).filter(Boolean)
        ),
      });
    }
    console.log(`    ${fns.size} function notes (${ALL_FNS ? "all" : "exported only"})`);
  }

  // ─── 3b. Classes ───────────────────────────────────────────────────────────────
  const classes = new Map();
  for (const [key, entity] of Object.entries(raw.classes || {})) {
    // Key is already full id like "class:c:/path/to/file.ts:ClassName"
    const fullId = key;
    const body = fullId.replace(/^class:/, "");
    const at = body.lastIndexOf(":");
    if (at <= 0) continue;

    const fp = norm(body.slice(0, at));
    const name = body.slice(at + 1);
    const rel = fp.startsWith(ROOT) ? fp.slice(ROOT.length) : fp.replace(/^[a-z]:\//, "");

    if (isNoise(rel)) continue;

    classes.set(fullId, {
      id: fullId,
      name: entity.name || name,
      fp,
      pkg: pkgSegment(rel),
      isExported: !!entity.isExported,
      purpose: entity.purpose || "",
    });
  }
  if (classes.size > 0) console.log(`    ${classes.size} class notes`);

  // ─── 3c. Generics ───────────────────────────────────────────────────────────────
  const generics = new Map();
  for (const [key, entity] of Object.entries(raw.generics || {})) {
    // Key is already full id like "type:c:/path/to/file.ts:TypeName"
    const fullId = key;
    const body = fullId.replace(/^type:/, "").replace(/^enum:/, "");
    const at = body.lastIndexOf(":");
    if (at <= 0) continue;

    const fp = norm(body.slice(0, at));
    const name = body.slice(at + 1);
    const rel = fp.startsWith(ROOT) ? fp.slice(ROOT.length) : fp.replace(/^[a-z]:\//, "");

    if (isNoise(rel)) continue;

    generics.set(fullId, {
      id: fullId,
      name: entity.name || name,
      type: entity.type || "type",
      fp,
      pkg: pkgSegment(rel),
      isExported: !!entity.isExported,
      purpose: entity.purpose || "",
    });
  }
  if (generics.size > 0) console.log(`    ${generics.size} generic notes`);

  // ─── 3d. Routes ───────────────────────────────────────────────────────────────
  const routes = new Map();
  for (const entity of (raw.routes || [])) {
    const fullId = `route:${entity.method}:${entity.path}`;
    routes.set(fullId, {
      id: fullId,
      method: entity.method,
      path: entity.path,
      handler: entity.handler,
      file: entity.file,
      line: entity.line,
    });
  }
  if (routes.size > 0) console.log(`    ${routes.size} route notes`);

  // ─── 3f. Variables ───────────────────────────────────────────────────────
  const allNodeIds = new Set()
  for (const edge of (raw.graph?.edges || [])) {
    allNodeIds.add(edge.from)
    allNodeIds.add(edge.to)
  }

  const variables = new Map()
  for (const id of allNodeIds) {
    if (!id.startsWith('var:')) continue
    const body = id.slice(4)
    const at = body.lastIndexOf(':')
    if (at <= 0) continue
    const fp = norm(body.slice(0, at))
    const name = body.slice(at + 1)
    const rel = fp.startsWith(ROOT) ? fp.slice(ROOT.length) : fp.replace(/^[a-z]:\//, "")
    if (isNoise(rel)) continue
    variables.set(id, { id, name, fp, pkg: pkgSegment(rel) })
  }
  if (variables.size > 0) console.log(`    ${variables.size} variable notes`)

  // ─── 3g. Properties ───────────────────────────────────────────────────────
  const properties = new Map()
  for (const id of allNodeIds) {
    if (!id.startsWith('prop:')) continue
    const body = id.slice(5)
    const at = body.lastIndexOf(':')
    if (at <= 0) continue
    const fp = norm(body.slice(0, at))
    const fullName = body.slice(at + 1)
    const rel = fp.startsWith(ROOT) ? fp.slice(ROOT.length) : fp.replace(/^[a-z]:\//, "")
    if (isNoise(rel)) continue
    properties.set(id, { id, name: fullName, fp, pkg: pkgSegment(rel) })
  }
  if (properties.size > 0) console.log(`    ${properties.size} property notes`);

  // ─── 3e. Context Files ──────────────────────────────────────────────────────
  const ctxFiles = new Map();
  for (const entity of (raw.contextFiles || [])) {
    const fullId = entity.path;
    ctxFiles.set(fullId, {
      id: fullId,
      path: entity.path,
      type: entity.type,
      size: entity.size || 0,
    });
  }
  if (ctxFiles.size > 0) console.log(`    ${ctxFiles.size} context file notes`);

  // Add files for classes/generics/routes
  for (const cls of classes.values()) {
    const rel = cls.fp.startsWith(ROOT) ? cls.fp.slice(ROOT.length) : cls.fp.replace(/^[a-z]:\//, "");
    if (!files.has(cls.fp)) {
      files.set(cls.fp, { fp: cls.fp, rel, pkg: pkgSegment(rel), calls: new Set(), calledBy: new Set() });
    }
  }
  for (const gen of generics.values()) {
    const rel = gen.fp.startsWith(ROOT) ? gen.fp.slice(ROOT.length) : gen.fp.replace(/^[a-z]:\//, "");
    if (!files.has(gen.fp)) {
      files.set(gen.fp, { fp: gen.fp, rel, pkg: pkgSegment(rel), calls: new Set(), calledBy: new Set() });
    }
  }
  for (const rt of routes.values()) {
    const rel = rt.file.startsWith(ROOT) ? rt.file.slice(ROOT.length) : rt.file.replace(/^[a-z]:\//, "");
    if (!files.has(rt.file)) {
      files.set(rt.file, { fp: rt.file, rel, pkg: pkgSegment(rel), calls: new Set(), calledBy: new Set() });
    }
  }

  // ─── 4. Group into packages ───────────────────────────────────────────────
  const pkgs = new Map();   // pkgName → { files: [], fns: [], classes: [], generics: [], variables: [], properties: [] }
  for (const f of files.values()) {
    if (!pkgs.has(f.pkg)) pkgs.set(f.pkg, { files: [], fns: [], classes: [], generics: [], variables: [], properties: [] });
    pkgs.get(f.pkg).files.push(f);
  }
  for (const fn of fns.values()) {
    if (!pkgs.has(fn.pkg)) pkgs.set(fn.pkg, { files: [], fns: [], classes: [], generics: [], variables: [], properties: [] });
    pkgs.get(fn.pkg).fns.push(fn);
  }
  for (const cls of classes.values()) {
    const rel = cls.fp.startsWith(ROOT) ? cls.fp.slice(ROOT.length) : cls.fp.replace(/^[a-z]:\//, "");
    const pkg = pkgSegment(rel);
    if (!pkgs.has(pkg)) pkgs.set(pkg, { files: [], fns: [], classes: [], generics: [], variables: [], properties: [] });
    pkgs.get(pkg).classes.push(cls);
  }
  for (const gen of generics.values()) {
    const rel = gen.fp.startsWith(ROOT) ? gen.fp.slice(ROOT.length) : gen.fp.replace(/^[a-z]:\//, "");
    const pkg = pkgSegment(rel);
    if (!pkgs.has(pkg)) pkgs.set(pkg, { files: [], fns: [], classes: [], generics: [], variables: [], properties: [] });
    pkgs.get(pkg).generics.push(gen);
  }
  for (const v of variables.values()) {
    const rel = v.fp.startsWith(ROOT) ? v.fp.slice(ROOT.length) : v.fp.replace(/^[a-z]:\//, "");
    const pkg = pkgSegment(rel);
    if (!pkgs.has(pkg)) pkgs.set(pkg, { files: [], fns: [], classes: [], generics: [], variables: [], properties: [] });
    pkgs.get(pkg).variables.push(v);
  }
  for (const p of properties.values()) {
    const rel = p.fp.startsWith(ROOT) ? p.fp.slice(ROOT.length) : p.fp.replace(/^[a-z]:\//, "");
    const pkg = pkgSegment(rel);
    if (!pkgs.has(pkg)) pkgs.set(pkg, { files: [], fns: [], classes: [], generics: [], variables: [], properties: [] });
    pkgs.get(pkg).properties.push(p);
  }

  // ─── 5. Write notes ───────────────────────────────────────────────────────
  console.log(`📁  Writing to ${outAbs}`);
  await fs.mkdir(outAbs, { recursive: true });

  // Build simple name map with collision handling (add suffix only when colliding)
  const nameCounts = new Map();
  for (const f of files.values()) {
    const n = simpleName(f.fp);
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }
  for (const fn of fns.values()) {
    const n = simpleName(fn.id, true);
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }
  for (const cls of classes.values()) {
    const n = cls.name;
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }
  for (const gen of generics.values()) {
    const n = gen.name;
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }
  for (const v of variables.values()) {
    const n = v.name;
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }
  for (const p of properties.values()) {
    const n = p.name;
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  }

  // Simple slug: base name with immediate parent dir for collisions
  const simpleSlug = (s, isFn = false) => {
    const n = simpleName(s, isFn);
    const count = nameCounts.get(n) || 0;
    if (count > 1) {
      // Get just the immediate parent dir (one level up)
      let base = String(s || "").replace(/^[a-z]:/i, "").replace(/\\/g, "/").replace(/:.*$/, "").replace(/\.[^.]+$/, "");
      const parts = base.split("/").filter(Boolean);
      const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
      return slug(parent ? `${n}-${parent}` : n);
    }
    const result = slug(n);
    if (result.length <= 1) {
      // Fallback: use more of the path
      let base = String(s || "").replace(/^[a-z]:/i, "").replace(/\\/g, "/").replace(/:.*$/, "").replace(/\.[^.]+$/, "");
      const parts = base.split("/").filter(Boolean);
      return slug(parts.slice(-2).join("-"));
    }
    return result;
  };

  // Helper: wikilink from absolute fp to its note
  function fileLink(fp) {
    const f = files.get(fp);
    if (!f) return null;
    return `[[file/${simpleSlug(f.fp)}|${simpleName(f.fp)}]]`;
  }
  function fnLink(id) {
    const f = fns.get(id);
    if (!f) return null;
    return `[[fn/${simpleSlug(f.id, true)}|${simpleName(f.id, true)}]]`;
  }

  // — File notes —
  let fileCount = 0;
  for (const f of files.values()) {
    const callLinks = [...f.calls].map(fileLink).filter(Boolean).map(l => `- ${l}`).join("\n");
    const callerLinks = [...f.calledBy].map(fileLink).filter(Boolean).map(l => `- ${l}`).join("\n");

    // functions defined in this file
    const ownFns = [...fns.values()].filter(fn => fn.fp === f.fp);
    const fnLinks = ownFns.map(fn => `- [[fn/${simpleSlug(fn.id, true)}|${simpleName(fn.id, true)}]]${fn.purpose ? "  — " + fn.purpose : ""}`).join("\n");

    const content = `---
tags: [mikk/file, mikk/${slug(f.pkg)}]
pkg: "${f.pkg}"
path: "${f.rel}"
---

# 📄 ${simpleName(f.fp)}

**Package:** [[module-${slug(f.pkg)}|${f.pkg}]]  
**Path:** \`${f.rel}\`

## Exported Functions
${fnLinks || "_none_"}

## Calls
${callLinks || "_none_"}

## Called By
${callerLinks || "_none_"}
`;
    await write(path.join(outAbs, `file/${simpleSlug(f.fp)}.md`), content);
    fileCount++;
  }
  console.log(`    ✔ ${fileCount} file notes`);

  // — Function notes —
  let fnCount = 0;
  for (const fn of fns.values()) {
    const paramStr = fn.params.map(p => `\`${p.name}${p.optional ? "?" : ""}: ${p.type}\``).join(", ");
    const callLinks = [...fn.calls].map(fnLink).filter(Boolean).map(l => `- ${l}`).join("\n");

    const content = `---
tags: [mikk/fn, mikk/${slug(fn.pkg)}]
pkg: "${fn.pkg}"
file: "[[file/${simpleSlug(fn.fp)}|${simpleName(fn.fp)}]]"
exported: ${fn.isExported}
---

# ⚙️ ${simpleName(fn.id, true)}

**File:** [[file/${simpleSlug(fn.fp)}|${simpleName(fn.fp)}]]  
**Package:** [[module-${slug(fn.pkg)}|${fn.pkg}]]${fn.purpose ? `  \n**Purpose:** ${fn.purpose}` : ""}

## Signature
\`\`\`
${fn.name}(${paramStr})${fn.returnType ? ": " + fn.returnType : ""}
\`\`\`

## Calls
${callLinks || "_none_"}
`;
    await write(path.join(outAbs, `fn/${simpleSlug(fn.id, true)}.md`), content);
    fnCount++;
  }
  if (!NO_FNS) console.log(`    ✔ ${fnCount} function notes`);

  // — Class notes —
  let classCount = 0;
  for (const cls of classes.values()) {
    // Find methods: functions in same file whose id matches ClassName.methodName
    const methodPrefix = `fn:${cls.fp}:${cls.name}.`;
    const altPrefix = `fn:${cls.fp}:${cls.name}#`;
    const methods = [...fns.values()].filter(fn =>
      fn.id.startsWith(methodPrefix) || fn.id.startsWith(altPrefix)
    ).sort((a, b) => a.name.localeCompare(b.name));
    const methodLinks = methods.length
      ? methods.map(fn =>
        `- [[fn/${simpleSlug(fn.id, true)}|${simpleName(fn.id, true)}]]${fn.purpose ? '  — ' + fn.purpose : ''}`
      ).join('\n')
      : '_none_';
    const content = `---
tags: [mikk/class, mikk/${slug(cls.pkg)}]
exported: ${cls.isExported}
---

# 🏠 ${cls.name}

**File:** [[file/${simpleSlug(cls.fp)}|${simpleName(cls.fp)}]]  
**Package:** [[module-${slug(cls.pkg)}|${cls.pkg}]]${cls.purpose ? `\n**Purpose:** ${cls.purpose}` : ""}

## Methods
${methodLinks}
`;
    await write(path.join(outAbs, `class/${simpleSlug(cls.name, false)}.md`), content);
    classCount++;
  }
  if (classCount > 0) console.log(`    ✔ ${classCount} class notes`);


  // — Generic notes —
  let genCount = 0;
  for (const gen of generics.values()) {
    const content = `---
tags: [mikk/generic, mikk/${slug(gen.pkg)}]
type: "${gen.type}"
exported: ${gen.isExported}
---

# 🔤 ${gen.name}

**Type:** ${gen.type}  
**File:** [[file/${simpleSlug(gen.fp)}|${simpleName(gen.fp)}]]  
**Package:** [[module-${slug(gen.pkg)}|${gen.pkg}]]${gen.purpose ? `\n**Purpose:** ${gen.purpose}` : ""}
`;
    await write(path.join(outAbs, `type/${simpleSlug(gen.name, false)}.md`), content);
    genCount++;
  }
  if (genCount > 0) console.log(`    ✔ ${genCount} generic notes`);

  // — Route notes —
  let routeCount = 0;
  for (const rt of routes.values()) {
    const content = `---
tags: [mikk/route]
method: "${rt.method}"
---

# 🌐 ${rt.method} ${rt.path}

**Handler:** ${rt.handler}  
**File:** [[file/${simpleSlug(rt.file)}|${simpleName(rt.file)}]]:${rt.line}
`;
    await write(path.join(outAbs, `route/${slug(rt.method + "-" + rt.path.replace(/\//g, "-"))}.md`), content);
    routeCount++;
  }
  if (routeCount > 0) console.log(`    ✔ ${routeCount} route notes`);

  // — Variable notes —
  let varCount = 0;
  for (const v of variables.values()) {
    const content = `---
tags: [mikk/variable, mikk/${slug(v.pkg)}]
---

# 📊 ${v.name}

**File:** [[file/${simpleSlug(v.fp)}|${simpleName(v.fp)}]]  
**Package:** [[module-${slug(v.pkg)}|${v.pkg}]]
`;
    await write(path.join(outAbs, `var/${simpleSlug(v.name, false)}.md`), content);
    varCount++;
  }
  if (varCount > 0) console.log(`    ✔ ${varCount} variable notes`);

  // — Property notes —
  let propCount = 0;
  for (const p of properties.values()) {
    const content = `---
tags: [mikk/property, mikk/${slug(p.pkg)}]
---

# 💠 ${p.name}

**File:** [[file/${simpleSlug(p.fp)}|${simpleName(p.fp)}]]  
**Package:** [[module-${slug(p.pkg)}|${p.pkg}]]
`;
    await write(path.join(outAbs, `prop/${simpleSlug(p.name, false)}.md`), content);
    propCount++;
  }
  if (propCount > 0) console.log(`    ✔ ${propCount} property notes`);

  // — Context File notes —
  let ctxCount = 0;
  for (const cf of ctxFiles.values()) {
    const content = `---
tags: [mikk/ctxfile]
type: "${cf.type}"
---

# 📋 ${cf.path.split("/").pop()}

**Path:** \`${cf.path}\`  
**Type:** ${cf.type}  
**Size:** ${cf.size || 0} bytes
`;
    await write(path.join(outAbs, `ctxfile/${slug(cf.path.split("/").pop())}.md`), content);
    ctxCount++;
  }
  if (ctxCount > 0) console.log(`    ✔ ${ctxCount} context file notes`);

  // — Module index notes —
  for (const [pkg, data] of pkgs) {
    const fileLinks = data.files.sort((a, b) => a.rel.localeCompare(b.rel))
      .map(f => `- [[file/${simpleSlug(f.fp)}|${simpleName(f.fp)}]]`).join("\n");
    const fnLinks2 = data.fns.sort((a, b) => a.name.localeCompare(b.name))
      .map(fn => `- [[fn/${simpleSlug(fn.id, true)}|${simpleName(fn.id, true)}]]${fn.purpose ? "  — " + fn.purpose : ""}`).join("\n");
    const classLinks = data.classes.sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `- [[class/${simpleSlug(c.name, false)}|${c.name}]]`).join("\n");
    const genLinks = data.generics.sort((a, b) => a.name.localeCompare(b.name))
      .map(g => `- [[type/${simpleSlug(g.name, false)}|${g.name}]]`).join("\n");

    const content = `---
tags: [mikk/module, mikk/${slug(pkg)}]
type: module
---

# 📦 ${pkg}

**Files:** ${data.files.length}  |  **Fns:** ${data.fns.length}  |  **Classes:** ${data.classes.length}  |  **Generics:** ${data.generics.length}

## Files
${fileLinks || "_none_"}

## Functions
${fnLinks2 || "_none_"}

## Classes
${classLinks || "_none_"}

## Types/Generics
${genLinks || "_none_"}
`;
    await write(path.join(outAbs, `module-${slug(pkg)}.md`), content);
  }
  console.log(`    ✔ ${pkgs.size} module notes`);

  // — Index —
  const genTime = new Date().toISOString();
  const pkgRows = [...pkgs.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([p, d]) => `| [[module-${slug(p)}\\|${p}]] | ${d.files.length} | ${d.fns.length} |`)
    .join("\n");

  await write(path.join(outAbs, "index.md"), `---
tags: [mikk/index]
generated: "${genTime}"
---

# 🔷 Code Graph Index

> \`${genTime}\`  •  root: \`${ROOT}\`

| Package | Files | Exported Fns |
|---------|-------|--------------|
${pkgRows}

---
_Open this folder as an Obsidian vault → \`Ctrl+G\` for Graph view_
`);
  console.log(`    ✔ index.md`);

  // — .obsidian/graph.json —
  const sortedPkgs = [...pkgs.keys()].sort();
  const colorGroups = sortedPkgs.map((p, i) => ({
    query: `tag:mikk/${slug(p).replace(/\//g, '-')}`,
    color: { a: 1, rgb: PALETTE[i % PALETTE.length] },
  }));

  await fs.mkdir(path.join(outAbs, ".obsidian"), { recursive: true });
  await write(path.join(outAbs, ".obsidian/graph.json"), JSON.stringify({
    "collapse-filter": true,
    "search": "",
    "showTags": true,
    "showAttachments": false,
    "hideUnresolved": false,
    "showOrphans": true,
    "collapse-color-groups": false,
    colorGroups,
    "collapse-display": true,
    "showArrow": true,
    "textFadeMultiplier": 0,
    "nodeSizeMultiplier": 1,
    "lineSizeMultiplier": 1,
    "collapse-forces": true,
    "centerStrength": 0.518713248970312,
    "repelStrength": 10,
    "linkStrength": 1,
    "linkDistance": 200,
    "scale": 1,
    "close": false,
  }, null, 2));

  // make Obsidian recognise the folder as a vault
  const appJson = path.join(outAbs, ".obsidian/app.json");
  try { await fs.access(appJson); } catch { await write(appJson, "{}"); }

  const total = fileCount + fnCount + classCount + genCount + routeCount + varCount + propCount + ctxCount + pkgs.size + 1;
  console.log(`
✅  Done — ${total} notes total
   ${fileCount} files  •  ${fnCount} functions  •  ${classCount} classes  •  ${genCount} generics  •  ${routeCount} routes  •  ${varCount} variables  •  ${propCount} properties  •  ${ctxCount} ctxfiles  •  ${pkgs.size} modules

HOW TO USE
  1. Open Obsidian → "Open folder as vault"
  2. Select:  ${outAbs}
  3. Ctrl/Cmd+G  →  Graph view
  4. Graph panel → Groups  →  colour-coded by package

RE-RUN ANYTIME — notes are overwritten, not duplicated.
`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
