var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  MikkGraphView: () => MikkGraphView,
  default: () => MikkPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var PALETTE = [
  "#4f9cf9",
  "#56cfb2",
  "#f6a623",
  "#a78bfa",
  "#f87171",
  "#34d399",
  "#fb7185",
  "#60a5fa",
  "#fbbf24",
  "#818cf8",
  "#2dd4bf",
  "#e879f9",
  "#4ade80",
  "#f97316",
  "#c084fc",
  "#38bdf8"
];
var NAMED_COLORS = {
  core: "#4f9cf9",
  cli: "#f6a623",
  api: "#f87171",
  auth: "#a78bfa",
  parser: "#56cfb2",
  graph: "#60a5fa",
  utils: "#818cf8",
  types: "#94a3b8",
  cache: "#fbbf24",
  contract: "#a78bfa",
  search: "#2dd4bf",
  security: "#f87171",
  intent: "#fb7185",
  watcher: "#34d399",
  mcp: "#c084fc",
  hash: "#56cfb2",
  analysis: "#818cf8",
  web: "#60a5fa",
  obsidian: "#a78bfa"
};
function getModuleColor(moduleId, index) {
  if (!moduleId) return PALETTE[0];
  const lower = moduleId.toLowerCase();
  for (const [k, v] of Object.entries(NAMED_COLORS)) {
    if (lower === k || lower.endsWith("-" + k) || lower.includes("/" + k)) return v;
  }
  return PALETTE[index % PALETTE.length];
}
function hexToRgb01(hex) {
  if (!hex?.startsWith("#")) return [0.6, 0.7, 0.85];
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}
function lerpColor(c1, c2, t) {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}
function normPath(p) {
  return String(p ?? "").replace(/\\/g, "/").toLowerCase().trim();
}
function extractNameFromId(fullId, prefix) {
  const body = fullId.startsWith(prefix) ? fullId.slice(prefix.length) : fullId;
  const last = body.lastIndexOf(":");
  if (last > 0) {
    const candidate = body.slice(last + 1);
    if (candidate && !/^\d+$/.test(candidate)) return candidate;
  }
  return null;
}
function extractFileFromId(fullId, prefix) {
  const body = fullId.startsWith(prefix) ? fullId.slice(prefix.length) : fullId;
  const last = body.lastIndexOf(":");
  return last > 0 ? body.slice(0, last) : "";
}
function deriveModuleFromPath(filePath, explicit) {
  if (explicit && typeof explicit === "string") {
    const clean = explicit.replace(/^(packages|apps)-/, "").replace(/-\d+$/, "").trim();
    if (clean && !/^\d+$/.test(clean)) return clean;
  }
  const parts = normPath(filePath).split("/").filter(Boolean);
  const pkgIdx = parts.findIndex((p) => p === "packages" || p === "apps");
  if (pkgIdx !== -1 && pkgIdx + 1 < parts.length) return parts[pkgIdx + 1];
  const srcIdx = parts.lastIndexOf("src");
  if (srcIdx !== -1 && srcIdx + 1 < parts.length) return parts[srcIdx + 1];
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || "unknown";
}
function hydrateLock(raw) {
  if (!raw || typeof raw !== "object") return null;
  const fnIndex = Array.isArray(raw.fnIndex) ? raw.fnIndex : [];
  const resolveFnRef = (ref) => {
    if (typeof ref === "number") return fnIndex[ref] ?? null;
    if (typeof ref === "string" && ref) return ref;
    return null;
  };
  const files = {};
  const fileModuleMap = /* @__PURE__ */ new Map();
  for (const [key, fe] of Object.entries(raw.files ?? {})) {
    const filePath = fe?.path ?? key;
    const mod = deriveModuleFromPath(filePath, fe?.moduleId);
    files[normPath(filePath)] = { path: filePath, moduleId: mod };
    fileModuleMap.set(normPath(filePath), mod);
    fileModuleMap.set(normPath(key), mod);
  }
  const functions = {};
  for (const [key, fe] of Object.entries(raw.functions ?? {})) {
    const idx = parseInt(key, 10);
    let fullId;
    if (!isNaN(idx) && fnIndex[idx]) fullId = fnIndex[idx];
    else if (fe?.id && typeof fe.id === "string" && !/^\d+$/.test(fe.id)) fullId = fe.id;
    else fullId = key;
    let name = "";
    if (fe?.name && typeof fe.name === "string" && !/^\d+$/.test(fe.name)) name = fe.name;
    if (!name) name = extractNameFromId(fullId, "fn:") ?? "";
    if (!name) {
      const f = fe?.file ?? extractFileFromId(fullId, "fn:");
      name = (f.split("/").pop() ?? "").replace(/\.[^.]+$/, "") || `fn_${key}`;
    }
    const file = fe?.file ?? extractFileFromId(fullId, "fn:");
    const modId = deriveModuleFromPath(file, fe?.moduleId ?? fileModuleMap.get(normPath(file)));
    const calls = [];
    const calledBy = [];
    for (const c of fe?.calls ?? []) {
      const r = resolveFnRef(c);
      if (r) calls.push(r);
    }
    for (const c of fe?.calledBy ?? []) {
      const r = resolveFnRef(c);
      if (r) calledBy.push(r);
    }
    const lines = Array.isArray(fe?.lines) ? [fe.lines[0] ?? 0, fe.lines[1] ?? 0] : [fe?.startLine ?? 0, fe?.endLine ?? 0];
    functions[fullId] = {
      id: fullId,
      name,
      file,
      moduleId: modId,
      isExported: !!fe?.isExported,
      isAsync: !!fe?.isAsync,
      purpose: fe?.purpose ?? "",
      calls,
      calledBy,
      startLine: lines[0],
      endLine: lines[1]
    };
  }
  const classes = {};
  for (const [key, ce] of Object.entries(raw.classes ?? {})) {
    const name = ce?.name ?? extractNameFromId(key, "class:") ?? key;
    const file = ce?.file ?? extractFileFromId(key, "class:");
    const mod = deriveModuleFromPath(file, ce?.moduleId ?? fileModuleMap.get(normPath(file)));
    classes[key] = { id: key, name, file, moduleId: mod, isExported: !!ce?.isExported, purpose: ce?.purpose ?? "" };
  }
  const generics = {};
  for (const [key, ge] of Object.entries(raw.generics ?? {})) {
    const name = ge?.name ?? extractNameFromId(key, "type:") ?? extractNameFromId(key, "enum:") ?? key;
    const file = ge?.file ?? extractFileFromId(key, "type:");
    const mod = deriveModuleFromPath(file, ge?.moduleId ?? fileModuleMap.get(normPath(file)));
    generics[key] = {
      id: key,
      name,
      file,
      moduleId: mod,
      isExported: !!ge?.isExported,
      type: ge?.type ?? "type",
      purpose: ge?.purpose ?? ""
    };
  }
  const modules = {};
  for (const [id, m] of Object.entries(raw.modules ?? {})) {
    modules[id] = { id, name: m?.name ?? m?.id ?? id, description: m?.description ?? "" };
  }
  for (const fn of Object.values(functions)) {
    if (fn.moduleId && !modules[fn.moduleId])
      modules[fn.moduleId] = { id: fn.moduleId, name: fn.moduleId, description: "" };
  }
  for (const c of Object.values(classes)) {
    if (c.moduleId && !modules[c.moduleId])
      modules[c.moduleId] = { id: c.moduleId, name: c.moduleId, description: "" };
  }
  for (const g of Object.values(generics)) {
    if (g.moduleId && !modules[g.moduleId])
      modules[g.moduleId] = { id: g.moduleId, name: g.moduleId, description: "" };
  }
  return { modules, functions, classes, generics, files };
}
async function loadThree() {
  if (window.__THREE_MIKK) return window.__THREE_MIKK;
  if (window.THREE?.Scene) {
    window.__THREE_MIKK = window.THREE;
    return window.THREE;
  }
  if (typeof require === "function") {
    try {
      const t = require("three");
      if (t?.Scene) {
        window.__THREE_MIKK = t;
        return t;
      }
    } catch {
    }
  }
  const urls = [
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "https://unpkg.com/three@0.128.0/build/three.min.js"
  ];
  for (const url of urls) {
    const ok = await new Promise((res) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => res(true);
      s.onerror = () => res(false);
      document.head.appendChild(s);
    });
    if (ok && window.THREE?.Scene) {
      window.__THREE_MIKK = window.THREE;
      return window.THREE;
    }
  }
  throw new Error("Failed to load Three.js from all CDN sources");
}
var DEFAULT_SETTINGS = {
  lockFilePath: "mikk.lock.json",
  autoDetect: true
};
var DEFAULT_CFG = {
  showEdges: true,
  showHalos: true,
  showLabels: true,
  edgeOpacity: 0.4,
  nodeScale: 1,
  labelSize: 13,
  dimStrength: 0.07
};
var VIEW_TYPE = "mikk-graph-v3";
var MikkGraphView = class extends import_obsidian.ItemView {
  plugin;
  cfg;
  // Three.js
  T = null;
  renderer = null;
  scene = null;
  camera = null;
  rafId = 0;
  // Graph data
  lock = null;
  lockPath = null;
  nodes = [];
  edges = [];
  nodeMap = /* @__PURE__ */ new Map();
  // Module colour maps
  moduleColors = /* @__PURE__ */ new Map();
  // moduleId → hex
  moduleRgb = /* @__PURE__ */ new Map();
  // moduleId → rgb
  // LOD expansion
  expandedModules = /* @__PURE__ */ new Set();
  // Three.js objects
  instMesh = null;
  edgeMesh = null;
  haloMeshes = [];
  dummy = null;
  colorObj = null;
  raycaster = null;
  // Interaction
  hovIdx = -1;
  selIdx = -1;
  highlight = /* @__PURE__ */ new Set();
  spherical = { theta: 0.5, phi: 0.85, radius: 1800 };
  target = { x: 0, y: 0, z: 0 };
  isDragging = false;
  isPanning = false;
  lastMouse = { x: 0, y: 0 };
  mouseDownPos = { x: 0, y: 0 };
  // Physics
  alpha = 1;
  simRunning = false;
  SIM_MAX = 400;
  simStep = 0;
  // DOM refs
  canvas3d = null;
  labelContainer = null;
  labelEls = [];
  tooltip = null;
  infoPanel = null;
  countEl = null;
  // Bound handlers (stored so we can remove them)
  _onMM;
  _onMD;
  _onMU;
  _onMW;
  _onResize;
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.cfg = { ...DEFAULT_CFG };
    this._onMM = this.__onMM.bind(this);
    this._onMD = this.__onMD.bind(this);
    this._onMU = this.__onMU.bind(this);
    this._onMW = this.__onMW.bind(this);
    this._onResize = this.__onResize.bind(this);
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Mikk Graph";
  }
  getIcon() {
    return "git-fork";
  }
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async onOpen() {
    const root = this.containerEl;
    root.style.cssText = "background:#0d1117;position:relative;overflow:hidden;";
    const { lock, path: lp, error } = await this._loadLock();
    if (error) console.error("[Mikk] Lock parse error:", error);
    this.lock = lock;
    this.lockPath = lp;
    if (!this.lock) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#8b949e;font-family:monospace;gap:16px;">
          <div style="font-size:48px">\u{1F50D}</div>
          <div style="color:#f0f6fc;font-size:16px;font-weight:600;">No lock file found</div>
          <div style="font-size:13px;text-align:center;max-width:340px;line-height:1.6;">
            Run <code style="background:#161b22;padding:2px 8px;border-radius:4px;color:#79c0ff;">mikk analyze</code>
            in your project, then place
            <code style="background:#161b22;padding:2px 8px;border-radius:4px;color:#79c0ff;">mikk.lock.json</code>
            in your vault root.
          </div>
        </div>`;
      return;
    }
    this._buildGraph();
    this._buildUI(root);
    try {
      this.T = await loadThree();
      this._initThree();
      this._buildNodeMesh();
      this._buildEdgeMesh();
      this._buildHalos();
      this._initLayout();
      this._loop();
    } catch (e) {
      console.error("[Mikk] Three.js init failed:", e);
      if (this.canvas3d) {
        this.canvas3d.innerHTML = `<div style="padding:32px;color:#f85149;">3D init failed: ${e.message}</div>`;
      }
    }
    window.addEventListener("resize", this._onResize);
  }
  async onClose() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this._onResize);
    if (this.canvas3d) {
      this.canvas3d.removeEventListener("mousemove", this._onMM);
      this.canvas3d.removeEventListener("mousedown", this._onMD);
      this.canvas3d.removeEventListener("mouseup", this._onMU);
      this.canvas3d.removeEventListener("wheel", this._onMW);
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
  // ── Lock loading ───────────────────────────────────────────────────────────
  async _loadLock() {
    const vault = this.app.vault;
    const configured = (0, import_obsidian.normalizePath)(this.plugin.settings.lockFilePath || "mikk.lock.json");
    let lockFile = null;
    const f = vault.getAbstractFileByPath(configured);
    if (f instanceof import_obsidian.TFile) lockFile = f;
    if (!lockFile && this.plugin.settings.autoDetect) {
      const all = vault.getFiles().filter((f2) => f2.name === "mikk.lock.json");
      all.sort((a, b) => a.path.split("/").length - b.path.split("/").length);
      lockFile = all[0] ?? null;
    }
    if (!lockFile) return { lock: null, path: null, error: null };
    try {
      const raw = JSON.parse(await vault.read(lockFile));
      const lock = hydrateLock(raw);
      return { lock, path: lockFile.path, error: null };
    } catch (e) {
      return { lock: null, path: lockFile.path, error: e };
    }
  }
  /** Live-reload triggered by vault file-modify watcher. */
  async reload() {
    const { lock, path: lp, error } = await this._loadLock();
    if (error || !lock) {
      console.error("[Mikk] Reload error:", error);
      return;
    }
    this.lock = lock;
    this.lockPath = lp;
    this._buildGraph();
    if (!this.T) return;
    this._buildNodeMesh();
    this._buildEdgeMesh();
    this._buildHalos();
    this._initLayout();
    this._buildLabelPool();
    if (this.countEl) this._updateStats();
    this.alpha = 1;
    this.simStep = 0;
    this.simRunning = true;
  }
  // ── Graph data construction ────────────────────────────────────────────────
  _buildGraph() {
    const lock = this.lock;
    const moduleEntries = Object.entries(lock.modules);
    this.moduleColors = /* @__PURE__ */ new Map();
    this.moduleRgb = /* @__PURE__ */ new Map();
    moduleEntries.forEach(([id], i) => {
      const hex = getModuleColor(id, i);
      this.moduleColors.set(id, hex);
      this.moduleRgb.set(id, hexToRgb01(hex));
    });
    this.nodes = [];
    this.edges = [];
    this.nodeMap = /* @__PURE__ */ new Map();
    const modFnCount = /* @__PURE__ */ new Map();
    const modClsCount = /* @__PURE__ */ new Map();
    const modGenCount = /* @__PURE__ */ new Map();
    for (const fn of Object.values(lock.functions)) {
      const m = fn.moduleId || "unknown";
      modFnCount.set(m, (modFnCount.get(m) ?? 0) + 1);
    }
    for (const c of Object.values(lock.classes)) {
      const m = c.moduleId || "unknown";
      modClsCount.set(m, (modClsCount.get(m) ?? 0) + 1);
    }
    for (const g of Object.values(lock.generics)) {
      const m = g.moduleId || "unknown";
      modGenCount.set(m, (modGenCount.get(m) ?? 0) + 1);
    }
    for (const [modId, modData] of moduleEntries) {
      const fnCount = modFnCount.get(modId) ?? 0;
      const clsCount = modClsCount.get(modId) ?? 0;
      const rgb = this.moduleRgb.get(modId);
      const r = Math.max(14, Math.min(28, 14 + Math.sqrt(fnCount) * 1.2));
      const idx = this.nodes.length;
      this.nodeMap.set(modId, idx);
      this.nodes.push({
        id: modId,
        name: modData.name || modId,
        displayName: (modData.name || modId).slice(0, 22),
        file: "",
        moduleId: modId,
        nodeType: "module",
        isExported: true,
        isAsync: false,
        purpose: modData.description,
        calledBy: [],
        calls: [],
        radius: r,
        color: rgb,
        hexColor: this.moduleColors.get(modId),
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        fx: null,
        fz: null,
        level: 0,
        parentId: null,
        visible: true,
        expanded: this.expandedModules.has(modId),
        fnCount,
        clsCount,
        badge: fnCount > 0 ? `${fnCount}f` : ""
      });
    }
    const filesByModule = /* @__PURE__ */ new Map();
    for (const fe of Object.values(lock.files)) {
      const m = fe.moduleId;
      if (!filesByModule.has(m)) filesByModule.set(m, /* @__PURE__ */ new Set());
      filesByModule.get(m).add(fe.path);
    }
    for (const fn of Object.values(lock.functions)) {
      if (!fn.file) continue;
      if (!filesByModule.has(fn.moduleId)) filesByModule.set(fn.moduleId, /* @__PURE__ */ new Set());
      filesByModule.get(fn.moduleId).add(fn.file);
    }
    for (const [modId] of moduleEntries) {
      if (!this.expandedModules.has(modId)) continue;
      const rgb = this.moduleRgb.get(modId);
      for (const fp of filesByModule.get(modId) ?? []) {
        const fileId = "file:" + fp;
        if (this.nodeMap.has(fileId)) continue;
        const baseName = fp.split("/").pop() || fp;
        this.nodeMap.set(fileId, this.nodes.length);
        this.nodes.push({
          id: fileId,
          name: baseName,
          displayName: baseName.slice(0, 28),
          file: fp,
          moduleId: modId,
          nodeType: "file",
          isExported: false,
          purpose: "",
          calledBy: [],
          calls: [],
          radius: 7,
          color: lerpColor(rgb, [1, 1, 1], 0.3),
          hexColor: this.moduleColors.get(modId),
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          fx: null,
          fz: null,
          level: 1,
          parentId: modId,
          visible: true
        });
      }
      let fnAdded = 0;
      const allModFns = Object.values(lock.functions).filter((fn) => fn.moduleId === modId);
      for (const fn of allModFns) {
        if (this.nodeMap.has(fn.id) || fnAdded >= 120) continue;
        const fileId = fn.file ? "file:" + fn.file : null;
        this.nodeMap.set(fn.id, this.nodes.length);
        this.nodes.push({
          id: fn.id,
          name: fn.name,
          displayName: fn.name.slice(0, 30),
          file: fn.file,
          moduleId: modId,
          nodeType: "function",
          isExported: fn.isExported,
          isAsync: fn.isAsync,
          purpose: fn.purpose,
          calledBy: fn.calledBy,
          calls: fn.calls,
          radius: fn.isExported ? 5.5 : 3.5,
          color: lerpColor(rgb, [0.1, 0.1, 0.1], 0.15),
          hexColor: this.moduleColors.get(modId),
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          fx: null,
          fz: null,
          level: 2,
          parentId: fileId ?? modId,
          visible: true
        });
        fnAdded++;
      }
      if (allModFns.length > 120) {
        const modNodeIdx = this.nodeMap.get(modId);
        if (modNodeIdx !== void 0) this.nodes[modNodeIdx].badge = `120/${allModFns.length}f \u26A0`;
      }
      for (const c of Object.values(lock.classes)) {
        if (c.moduleId !== modId || this.nodeMap.has(c.id)) continue;
        this.nodeMap.set(c.id, this.nodes.length);
        this.nodes.push({
          id: c.id,
          name: c.name,
          displayName: c.name.slice(0, 28),
          file: c.file,
          moduleId: modId,
          nodeType: "class",
          isExported: c.isExported,
          purpose: c.purpose,
          calledBy: [],
          calls: [],
          radius: 8,
          color: lerpColor(rgb, [1, 1, 1], 0.2),
          hexColor: this.moduleColors.get(modId),
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          fx: null,
          fz: null,
          level: 2,
          parentId: "file:" + c.file,
          visible: true
        });
      }
      for (const g of Object.values(lock.generics)) {
        if (g.moduleId !== modId || this.nodeMap.has(g.id)) continue;
        this.nodeMap.set(g.id, this.nodes.length);
        this.nodes.push({
          id: g.id,
          name: g.name,
          displayName: g.name.slice(0, 28),
          file: g.file,
          moduleId: modId,
          nodeType: "generic",
          isExported: g.isExported,
          purpose: g.purpose || g.type,
          calledBy: [],
          calls: [],
          radius: 4.5,
          color: lerpColor(rgb, [0.85, 0.85, 1], 0.35),
          hexColor: this.moduleColors.get(modId),
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          fx: null,
          fz: null,
          level: 2,
          parentId: g.file ? "file:" + g.file : modId,
          visible: true
        });
      }
    }
    const edgeSet = /* @__PURE__ */ new Set();
    const addEdge = (aId, bId) => {
      if (!aId || !bId || aId === bId) return;
      const ai = this.nodeMap.get(aId);
      const bi = this.nodeMap.get(bId);
      if (ai === void 0 || bi === void 0) return;
      const key = ai < bi ? `${ai}_${bi}` : `${bi}_${ai}`;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      this.edges.push({ si: ai, ti: bi, interMod: this.nodes[ai].moduleId !== this.nodes[bi].moduleId });
    };
    for (const fn of Object.values(lock.functions)) {
      for (const calleeId of fn.calls) {
        const cf = lock.functions[calleeId];
        if (!cf || fn.moduleId === cf.moduleId) continue;
        addEdge(fn.moduleId, cf.moduleId);
      }
    }
    for (const modId of this.expandedModules) {
      for (const fn of Object.values(lock.functions)) {
        if (fn.moduleId !== modId) continue;
        if (fn.file) addEdge(fn.id, "file:" + fn.file);
        for (const calleeId of fn.calls) {
          const cf = lock.functions[calleeId];
          if (cf?.moduleId === modId) addEdge(fn.id, calleeId);
        }
      }
      for (const nd of this.nodes) {
        if (nd.nodeType === "file" && nd.moduleId === modId) addEdge(nd.id, modId);
      }
    }
    if (this.labelContainer) this._buildLabelPool();
  }
  // ── Three.js init ──────────────────────────────────────────────────────────
  _initThree() {
    const T = this.T;
    const el = this.canvas3d;
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 600;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(856343, 1);
    this.renderer.setSize(w, h);
    el.appendChild(this.renderer.domElement);
    this.scene = new T.Scene();
    this.scene.background = new T.Color(856343);
    this.scene.fog = new T.FogExp2(856343, 12e-5);
    this.camera = new T.PerspectiveCamera(50, w / h, 1, 12e3);
    this._updateCamera();
    this.scene.add(new T.AmbientLight(16777215, 0.8));
    const dir1 = new T.DirectionalLight(16777215, 0.6);
    dir1.position.set(200, 500, 300);
    this.scene.add(dir1);
    const dir2 = new T.DirectionalLight(8947967, 0.3);
    dir2.position.set(-300, -200, -100);
    this.scene.add(dir2);
    this.raycaster = new T.Raycaster();
    this.dummy = new T.Object3D();
    this.colorObj = new T.Color();
    el.addEventListener("mousemove", this._onMM);
    el.addEventListener("mousedown", this._onMD);
    el.addEventListener("mouseup", this._onMU);
    el.addEventListener("wheel", this._onMW, { passive: false });
  }
  _updateCamera() {
    if (!this.camera) return;
    const { theta, phi, radius } = this.spherical;
    const { x, y, z } = this.target;
    this.camera.position.set(
      x + radius * Math.sin(phi) * Math.sin(theta),
      y + radius * Math.cos(phi),
      z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(x, y, z);
  }
  // ── Instanced mesh ─────────────────────────────────────────────────────────
  _buildNodeMesh() {
    const T = this.T, scene = this.scene;
    if (this.instMesh) {
      scene.remove(this.instMesh);
      this.instMesh.geometry.dispose();
      this.instMesh.dispose();
      this.instMesh = null;
    }
    if (!this.nodes.length) return;
    const geo = new T.IcosahedronGeometry(1, 2);
    const mat = new T.MeshStandardMaterial({ roughness: 0.3, metalness: 0.35 });
    this.instMesh = new T.InstancedMesh(geo, mat, this.nodes.length);
    this.instMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      this.dummy.position.set(nd.x, nd.y, nd.z);
      this.dummy.scale.setScalar(nd.radius * this.cfg.nodeScale);
      this.dummy.updateMatrix();
      this.instMesh.setMatrixAt(i, this.dummy.matrix);
      this.colorObj.setRGB(...nd.color);
      this.instMesh.setColorAt(i, this.colorObj);
    }
    this.instMesh.instanceMatrix.needsUpdate = true;
    if (this.instMesh.instanceColor) this.instMesh.instanceColor.needsUpdate = true;
    scene.add(this.instMesh);
    this._buildLabelPool();
  }
  _updateNodeMesh() {
    if (!this.instMesh) return;
    const hasHL = this.highlight.size > 0;
    const dim = this.cfg.dimStrength;
    const scale = this.cfg.nodeScale;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      const isSel = i === this.selIdx;
      const isHov = i === this.hovIdx;
      const inHL = this.highlight.has(i);
      const isDim = hasHL && !inHL && !isSel;
      const sm = isSel ? 2.2 : inHL ? 1.6 : isHov ? 1.3 : 1;
      this.dummy.position.set(nd.x, nd.y, nd.z);
      this.dummy.scale.setScalar(nd.radius * scale * sm);
      this.dummy.updateMatrix();
      this.instMesh.setMatrixAt(i, this.dummy.matrix);
      if (isSel) {
        this.colorObj.setHex(16769126);
      } else if (isHov) {
        this.colorObj.setRGB(
          Math.min(1, nd.color[0] * 1.5),
          Math.min(1, nd.color[1] * 1.5),
          Math.min(1, nd.color[2] * 1.5)
        );
      } else if (isDim) {
        this.colorObj.setRGB(nd.color[0] * dim, nd.color[1] * dim, nd.color[2] * dim);
      } else {
        this.colorObj.setRGB(...nd.color);
      }
      this.instMesh.setColorAt(i, this.colorObj);
    }
    this.instMesh.instanceMatrix.needsUpdate = true;
    if (this.instMesh.instanceColor) this.instMesh.instanceColor.needsUpdate = true;
  }
  // ── Edge mesh ──────────────────────────────────────────────────────────────
  _buildEdgeMesh() {
    const T = this.T, scene = this.scene;
    if (this.edgeMesh) {
      scene.remove(this.edgeMesh);
      this.edgeMesh.geometry.dispose();
      this.edgeMesh = null;
    }
    if (!this.edges.length) return;
    const pos = new Float32Array(this.edges.length * 6);
    const col = new Float32Array(this.edges.length * 6);
    this._fillEdgeArrays(pos, col);
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.BufferAttribute(col, 3));
    const mat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: this.cfg.edgeOpacity, depthWrite: false });
    this.edgeMesh = new T.LineSegments(geo, mat);
    this.edgeMesh.renderOrder = 10;
    this.edgeMesh.visible = this.cfg.showEdges;
    scene.add(this.edgeMesh);
  }
  _fillEdgeArrays(pos, col) {
    const ns = this.nodes;
    const hasHL = this.highlight.size > 0;
    for (let i = 0; i < this.edges.length; i++) {
      const { si, ti, interMod } = this.edges[i];
      const s = ns[si], t = ns[ti];
      pos[i * 6] = s.x;
      pos[i * 6 + 1] = s.y;
      pos[i * 6 + 2] = s.z;
      pos[i * 6 + 3] = t.x;
      pos[i * 6 + 4] = t.y;
      pos[i * 6 + 5] = t.z;
      let r, g, b;
      if (hasHL) {
        const lit = (this.highlight.has(si) || si === this.selIdx) && (this.highlight.has(ti) || ti === this.selIdx);
        [r, g, b] = lit ? [1, 0.88, 0.3] : [0.12, 0.12, 0.15];
      } else if (interMod) {
        [r, g, b] = [0.45, 0.48, 0.55];
      } else {
        const c = s.color;
        [r, g, b] = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
      }
      col[i * 6] = r;
      col[i * 6 + 1] = g;
      col[i * 6 + 2] = b;
      col[i * 6 + 3] = r;
      col[i * 6 + 4] = g;
      col[i * 6 + 5] = b;
    }
  }
  _updateEdgeMesh() {
    if (!this.edgeMesh) return;
    const pa = this.edgeMesh.geometry.attributes["position"];
    const ca = this.edgeMesh.geometry.attributes["color"];
    this._fillEdgeArrays(pa.array, ca.array);
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    this.edgeMesh.material.opacity = this.cfg.edgeOpacity;
    this.edgeMesh.visible = this.cfg.showEdges;
  }
  // ── Group halos (wireframe-only — edges always visible) ────────────────────
  //
  // Critical fix vs v2: we use ONLY Line geometry here, never filled faces.
  // Because edges render at renderOrder=10 and halos at 1-3, edges will always
  // appear on top regardless of camera angle. No more "groups blocking edges".
  _buildHalos() {
    const T = this.T, scene = this.scene;
    for (const m of this.haloMeshes) scene.remove(m);
    this.haloMeshes = [];
    if (!this.cfg.showHalos) return;
    const byModule = /* @__PURE__ */ new Map();
    for (const nd of this.nodes) {
      if (!byModule.has(nd.moduleId)) byModule.set(nd.moduleId, []);
      byModule.get(nd.moduleId).push(nd);
    }
    for (const [modId, members] of byModule) {
      if (members.length < 2) continue;
      let cx = 0, cz = 0;
      for (const nd of members) {
        cx += nd.x;
        cz += nd.z;
      }
      cx /= members.length;
      cz /= members.length;
      let maxR = 0;
      for (const nd of members) {
        const d = Math.sqrt((nd.x - cx) ** 2 + (nd.z - cz) ** 2) + nd.radius * 2;
        if (d > maxR) maxR = d;
      }
      const r = Math.max(maxR + 20, 35);
      const color = new T.Color(this.moduleColors.get(modId) ?? "#4f9cf9");
      const SEG = 80;
      const mkRing = (radius, opacity, order) => {
        const pts = new Float32Array((SEG + 1) * 3);
        for (let i = 0; i <= SEG; i++) {
          const a = i / SEG * Math.PI * 2;
          pts[i * 3] = cx + radius * Math.cos(a);
          pts[i * 3 + 1] = 0;
          pts[i * 3 + 2] = cz + radius * Math.sin(a);
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute("position", new T.BufferAttribute(pts, 3));
        const mat = new T.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
        const ring = new T.Line(geo, mat);
        ring.renderOrder = order;
        scene.add(ring);
        this.haloMeshes.push(ring);
      };
      mkRing(r, 0.6, 2);
      mkRing(r * 0.88, 0.18, 1);
      const tickPts = new Float32Array(4 * 2 * 3);
      let idx = 0;
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2;
        const r1 = r * 0.88, r2 = r;
        tickPts[idx++] = cx + r1 * Math.cos(a);
        tickPts[idx++] = 0;
        tickPts[idx++] = cz + r1 * Math.sin(a);
        tickPts[idx++] = cx + r2 * Math.cos(a);
        tickPts[idx++] = 0;
        tickPts[idx++] = cz + r2 * Math.sin(a);
      }
      const tg = new T.BufferGeometry();
      tg.setAttribute("position", new T.BufferAttribute(tickPts, 3));
      const ticks = new T.LineSegments(tg, new T.LineBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }));
      ticks.renderOrder = 3;
      scene.add(ticks);
      this.haloMeshes.push(ticks);
    }
  }
  // ── Layout ─────────────────────────────────────────────────────────────────
  _initLayout() {
    const ns = this.nodes;
    if (!ns.length) return;
    const moduleNodes = ns.filter((n) => n.nodeType === "module");
    const count = moduleNodes.length;
    const ringR = Math.max(280, count * 65);
    moduleNodes.forEach((nd, i) => {
      nd.x = ringR * Math.cos(i / count * Math.PI * 2);
      nd.y = 0;
      nd.z = ringR * Math.sin(i / count * Math.PI * 2);
      nd.vx = nd.vy = nd.vz = 0;
    });
    for (const modNd of moduleNodes) {
      const children = ns.filter((n) => n.parentId === modNd.id && n.level === 1);
      if (!children.length) continue;
      const subR = Math.max(60, children.length * 18);
      children.forEach((nd, i) => {
        nd.x = modNd.x + subR * Math.cos(i / children.length * Math.PI * 2);
        nd.y = 0;
        nd.z = modNd.z + subR * Math.sin(i / children.length * Math.PI * 2);
        nd.vx = nd.vy = nd.vz = 0;
      });
      for (const fileNd of children) {
        const fns = ns.filter((n) => n.parentId === fileNd.id && n.level === 2);
        if (!fns.length) continue;
        const fnR = Math.max(30, fns.length * 8);
        fns.forEach((nd, i) => {
          nd.x = fileNd.x + fnR * Math.cos(i / fns.length * Math.PI * 2);
          nd.y = 0;
          nd.z = fileNd.z + fnR * Math.sin(i / fns.length * Math.PI * 2);
          nd.vx = nd.vy = nd.vz = 0;
        });
      }
    }
    this.alpha = 1;
    this.simStep = 0;
    this.simRunning = true;
  }
  // ── Force simulation (flat XZ, Y ≈ 0) ─────────────────────────────────────
  _simTick() {
    if (!this.simRunning || this.alpha < 3e-3) {
      this.simRunning = false;
      return;
    }
    const ns = this.nodes;
    const n = ns.length;
    const a = this.alpha;
    const DAMP = 0.88;
    const G_PULL = 6e-4;
    for (let i = 0; i < n; i++) {
      const ni = ns[i];
      const repI = ni.nodeType === "module" ? 9e3 : ni.nodeType === "file" ? 2e3 : 500;
      for (let j = i + 1; j < n; j++) {
        const nj = ns[j];
        const repJ = nj.nodeType === "module" ? 9e3 : nj.nodeType === "file" ? 2e3 : 500;
        const dx = nj.x - ni.x || 0.01;
        const dz = nj.z - ni.z || 0.01;
        const d2 = dx * dx + dz * dz;
        if (d2 > 4e5) continue;
        const d = Math.sqrt(d2) || 1;
        const minD = (ni.radius + nj.radius) * 3.5;
        const rep = Math.sqrt(repI * repJ);
        const f = d < minD ? rep * 4 / (d2 + 0.1) * a : rep / d2 * a;
        ni.vx -= f * dx / d;
        ni.vz -= f * dz / d;
        nj.vx += f * dx / d;
        nj.vz += f * dz / d;
      }
    }
    const SPRING_K = 0.045;
    for (const { si, ti, interMod } of this.edges) {
      const s = ns[si], t = ns[ti];
      const dx = t.x - s.x, dz = t.z - s.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const restLen = interMod ? 180 : (s.radius + t.radius) * 5;
      const f = (d - restLen) * SPRING_K * a;
      if (s.fx === null) {
        s.vx += f * dx / d;
        s.vz += f * dz / d;
      }
      if (t.fx === null) {
        t.vx -= f * dx / d;
        t.vz -= f * dz / d;
      }
    }
    for (const nd of ns) {
      if (nd.parentId === null || nd.nodeType === "module") continue;
      const pi = this.nodeMap.get(nd.parentId);
      if (pi === void 0) continue;
      const parent = ns[pi];
      const dx = parent.x - nd.x, dz = parent.z - nd.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const str = nd.nodeType === "file" ? 0.04 * a : 0.06 * a;
      nd.vx += dx * str;
      nd.vz += dz * str;
    }
    for (const nd of ns) {
      if (nd.fx !== null) continue;
      nd.vx -= nd.x * G_PULL * a;
      nd.vz -= nd.z * G_PULL * a;
    }
    for (const nd of ns) {
      nd.vx *= DAMP;
      nd.vy *= DAMP;
      nd.vz *= DAMP;
      if (nd.fx !== null) {
        nd.x = nd.fx;
        nd.z = nd.fz;
      } else {
        nd.x += nd.vx;
        nd.z += nd.vz;
      }
      nd.y *= 0.85;
    }
    this.alpha *= 0.97;
    this.simStep++;
    if (this.simStep > this.SIM_MAX) this.simRunning = false;
  }
  // ── Render loop ────────────────────────────────────────────────────────────
  _loop() {
    this.rafId = requestAnimationFrame(() => this._loop());
    const steps = this.simRunning ? this.nodes.length > 200 ? 2 : 4 : 0;
    for (let s = 0; s < steps; s++) this._simTick();
    if (this.simRunning) {
      this._updateNodeMesh();
      this._updateEdgeMesh();
      if (this.simStep % 12 === 0) this._buildHalos();
    }
    this._updateLabels();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
  // ── HTML label layer ───────────────────────────────────────────────────────
  _buildLabelPool() {
    if (!this.labelContainer) return;
    this.labelContainer.innerHTML = "";
    this.labelEls = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;pointer-events:none;white-space:nowrap;user-select:none;transform:translate(-50%,-50%);transition:opacity 0.15s;";
      this.labelContainer.appendChild(el);
      this.labelEls.push(el);
    }
  }
  _updateLabels() {
    if (!this.labelContainer || !this.camera || !this.renderer || !this.T) return;
    const T = this.T;
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const camPos = this.camera.position;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      const el = this.labelEls[i];
      if (!el) continue;
      const isModule = nd.nodeType === "module";
      const isHL = this.highlight.has(i) || i === this.selIdx || i === this.hovIdx;
      const shouldShow = isModule || isHL || this.cfg.showLabels && nd.level <= 1;
      if (!shouldShow) {
        el.style.display = "none";
        continue;
      }
      const vec = new T.Vector3(nd.x, nd.y, nd.z);
      vec.project(this.camera);
      if (vec.z > 1) {
        el.style.display = "none";
        continue;
      }
      const sx = (vec.x * 0.5 + 0.5) * w;
      const sy = (-vec.y * 0.5 + 0.5) * h;
      if (sx < -80 || sx > w + 80 || sy < -20 || sy > h + 20) {
        el.style.display = "none";
        continue;
      }
      let opacity = 1;
      if (!isModule) {
        const dist = Math.sqrt((camPos.x - nd.x) ** 2 + (camPos.y - nd.y) ** 2 + (camPos.z - nd.z) ** 2);
        opacity = Math.max(0, Math.min(1, (1200 - dist) / 600));
      }
      el.style.display = opacity < 0.03 ? "none" : "block";
      el.style.left = sx + "px";
      el.style.top = sy - nd.radius * this.cfg.nodeScale * 1.5 - (isModule ? 12 : 7) + "px";
      el.style.opacity = String(opacity);
      if (isModule) {
        Object.assign(el.style, {
          color: nd.hexColor,
          fontSize: "12px",
          fontWeight: "700",
          fontFamily: "ui-monospace,monospace",
          textShadow: "0 1px 3px rgba(0,0,0,0.9),0 0 8px rgba(0,0,0,0.8)",
          padding: "2px 6px",
          borderRadius: "3px",
          borderBottom: `2px solid ${nd.hexColor}`
        });
        el.textContent = nd.displayName + (nd.badge ? ` \xB7 ${nd.badge}` : "");
      } else if (nd.nodeType === "file") {
        Object.assign(el.style, {
          color: "#c9d1d9",
          fontSize: "10px",
          fontWeight: "500",
          fontFamily: "ui-monospace,monospace",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          padding: "0",
          borderRadius: "0",
          borderBottom: ""
        });
        el.textContent = nd.displayName;
      } else {
        Object.assign(el.style, {
          color: nd.isExported ? nd.hexColor : "#8b949e",
          fontSize: "9px",
          fontWeight: "400",
          fontFamily: "ui-monospace,monospace",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          padding: "0",
          borderRadius: "0",
          borderBottom: ""
        });
        el.textContent = nd.displayName;
      }
    }
  }
  // ── Mouse handlers ─────────────────────────────────────────────────────────
  __onMM(e) {
    if (this.isDragging) {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.spherical.theta -= dx * 5e-3;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi + dy * 5e-3));
      this._updateCamera();
    } else if (this.isPanning && this.T && this.camera) {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      const sp = this.spherical.radius * 1e-3;
      const right = new this.T.Vector3();
      const worldDir = new this.T.Vector3();
      right.crossVectors(this.camera.position, this.T ? new this.T.Vector3(0, 1, 0) : right).normalize();
      this.target.x -= right.x * dx * sp;
      this.target.z -= right.z * dx * sp;
      this.target.y -= dy * sp;
      this._updateCamera();
    }
    this.lastMouse = { x: e.clientX, y: e.clientY };
    this._pick(e, false);
  }
  __onMD(e) {
    this.mouseDownPos = { x: e.clientX, y: e.clientY };
    if (e.button === 0 && !e.altKey) this.isDragging = true;
    else this.isPanning = true;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }
  __onMU(e) {
    const wasDrag = Math.abs(e.clientX - this.mouseDownPos.x) > 4 || Math.abs(e.clientY - this.mouseDownPos.y) > 4;
    if (!wasDrag) this._pick(e, true);
    this.isDragging = false;
    this.isPanning = false;
  }
  __onMW(e) {
    e.preventDefault();
    this.spherical.radius = Math.max(80, Math.min(8e3, this.spherical.radius * (e.deltaY > 0 ? 1.12 : 0.89)));
    this._updateCamera();
  }
  __onResize() {
    if (!this.renderer || !this.camera || !this.canvas3d) return;
    const w = this.canvas3d.clientWidth;
    const h = this.canvas3d.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  // ── Picking ─────────────────────────────────────────────────────────────────
  _pick(e, click) {
    if (!this.raycaster || !this.instMesh || !this.renderer || !this.camera || !this.T) return;
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new this.T.Vector2(
      (e.clientX - rect.left) / rect.width * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.instMesh);
    if (hits.length > 0) {
      const idx = hits[0].instanceId;
      if (click) this._onNodeClick(idx);
      else if (this.hovIdx !== idx) {
        this.hovIdx = idx;
        this._showTooltip(idx, e);
      }
    } else {
      this.hovIdx = -1;
      if (this.tooltip) this.tooltip.style.display = "none";
    }
  }
  _onNodeClick(idx) {
    const nd = this.nodes[idx];
    if (!nd) return;
    if (nd.nodeType === "module") {
      if (this.expandedModules.has(nd.id)) {
        this.expandedModules.delete(nd.id);
        nd.expanded = false;
      } else {
        this.expandedModules.add(nd.id);
        nd.expanded = true;
      }
      this._buildGraph();
      this._buildNodeMesh();
      this._buildEdgeMesh();
      this._buildHalos();
      this._initLayout();
      if (this.countEl) this._updateStats();
      return;
    }
    this.selIdx = idx;
    this.highlight = this._computeHighlight(idx);
    this._updateNodeMesh();
    this._updateEdgeMesh();
    this._showInfoPanel(nd);
  }
  _computeHighlight(selIdx) {
    const hl = /* @__PURE__ */ new Set([selIdx]);
    for (const { si, ti } of this.edges) {
      if (si === selIdx) hl.add(ti);
      if (ti === selIdx) hl.add(si);
    }
    return hl;
  }
  // ── Tooltip / info panel ────────────────────────────────────────────────────
  _showTooltip(idx, e) {
    const nd = this.nodes[idx];
    if (!nd || !this.tooltip) return;
    const icon = { module: "\u{1F4E6}", file: "\u{1F4C4}", function: nd.isAsync ? "\u26A1" : "\u0192", class: "\u2B21", generic: "T" }[nd.nodeType] ?? "\xB7";
    let html = `<div style="color:#f0f6fc;font-weight:700;font-size:13px;margin-bottom:4px;">${icon} ${nd.name}</div>`;
    if (nd.purpose) html += `<div style="color:#8b949e;font-size:11px;margin-bottom:4px;font-style:italic;">${nd.purpose.slice(0, 80)}</div>`;
    if (nd.file) html += `<div style="color:#6e7681;font-size:10px;">${nd.file.split("/").slice(-2).join("/")}</div>`;
    if (nd.nodeType === "function") {
      html += `<div style="font-size:10px;color:#8b949e;margin-top:4px;">`;
      if (nd.isExported) html += `<span style="color:#56cfb2;">exported</span> `;
      if (nd.isAsync) html += `<span style="color:#f6a623;">async</span> `;
      html += `${nd.calledBy.length} callers \xB7 ${nd.calls.length} callees</div>`;
    }
    if (nd.nodeType === "module") html += `<div style="font-size:10px;color:#8b949e;margin-top:4px;">Click to ${nd.expanded ? "collapse \u2191" : "expand \u2193"} (${nd.fnCount ?? 0} fns)</div>`;
    this.tooltip.innerHTML = html;
    const rx = this.containerEl.getBoundingClientRect();
    let tx = e.clientX - rx.left + 14;
    if (tx + 240 > rx.width) tx = e.clientX - rx.left - 240;
    this.tooltip.style.left = tx + "px";
    this.tooltip.style.top = e.clientY - rx.top + 14 + "px";
    this.tooltip.style.display = "block";
  }
  _showInfoPanel(nd) {
    if (!this.infoPanel) return;
    this.infoPanel.style.display = "block";
    const icon = { module: "\u{1F4E6}", file: "\u{1F4C4}", function: "\u0192", class: "\u2B21", generic: "T" }[nd.nodeType] ?? "\xB7";
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="color:${nd.hexColor};font-weight:700;font-size:14px;">${icon} ${nd.name}</span>
      <button onclick="this.parentElement.parentElement.style.display='none'"
        style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;padding:0;">\xD7</button>
    </div>`;
    if (nd.purpose) html += `<div style="color:#8b949e;font-size:11px;line-height:1.5;margin-bottom:8px;font-style:italic;">${nd.purpose}</div>`;
    html += `<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 8px;font-size:11px;color:#6e7681;">`;
    html += `<span>module</span><span style="color:#c9d1d9;">${nd.moduleId}</span>`;
    if (nd.file) html += `<span>file</span><span style="color:#79c0ff;">${nd.file.split("/").slice(-2).join("/")}</span>`;
    if (nd.nodeType === "function") {
      html += `<span>exported</span><span style="color:${nd.isExported ? "#56cfb2" : "#f85149"};">${nd.isExported}</span>`;
      html += `<span>async</span><span style="color:${nd.isAsync ? "#f6a623" : "#6e7681"};">${!!nd.isAsync}</span>`;
      if (nd.calledBy.length) html += `<span>calledBy</span><span style="color:#c9d1d9;">${nd.calledBy.length} callers</span>`;
      if (nd.calls.length) html += `<span>calls</span><span style="color:#c9d1d9;">${nd.calls.length} callees</span>`;
    }
    html += `</div>`;
    this.infoPanel.innerHTML = html;
  }
  // ── Stats ───────────────────────────────────────────────────────────────────
  _updateStats() {
    if (!this.countEl || !this.lock) return;
    const fnCount = Object.keys(this.lock.functions).length;
    const modCount = Object.keys(this.lock.modules).length;
    const genCount = Object.keys(this.lock.generics).length;
    const suffix = genCount > 0 ? ` \xB7 ${genCount} types` : "";
    this.countEl.textContent = `${this.nodes.length} vis \xB7 ${this.edges.length} edges \xB7 ${fnCount} fns \xB7 ${modCount} mods${suffix}`;
  }
  // ── Rebuild (after settings change) ────────────────────────────────────────
  _rebuild() {
    if (!this.T) return;
    this._buildGraph();
    this._buildNodeMesh();
    this._buildEdgeMesh();
    this._buildHalos();
    this._initLayout();
    if (this.countEl) this._updateStats();
  }
  // ── Search ──────────────────────────────────────────────────────────────────
  _searchNodes(query) {
    if (!query.trim()) {
      this.highlight = /* @__PURE__ */ new Set();
      this.selIdx = -1;
      this._updateNodeMesh();
      this._updateEdgeMesh();
      if (this.countEl) this._updateStats();
      return;
    }
    const lower = query.toLowerCase();
    const matches = /* @__PURE__ */ new Set();
    this.nodes.forEach((nd, i) => {
      if (nd.name.toLowerCase().includes(lower) || nd.moduleId.toLowerCase().includes(lower) || nd.purpose.toLowerCase().includes(lower) || nd.file.toLowerCase().includes(lower)) matches.add(i);
    });
    this.highlight = matches;
    this._updateNodeMesh();
    this._updateEdgeMesh();
    if (this.countEl) this.countEl.textContent = `${matches.size} matches`;
    if (matches.size > 0) {
      const first = this.nodes[[...matches][0]];
      if (first) {
        this.target = { x: first.x, y: first.y, z: first.z };
        this._updateCamera();
      }
    }
  }
  // ── UI ──────────────────────────────────────────────────────────────────────
  _buildUI(root) {
    const mk = (tag, css, parent) => {
      const el = document.createElement(tag);
      el.style.cssText = css;
      parent?.appendChild(el);
      return el;
    };
    const hdr = mk("div", [
      "position:absolute;top:0;left:0;right:0;z-index:30;height:44px",
      "background:rgba(13,17,23,0.97);border-bottom:1px solid #21262d",
      "display:flex;align-items:center;gap:8px;padding:0 12px",
      "backdrop-filter:blur(4px)"
    ].join(";"), root);
    const logo = mk("div", "display:flex;align-items:center;gap:6px;flex-shrink:0;", hdr);
    logo.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f9cf9" stroke-width="2.5">
        <circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/>
        <circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/>
        <line x1="6" y1="6.5" x2="10.5" y2="10.5"/><line x1="18" y1="6.5" x2="13.5" y2="10.5"/>
        <line x1="6" y1="17.5" x2="10.5" y2="13.5"/><line x1="18" y1="17.5" x2="13.5" y2="13.5"/>
      </svg>
      <span style="font-weight:800;font-size:13px;color:#f0f6fc;">mikk</span>
      <span style="font-size:9px;color:#4f9cf9;background:#1f6feb18;padding:1px 6px;border-radius:3px;border:1px solid #1f6feb44;font-weight:600;">graph</span>`;
    const sw = mk("div", "position:relative;flex:1;max-width:220px;", hdr);
    const searchIcon = mk("div", "position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#6e7681;font-size:12px;pointer-events:none;", sw);
    searchIcon.textContent = "\u2315";
    const search = mk("input", "width:100%;padding:5px 9px 5px 26px;border-radius:6px;border:1px solid #30363d;background:#161b22;color:#f0f6fc;font-size:11px;outline:none;box-sizing:border-box;", sw);
    search.placeholder = "Search nodes\u2026";
    search.addEventListener("focus", () => search.style.borderColor = "#4f9cf9");
    search.addEventListener("blur", () => search.style.borderColor = "#30363d");
    search.addEventListener("input", (e) => this._searchNodes(e.target.value));
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        search.value = "";
        this._searchNodes("");
      }
    });
    this.countEl = mk("span", "font-size:10px;color:#6e7681;white-space:nowrap;padding:3px 8px;background:#161b22;border:1px solid #21262d;border-radius:5px;flex-shrink:0;", hdr);
    const btns = mk("div", "display:flex;gap:5px;flex-shrink:0;margin-left:auto;", hdr);
    const BTN = "background:#161b22;border:1px solid #30363d;color:#c9d1d9;border-radius:5px;cursor:pointer;font-size:11px;padding:4px 10px;white-space:nowrap;transition:background 0.1s;";
    const mkBtn = (label, title, fn) => {
      const b = mk("button", BTN, btns);
      b.textContent = label;
      b.title = title;
      b.onclick = fn;
      b.onmouseenter = () => b.style.background = "#21262d";
      b.onmouseleave = () => b.style.background = "#161b22";
      return b;
    };
    const lodSel = mk("select", "background:#161b22;border:1px solid #30363d;color:#c9d1d9;border-radius:5px;padding:4px 6px;font-size:11px;cursor:pointer;", btns);
    [["modules", "\u{1F4E6} Modules"], ["files", "\u{1F4C4} +Files"], ["all", "\u0192 +Functions"]].forEach(([v, l]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = l;
      lodSel.appendChild(o);
    });
    lodSel.value = "modules";
    lodSel.onchange = () => {
      if (lodSel.value === "all" || lodSel.value === "files") {
        if (this.lock) for (const modId of Object.keys(this.lock.modules)) this.expandedModules.add(modId);
      } else {
        this.expandedModules.clear();
      }
      this._rebuild();
    };
    const edgeBtn = mkBtn("\u2B21 Edges", "Toggle edges", () => {
      this.cfg.showEdges = !this.cfg.showEdges;
      if (this.edgeMesh) this.edgeMesh.visible = this.cfg.showEdges;
      edgeBtn.style.borderColor = this.cfg.showEdges ? "#4f9cf9" : "#30363d";
      edgeBtn.style.color = this.cfg.showEdges ? "#4f9cf9" : "#8b949e";
    });
    edgeBtn.style.borderColor = "#4f9cf9";
    edgeBtn.style.color = "#4f9cf9";
    mkBtn("\u21BA Reset", "Reset camera", () => {
      this.spherical = { theta: 0.5, phi: 0.85, radius: 1800 };
      this.target = { x: 0, y: 0, z: 0 };
      this._updateCamera();
    });
    mkBtn("\u27F3 Reload", "Reload lock file", () => this.reload());
    let settingsPanel = null;
    mkBtn("\u2699 Settings", "Graph settings", () => {
      if (!settingsPanel) settingsPanel = this._buildSettingsPanel(root);
      settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
    });
    this.canvas3d = mk("div", "position:absolute;top:44px;left:0;right:0;bottom:0;cursor:grab;", root);
    this.labelContainer = mk("div", "position:absolute;top:44px;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;", root);
    this.tooltip = mk("div", [
      "position:absolute;display:none;pointer-events:none;z-index:60",
      "padding:10px 13px;border-radius:9px;max-width:260px",
      "background:#161b22;border:1px solid #30363d",
      "box-shadow:0 8px 28px rgba(0,0,0,0.85);font-size:12px;line-height:1.5"
    ].join(";"), root);
    this.infoPanel = mk("div", [
      "position:absolute;top:54px;right:10px;width:260px;display:none",
      "background:#0d1117;border:1px solid #30363d;border-radius:10px",
      "padding:14px;font-size:12px;color:#c9d1d9;z-index:40",
      "box-shadow:0 8px 32px rgba(0,0,0,0.9);max-height:calc(100% - 64px);overflow-y:auto"
    ].join(";"), root);
    const leg = mk("div", [
      "position:absolute;bottom:10px;left:10px",
      "background:rgba(13,17,23,0.85);border:1px solid #21262d;border-radius:7px",
      "padding:7px 11px;font-size:10px;color:#6e7681;z-index:20;line-height:2;pointer-events:none"
    ].join(";"), root);
    leg.innerHTML = [
      "<b style='color:#8b949e'>Left drag</b> \u2192 orbit",
      "<b style='color:#8b949e'>Right drag</b> \u2192 pan",
      "<b style='color:#8b949e'>Scroll</b> \u2192 zoom",
      "<b style='color:#8b949e'>Click module</b> \u2192 expand / collapse"
    ].join("<br>");
    const modLeg = mk("div", [
      "position:absolute;bottom:10px;right:10px",
      "background:rgba(13,17,23,0.88);border:1px solid #21262d;border-radius:7px",
      "padding:8px 12px;font-size:10px;z-index:20;max-height:200px;overflow-y:auto;pointer-events:none"
    ].join(";"), root);
    if (this.lock) {
      modLeg.innerHTML = Object.entries(this.lock.modules).map(([id, m]) => {
        const hex = this.moduleColors.get(id) ?? "#aaa";
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <div style="width:9px;height:9px;border-radius:50%;background:${hex};flex-shrink:0;"></div>
            <span style="color:#c9d1d9;">${m.name || id}</span>
          </div>`;
      }).join("");
    }
    this._updateStats();
  }
  _buildSettingsPanel(root) {
    const mk = (tag, css, parent) => {
      const el = document.createElement(tag);
      el.style.cssText = css;
      parent?.appendChild(el);
      return el;
    };
    const panel = mk("div", [
      "position:absolute;top:54px;left:10px;width:240px;z-index:50",
      "background:#0d1117;border:1px solid #30363d;border-radius:10px",
      "padding:14px;font-size:12px;color:#c9d1d9",
      "box-shadow:0 8px 32px rgba(0,0,0,0.9);max-height:calc(100%-64px);overflow-y:auto"
    ].join(";"), root);
    const hdr = mk("div", "font-weight:700;font-size:13px;color:#f0f6fc;margin-bottom:12px;", panel);
    hdr.textContent = "\u2699 Graph Settings";
    const sec = (title) => {
      const h = mk("div", "font-size:10px;color:#8b949e;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 6px;", panel);
      h.textContent = title;
    };
    const addSlider = (label, key, min, max, step, fmt) => {
      const row = mk("div", "margin-bottom:8px;", panel);
      const top = mk("div", "display:flex;justify-content:space-between;color:#8b949e;font-size:11px;margin-bottom:3px;", row);
      const lbl = mk("span", "", top);
      lbl.textContent = label;
      const val = mk("span", "color:#c9d1d9;", top);
      val.textContent = fmt ? fmt(this.cfg[key]) : String(this.cfg[key]);
      const sl = mk("input", "width:100%;accent-color:#4f9cf9;cursor:pointer;", row);
      sl.type = "range";
      sl.min = String(min);
      sl.max = String(max);
      sl.step = String(step);
      sl.value = String(this.cfg[key]);
      sl.oninput = () => {
        this.cfg[key] = parseFloat(sl.value);
        val.textContent = fmt ? fmt(this.cfg[key]) : String(this.cfg[key]);
        this._updateNodeMesh();
        this._updateEdgeMesh();
      };
    };
    const addToggle = (label, key, onChange) => {
      const row = mk("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;", panel);
      const lbl = mk("span", "color:#8b949e;font-size:11px;", row);
      lbl.textContent = label;
      const chk = mk("input", "cursor:pointer;accent-color:#4f9cf9;", row);
      chk.type = "checkbox";
      chk.checked = !!this.cfg[key];
      chk.onchange = () => {
        this.cfg[key] = chk.checked;
        onChange?.(chk.checked);
      };
    };
    sec("Appearance");
    addSlider("Node size", "nodeScale", 0.3, 3, 0.1, (v) => v.toFixed(1) + "\xD7");
    addSlider("Edge opacity", "edgeOpacity", 0, 1, 0.05, (v) => Math.round(v * 100) + "%");
    addSlider("Label size", "labelSize", 9, 22, 1, (v) => v + "px");
    addSlider("Dim strength", "dimStrength", 0, 0.4, 0.01, (v) => Math.round(v * 100) + "%");
    sec("Visibility");
    addToggle("Show edges", "showEdges", (v) => {
      if (this.edgeMesh) this.edgeMesh.visible = v;
    });
    addToggle("Show group halos", "showHalos", () => this._buildHalos());
    addToggle("Show labels", "showLabels");
    sec("Physics");
    const rb = mk("button", "width:100%;padding:7px;background:#1f6feb;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:11px;font-weight:600;margin-bottom:6px;", panel);
    rb.textContent = "\u27F3 Restart Physics";
    rb.onclick = () => {
      this.alpha = 1;
      this.simStep = 0;
      this.simRunning = true;
    };
    const cb = mk("button", "width:100%;padding:6px;background:transparent;border:1px solid #30363d;border-radius:6px;color:#8b949e;cursor:pointer;font-size:11px;", panel);
    cb.textContent = "\u21BA Reset Camera";
    cb.onclick = () => {
      this.spherical = { theta: 0.5, phi: 0.85, radius: 1800 };
      this.target = { x: 0, y: 0, z: 0 };
      this._updateCamera();
    };
    return panel;
  }
};
var MikkPlugin = class extends import_obsidian.Plugin {
  settings;
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new MikkGraphView(leaf, this));
    addIcon("mikk-graph", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/>
      <circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/>
      <line x1="6" y1="6.5" x2="10.5" y2="10.5"/><line x1="18" y1="6.5" x2="13.5" y2="10.5"/>
      <line x1="6" y1="17.5" x2="10.5" y2="13.5"/><line x1="18" y1="17.5" x2="13.5" y2="13.5"/>
    </svg>`);
    this.addRibbonIcon("mikk-graph", "Open Mikk Graph", async () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
      if (existing.length) {
        this.app.workspace.revealLeaf(existing[0]);
        return;
      }
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    });
    this.addCommand({
      id: "open-mikk-graph",
      name: "Open Mikk Graph",
      callback: async () => {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
      }
    });
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.name === "mikk.lock.json" || this.settings.lockFilePath && file.path === (0, import_obsidian.normalizePath)(this.settings.lockFilePath)) {
          this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
            const view = leaf.view;
            if (view instanceof MikkGraphView) view.reload();
          });
        }
      })
    );
    this.addSettingTab(new MikkSettingTab(this.app, this));
  }
  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => l.detach());
  }
  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var MikkSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Mikk Graph Settings" });
    new import_obsidian.Setting(containerEl).setName("Lock file path").setDesc("Path inside vault to mikk.lock.json (defaults to vault root)").addText(
      (t) => t.setPlaceholder("mikk.lock.json").setValue(this.plugin.settings.lockFilePath).onChange(async (v) => {
        this.plugin.settings.lockFilePath = v.trim() || "mikk.lock.json";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto-detect lock file").setDesc("If not found at configured path, search vault for mikk.lock.json").addToggle(
      (t) => t.setValue(!!this.plugin.settings.autoDetect).onChange(async (v) => {
        this.plugin.settings.autoDetect = v;
        await this.plugin.saveSettings();
      })
    );
  }
};
//# sourceMappingURL=main.js.map
