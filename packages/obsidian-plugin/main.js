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
  default: () => MikkPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE = "mikk-v2";
var MODULE_COLORS = {
  "components": "#6366f1",
  "lib": "#10b981",
  "app": "#f59e0b",
  "providers": "#ec4899",
  "hooks": "#8b5cf6",
  "utils": "#14b8a6",
  "api": "#f97316",
  "types": "#64748b",
  "graph": "#3b82f6",
  "parser": "#a855f7",
  "core": "#22c55e",
  "cli": "#ef4444",
  "search": "#0ea5e9",
  "cache": "#d97706",
  "contract": "#7c3aed",
  "security": "#dc2626",
  "hash": "#059669",
  "analysis": "#6d28d9",
  "scripts": "#78716c",
  "benchmarks": "#92400e"
};
function moduleColor(moduleId) {
  if (!moduleId) return "#94a3b8";
  const key = Object.keys(MODULE_COLORS).find((k) => moduleId.toLowerCase().includes(k));
  return key ? MODULE_COLORS[key] : "#94a3b8";
}
var IDEAL_LINK = 80;
var REPULSION = 1500;
var DAMPING = 0.9;
var ALPHA_DECAY = 0.02;
function forceStep(nodes, edges, alpha) {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[j].x - nodes[i].x || 0.1;
      const dy = nodes[j].y - nodes[i].y || 0.1;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > 4e4) continue;
      let force = REPULSION / dist2 * alpha;
      const f = force / Math.sqrt(dist2);
      nodes[i].vx -= f * dx;
      nodes[i].vy -= f * dy;
      nodes[j].vx += f * dx;
      nodes[j].vy += f * dy;
    }
  }
  const nodeMap = new Map(nodes.map((n2) => [n2.id, n2]));
  for (const e of edges) {
    const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
    if (!s || !t) continue;
    const dx = t.x - s.x, dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - IDEAL_LINK) * 0.05 * alpha;
    const fx = force * dx / dist, fy = force * dy / dist;
    if (s.fx === null) {
      s.vx += fx;
      s.vy += fy;
    }
    if (t.fx === null) {
      t.vx -= fx;
      t.vy -= fy;
    }
  }
  for (const node of nodes) {
    if (node.fx !== null) continue;
    node.vx += -node.x * 0.01 * alpha;
    node.vy += -node.y * 0.01 * alpha;
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
  }
}
var MikkGraphView = class extends import_obsidian.ItemView {
  raf = 0;
  alpha = 1;
  nodes = [];
  edges = [];
  transform = { x: 0, y: 0, k: 1 };
  drag = null;
  pan = null;
  canvas;
  ctx;
  tooltip;
  searchInput;
  highlight = /* @__PURE__ */ new Set();
  selected = null;
  infoPanel;
  lock = null;
  lockInfoPanel;
  moduleStatsPanel;
  showLockInfo = true;
  showModuleStats = true;
  constructor(leaf) {
    super(leaf);
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Mikk Graph";
  }
  async onOpen() {
    const vault = this.app.vault;
    const file = vault.getAbstractFileByPath("mikk.lock.json");
    if (file instanceof import_obsidian.TFile) {
      try {
        this.lock = JSON.parse(await vault.read(file));
      } catch (e) {
        console.error("Mikk: parse error", e);
      }
    }
    if (!this.lock) {
      this.containerEl.innerHTML = `<div style="padding:32px;color:var(--text-muted);font-family:monospace">
          \u26A0\uFE0F No <code>mikk.lock.json</code> found in vault root.<br>
          Run <code>mikk scan</code> in your project first.
        </div>`;
      return;
    }
    this.buildGraph();
    this.buildUI();
    this.buildLockInfoPanel();
    this.buildModuleStatsPanel();
    this.startSimulation();
  }
  async onClose() {
    cancelAnimationFrame(this.raf);
  }
  // ── Build graph data from lock file ──────────────────────────────────────
  buildGraph() {
    const lock = this.lock;
    const fns = lock.functions || {};
    const classes = lock.classes || {};
    const fnIndex = lock.fnIndex || [];
    const MAX_NODES = 2e3;
    let count = 0;
    const nodeMap = /* @__PURE__ */ new Map();
    const getFnId = (idx) => fnIndex[idx] ?? null;
    const getModId = (filePath, fnModuleId) => {
      if (fnModuleId) return fnModuleId;
      if (!filePath) return "default";
      const fileParts = filePath.replace(/\\/g, "/").toLowerCase().split("/");
      let startIdx = 0;
      if (fileParts[0].endsWith(":")) startIdx = 1;
      const pkgIdx = fileParts.findIndex((p) => p === "packages" || p === "apps");
      if (pkgIdx !== -1 && pkgIdx + 1 < fileParts.length - 1) return fileParts[pkgIdx + 1];
      const srcIdx = fileParts.findIndex((p) => p === "src");
      if (srcIdx !== -1 && srcIdx + 1 < fileParts.length - 1) return fileParts[srcIdx + 1];
      if (fileParts.length >= 2) return fileParts[fileParts.length - 2];
      return "default";
    };
    for (const [key, fn] of Object.entries(fns)) {
      if (count >= MAX_NODES) break;
      const idx = parseInt(key, 10);
      const fullId = !isNaN(idx) && fnIndex[idx] ? fnIndex[idx] : key;
      const parts = fullId.split(":");
      const filePath = parts.length >= 3 ? parts.slice(0, -1).join(":").replace("fn:", "") : "";
      const rawName = parts[parts.length - 1] || key;
      const name = this.cleanFunctionName(rawName, filePath);
      const modId = getModId(filePath, fn.moduleId);
      const nodeType = rawName.includes(".") || rawName.charAt(0) === rawName.charAt(0).toUpperCase() ? "method" : "function";
      const node = {
        id: fullId,
        name,
        file: filePath,
        moduleId: modId,
        nodeType,
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 600,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        color: moduleColor(modId),
        radius: fn.isExported ? 7 : 5
      };
      nodeMap.set(fullId, node);
      this.nodes.push(node);
      count++;
    }
    for (const [key, cls] of Object.entries(classes)) {
      if (count >= MAX_NODES) break;
      const fullId = `class:${cls.file}:${cls.name}`;
      const modId = getModId(cls.file, cls.moduleId);
      const node = {
        id: fullId,
        name: cls.name,
        file: cls.file || "",
        moduleId: modId,
        nodeType: "class",
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 600,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        color: moduleColor(modId),
        radius: 9
        // larger for classes
      };
      nodeMap.set(fullId, node);
      this.nodes.push(node);
      count++;
    }
    this.deduplicateNodeNames();
    for (const [key, fn] of Object.entries(fns)) {
      const idx = parseInt(key, 10);
      const sourceId = !isNaN(idx) && fnIndex[idx] ? fnIndex[idx] : null;
      if (!sourceId || !nodeMap.has(sourceId)) continue;
      if (Array.isArray(fn.calls)) {
        for (const targetIdx of fn.calls) {
          const targetId = getFnId(targetIdx);
          if (targetId && nodeMap.has(targetId) && sourceId !== targetId) {
            this.edges.push({ source: sourceId, target: targetId });
          }
        }
      }
    }
    for (const [key, fn] of Object.entries(fns)) {
      const idx = parseInt(key, 10);
      const targetId = !isNaN(idx) && fnIndex[idx] ? fnIndex[idx] : null;
      if (!targetId || !nodeMap.has(targetId)) continue;
      if (Array.isArray(fn.calledBy)) {
        for (const callerIdx of fn.calledBy) {
          const sourceId = getFnId(callerIdx);
          if (sourceId && nodeMap.has(sourceId) && sourceId !== targetId) {
            const exists = this.edges.some((e) => e.source === sourceId && e.target === targetId);
            if (!exists) {
              this.edges.push({ source: sourceId, target: targetId });
            }
          }
        }
      }
    }
    this.initialLayout(nodeMap);
    console.log(`Mikk Graph: ${this.nodes.length} nodes, ${this.edges.length} edges`);
  }
  // Position nodes in a simple circle layout
  initialLayout(nodeMap) {
    const centerX = 0, centerY = 0;
    const radius = Math.min(200, this.nodes.length * 2);
    this.nodes.forEach((node, i) => {
      const angle = i / this.nodes.length * Math.PI * 2;
      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
    });
  }
  // Helper to get function data by node ID
  getFnData(nodeId) {
    try {
      const lock = this.lock;
      if (!lock?.functions || !lock.fnIndex) return void 0;
      if (lock.functions[nodeId]) return lock.functions[nodeId];
      const idx = lock.fnIndex.findIndex((id) => id.includes(nodeId));
      if (idx >= 0) return lock.functions[lock.fnIndex[idx]];
      return void 0;
    } catch (e) {
      console.error("Error getting function data:", e);
      return void 0;
    }
  }
  // Clean function name - extract meaningful part
  cleanFunctionName(rawName, filePath) {
    if (!rawName) return "unknown";
    if (rawName.includes(".")) {
      const parts = rawName.split(".");
      return parts[parts.length - 1];
    }
    if (rawName.length > 0 && rawName.charAt(0) === rawName.charAt(0).toUpperCase()) {
      return rawName;
    }
    return rawName.length > 20 ? rawName.slice(0, 18) : rawName;
  }
  // Deduplicate node names by adding file suffix
  deduplicateNodeNames() {
    const nameCounts = /* @__PURE__ */ new Map();
    const nameToNode = /* @__PURE__ */ new Map();
    for (const node of this.nodes) {
      if (!node || !node.name) continue;
      const count = nameCounts.get(node.name) || 0;
      nameCounts.set(node.name, count + 1);
      const list = nameToNode.get(node.name) || [];
      list.push(node);
      nameToNode.set(node.name, list);
    }
    for (const [name, nodes] of nameToNode) {
      if (nodes.length > 1) {
        nodes.forEach((node, i) => {
          if (!node) return;
          const fileName = (node.file || "").split("/").pop()?.replace(/\.[^.]+$/, "") || "f";
          node.name = `${name.slice(0, 14)}:${fileName.slice(0, 6)}`;
        });
      }
    }
  }
  // Fuzzy search for nodes
  fuzzyMatch(query, target) {
    if (!query || !target) return 0;
    query = query.toLowerCase();
    target = target.toLowerCase();
    if (target.includes(query)) return 0.9;
    if (target.startsWith(query)) return 0.7;
    let qi = 0;
    for (let i = 0; i < target.length && qi < query.length; i++) {
      if (target[i] === query[qi]) qi++;
    }
    if (qi === query.length) return 0.5;
    return 0;
  }
  // ── Lock Info Panel ─────────────────────────────────────────────────────
  buildLockInfoPanel() {
    const root = this.containerEl;
    this.lockInfoPanel = root.createEl("div");
    this.lockInfoPanel.style.cssText = `
      position:absolute;top:60px;left:10px;width:280px;z-index:15;
      background:var(--background-secondary);border-radius:12px;
      border:1px solid var(--background-modifier-border);
      padding:16px;font-size:11px;color:var(--text-normal);
      box-shadow:0 4px 20px rgba(0,0,0,0.15);
      transition:all 0.3s ease;
    `;
    const lock = this.lock;
    const generatedDate = lock.generatedAt ? new Date(lock.generatedAt).toLocaleString() : "Unknown";
    this.lockInfoPanel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:14px;font-weight:600;color:var(--text-accent)">\u{1F512} Lock File Info</h3>
        <button onclick="this.parentElement.parentElement.style.display='none'" 
                style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px">\xD7</button>
      </div>
      <div style="display:grid;gap:8px">
        <div><strong>Version:</strong> ${lock.version || "N/A"}</div>
        <div><strong>Generated:</strong> ${generatedDate}</div>
        <div><strong>Generator:</strong> ${lock.generatorVersion || "N/A"}</div>
        ${lock.projectRoot ? `<div><strong>Project:</strong> <code style="font-size:10px">${lock.projectRoot.split(/[\\/]/).pop()}</code></div>` : ""}
        ${lock.syncState ? `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--background-modifier-border)">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="width:8px;height:8px;border-radius:50%;background:${lock.syncState.status === "clean" ? "#10b981" : "#f59e0b"}"></span>
              <strong>Sync Status:</strong> ${lock.syncState.status}
            </div>
            <div style="font-size:10px;color:var(--text-muted)">
              <div>Files: ${lock.syncState.parseDiagnostics.parsedFiles}/${lock.syncState.parseDiagnostics.requestedFiles}</div>
              <div>Diagnostics: ${lock.syncState.parseDiagnostics.diagnostics}</div>
            </div>
          </div>
        ` : ""}
        ${lock.graph ? `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--background-modifier-border)">
            <div><strong>Graph Stats:</strong></div>
            <div style="font-size:10px;color:var(--text-muted)">
              <div>\u{1F4CA} ${lock.graph.nodes} nodes, ${lock.graph.edges} edges</div>
              <div>\u{1F517} Root: <code style="font-size:9px">${lock.graph.rootHash.slice(0, 8)}...</code></div>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }
  // ── Module Stats Panel ────────────────────────────────────────────────────
  buildModuleStatsPanel() {
    const root = this.containerEl;
    this.moduleStatsPanel = root.createEl("div");
    this.moduleStatsPanel.style.cssText = `
      position:absolute;top:60px;right:10px;width:260px;z-index:15;
      background:var(--background-secondary);border-radius:12px;
      border:1px solid var(--background-modifier-border);
      padding:16px;font-size:11px;color:var(--text-normal);
      box-shadow:0 4px 20px rgba(0,0,0,0.15);
      transition:all 0.3s ease;
    `;
    const moduleStats = /* @__PURE__ */ new Map();
    for (const node of this.nodes) {
      const stats = moduleStats.get(node.moduleId) || { count: 0, functions: 0, classes: 0, exported: 0 };
      stats.count++;
      if (node.nodeType === "class") stats.classes++;
      else stats.functions++;
      if (node.radius > 6) stats.exported++;
      moduleStats.set(node.moduleId, stats);
    }
    const sortedModules = Array.from(moduleStats.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
    let moduleHtml = '<div style="display:grid;gap:6px">';
    for (const [moduleId, stats] of sortedModules) {
      const color = moduleColor(moduleId);
      moduleHtml += `
        <div style="display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;background:var(--background-primary)">
          <div style="width:12px;height:12px;border-radius:50%;background:${color}"></div>
          <div style="flex:1">
            <div style="font-weight:500;font-size:12px">${moduleId}</div>
            <div style="font-size:10px;color:var(--text-muted)">
              ${stats.functions}f ${stats.classes}c ${stats.exported}\u2713
            </div>
          </div>
          <div style="font-size:11px;font-weight:600;color:${color}">${stats.count}</div>
        </div>
      `;
    }
    moduleHtml += "</div>";
    this.moduleStatsPanel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:14px;font-weight:600;color:var(--text-accent)">\u{1F4E6} Module Stats</h3>
        <button onclick="this.parentElement.parentElement.style.display='none'" 
                style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px">\xD7</button>
      </div>
      <div style="margin-bottom:8px;font-size:10px;color:var(--text-muted)">
        ${moduleStats.size} modules \xB7 ${this.nodes.length} total symbols
      </div>
      ${moduleHtml}
    `;
  }
  // ── UI scaffold ───────────────────────────────────────────────────────────
  buildUI() {
    const root = this.containerEl;
    root.style.cssText = "position:relative;overflow:hidden;background:var(--background-primary);";
    root.innerHTML = "";
    const header = root.createEl("div");
    header.style.cssText = `
      position:absolute;top:0;left:0;right:0;z-index:10;
      background:var(--background-primary);border-bottom:1px solid var(--background-modifier-border);
      padding:12px;pointer-events:none;
    `;
    const toolbar = header.createEl("div");
    toolbar.style.cssText = `
      display:flex;align-items:center;gap:12px;pointer-events:all;
    `;
    const title = toolbar.createEl("div");
    title.innerHTML = '<span style="font-weight:600;font-size:16px;color:var(--text-accent)">\u{1F517} Mikk Graph</span>';
    this.searchInput = toolbar.createEl("input", { type: "text", placeholder: "\u{1F50D} Search functions, modules, files\u2026" });
    this.searchInput.style.cssText = `
      flex:1;max-width:320px;padding:8px 14px;border-radius:10px;
      border:1px solid var(--background-modifier-border);
      background:var(--background-secondary);color:var(--text-normal);
      font-size:13px;outline:none;transition:all 0.2s ease;
    `;
    this.searchInput.addEventListener("input", () => this.onSearch(this.searchInput.value));
    this.searchInput.addEventListener("focus", () => {
      this.searchInput.style.borderColor = "var(--text-accent)";
      this.searchInput.style.boxShadow = "0 0 0 2px rgba(var(--text-accent-rgb), 0.1)";
    });
    this.searchInput.addEventListener("blur", () => {
      this.searchInput.style.borderColor = "var(--background-modifier-border)";
      this.searchInput.style.boxShadow = "none";
    });
    const stats = toolbar.createEl("span");
    stats.style.cssText = `
      padding:6px 12px;border-radius:8px;font-size:12px;font-weight:500;
      background:var(--background-secondary-alt);color:var(--text-normal);
      border:1px solid var(--background-modifier-border);
    `;
    stats.textContent = `${this.nodes.length} symbols \xB7 ${this.edges.length} connections`;
    const controls = toolbar.createEl("div");
    controls.style.cssText = "display:flex;gap:6px;";
    const toggleLockBtn = controls.createEl("button");
    toggleLockBtn.innerHTML = "\u{1F512}";
    toggleLockBtn.title = "Toggle Lock Info";
    toggleLockBtn.style.cssText = `
      padding:6px 10px;border-radius:8px;font-size:14px;cursor:pointer;
      background:var(--background-secondary);color:var(--text-normal);
      border:1px solid var(--background-modifier-border);
    `;
    toggleLockBtn.onclick = () => {
      this.showLockInfo = !this.showLockInfo;
      this.lockInfoPanel.style.display = this.showLockInfo ? "block" : "none";
    };
    const toggleModuleBtn = controls.createEl("button");
    toggleModuleBtn.innerHTML = "\u{1F4E6}";
    toggleModuleBtn.title = "Toggle Module Stats";
    toggleModuleBtn.style.cssText = toggleLockBtn.style.cssText;
    toggleModuleBtn.onclick = () => {
      this.showModuleStats = !this.showModuleStats;
      this.moduleStatsPanel.style.display = this.showModuleStats ? "block" : "none";
    };
    this.canvas = root.createEl("canvas");
    this.canvas.style.cssText = "position:absolute;top:48px;left:0;right:0;bottom:0;cursor:grab;background:transparent;";
    this.ctx = this.canvas.getContext("2d");
    this.transform = { x: 0, y: 0, k: 0.5 };
    this.resize();
    console.log("Canvas created, initial transform:", this.transform);
    this.tooltip = root.createEl("div");
    this.tooltip.style.cssText = `
      position:absolute;display:none;pointer-events:none;z-index:20;
      padding:10px 14px;border-radius:10px;font-size:12px;max-width:300px;
      background:var(--background-secondary);color:var(--text-normal);
      border:1px solid var(--background-modifier-border);
      box-shadow:0 8px 24px rgba(0,0,0,0.2);line-height:1.6;
    `;
    this.infoPanel = root.createEl("div");
    this.infoPanel.style.cssText = `
      position:absolute;top:60px;right:10px;width:250px;display:none;
      background:var(--background-secondary);border-radius:12px;z-index:15;
      border:1px solid var(--background-modifier-border);
      padding:16px;font-size:12px;color:var(--text-normal);
      box-shadow:0 8px 24px rgba(0,0,0,0.2);
    `;
    const resetBtn = root.createEl("button");
    resetBtn.innerHTML = "\u27F3 Reset View";
    resetBtn.style.cssText = `
      position:absolute;bottom:16px;right:16px;z-index:10;
      padding:8px 16px;border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;
      background:var(--interactive-accent);color:var(--text-on-accent);
      border:none;box-shadow:0 4px 12px rgba(var(--interactive-accent-rgb), 0.3);
      transition:all 0.2s ease;
    `;
    resetBtn.onmouseover = () => resetBtn.style.transform = "translateY(-1px)";
    resetBtn.onmouseout = () => resetBtn.style.transform = "translateY(0)";
    resetBtn.onclick = () => {
      this.transform = { x: this.canvas.width / 2, y: this.canvas.height / 2, k: 1 };
      this.alpha = 0.5;
    };
    this.attachCanvasEvents();
  }
  // ── Canvas interaction ────────────────────────────────────────────────────
  resize() {
    const w = this.containerEl.clientWidth || 800;
    const h = this.containerEl.clientHeight || 600;
    this.canvas.width = w;
    this.canvas.height = h;
    this.transform = { x: w / 2, y: h / 2, k: 0.5 };
    console.log(`Canvas: ${w}x${h}, Transform:`, this.transform);
  }
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.transform.x) / this.transform.k,
      y: (sy - this.transform.y) / this.transform.k
    };
  }
  nodeAt(wx, wy) {
    const hitRadius = 8 / this.transform.k;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = n.x - wx, dy = n.y - wy;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return n;
    }
    return null;
  }
  attachCanvasEvents() {
    const c = this.canvas;
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newK = Math.min(3, Math.max(0.1, this.transform.k * factor));
      const worldX = (mx - this.transform.x) / this.transform.k;
      const worldY = (my - this.transform.y) / this.transform.k;
      this.transform.k = newK;
      this.transform.x = mx - worldX * newK;
      this.transform.y = my - worldY * newK;
    }, { passive: false });
    c.addEventListener("mousedown", (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const wp = this.screenToWorld(sx, sy);
      const hit = this.nodeAt(wp.x, wp.y);
      if (hit) {
        hit.fx = hit.x;
        hit.fy = hit.y;
        this.drag = { node: hit, ox: wp.x - hit.x, oy: wp.y - hit.y };
        c.style.cursor = "grabbing";
      } else {
        this.pan = { startX: e.clientX, startY: e.clientY, tx: this.transform.x, ty: this.transform.y };
        c.style.cursor = "grabbing";
      }
    });
    window.addEventListener("mousemove", (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (this.drag) {
        const wp = this.screenToWorld(sx, sy);
        this.drag.node.fx = wp.x - this.drag.ox;
        this.drag.node.fy = wp.y - this.drag.oy;
        this.drag.node.x = this.drag.node.fx;
        this.drag.node.y = this.drag.node.fy;
        this.alpha = Math.max(this.alpha, 0.3);
      } else if (this.pan) {
        this.transform.x = this.pan.tx + (e.clientX - this.pan.startX);
        this.transform.y = this.pan.ty + (e.clientY - this.pan.startY);
      } else {
        const wp = this.screenToWorld(sx, sy);
        const hit = this.nodeAt(wp.x, wp.y);
        this.showTooltip(hit, e.clientX - rect.left, e.clientY - rect.top);
      }
    });
    window.addEventListener("mouseup", () => {
      if (this.drag) {
        this.drag.node.fx = null;
        this.drag.node.fy = null;
        this.drag = null;
      }
      this.pan = null;
      this.canvas.style.cursor = "grab";
    });
    c.addEventListener("click", (e) => {
      const rect = c.getBoundingClientRect();
      const wp = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = this.nodeAt(wp.x, wp.y);
      if (hit && this.selected?.id === hit.id) {
        this.selectNode(null);
      } else {
        this.selectNode(hit);
      }
    });
    c.addEventListener("dblclick", () => {
      if (this.selected) {
        this.selectNode(null);
      }
    });
    window.addEventListener("resize", () => this.resize());
  }
  // ── Enhanced Search ────────────────────────────────────────────────────────────
  onSearch(query) {
    this.highlight.clear();
    if (!query.trim()) return;
    const q = query.toLowerCase();
    const queryWords = q.split(/\s+/).filter((w) => w.length > 0);
    for (const n of this.nodes) {
      const name = n.name.toLowerCase();
      const file = n.file.toLowerCase();
      const module2 = n.moduleId.toLowerCase();
      const matchesAllWords = queryWords.every(
        (word) => name.includes(word) || file.includes(word) || module2.includes(word)
      );
      const fuzzyMatch = queryWords.length === 1 && this.fuzzyMatch(queryWords[0], name) > 0.3;
      if (matchesAllWords || fuzzyMatch) {
        this.highlight.add(n.id);
      }
    }
  }
  // ── Enhanced Tooltip / info panel ──────────────────────────────────────────────
  showTooltip(node, sx, sy) {
    if (!node) {
      this.tooltip.style.display = "none";
      return;
    }
    const calls = this.edges.filter((e) => e.source === node.id);
    const callers = this.edges.filter((e) => e.target === node.id);
    const totalCalls = calls.length;
    const totalCallers = callers.length;
    const fnData = this.getFnData(node.id);
    const isExported = fnData?.isExported || node.radius > 6 || false;
    const purpose = fnData?.purpose || "";
    const params = fnData?.params || [];
    const returnType = fnData?.returnType || "";
    const typeIcon = node.nodeType === "class" ? "\u{1F4E6}" : node.nodeType === "method" ? "\u26A1" : "\u2699\uFE0F";
    const typeLabel = node.nodeType === "class" ? "Class" : node.nodeType === "method" ? "Method" : "Function";
    const paramsStr = params.length > 0 ? params.slice(0, 3).map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`).join(", ") + (params.length > 3 ? "\u2026" : "") : "";
    this.tooltip.style.display = "block";
    this.tooltip.style.left = sx + 14 + "px";
    this.tooltip.style.top = sy - 8 + "px";
    this.tooltip.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:16px">${typeIcon}</span>
        <div>
          <div style="font-weight:600;font-size:13px">${node.name || "unknown"}</div>
          <div style="color:var(--text-muted);font-size:10px">${typeLabel} \xB7 ${node.moduleId}</div>
        </div>
        ${isExported ? '<span style="background:var(--text-accent);color:var(--text-on-accent);font-size:9px;padding:2px 6px;border-radius:4px">exported</span>' : ""}
      </div>
      ${node.file ? `<div style="color:var(--text-muted);font-size:10px;margin-bottom:4px;font-family:monospace">\u{1F4C1} ${node.file.split(/[\\/]/).pop()}</div>` : ""}
      ${purpose ? `<div style="color:var(--text-normal);font-size:11px;margin-bottom:4px;font-style:italic">${purpose}</div>` : ""}
      ${paramsStr ? `<div style="color:var(--text-muted);font-size:10px;margin-bottom:4px;font-family:monospace">(${paramsStr})${returnType ? ": " + returnType : ""}</div>` : ""}
      <div style="display:flex;gap:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--background-modifier-border);font-size:10px">
        <span style="color:#10b981">\u25B6 ${totalCalls} calls</span>
        <span style="color:#6366f1">\u25C0 ${totalCallers} callers</span>
      </div>
    `;
  }
  selectNode(node) {
    try {
      this.selected = node;
      if (!node) {
        this.infoPanel.style.display = "none";
        return;
      }
      const calls = this.edges.filter((e) => e.source === node.id);
      const callers = this.edges.filter((e) => e.target === node.id);
      const fnData = this.getFnData(node.id);
      const purpose = fnData?.purpose || "";
      const params = fnData?.params || [];
      const returnType = fnData?.returnType || "";
      const lines = fnData?.lines || [];
      const isExported = fnData?.isExported || node.radius > 6;
      const formatCallList = (edges, maxItems = 8) => {
        return edges.slice(0, maxItems).map((e) => {
          const parts = e.target.split(":");
          const name = parts[parts.length - 1] || "?";
          const targetNode = this.nodes.find((n) => n.id === e.target);
          const module2 = targetNode?.moduleId || "";
          return `<div style="padding:2px 0;font-size:10px">\u2022 <span style="color:var(--text-normal)">${name}</span> <span style="color:var(--text-muted)">(${module2})</span></div>`;
        }).join("") + (edges.length > maxItems ? `<div style="color:var(--text-muted);font-size:9px;padding:2px 0">\u2026 and ${edges.length - maxItems} more</div>` : "");
      };
      this.highlight.clear();
      this.highlight.add(node.id);
      for (const e of calls) this.highlight.add(e.target);
      for (const e of callers) this.highlight.add(e.source);
      const typeIcon = node.nodeType === "class" ? "\u{1F4E6}" : node.nodeType === "method" ? "\u26A1" : "\u2699\uFE0F";
      const typeLabel = node.nodeType === "class" ? "Class" : node.nodeType === "method" ? "Method" : "Function";
      const paramsStr = params.length > 0 ? params.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`).join(", ") : "none";
      this.infoPanel.style.display = "block";
      this.infoPanel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:18px">${typeIcon}</span>
          <div>
            <div style="font-weight:600;font-size:14px;color:var(--text-accent)">${node.name || "unknown"}</div>
            <div style="color:var(--text-muted);font-size:11px">${typeLabel} in ${node.moduleId}</div>
          </div>
        </div>
        ${isExported ? '<span style="background:var(--interactive-accent);color:var(--text-on-accent);font-size:9px;padding:3px 8px;border-radius:6px">exported</span>' : ""}
      </div>
      
      ${node.file ? `<div style="margin-bottom:8px;padding:6px;background:var(--background-primary);border-radius:6px;font-size:10px;font-family:monospace;color:var(--text-muted)">\u{1F4C1} ${node.file}</div>` : ""}
      
      ${purpose ? `<div style="margin-bottom:8px;padding:6px;background:var(--background-primary);border-radius:6px;font-size:11px;font-style:italic;color:var(--text-normal)">\u{1F4AD} ${purpose}</div>` : ""}
      
      ${params.length > 0 ? `
        <div style="margin-bottom:8px">
          <div style="font-weight:500;font-size:11px;margin-bottom:4px;color:var(--text-muted)">Parameters:</div>
          <div style="padding:6px;background:var(--background-primary);border-radius:6px;font-size:10px;font-family:monospace;color:var(--text-normal)">(${paramsStr})${returnType ? ": " + returnType : ""}</div>
        </div>
      ` : ""}
      
      ${lines && lines.length > 0 ? `
        <div style="margin-bottom:8px">
          <div style="font-weight:500;font-size:11px;margin-bottom:4px;color:var(--text-muted)">Location:</div>
          <div style="font-size:10px;color:var(--text-normal)">Lines ${Math.min(...lines)}-${Math.max(...lines)}</div>
        </div>
      ` : ""}
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div style="padding:6px;background:var(--background-primary);border-radius:6px;text-align:center">
          <div style="font-size:16px;font-weight:600;color:#10b981">${calls.length}</div>
          <div style="font-size:9px;color:var(--text-muted)">calls</div>
        </div>
        <div style="padding:6px;background:var(--background-primary);border-radius:6px;text-align:center">
          <div style="font-size:16px;font-weight:600;color:#6366f1">${callers.length}</div>
          <div style="font-size:9px;color:var(--text-muted)">callers</div>
        </div>
      </div>
      
      ${calls.length > 0 ? `
        <div style="margin-bottom:8px">
          <div style="font-weight:500;font-size:11px;margin-bottom:4px;color:var(--text-muted)">Calls (${calls.length}):</div>
          <div style="max-height:120px;overflow-y:auto">${formatCallList(calls)}</div>
        </div>
      ` : ""}
      
      ${callers.length > 0 ? `
        <div>
          <div style="font-weight:500;font-size:11px;margin-bottom:4px;color:var(--text-muted)">Called by (${callers.length}):</div>
          <div style="max-height:120px;overflow-y:auto">${formatCallList(callers)}</div>
        </div>
      ` : ""}
      
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--background-modifier-border);font-size:10px;color:var(--text-muted);text-align:center">
        Double-click to deselect
      </div>
    `;
    } catch (e) {
      console.error("Error in selectNode:", e);
      this.infoPanel.style.display = "none";
    }
  }
  // ── Simulation loop ───────────────────────────────────────────────────────
  startSimulation() {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (this.alpha > 1e-3) {
        forceStep(this.nodes, this.edges, this.alpha);
        this.alpha -= ALPHA_DECAY;
        if (this.alpha < 0) this.alpha = 0;
      }
      this.draw();
    };
    tick();
  }
  // ── Simple Render ────────────────────────────────────────────────────
  draw() {
    console.log("=== DRAW START ===");
    console.log("Nodes:", this.nodes?.length || 0);
    console.log("Edges:", this.edges?.length || 0);
    console.log("Transform:", this.transform);
    console.log("Canvas:", this.canvas ? "available" : "null");
    console.log("Context:", this.ctx ? "available" : "null");
    if (!this.ctx || !this.canvas) {
      console.error("Canvas or context not available");
      return;
    }
    const ctx = this.ctx;
    const { x: tx, y: ty, k } = this.transform;
    const hasHL = this.highlight.size > 0;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
    ctx.fillRect(0, 0, 50, 50);
    if (!this.nodes || this.nodes.length === 0) {
      ctx.fillStyle = "#fff";
      ctx.font = "16px sans-serif";
      ctx.fillText("No nodes to display", 100, 100);
      return;
    }
    console.log("About to draw nodes...");
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);
    console.log(`Drawing ${this.nodes.length} nodes, ${this.edges?.length || 0} edges`);
    if (k > 0.5) {
      console.log("Drawing edges...");
      ctx.strokeStyle = "rgba(150, 150, 150, 0.2)";
      ctx.lineWidth = 1 / k;
      let edgeCount = 0;
      for (const e of this.edges) {
        const s = this.nodes.find((n) => n.id === e.source);
        const t = this.nodes.find((n) => n.id === e.target);
        if (!s || !t) continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        edgeCount++;
      }
      console.log(`Drew ${edgeCount} edges`);
    }
    console.log("Drawing nodes...");
    let nodeCount = 0;
    for (const node of this.nodes) {
      nodeCount++;
      const isHL = !hasHL || this.highlight.has(node.id);
      const isSelected = this.selected?.id === node.id;
      console.log(`Drawing node ${nodeCount}: ${node.name} at (${node.x}, ${node.y})`);
      const opacity = hasHL && !isHL ? 0.3 : 0.9;
      const nodeColor = node.color + Math.floor(opacity * 255).toString(16).padStart(2, "0");
      ctx.beginPath();
      ctx.arc(node.x, node.y, Math.max(4, node.radius), 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 / k;
        ctx.stroke();
      }
      if (k > 0.8) {
        ctx.font = `${Math.max(8, 10 / k)}px sans-serif`;
        ctx.fillStyle = isHL ? "#fff" : "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "center";
        const text = node.name.length > 12 ? node.name.slice(0, 10) + "\u2026" : node.name;
        ctx.fillText(text, node.x, node.y + node.radius + 8);
      }
    }
    console.log(`Drew ${nodeCount} nodes`);
    ctx.restore();
    console.log("=== DRAW END ===");
  }
};
var MikkPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new MikkGraphView(leaf));
    this.addCommand({
      id: "open-mikk-graph",
      name: "Open Mikk Graph",
      callback: async () => {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
      }
    });
    (0, import_obsidian.addIcon)("mg", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <circle cx="4" cy="6" r="2"/>
      <circle cx="20" cy="6" r="2"/>
      <circle cx="4" cy="18" r="2"/>
      <circle cx="20" cy="18" r="2"/>
      <line x1="6" y1="7" x2="10" y2="11"/>
      <line x1="18" y1="7" x2="14" y2="11"/>
      <line x1="6" y1="17" x2="10" y2="13"/>
      <line x1="18" y1="17" x2="14" y2="13"/>
    </svg>`);
    this.addRibbonIcon("mg", "Mikk Graph", async () => {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    });
  }
};
//# sourceMappingURL=main.js.map
