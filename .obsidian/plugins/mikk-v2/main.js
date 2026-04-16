/*
 * Mikk Graph v2 — 3D Obsidian Plugin
 * Highly customizable: colored nodes, selection modes, graph modes, non-overlapping layout
 */
'use strict';

var obsidian = require('obsidian');

const VIEW_TYPE = 'mikk-v3';

// ─── Module colour palette (vibrant, light-toned) ────────────────────────────
const PALETTE = {
  'components': '#88aaff', 'lib':        '#5de8a8', 'app':      '#ffd166',
  'providers':  '#ff85c8', 'hooks':      '#b99dff', 'utils':    '#4ecdc4',
  'api':        '#ffb347', 'types':      '#a0b4cc', 'graph':    '#74c0fc',
  'parser':     '#cc99ff', 'core':       '#69db7c', 'cli':      '#ff8787',
  'search':     '#38d9f5', 'cache':      '#ffa94d', 'contract': '#9775fa',
  'security':   '#ff6b6b', 'hash':       '#20c997', 'analysis': '#b197fc',
  'scripts':    '#adb5bd', 'benchmarks': '#e8a87c', 'watcher':  '#63e6be',
  'intent':     '#ff9fb2', 'mcp':        '#8b7ef8', 'obsidian': '#a78bfa',
  'vscode':     '#4dabf7', 'registry':   '#ffd43b', 'default':  '#94a3b8',
};

function hexToRGB01(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function modColor(moduleId) {
  if (!moduleId) return hexToRGB01(PALETTE.default);
  const k = Object.keys(PALETTE).find(k => moduleId.toLowerCase().includes(k));
  return hexToRGB01(k ? PALETTE[k] : PALETTE.default);
}

// ─── Three.js loader ─────────────────────────────────────────────────────────
async function loadThree() {
  if (window.THREE && window.THREE.__mikk_loaded) return window.THREE;
  return new Promise((resolve, reject) => {
    if (window.THREE) { window.THREE.__mikk_loaded = true; resolve(window.THREE); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => { window.THREE.__mikk_loaded = true; resolve(window.THREE); };
    s.onerror = () => reject(new Error('Failed to load Three.js'));
    document.head.appendChild(s);
  });
}

// ─── Graph View ───────────────────────────────────────────────────────────────
class MikkGraphView extends obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
    this.T = null;
    this.renderer = null; this.scene = null; this.camera = null;
    this.raf = 0;
    this.lock = null;
    this.nodes = [];
    this.edges = [];
    // adjacency for fast lookup
    this.adjOut = new Map(); // src → Set of targets
    this.adjIn  = new Map(); // tgt → Set of sources
    this.nodeIndexMap = new Map();
    this.instanceMesh = null;
    this.edgeLines = null;
    this.dummy = null;
    this.colorObj = null;
    this.raycaster = null;
    this.hoveredIdx = -1;
    this.selectedIdx = -1;
    this.highlight = new Set(); // indices to highlight
    this.spherical = { theta: 0.5, phi: 1.1, radius: 500 };
    this.target = { x: 0, y: 0, z: 0 };
    this.isDragging = false; this.isPanning = false;
    this.lastMouse = { x: 0, y: 0 };
    this.alpha = 1.0; this.simSteps = 0; this.simActive = true;
    this.SIM_MAX = 300;

    // ── Customizable settings ─────────────────────────────────────────────
    this.cfg = {
      maxNodes:      5000,
      graphMode:     'force3d',    // 'force3d' | 'radial' | 'flat'
      selectMode:    'callers',    // 'callers' | 'callees' | 'both' | 'component' | 'single'
      groupBy:       'moduleId',   // 'moduleId' | 'fileDir' | 'nodeType' | 'exported'
      groupMeshStyle: 'box',       // 'none' | 'sphere' | 'box' | 'hull' - 3D group representation
      searchMode:    'hybrid',     // 'exact' | 'fuzzy' | 'semantic' | 'hybrid' - search algorithm
      dimStrength:   0.08,
      nodeScale:     1.0,
      edgeOpacity:   0.35,
      showEdges:     true,
      colorByModule: true,
      showGroups:    true,
      repulsion:     200,
      idealDist:     150,
      groupDist:     350,         // Distance between group centers (3D shapes)
      nodeSpacing:   15,         // Min spacing between nodes
      preventOverlap: true,       // Enable node collision resolution
      preventGroupOverlap: true,  // Enable group collision resolution
      showNodeNames: true,       // Show node names
      labelDist: 100,          // Show labels within distance
      labelSize: 14,           // Label font size
      showModuleLegend: true,  // Show module colors legend
    };
    this.groupMeshes = []; // halo ring meshes

    // UI refs
    this.tooltip = null; this.infoPanel = null; this.settingsPanel = null; this._labelContainer = null; this._legendEl = null;
    this.statsPanel = null; this.searchInput = null; this.countEl = null;
    this.container3d = null;

    // Bound handlers
    this._mm = this._mm.bind(this); this._md = this._md.bind(this);
    this._mu = this._mu.bind(this); this._mw = this._mw.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Mikk Graph 3D'; }
  getIcon() { return 'git-fork'; }

  async onOpen() {
    const root = this.containerEl;
    root.style.setProperty('background', '#0d1117', 'important');

    const vf = this.app.vault.getAbstractFileByPath('mikk.lock.json');
    if (vf instanceof obsidian.TFile) {
      try { this.lock = JSON.parse(await this.app.vault.read(vf)); }
      catch (e) { console.error('[Mikk] parse error', e); }
    }
    if (!this.lock) {
      root.innerHTML = `<div style="padding:48px;color:#8b949e;font-family:monospace;line-height:2">
        <div style="font-size:32px">⚠️</div>
        <strong style="color:#f0f6fc;font-size:16px">mikk.lock.json not found in vault root</strong><br>
        Run <code style="background:#161b22;padding:2px 8px;border-radius:4px;color:#79c0ff">mikk scan</code> in your project,
        then copy <code style="background:#161b22;padding:2px 8px;border-radius:4px;color:#79c0ff">mikk.lock.json</code> here.
      </div>`; return;
    }

    this._buildGraph();
    this._buildUI(root);

    try {
      this.T = await loadThree();
      this._init3D();
      this._mkInstanceMesh();
      this._mkEdges();
      this._applyLayout();
      this._loop();
    } catch (e) {
      console.error('[Mikk 3D] init failed', e);
      if (this.container3d)
        this.container3d.innerHTML = `<div style="padding:32px;color:#f85149;font-size:14px">3D init failed: ${e.message}</div>`;
    }
    window.addEventListener('resize', this._onResize);
  }

  async onClose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    if (this.container3d) {
      this.container3d.removeEventListener('mousemove', this._mm);
      this.container3d.removeEventListener('mousedown', this._md);
      this.container3d.removeEventListener('mouseup', this._mu);
      this.container3d.removeEventListener('wheel', this._mw);
    }
    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
  }

  // ─── Build graph ─────────────────────────────────────────────────────────
  _buildGraph() {
    const lock = this.lock;
    const fns = lock.functions || {}, cls = lock.classes || {}, fnIdx = lock.fnIndex || [];
    const MAX = this.cfg.maxNodes;

    const getModId = (fp, fm) => {
      if (fm) return fm; if (!fp) return 'default';
      const ps = fp.replace(/\\/g, '/').toLowerCase().split('/');
      const pi = ps.findIndex(p => p === 'packages' || p === 'apps');
      if (pi !== -1 && pi + 1 < ps.length - 1) return ps[pi + 1];
      const si = ps.findIndex(p => p === 'src');
      if (si !== -1 && si + 1 < ps.length - 1) return ps[si + 1];
      return ps.length >= 2 ? ps[ps.length - 2] : 'default';
    };

    this.nodes = []; this.edges = [];
    this.adjOut = new Map(); this.adjIn = new Map();
    this.isDraggingGroup = false; this.dragGroupIdx = null;
    this._dragVel = { x: 0, y: 0 };
    let count = 0; const nm = new Map();

    for (const [key, fn] of Object.entries(fns)) {
      if (count >= MAX) break;
      const i = parseInt(key, 10);
      const fid = (!isNaN(i) && fnIdx[i]) ? fnIdx[i] : key;
      if (nm.has(fid)) continue;
      const parts = fid.split(':');
      const fp = parts.length >= 3 ? parts.slice(0, -1).join(':').replace('fn:', '') : '';
      const rawN = parts[parts.length - 1] || key;
      const name = rawN.includes('.') ? rawN.split('.').pop().slice(0, 28) : rawN.slice(0, 28);
      const mid = getModId(fp, fn.moduleId);
      nm.set(fid, this.nodes.length);
      this.nodes.push({
        id: fid, name, file: fp, moduleId: mid,
        nodeType: rawN.includes('.') ? 'method' : 'function',
        isExported: !!fn.isExported, purpose: fn.purpose || '',
        params: fn.params || [], returnType: fn.returnType || '',
        radius: fn.isExported ? 2.8 : 1.8,
        color: modColor(mid),
        x: (Math.random() - .5) * 600, y: (Math.random() - .5) * 600, z: (Math.random() - .5) * 600,
        vx: 0, vy: 0, vz: 0,
      }); count++;
    }

    for (const [key, c] of Object.entries(cls)) {
      if (count >= MAX) break;
      const fid = `class:${c.file}:${c.name}`;
      if (nm.has(fid)) continue;
      const mid = getModId(c.file, c.moduleId);
      nm.set(fid, this.nodes.length);
      this.nodes.push({
        id: fid, name: c.name, file: c.file || '', moduleId: mid,
        nodeType: 'class', isExported: !!c.isExported, purpose: c.purpose || '',
        params: [], returnType: '',
        radius: 4.5, color: modColor(mid),
        x: (Math.random() - .5) * 600, y: (Math.random() - .5) * 600, z: (Math.random() - .5) * 600,
        vx: 0, vy: 0, vz: 0,
      }); count++;
    }
    this.nodeIndexMap = nm;

    // Build edges + adjacency maps
    const edgeSet = new Set();
    const addEdge = (sId, tId) => {
      if (!sId || !tId || sId === tId) return;
      const si = nm.get(sId), ti = nm.get(tId);
      if (si === undefined || ti === undefined) return;
      if (this.edges.length >= 40000) return;
      const k = si < ti ? `${si}_${ti}` : `${ti}_${si}`;
      if (edgeSet.has(k)) return;
      edgeSet.add(k);
      this.edges.push({ source: si, target: ti });
      if (!this.adjOut.has(si)) this.adjOut.set(si, new Set());
      if (!this.adjIn.has(ti))  this.adjIn.set(ti, new Set());
      this.adjOut.get(si).add(ti);
      this.adjIn.get(ti).add(si);
    };

    for (const [key, fn] of Object.entries(fns)) {
      const i = parseInt(key, 10);
      const sid = (!isNaN(i) && fnIdx[i]) ? fnIdx[i] : null;
      if (!sid) continue;
      if (Array.isArray(fn.calls)) for (const ci of fn.calls)
        addEdge(sid, typeof ci === 'number' ? fnIdx[ci] : ci);
      if (Array.isArray(fn.calledBy)) for (const ci of fn.calledBy)
        addEdge(typeof ci === 'number' ? fnIdx[ci] : ci, sid);
    }

    this._clusterLayout();
    console.log(`[Mikk] ${this.nodes.length} nodes, ${this.edges.length} edges`);
  }

  // ─── Layouts ──────────────────────────────────────────────────────────────

  // Get group key for a node based on cfg.groupBy
  _groupKey(nd) {
    if (this.cfg.groupBy === 'fileDir') {
      const parts = (nd.file || '').replace(/\\/g, '/').split('/');
      return parts.length >= 2 ? parts[parts.length - 2] : 'root';
    }
    if (this.cfg.groupBy === 'nodeType') return nd.nodeType; // 'function'|'method'|'class'
    if (this.cfg.groupBy === 'exported') return nd.isExported ? 'Exported' : 'Internal';
    return nd.moduleId; // default: moduleId
  }

  _buildGroups() {
    const groups = new Map();
    for (const n of this.nodes) {
      const k = this._groupKey(n);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    return groups;
  }

  _clusterLayout() {
    const groups = this._buildGroups();
    const keys = Array.from(groups.keys());
    // Space group centers further apart so groups never overlap in 3D
    // Use groupDist as base, scale by number of groups to ensure min spacing
    const groupSpacing = this.cfg.groupDist || 350;
    // Calculate radius to ensure groups are at least groupSpacing apart
    const baseR = groupSpacing * Math.pow(keys.length, 0.4);  
    const clR = Math.max(baseR, groupSpacing * 1.5);
    keys.forEach((k, ki) => {
      // Fibonacci sphere distribution for group centers - ensures max separation in 3D
      const phi   = Math.acos(1 - 2 * (ki + 0.5) / keys.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * ki;
      const cx = clR * Math.sin(phi) * Math.cos(theta);
      const cy = clR * Math.cos(phi);  // Full 3D separation - groups at different Y heights
      const cz = clR * Math.sin(phi) * Math.sin(theta);
      const members = groups.get(k);
      // Nodes inside a group - scaled by idealDist
const nodeSpacing = this.cfg.nodeSpacing || this.cfg.idealDist || 150;
      const inR = Math.max(nodeSpacing * 0.15, Math.cbrt(members.length) * (nodeSpacing * 0.15));
      members.forEach((n, ni) => {
        const p2 = Math.acos(1 - 2 * (ni + 0.5) / members.length);
        const t2 = Math.PI * (1 + Math.sqrt(5)) * ni;
        n.x = cx + inR * Math.sin(p2) * Math.cos(t2);
        n.y = cy + inR * Math.cos(p2);
        n.z = cz + inR * Math.sin(p2) * Math.sin(t2);
        n.vx = 0; n.vy = 0; n.vz = 0;
        n._groupKey = k; // cache for physics
        n._groupCx = cx; n._groupCy = cy; n._groupCz = cz;
      });
    });
    this._groupData = groups; // store for halo rendering
  }

  _radialLayout() {
    const groups = this._buildGroups();
    if (!this._groupData) this._groupData = groups;
    const grouped = groups;
    const keys = Array.from(grouped.keys());
    // Ring distribution - groups on different Y levels too - use groupDist
    const groupSpacing = this.cfg.groupDist || 350;
    const ringR = Math.max(groupSpacing * 0.6, keys.length * groupSpacing / keys.length);
    const yStep = Math.max(groupSpacing * 0.3, keys.length * 15); // Separate groups vertically
    const nodeSpacing = this.cfg.nodeSpacing || this.cfg.idealDist || 150;
    keys.forEach((k, ki) => {
      const angle = (ki / keys.length) * Math.PI * 2;
      const cx = ringR * Math.cos(angle);
      const cz = ringR * Math.sin(angle);
      const cy = (ki - keys.length/2) * yStep / keys.length; // Each group at different Y
      const members = grouped.get(k);
      const spokeR = Math.max(nodeSpacing * 0.2, Math.cbrt(members.length) * (nodeSpacing * 0.15));
      members.forEach((n, ni) => {
        const a2 = (ni / members.length) * Math.PI * 2;
        n.x = cx + spokeR * Math.cos(a2);
        n.y = cy + (ni - members.length / 2) * (nodeSpacing * 0.08); // Nodes spread around group center Y
        n.z = cz + spokeR * Math.sin(a2);
        n.vx = 0; n.vy = 0; n.vz = 0;
      });
    });

    if (this.cfg.noOverlap) this._resolveOverlaps();
    if (this.cfg.preventGroupOverlap) this._resolveGroupOverlaps();
  }

  _flatLayout() {
    this._clusterLayout();
    for (const n of this.nodes) { n.y = 0; n.vy = 0; }
    if (this.cfg.noOverlap) this._resolveOverlaps();
  }

  // Resolve node overlaps using radius-based repulsion
  _resolveOverlaps() {
    const iterations = 50;
    const pushFactor = 2.5;
    for (let iter = 0; iter < iterations; iter++) {
      let moved = false;
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const n1 = this.nodes[i], n2 = this.nodes[j];
          const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.01;
          const minDist = (n1.radius || 2) * this.cfg.nodeScale * 2.5 + (n2.radius || 2) * this.cfg.nodeScale * 2.5;
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) * pushFactor / dist;
            n1.x -= dx * push * 0.5; n1.y -= dy * push * 0.5; n1.z -= dz * push * 0.5;
            n2.x += dx * push * 0.5; n2.y += dy * push * 0.5; n2.z += dz * push * 0.5;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }

  _resolveGroupOverlaps() {
    if (!this._groupData) return;
    const groupDist = this.cfg.groupDist || 400;
    const iterations = 30;
    const pushFactor = 2.0;
    const groups = Array.from(this._groupData.entries());
    for (let iter = 0; iter < iterations; iter++) {
      let moved = false;
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const [key1, members1] = groups[i];
          const [key2, members2] = groups[j];
          let cx1 = 0, cy1 = 0, cz1 = 0;
          let cx2 = 0, cy2 = 0, cz2 = 0;
          for (const n of members1) { cx1 += n.x; cy1 += n.y; cz1 += n.z; }
          for (const n of members2) { cx2 += n.x; cy2 += n.y; cz2 += n.z; }
          cx1 /= members1.length; cy1 /= members1.length; cz1 /= members1.length;
          cx2 /= members2.length; cy2 /= members2.length; cz2 /= members2.length;
          const dx = cx2 - cx1, dy = cy2 - cy1, dz = cz2 - cz1;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.01;
          if (dist < groupDist && dist > 0) {
            const push = (groupDist - dist) * pushFactor / dist;
            for (const n of members1) {
              n.x -= dx * push * 0.5; n.y -= dy * push * 0.5; n.z -= dz * push * 0.5;
            }
            for (const n of members2) {
              n.x += dx * push * 0.5; n.y += dy * push * 0.5; n.z += dz * push * 0.5;
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }

  _applyLayout() {
    if (this.cfg.graphMode === 'radial') this._radialLayout();
    else if (this.cfg.graphMode === 'flat') this._flatLayout();
    else this._clusterLayout();
    if (this.cfg.noOverlap) this._resolveOverlaps();
    if (this.cfg.preventGroupOverlap) this._resolveGroupOverlaps();
    if (this.T) this._mkGroupVisuals();
    this.alpha = 1.0; this.simSteps = 0; this.simActive = true;
  }

  // ─── Group Halo Visuals ────────────────────────────────────────────────────
  _mkGroupVisuals() {
    const T = this.T, scene = this.scene;
    if (!scene) return;
    for (const m of this.groupMeshes) scene.remove(m);
    this.groupMeshes = [];
    if (!this.cfg.showGroups || !this._groupData) return;

    const groups = this._groupData;
    const keys   = Array.from(groups.keys());

    keys.forEach((k, ki) => {
      const members = groups.get(k);

      // Centroid of the group
      let cx = 0, cy = 0, cz = 0;
      for (const n of members) { cx += n.x; cy += n.y; cz += n.z; }
      cx /= members.length; cy /= members.length; cz /= members.length;

      // Radius that encompasses all members with padding
      let maxR = 0;
      for (const n of members) {
        const d = Math.sqrt((n.x-cx)**2 + (n.y-cy)**2 + (n.z-cz)**2) + n.radius * 3;
        if (d > maxR) maxR = d;
      }
      const r = Math.max(maxR, 25);

      // Dominant module color in group (use most common module color)
      const modCounts = new Map();
      for (const n of members) {
        const m = n.moduleId || 'default';
        modCounts.set(m, (modCounts.get(m) || 0) + 1);
      }
      let dominantMod = 'default';
      let maxCount = 0;
      for (const [m, c] of modCounts) { if (c > maxCount) { maxCount = c; dominantMod = m; } }
      const groupColor = modColor(dominantMod);
      const groupColorHex = this.T ? new this.T.Color().setRGB(groupColor[0], groupColor[1], groupColor[2]) : new this.T.Color(0x888888);

      // ── 3D Mesh Group Option (if enabled) ───────────────────────────────────
      if (this.cfg.groupMeshStyle && this.cfg.groupMeshStyle !== 'none') {
        // Create bounding box hull for group
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of members) {
          if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
          if (n.z < minZ) minZ = n.z; if (n.z > maxZ) maxZ = n.z;
        }
        const w = maxX - minX + 30, h = maxY - minY + 30, d = maxZ - minZ + 30;
        const cx2 = (minX + maxX) / 2, cy2 = (minY + maxY) / 2, cz2 = (minZ + maxZ) / 2;

        if (this.cfg.groupMeshStyle === 'sphere') {
          const sphereGeo = new this.T.SphereGeometry(Math.max(r, 35), 24, 18);
          const sphereMat = new this.T.MeshBasicMaterial({ color: groupColorHex, transparent: true, opacity: 0.12, wireframe: false });
          const sphere = new this.T.Mesh(sphereGeo, sphereMat);
          sphere.position.set(cx2, cy2, cz2);
          scene.add(sphere);
          this.groupMeshes.push(sphere);
        } else if (this.cfg.groupMeshStyle === 'box') {
          const boxGeo = new this.T.BoxGeometry(w, h, d);
          const boxMat = new this.T.MeshBasicMaterial({ color: groupColorHex, transparent: true, opacity: 0.08 });
          const box = new this.T.Mesh(boxGeo, boxMat);
          box.position.set(cx2, cy2, cz2);
          scene.add(box);
          this.groupMeshes.push(box);
        } else if (this.cfg.groupMeshStyle === 'hull') {
          // Enclosing sphere (simpler than convex hull, no external dep needed)
          const hullR = r * 1.1;
          const hullGeo = new this.T.SphereGeometry(hullR, 16, 12);
          const hullMat = new this.T.MeshBasicMaterial({ color: groupColorHex, transparent: true, opacity: 0.08, wireframe: true });
          const hull = new this.T.Mesh(hullGeo, hullMat);
          hull.position.set(cx, cy, cz);
          scene.add(hull);
          this.groupMeshes.push(hull);
        }
        // Still add thin ring outline
        const torusGeo = new this.T.TorusGeometry(r, 0.3, 4, 48);
        const torusMat = new this.T.MeshBasicMaterial({ color: groupColorHex, transparent: true, opacity: 0.25 });
        const ring = new this.T.Mesh(torusGeo, torusMat);
        ring.position.set(cx, cy, cz);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
        this.groupMeshes.push(ring);
        return; // Skip 2D circle if using 3D mesh
      }

      // ── Outer ring (TorusGeometry = a flat donut outline) ──────────────
      const torusGeo = new T.TorusGeometry(r, 0.8, 6, 64);
      const torusMat = new T.MeshBasicMaterial({
        color: groupColor,
        transparent: true,
        opacity: 0.35,
      });
      const ring = new T.Mesh(torusGeo, torusMat);
      ring.position.set(cx, cy, cz);
      // Orient the ring to face the camera-up direction (XZ plane)
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      this.groupMeshes.push(ring);

      // ── Inner filled disc (very faint, just gives depth to the group) ──
      const discGeo = new T.CircleGeometry(r * 0.97, 48);
      const discMat = new T.MeshBasicMaterial({
        color: groupColor,
        transparent: true,
        opacity: 0.035,
        side: T.DoubleSide,
      });
      const disc = new T.Mesh(discGeo, discMat);
      disc.position.set(cx, cy, cz);
      disc.rotation.x = Math.PI / 2;
      scene.add(disc);
      this.groupMeshes.push(disc);

      // ── Dashed vertical line from disc to y=0 (anchors the group visually)
      const linePts = new Float32Array([cx, cy - r * 0.5, cz, cx, cy + r * 0.5, cz]);
      const lineGeo = new T.BufferGeometry();
      lineGeo.setAttribute('position', new T.BufferAttribute(linePts, 3));
      const lineMat = new T.LineBasicMaterial({ color: groupColor, transparent: true, opacity: 0.15 });
      const axis = new T.Line(lineGeo, lineMat);
      scene.add(axis);
      this.groupMeshes.push(axis);
    });
  }

  // ─── 3D Init ──────────────────────────────────────────────────────────────
  _init3D() {
    const T = this.T, el = this.container3d;
    if (!el) return;

    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0d1117, 1);
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(this.renderer.domElement);

    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x0d1117);

    this.camera = new T.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 1, 8000);
    this._camUpdate();

    this.scene.add(new T.AmbientLight(0xffffff, 0.9));
    const headlight = new T.PointLight(0xffffff, 1.2, 4000);
    this.camera.add(headlight);
    this.scene.add(this.camera);
    const dirTop = new T.DirectionalLight(0xffffff, 0.5);
    dirTop.position.set(400, 600, 400);
    this.scene.add(dirTop);

    this.raycaster = new T.Raycaster();
    this.dummy = new T.Object3D();
    this.colorObj = new T.Color();

    el.addEventListener('mousemove', this._mm);
    el.addEventListener('mousedown', this._md);
    el.addEventListener('mouseup', this._mu);
    el.addEventListener('wheel', this._mw, { passive: false });
  }

  _camUpdate() {
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

  // ─── Instanced Mesh ───────────────────────────────────────────────────────
  _mkInstanceMesh() {
    if (this.instanceMesh) { this.scene.remove(this.instanceMesh); this.instanceMesh.dispose(); }
    const T = this.T, n = this.nodes.length; if (!n) return;
    const geo = new T.SphereBufferGeometry(1, 14, 10);
    // NOTE: do NOT set vertexColors:true — InstancedMesh handles per-instance color separately in r128
    const mat = new T.MeshStandardMaterial({ roughness: 0.2, metalness: 0.4 });
    this.instanceMesh = new T.InstancedMesh(geo, mat, n);
    this.instanceMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      const nd = this.nodes[i];
      this.dummy.position.set(nd.x, nd.y, nd.z);
      this.dummy.scale.setScalar(nd.radius * this.cfg.nodeScale);
      this.dummy.updateMatrix();
      this.instanceMesh.setMatrixAt(i, this.dummy.matrix);
      this.colorObj.setRGB(...nd.color);
      this.instanceMesh.setColorAt(i, this.colorObj);
    }
    this.instanceMesh.instanceMatrix.needsUpdate = true;
    this.instanceMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.instanceMesh);
  }

  _updateInstances() {
    if (!this.instanceMesh) return;
    const hasHL = this.highlight.size > 0;
    const dim = this.cfg.dimStrength;
    const scale = this.cfg.nodeScale;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      const isSel = i === this.selectedIdx;
      const isHov = i === this.hoveredIdx;
      const inHL = hasHL && this.highlight.has(i);
      const isDim = hasHL && !inHL && !isSel;

      this.dummy.position.set(nd.x, nd.y, nd.z);
      this.dummy.scale.setScalar(nd.radius * scale * (isSel ? 2.4 : inHL ? 1.5 : isHov ? 1.3 : 1));
      this.dummy.updateMatrix();
      this.instanceMesh.setMatrixAt(i, this.dummy.matrix);

      if (isSel) {
        this.colorObj.setHex(0xffd700); // gold for selected
      } else if (isDim) {
        this.colorObj.setRGB(nd.color[0] * dim, nd.color[1] * dim, nd.color[2] * dim);
      } else {
        this.colorObj.setRGB(...nd.color);
      }
      this.instanceMesh.setColorAt(i, this.colorObj);
    }
    this.instanceMesh.instanceMatrix.needsUpdate = true;
    this.instanceMesh.instanceColor.needsUpdate = true;
  }

  // ─── Edge Lines ───────────────────────────────────────────────────────────
  _mkEdges() {
    if (this.edgeLines) { this.scene.remove(this.edgeLines); }
    const T = this.T; if (!this.edges.length) return;
    const pos  = new Float32Array(this.edges.length * 6);
    const cols = new Float32Array(this.edges.length * 6);
    this._fillEdgePositions(pos);
    this._fillEdgeColors(cols);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(cols, 3));
    const mat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: this.cfg.edgeOpacity });
    this.edgeLines = new T.LineSegments(geo, mat);
    this.edgeLines.visible = this.cfg.showEdges;
    this.scene.add(this.edgeLines);
  }

  _fillEdgePositions(arr) {
    for (let i = 0; i < this.edges.length; i++) {
      const s = this.nodes[this.edges[i].source], t = this.nodes[this.edges[i].target];
      arr[i*6]   = s.x; arr[i*6+1] = s.y; arr[i*6+2] = s.z;
      arr[i*6+3] = t.x; arr[i*6+4] = t.y; arr[i*6+5] = t.z;
    }
  }

  _fillEdgeColors(arr) {
    const hasHL = this.highlight.size > 0;
    const selIdx = this.selectedIdx;
    for (let i = 0; i < this.edges.length; i++) {
      const e = this.edges[i];
      let r, g, b;
      if (hasHL) {
        const srcHL = this.highlight.has(e.source) || e.source === selIdx;
        const tgtHL = this.highlight.has(e.target) || e.target === selIdx;
        const lit = srcHL && tgtHL;
        if (lit) { r = 1.0; g = 0.87; b = 0.3; }     // gold for connected edges
        else      { r = 0.15; g = 0.16; b = 0.2; }   // nearly invisible dim
      } else {
        // Use source node colour at low brightness
        const snd = this.nodes[e.source];
        r = snd.color[0] * 0.6; g = snd.color[1] * 0.6; b = snd.color[2] * 0.6;
      }
      arr[i*6]   = r; arr[i*6+1] = g; arr[i*6+2] = b;
      arr[i*6+3] = r; arr[i*6+4] = g; arr[i*6+5] = b;
    }
  }

  _updateEdges() {
    if (!this.edgeLines) return;
    const posAttr = this.edgeLines.geometry.attributes.position;
    this._fillEdgePositions(posAttr.array); posAttr.needsUpdate = true;
    const colAttr = this.edgeLines.geometry.attributes.color;
    this._fillEdgeColors(colAttr.array); colAttr.needsUpdate = true;
    this.edgeLines.material.opacity = this.cfg.edgeOpacity;
    this.edgeLines.material.needsUpdate = true;
  }

  // ─── Physics ──────────────────────────────────────────────────────────────
  _simStep() {
    if (!this.simActive || this.alpha < 0.004) { this.simActive = false; return; }
    const ns = this.nodes, es = this.edges, n = ns.length;
    const a = this.alpha;
    const REP = this.cfg.repulsion, MAX2 = 90000, DAMP = 0.85, GRAV = 0.004;
    const IDEAL = this.cfg.idealDist;
    const isFlat = this.cfg.graphMode === 'flat';
    const step = n > 4000 ? 6 : n > 2000 ? 4 : n > 1000 ? 2 : 1;

    for (let i = 0; i < n; i += step) {
      const ni = ns[i];
      for (let j = i + step; j < n; j += step) {
        const nj = ns[j];
        const dx = nj.x - ni.x || 0.01, dy = nj.y - ni.y || 0.01, dz = nj.z - ni.z || 0.01;
        const d2 = dx*dx + dy*dy + dz*dz; if (d2 > MAX2) continue;
        const d = Math.sqrt(d2) || 1;
        // Radius-aware: push apart if too close
        const minDist = (ni.radius + nj.radius) * 2.5;
        const f = d < minDist ? (REP * 3 / (d2 + 0.1)) * a * step : (REP / d2) * a * step;
        const fx = f*dx/d, fy = f*dy/d, fz = f*dz/d;
        ni.vx -= fx; ni.vy -= fy; ni.vz -= fz;
        nj.vx += fx; nj.vy += fy; nj.vz += fz;
      }
    }
    for (const e of es) {
      const s = ns[e.source], t = ns[e.target];
      const dx = t.x-s.x, dy = t.y-s.y, dz = t.z-s.z;
      const d = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
      const f = (d - IDEAL) * 0.03 * a;
      const fx = f*dx/d, fy = f*dy/d, fz = f*dz/d;
      s.vx += fx; s.vy += fy; s.vz += fz;
      t.vx -= fx; t.vy -= fy; t.vz -= fz;
    }
    // Intra-group attraction: pull nodes gently toward their group centroid
    if (this.cfg.graphMode === 'force3d' || this.cfg.graphMode === 'flat') {
      for (const nd of ns) {
        if (nd._groupCx !== undefined) {
          nd.vx += (nd._groupCx - nd.x) * 0.003 * a;
          nd.vy += (nd._groupCy - nd.y) * 0.003 * a;
          nd.vz += (nd._groupCz - nd.z) * 0.003 * a;
        }
      }
    }
    for (const nd of ns) {
      nd.vx += -nd.x * GRAV * a;
      nd.vy += -nd.y * GRAV * a;
      nd.vz += -nd.z * GRAV * a;
      nd.vx *= DAMP; nd.vy *= DAMP; nd.vz *= DAMP;
      nd.x += nd.vx; nd.y += nd.vy;
      if (!isFlat) nd.z += nd.vz;
    }
    this.alpha *= 0.985; this.simSteps++;
    if (this.simSteps >= this.SIM_MAX) {
      this.simActive = false;
      this._mkGroupVisuals(); // final halo placement
    }
  }

  // ─── Render Loop ─────────────────────────────────────────────────────────
  _loop() {
    let haloTick = 0;
    this._dragVel = { x: 0, y: 0 };
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      // Continuous group dragging
      if (this.isDraggingGroup && this.dragGroupIdx) {
        const dx = this._dragVel.x * 0.5, dy = this._dragVel.y * 0.5;
        const groupKey = this.dragGroupIdx;
        for (let i = 0; i < this.nodes.length; i++) {
          const n = this.nodes[i];
          if (n?.moduleId === groupKey) { n.x += dx; n.y -= dy; }
        }
        this._updateInstances();
        if (this.cfg.showGroups) this._mkGroupVisuals();
        this._dragVel = { x: 0, y: 0 };
      }
      if (this.simActive) {
        this._simStep();
        this._updateInstances();
        this._updateEdges();
        if (++haloTick % 40 === 0 && this.cfg.showGroups) this._mkGroupVisuals();
      }
      if (this.renderer) this.renderer.render(this.scene, this.camera);
      this._updateLabels();
    };
    tick();
  }

  _updateLabels() {
    if (!this.container3d || !this.camera) {
      if (this._labelContainer) this._labelContainer.style.display = 'none';
      return;
    }
    const show = this.cfg.showNodeNames;
    const dist = this.cfg.labelDist || 100;
    const fs = this.cfg.labelSize || 14;
    const camPos = this.camera.position;
    
    if (!show) {
      this._labelContainer.style.display = 'none';
      return;
    }
    this._labelContainer.style.display = 'block';
    let html = '';
    const limit = Math.min(this.nodes.length, 300);
    for (let i = 0; i < limit; i++) {
      const nd = this.nodes[i];
      const dx = nd.x - camPos.x, dy = nd.y - camPos.y, dz = nd.z - camPos.z;
      const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (d > dist) continue;
      const v = new THREE.Vector3(nd.x, nd.y, nd.z);
      v.project(this.camera);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * this.container3d.clientWidth;
      const y = (-v.y * 0.5 + 0.5) * this.container3d.clientHeight;
      html += `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${fs}px;color:#fff;text-shadow:0 0 3px #000;white-space:nowrap;transform:translate(-50%,-50%);pointer-events:none">${(nd.name||'').slice(0,20)}</div>`;
    }
    this._labelContainer.innerHTML = html;
  }

  _updateLegend() {
    if (!this._legendEl) return;
    if (!this.cfg.showModuleLegend) {
      this._legendEl.style.display = 'none';
      return;
    }
    this._legendEl.style.display = 'block';
    const colors = Object.entries(PALETTE).filter(([k]) => k !== 'default').slice(0, 15);
    this._legendEl.innerHTML = `<div style="position:absolute;top:10px;right:10px;background:#161b22cc;padding:10px;border-radius:8px;font-size:11px;color:#fff">
      <div style="font-weight:bold;margin-bottom:5px">Modules</div>
      ${colors.map(([k, v]) => `<div style="display:flex;align-items:center;gap:5px;margin:3px 0"><span style="width:8px;height:8px;border-radius:50%;background:${v}"></span>${k}</div>`).join('')}
    </div>`;
  }

  // ─── Selection Logic ──────────────────────────────────────────────────────
  _computeHighlight(idx) {
    if (idx < 0) return new Set();
    const mode = this.cfg.selectMode;
    const seen = new Set();

    if (mode === 'single') {
      // Just the node itself, no expansion
      return seen;
    }

    if (mode === 'callers' || mode === 'both') {
      // Callers = nodes that call this one (adjIn)
      const callers = this.adjIn.get(idx) || new Set();
      for (const c of callers) seen.add(c);
    }
    if (mode === 'callees' || mode === 'both') {
      // Callees = nodes this one calls (adjOut)
      const callees = this.adjOut.get(idx) || new Set();
      for (const c of callees) seen.add(c);
    }
    if (mode === 'component') {
      // BFS full connected component
      const q = [idx];
      seen.add(idx);
      while (q.length > 0) {
        const curr = q.shift();
        const outs = this.adjOut.get(curr) || new Set();
        const ins  = this.adjIn.get(curr)  || new Set();
        for (const nb of [...outs, ...ins]) {
          if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
        }
        if (seen.size > 2000) break;
      }
      seen.delete(idx); // idx is the selected node itself
    }
    return seen;
  }

  _select(idx) {
    if (idx === this.selectedIdx) {
      this.selectedIdx = -1; this.highlight = new Set();
      this._hideInfo();
    } else {
      this.selectedIdx = idx;
      this.highlight = this._computeHighlight(idx);
      if (idx >= 0) this._showInfo(idx);
      else this._hideInfo();
    }
    this._updateInstances();
    this._updateEdges();
  }

  // ─── Mouse ────────────────────────────────────────────────────────────────
  _ndc(e) {
    const r = this.container3d.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width)*2 - 1, y: -((e.clientY - r.top) / r.height)*2 + 1 };
  }

  _pick(ndcX, ndcY) {
    if (!this.instanceMesh) return -1;
    const T = this.T;
    this.raycaster.setFromCamera(new T.Vector2(ndcX, ndcY), this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    let best = Infinity, bestI = -1;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const ox = n.x-o.x, oy = n.y-o.y, oz = n.z-o.z;
      const tca = ox*d.x + oy*d.y + oz*d.z; if (tca < 0) continue;
      const d2 = ox*ox + oy*oy + oz*oz - tca*tca;
      const r = n.radius * this.cfg.nodeScale * 3.2; if (d2 > r*r) continue;
      const dist = tca - Math.sqrt(Math.max(0, r*r - d2));
      if (dist < best) { best = dist; bestI = i; }
    }
    return bestI;
  }

  _mm(e) {
    const { x, y } = this._ndc(e);
    if (this.isDragging) {
      const dx = (e.clientX - this.lastMouse.x)*0.005, dy = (e.clientY - this.lastMouse.y)*0.005;
      this.spherical.theta -= dx;
      this.spherical.phi += dy;
    if (this.spherical.phi < 0) this.spherical.phi += Math.PI * 2;
    if (this.spherical.phi > Math.PI * 2) this.spherical.phi -= Math.PI * 2;
      this._camUpdate();
    } else if (this.isPanning) {
      const T = this.T, spd = this.spherical.radius * 0.001;
      const camDir = new T.Vector3().subVectors(this.camera.position,
        new T.Vector3(this.target.x, this.target.y, this.target.z)).normalize();
      const up = new T.Vector3(0, 1, 0);
      const right = new T.Vector3().crossVectors(up, camDir).normalize();
      const upV   = new T.Vector3().crossVectors(camDir, right).normalize();
      const dx = (e.clientX - this.lastMouse.x)*spd, dy = (e.clientY - this.lastMouse.y)*spd;
      this.target.x += right.x*dx - upV.x*dy;
      this.target.y += right.y*dx - upV.y*dy;
      this.target.z += right.z*dx - upV.z*dy;
      this._camUpdate();
    } else if (this.isDraggingGroup && this.dragGroupIdx) {
      this._dragVel.x = e.clientX - this.lastMouse.x;
      this._dragVel.y = e.clientY - this.lastMouse.y;
    } else {
      const idx = this._pick(x, y);
      if (idx !== this.hoveredIdx) {
        this.hoveredIdx = idx;
        this._updateInstances();
        if (idx >= 0) this._showTip(idx, e.clientX, e.clientY);
        else this._hideTip();
      } else if (idx >= 0) this._moveTip(e.clientX, e.clientY);
    }
    this.lastMouse = { x: e.clientX, y: e.clientY };
  }

  _md(e) {
    this.lastMouse = { x: e.clientX, y: e.clientY };
    const n = this._ndc(e);
    const picked = this._pick(n.x, n.y);
    if (e.button === 2 || (e.button === 0 && e.altKey)) this.isPanning = true;
    else if (e.button === 0 && e.shiftKey && picked >= 0) {
      const groupKey = this._getGroupForNode(picked);
      if (groupKey) {
        this.isDraggingGroup = true;
        this.dragGroupIdx = groupKey;
        this.container3d.style.cursor = 'move';
        return;
      }
    }
    this.isDraggingGroup = false; this.dragGroupIdx = null;
    this.isDragging = true;
    this.container3d.style.cursor = 'grabbing';
  }

  _mu(e) {
    this._dragVel = { x: 0, y: 0 };
    const moved = Math.abs(e.clientX - this.lastMouse.x) + Math.abs(e.clientY - this.lastMouse.y);
    if (this.isDraggingGroup) {
      if (this.cfg.showGroups) this._mkGroupVisuals();
      this.isDraggingGroup = false;
      this.dragGroupIdx = null;
      this.container3d.style.cursor = 'grab';
      return;
    }
    this.isDragging = false; this.isPanning = false;
    this.container3d.style.cursor = 'grab';
    if (moved < 5 && e.button === 0) { const n = this._ndc(e); this._select(this._pick(n.x, n.y)); }
  }

  _getGroupForNode(idx) {
    if (idx < 0) return -1;
    const n = this.nodes[idx];
    if (!n) return -1;
    // Group by moduleId or 'default' for any node
    return n.moduleId || 'default';
  }

  _getGroupMembers(groupKey) {
    const members = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i]?.moduleId === groupKey) members.push(this.nodes[i]);
    }
    return members;
  }

  _mw(e) {
    e.preventDefault();
    this.spherical.radius *= (e.deltaY > 0 ? 1.1 : 0.91);
    if (this.spherical.radius < 5) this.spherical.radius = 5;
    this._camUpdate();
  }

  _onResize() {
    if (!this.renderer || !this.container3d) return;
    const w = this.container3d.clientWidth, h = this.container3d.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ─── Tooltip ─────────────────────────────────────────────────────────────
  _showTip(idx, sx, sy) {
    const n = this.nodes[idx];
    const calls   = (this.adjOut.get(idx) || new Set()).size;
    const callers = (this.adjIn.get(idx)  || new Set()).size;
    const icon = n.nodeType === 'class' ? '📦' : n.nodeType === 'method' ? '⚡' : '⚙️';
    const hex = PALETTE[Object.keys(PALETTE).find(k => n.moduleId.toLowerCase().includes(k))] || PALETTE.default;
    this.tooltip.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="width:8px;height:8px;border-radius:50%;background:${hex};flex-shrink:0"></span>
        <div style="font-weight:700;font-size:13px;color:#f0f6fc">${icon} ${n.name}</div>
      </div>
      <div style="font-size:10px;color:#8b949e;margin-bottom:5px">${n.moduleId}</div>
      ${n.purpose ? `<div style="font-size:11px;color:#c9d1d9;max-width:220px;white-space:normal;margin-bottom:5px">${n.purpose.slice(0, 80)}</div>` : ''}
      <div style="display:flex;gap:10px;font-size:11px">
        <span style="color:#58a6ff">→ ${calls} calls</span>
        <span style="color:#f78166">← ${callers} callers</span>
        ${n.isExported ? '<span style="color:#3fb950">✓ exported</span>' : ''}
      </div>`;
    this._moveTip(sx, sy);
    this.tooltip.style.display = 'block';
  }
  _moveTip(sx, sy) {
    const r = this.containerEl.getBoundingClientRect();
    this.tooltip.style.left = Math.min(sx - r.left + 16, r.width - 300) + 'px';
    this.tooltip.style.top  = Math.max(8, sy - r.top - 10) + 'px';
  }
  _hideTip() { this.tooltip.style.display = 'none'; }

  // ─── Info Panel ──────────────────────────────────────────────────────────
  _showInfo(idx) {
    const nd = this.nodes[idx];
    const outs    = [...(this.adjOut.get(idx) || [])];
    const ins     = [...(this.adjIn.get(idx) || [])];
    const icon    = nd.nodeType === 'class' ? '📦' : nd.nodeType === 'method' ? '⚡' : '⚙️';
    const label   = nd.nodeType === 'class' ? 'Class' : nd.nodeType === 'method' ? 'Method' : 'Function';
    const hex     = PALETTE[Object.keys(PALETTE).find(k => nd.moduleId.toLowerCase().includes(k))] || PALETTE.default;
    const paramsStr = nd.params.slice(0, 4).map(p => `${p.name}${p.optional?'?':''}: ${p.type}`).join(', ');
    const fmtList = (idxArr, max=6) => idxArr.slice(0, max).map(i => {
      const n2 = this.nodes[i];
      const h2 = PALETTE[Object.keys(PALETTE).find(k => n2.moduleId.toLowerCase().includes(k))] || PALETTE.default;
      return `<div style="padding:3px 5px;font-size:10px;color:#c9d1d9;cursor:pointer;border-radius:4px;display:flex;align-items:center;gap:5px"
        onmouseenter="this.style.background='#21262d'" onmouseleave="this.style.background=''"
        onclick="window._mikkSelect(${i})"
        ondblclick="window._mikkOpen(${i})">
        <span style="width:6px;height:6px;border-radius:50%;background:${h2};flex-shrink:0"></span>
        <span style="color:#f0f6fc;font-size:10px">${n2?.name||'?'}</span>
        <span style="color:#484f58;font-size:9px">${n2?.moduleId||''}</span>
      </div>`;
    }).join('') + (idxArr.length > max ? `<div style="color:#6e7681;font-size:10px;padding:2px 5px">…+${idxArr.length-max} more</div>` : '');

    // Expose _select and _open globally for inline onclick/dblclick
    window._mikkSelect = (i) => this._select(i);
    window._mikkOpen = (i) => { const n = this.nodes[i]; if (n) this._openFile(n.file, n.startLine); };

    this.infoPanel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="width:10px;height:10px;border-radius:50%;background:${hex};flex-shrink:0"></span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#f0f6fc">${icon} ${nd.name}</div>
            <div style="font-size:10px;color:${hex};margin-top:1px">${label} · ${nd.moduleId}</div>
          </div>
        </div>
        <button id="ik-close" style="background:none;border:none;color:#484f58;cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>
      </div>
      <div style="font-size:10px;color:#6e7681;margin-bottom:8px;word-break:break-all">${(nd.file||'').split('/').slice(-2).join('/')}</div>
      ${nd.purpose ? `<div style="background:#0d1117;padding:8px;border-radius:6px;font-size:11px;color:#c9d1d9;margin-bottom:10px;line-height:1.5;border:1px solid #21262d">${nd.purpose.slice(0,160)}</div>` : ''}
      ${paramsStr ? `<div style="margin-bottom:10px"><div style="font-size:9px;font-weight:600;color:#6e7681;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Parameters</div><div style="font-size:10px;font-family:monospace;color:#a5d6ff;background:#0d1117;padding:6px;border-radius:4px">(${paramsStr})</div></div>` : ''}
      ${nd.returnType ? `<div style="margin-bottom:10px"><span style="font-size:10px;color:#6e7681">Returns: </span><span style="font-size:10px;font-family:monospace;color:#79c0ff">${nd.returnType}</span></div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:#0d1117;padding:7px;border-radius:6px;text-align:center;border:1px solid #21262d">
          <div style="font-size:16px;font-weight:700;color:#58a6ff">${outs.length}</div>
          <div style="font-size:9px;color:#8b949e">calls</div>
        </div>
        <div style="background:#0d1117;padding:7px;border-radius:6px;text-align:center;border:1px solid #21262d">
          <div style="font-size:16px;font-weight:700;color:#f78166">${ins.length}</div>
          <div style="font-size:9px;color:#8b949e">callers</div>
        </div>
      </div>
      ${outs.length ? `<div style="margin-bottom:8px"><div style="font-size:9px;font-weight:600;color:#58a6ff;margin-bottom:4px;letter-spacing:.5px">→ CALLS</div>${fmtList(outs)}</div>` : ''}
      ${ins.length  ? `<div style="margin-bottom:10px"><div style="font-size:9px;font-weight:600;color:#f78166;margin-bottom:4px;letter-spacing:.5px">← CALLED BY</div>${fmtList(ins)}</div>` : ''}
      <div style="padding-top:8px;border-top:1px solid #21262d;display:flex;gap:6px">
        <button id="ik-open" onclick="window._mikkOpenCurrent()" style="flex:1;padding:5px;background:#238636;border:none;border-radius:5px;color:#fff;cursor:pointer;font-size:11px">📄 Open File</button>
      </div>
      <div style="padding-top:6px;display:flex;gap:6px">
        <button id="ik-focus" style="flex:1;padding:5px;background:#1f6feb18;border:1px solid #1f6feb44;border-radius:5px;color:#58a6ff;cursor:pointer;font-size:11px">🎯 Focus</button>
        <button id="ik-close2" style="flex:1;padding:5px;background:#0d1117;border:1px solid #30363d;border-radius:5px;color:#8b949e;cursor:pointer;font-size:11px">✕ Close</button>
      </div>
    `;
    this.infoPanel.style.display = 'block';
    
    // Store current node info for onclick handlers
    this._currentNodeFile = nd.file;
    this._currentNodeLine = nd.startLine;
    
    // Expose global handlers
    window._mikkOpenCurrent = () => {
      console.log('[Mikk] Open file:', this._currentNodeFile, 'line:', this._currentNodeLine);
      this._openFile(this._currentNodeFile, this._currentNodeLine);
    };
    window._mikkCloseInfo = () => this._select(-1);
    window._mikkFocusCurrent = () => this._focusNode(idx);
    
    this.infoPanel.querySelector('#ik-close').onclick  = () => this._select(-1);
    this.infoPanel.querySelector('#ik-close2').onclick = () => this._select(-1);
    this.infoPanel.querySelector('#ik-focus').onclick  = () => this._focusNode(idx);
  }
  _hideInfo() { this.infoPanel.style.display = 'none'; }

  _focusNode(idx) {
    const n = this.nodes[idx];
    this.target = { x: n.x, y: n.y, z: n.z };
    this.spherical.radius = 80; this._camUpdate();
  }

  _resetCamera() {
    this.target = { x: 0, y: 0, z: 0 };
    this.spherical = { theta: 0.5, phi: 1.1, radius: 500 };
    this._camUpdate();
  }

  // ─── Search with multiple modes ─────────────────────────────────────────────
  _search(q) {
    console.log('[Mikk] _search START, query:', q, 'nodes count:', this.nodes?.length);
    
    if (!q || q.trim() === '') {
      console.log('[Mikk] Empty search, showing all nodes');
      this.highlight = new Set();
      this.selectedIdx = -1;
      for (let i = 0; i < this.nodes.length; i++) this.highlight.add(i);
      if (this.countEl) this.countEl.textContent = `${this.nodes.length} nodes · ${this.edges.length} edges`;
      this._updateInstances();
      this._updateEdges();
      return;
    }

    q = q.trim().toLowerCase();
    console.log('[Mikk] After trim, query:', q);
    this.highlight = new Set(); this.selectedIdx = -1;
    if (!q) {
      if (this.countEl) this.countEl.textContent = `${this.nodes.length} nodes · ${this.edges.length} edges`;
      this._updateInstances();
      this._updateEdges();
      return;
    }

    const mode = this.cfg.searchMode || 'hybrid';
    const matches = [];

    // Get max nodes from lock if available
    let maxAvailable = this.nodes.length;
    if (this.lock && this.lock.fnIndex) maxAvailable = this.lock.fnIndex.length;
    else if (this.lock && this.lock.functions) maxAvailable = Object.keys(this.lock.functions).length;

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!n || !n.name) continue;
      // Prefer nodes with purpose for better results
      const hasInfo = n.purpose && n.purpose.length > 5;
      let score = 0;
      const nameL = (n.name || '').toLowerCase();
      const modL = (n.moduleId || '').toLowerCase();
      const fileL = (n.file || '').toLowerCase();

      // Boost nodes with purpose
      if (hasInfo) score += 5;

      if (mode === 'exact' || mode === 'hybrid') {
        if (nameL === q) score += 100;
        else if (nameL.startsWith(q)) score += 50;
        else if (nameL.includes(q)) score += 20;
      }

      if (mode === 'fuzzy' || mode === 'hybrid') {
        // Simple fuzzy: check if all chars in search appear in order
        let qi = 0;
        for (const c of q) {
          const idx = nameL.indexOf(c, qi);
          if (idx === -1) { score = 0; break; }
          qi = idx + 1;
        }
        if (score > 0) score += (mode === 'fuzzy' ? 15 : 5);
        // Also fuzzy match module and file
        if (modL.includes(q)) score += (mode === 'fuzzy' ? 10 : 3);
        if (fileL.includes(q)) score += (mode === 'fuzzy' ? 8 : 2);
      }

      if (mode === 'semantic') {
        // Semantic-like: match related terms and purpose
        if (nameL.includes(q) || modL.includes(q)) score += 25;
        if ((n.purpose || '').toLowerCase().includes(q)) score += 15;
        // Also check params and return type
        if (n.params) for (const p of n.params) {
          if ((p.name || '').toLowerCase().includes(q)) score += 8;
          if ((p.type || '').toLowerCase().includes(q)) score += 5;
        }
        if ((n.returnType || '').toLowerCase().includes(q)) score += 5;
      }

      if (mode === 'hybrid') {
        // Combine all signals
        if (nameL === q) score += 30;
        else if (nameL.startsWith(q)) score += 15;
        if (modL.includes(q)) score += 10;
        if (fileL.includes(q)) score += 5;
        if ((n.purpose || '').toLowerCase().includes(q)) score += 8;
      }

      if (score > 0) matches.push({ idx: i, score });
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    // Take top matches (cap at maxNodes or 500)
    const cap = Math.min(this.cfg.maxNodes, 500);
    for (let i = 0; i < Math.min(matches.length, cap); i++) {
      this.highlight.add(matches[i].idx);
    }

    if (this.countEl) {
      this.countEl.textContent = `${this.highlight.size} matches (of ${maxAvailable} total)`;
    }
    console.log('[Mikk] _search END. Found:', this.highlight.size, 'matches');
    
    // Show/hide suggestions dropdown
    if (!q || q.length === 0) {
      // Clear search - hide suggestions and show all nodes
      if (this.suggestionsPanel) this.suggestionsPanel.style.display = 'none';
    } else {
      // Has query - show suggestions
      const topMatches = matches.slice(0, 10);
      if (topMatches.length > 0 && this.suggestionsPanel) {
        this.suggestionsPanel.innerHTML = '';
        this.suggestionsPanel.style.display = 'block';
        this.suggestionsPanel.style.background = '#161b22';
        
        topMatches.forEach((m, idx) => {
          const n = this.nodes[m.idx];
          if (!n || !n.name) return;
          
          const row = document.createElement('div');
          row.style.cssText = 'padding:6px 10px;font-size:11px;color:#c9d1d9;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #21262d;';
          row.onmouseenter = () => row.style.background = '#21262d';
          row.onmouseleave = () => row.style.background = '';
          row.onclick = () => {
            this._select(m.idx);
            this.suggestionsPanel.style.display = 'none';
            this.searchInput.value = n.name;
            this.searchInput.blur();
          };
          
          // Color dot
          const dot = document.createElement('span');
          const nMod = (n.moduleId || '').toLowerCase();
          const modKey = Object.keys(PALETTE).find(k => nMod.includes(k)) || 'default';
          dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${PALETTE[modKey]}`;
          row.appendChild(dot);
          
          // Name
          const nameSpan = document.createElement('span');
          nameSpan.textContent = n.name;
          nameSpan.style.flex = '1';
          row.appendChild(nameSpan);
          
          // Module
          const modSpan = document.createElement('span');
          modSpan.textContent = n.moduleId || '';
          modSpan.style.color = '#6e7681';
          modSpan.style.fontSize = '9px';
          row.appendChild(modSpan);
          
          this.suggestionsPanel.appendChild(row);
        });
      } else if (this.suggestionsPanel) {
        this.suggestionsPanel.style.display = 'none';
      }
    }
    
    this._updateInstances();
    this._updateEdges();
  }

  // ─── Open file from info panel ─────────────────────────────────────────────────
  async _openFile(filePath, lineNum) {
    if (!filePath || !this.app) return;
    
    const fileName = filePath.split(/[\\/]/).pop();
    const files = this.app.vault.getFiles();
    const file = files.find(f => f.name === fileName);
    
    if (!file) {
      this._showToast('File not found: ' + fileName);
      return;
    }
    
    // Check extension - Obsidian can only open markdown natively
    const isMarkdown = fileName.toLowerCase().endsWith('.md');
    
    if (isMarkdown) {
      const leaf = this.app.workspace.getLeaf('tab', true);
      await leaf.openFile(file);
    } else {
      // Show message for non-markdown files
      const msg = `Can't open ${fileName} in Obsidian.\nOnly .md files can be displayed.\n\nClick OK to reveal in file explorer.`;
      if (confirm(msg)) {
        await this.app.fileManager.revealFileInFolder(file);
      }
    }
  }
  
  _showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#f85149;color:#fff;padding:10px 20px;border-radius:6px;z-index:9999;font-size:14px;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ─── Full Rebuild (when settings change) ─────────────────────────────────
  _rebuild() {
    this.selectedIdx = -1; this.highlight = new Set(); this.hoveredIdx = -1;
    this._hideTip(); this._hideInfo();
    this._buildGraph();
    this._mkInstanceMesh();
    this._mkEdges();
    this._applyLayout();
    if (this.countEl) this.countEl.textContent = `${this.nodes.length} nodes · ${this.edges.length} edges`;
  }

  // ─── Settings Panel ───────────────────────────────────────────────────────
  _buildSettingsPanel(root) {
    const mk = (tag, css, parent) => {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (parent) parent.appendChild(el);
      return el;
    };

    const panel = mk('div', `position:absolute;top:52px;left:10px;width:240px;display:none;
      background:#161b22;border:1px solid #30363d;border-radius:10px;
      padding:14px;font-size:12px;color:#c9d1d9;z-index:40;
      box-shadow:0 8px 32px rgba(0,0,0,0.9);max-height:calc(100% - 62px);overflow-y:auto;`, root);

    const section = (title) => {
      const s = mk('div', 'margin-bottom:12px;', panel);
      mk('div', 'font-size:10px;font-weight:600;color:#6e7681;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;', s).textContent = title;
      return s;
    };

    const addSlider = (parent, label, key, min, max, step, fmt) => {
      const row = mk('div', 'margin-bottom:8px;', parent);
      const labelRow = mk('div', 'display:flex;justify-content:space-between;margin-bottom:3px;', row);
      mk('span', 'font-size:11px;color:#c9d1d9;', labelRow).textContent = label;
      const val = mk('span', 'font-size:11px;color:#58a6ff;', labelRow);
      val.textContent = fmt ? fmt(this.cfg[key]) : this.cfg[key];
      const slider = mk('input', 'width:100%;accent-color:#58a6ff;cursor:pointer;', row);
      slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step;
      slider.value = this.cfg[key];
      slider.addEventListener('input', () => {
        const v = step < 1 ? parseFloat(slider.value) : parseInt(slider.value);
        this.cfg[key] = v;
        val.textContent = fmt ? fmt(v) : v;
        if (key === 'nodeScale')     { this._updateInstances(); }
        if (key === 'edgeOpacity')   { if (this.edgeLines) { this.edgeLines.material.opacity = v; this.edgeLines.material.needsUpdate = true; } }
        if (key === 'dimStrength')   { this._updateInstances(); }
        if (key === 'idealDist' || key === 'groupDist') { this._applyLayout(); }
      });
      return slider;
    };

    const addSelect = (parent, label, key, opts, onChange) => {
      const row = mk('div', 'margin-bottom:8px;', parent);
      mk('div', 'font-size:11px;color:#c9d1d9;margin-bottom:3px;', row).textContent = label;
      const sel = mk('select', `width:100%;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;
        border-radius:5px;padding:4px 6px;font-size:11px;cursor:pointer;`, row);
      for (const [v, lbl] of opts) {
        const o = document.createElement('option');
        o.value = v; o.textContent = lbl;
        if (this.cfg[key] === v) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => { this.cfg[key] = sel.value; if (onChange) onChange(sel.value); });
      return sel;
    };

    const addToggle = (parent, label, key, onChange) => {
      const row = mk('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;', parent);
      mk('span', 'font-size:11px;color:#c9d1d9;', row).textContent = label;
      const btn = mk('div', `width:36px;height:18px;border-radius:9px;cursor:pointer;position:relative;
        background:${this.cfg[key] ? '#1f6feb' : '#30363d'};transition:background .2s;flex-shrink:0;`, row);
      const knob = mk('div', `position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;
        top:2px;transition:left .2s;left:${this.cfg[key] ? '20px' : '2px'};`, btn);
      btn.onclick = () => {
        this.cfg[key] = !this.cfg[key];
        btn.style.background = this.cfg[key] ? '#1f6feb' : '#30363d';
        knob.style.left = this.cfg[key] ? '20px' : '2px';
        if (onChange) onChange(this.cfg[key]);
      };
    };

    // — Nodes section
    const nodesS = section('Nodes');
    // Get max available from lock
    let maxAvailable = 8000;
    if (this.lock && this.lock.fnIndex) maxAvailable = Math.min(16000, this.lock.fnIndex.length + 500);
    else if (this.lock && this.lock.functions) maxAvailable = Math.min(16000, Object.keys(this.lock.functions).length + 500);
    addSlider(nodesS, 'Max Nodes', 'maxNodes', 100, maxAvailable, 100, v => v.toLocaleString() + ` (max: ${maxAvailable.toLocaleString()})`);
    addSlider(nodesS, 'Node Size', 'nodeScale', 0.3, 3, 0.1, v => v.toFixed(1) + '×');
    addToggle(nodesS, 'Color by Module', 'colorByModule', () => {
      // recolor nodes
      for (const nd of this.nodes) {
        nd.color = this.cfg.colorByModule ? modColor(nd.moduleId) : [0.9, 0.9, 0.95];
      }
      this._updateInstances();
    });

    // — Layout section
    const layoutS = section('Layout');
    addSelect(layoutS, 'Graph Mode', 'graphMode', [
      ['force3d', '3D Force Directed'],
      ['radial',  'Radial / Ring'],
      ['flat',    '2D Force (Flat)'],
    ], () => this._applyLayout());
    addSelect(layoutS, 'Group Nodes By', 'groupBy', [
      ['moduleId',  '📦 Module ID'],
      ['fileDir',   '📁 File Directory'],
      ['nodeType',  '🔧 Node Type (fn/class)'],
      ['exported',  '✓ Exported vs Internal'],
    ], () => this._rebuild());
    addSelect(layoutS, 'Group Visualization', 'groupMeshStyle', [
      ['none',   '◯ 2D Circle (default)'],
      ['sphere', '⬡ 3D Sphere'],
      ['box',    '▢ 3D Box'],
      ['hull',  '⬡ Convex Hull (wraps nodes)'],
    ], () => { this._rebuild(); });
    addToggle(layoutS, 'Show Group Halos', 'showGroups', () => this._mkGroupVisuals());
    addToggle(layoutS, 'Prevent Node Overlap', 'noOverlap', () => this._applyLayout());
    addSlider(layoutS, 'Node Spacing', 'nodeSpacing', 5, 50, 5, v => v.toLocaleString());
    addToggle(layoutS, 'Prevent Group Overlap', 'preventGroupOverlap', () => this._applyLayout());
    addSlider(layoutS, 'Repulsion', 'repulsion', 200, 4000, 100);
    addSlider(layoutS, 'Ideal Distance', 'idealDist', 20, 400, 10);
    addSlider(layoutS, 'Group Distance', 'groupDist', 200, 800, 50, v => v.toLocaleString());

    // — Labels section
    const lblS = section('Labels');
    addToggle(lblS, 'Show Node Names', 'showNodeNames', () => this._updateLabels());
    addSlider(lblS, 'Label Distance', 'labelDist', 50, 400, 50, v => 'within ' + v);
    addSlider(lblS, 'Label Size', 'labelSize', 10, 32, 2, v => v + 'px');
    addToggle(lblS, 'Show Module Legend', 'showModuleLegend', () => this._updateLegend());
    
    // — Controls help
    const helpS = section('Controls');
    mk('div', 'font-size:10px;color:#8b949e;line-height:1.6;', helpS).innerHTML = `
      <div><b>Left drag</b> → Rotate</div>
      <div><b>Right drag</b> → Pan</div>
      <div><b>Shift + Left drag on group</b> → Move group</div>
      <div><b>Scroll</b> → Zoom</div>
      <div><b>Click</b> → Select node</div>`;

    // — Search section
    const searchS = section('Search');
    addSelect(searchS, 'Search Mode', 'searchMode', [
      ['exact',    '🔤 Exact match'],
      ['fuzzy',    '🔀 Fuzzy (character order)'],
      ['semantic', '🧠 Semantic (+ params, purpose)'],
      ['hybrid',   '🎯 Hybrid (combined)'],
    ]);
    // Show total available nodes from lock
    let totalAvail = 'N/A';
    if (this.lock && this.lock.fnIndex) totalAvail = this.lock.fnIndex.length.toLocaleString();
    else if (this.lock && this.lock.functions) totalAvail = Object.keys(this.lock.functions).length.toLocaleString();
    mk('div', 'font-size:10px;color:#6e7681;margin-bottom:8px;', searchS).textContent = `Total in lock: ${totalAvail} functions`;

    // — Selection section
    const selS = section('Selection Behaviour');
    addSelect(selS, 'When clicking a node:', 'selectMode', [
      ['callers',   '← Show Callers only'],
      ['callees',   '→ Show Callees only'],
      ['both',      '↔ Callers + Callees'],
      ['component', '⬡ Full Component (BFS)'],
      ['single',    '● Just the node'],
    ]);
    addSlider(selS, 'Dim Strength', 'dimStrength', 0, 0.5, 0.01, v => (v*100).toFixed(0) + '%');

    // — Edges section
    const edgeS = section('Edges');
    addSlider(edgeS, 'Edge Opacity', 'edgeOpacity', 0, 1, 0.05, v => (v*100).toFixed(0) + '%');
    addToggle(edgeS, 'Show Edges', 'showEdges', v => {
      if (this.edgeLines) this.edgeLines.visible = v;
    });

    // Apply button
    const applyBtn = mk('button', `width:100%;padding:7px;background:#1f6feb;border:none;border-radius:6px;
      color:#fff;cursor:pointer;font-size:12px;font-weight:600;margin-top:4px;`, panel);
    applyBtn.textContent = '↺ Apply & Rebuild';
    applyBtn.onclick = () => this._rebuild();

    const resetBtn = mk('button', `width:100%;padding:6px;background:transparent;border:1px solid #30363d;border-radius:6px;
      color:#8b949e;cursor:pointer;font-size:11px;margin-top:5px;`, panel);
    resetBtn.textContent = '⌖ Reset Camera';
    resetBtn.onclick = () => this._resetCamera();

    return panel;
  }

  // ─── Main UI ──────────────────────────────────────────────────────────────
  _buildUI(root) {
    const mk = (tag, css, parent) => {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (parent) parent.appendChild(el);
      return el;
    };
    const BTN = `background:#161b22;border:1px solid #30363d;color:#c9d1d9;
      border-radius:5px;cursor:pointer;font-size:11px;padding:4px 9px;
      transition:all 0.15s;white-space:nowrap;`;

    // ── Header ───────────────────────────────────────────────────────────
    const hdr = mk('div', `position:absolute;top:0;left:0;right:0;z-index:20;height:42px;
      background:#0d1117;border-bottom:1px solid #21262d;
      display:flex;align-items:center;gap:6px;padding:0 10px;`, root);

    // Logo
    const logo = mk('div', 'display:flex;align-items:center;gap:5px;flex-shrink:0;margin-right:4px;', hdr);
    logo.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2.5">
      <circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
      <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
      <line x1="6" y1="7" x2="10" y2="11"/><line x1="18" y1="7" x2="14" y2="11"/>
      <line x1="6" y1="17" x2="10" y2="13"/><line x1="18" y1="17" x2="14" y2="13"/>
    </svg><span style="font-weight:800;font-size:13px;color:#f0f6fc">Mikk</span>
    <span style="font-size:9px;color:#58a6ff;background:#1f6feb22;padding:1px 5px;border-radius:3px;border:1px solid #1f6feb44">3D</span>`;

    // Search
    this.searchInput = mk('input', `flex:1;max-width:180px;padding:5px 9px;border-radius:5px;
      border:1px solid #30363d;background:#161b22;color:#f0f6fc;font-size:11px;outline:none;`, hdr);
    this.searchInput.placeholder = '🔍 Search…';
    
    // Search mode dropdown next to search
    this.searchModeSelect = mk('select', `background:#161b22;border:1px solid #30363d;color:#c9d1d9;
      border-radius:5px;padding:4px 6px;font-size:10px;cursor:pointer;flex-shrink:0;`, hdr);
    const modes = [
      ['exact', '🔤 exact'],
      ['fuzzy', '🔀 fuzzy'], 
      ['semantic', '🧠 semantic'],
      ['hybrid', '🎯 hybrid']
    ];
    modes.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      this.searchModeSelect.appendChild(opt);
    });
    this.searchModeSelect.value = this.cfg.searchMode || 'hybrid';
    this.searchModeSelect.addEventListener('change', (e) => {
      this.cfg.searchMode = e.target.value;
      console.log('[Mikk] Search mode changed to:', this.cfg.searchMode);
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (this.suggestionsPanel && this.suggestionsPanel.style.display === 'block') {
        if (!this.suggestionsPanel.contains(e.target) && e.target !== this.searchInput) {
          this.suggestionsPanel.style.display = 'none';
        }
      }
    });
    
    // Suggestions dropdown
    this.suggestionsPanel = mk('div', `position:absolute;top:42px;left:10px;width:300px;max-height:200px;
      background:#161b22;border:1px solid #30363d;border-radius:6px;overflow-y:auto;display:none;z-index:50;`, hdr);
    this.suggestionsPanel.style.display = 'none';
    
    this.searchInput.addEventListener('input', (e) => {
      const q = e.target.value;
      console.log('[Mikk] Search input event:', q);
      this._search(q);
      // Also update count immediately
      if (this.countEl) {
        this.countEl.textContent = q ? 'Searching...' : `${this.nodes.length} nodes`;
      }
    });
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        console.log('[Mikk] Search Enter pressed');
        this._search(e.target.value);
      }
    });
    this.searchInput.addEventListener('focus', () => { this.searchInput.style.borderColor = '#58a6ff'; });
    this.searchInput.addEventListener('blur',  () => { this.searchInput.style.borderColor = '#30363d'; });

    // Count
    this.countEl = mk('span', `font-size:10px;color:#8b949e;white-space:nowrap;padding:3px 7px;
      background:#161b22;border:1px solid #30363d;border-radius:5px;flex-shrink:0;`, hdr);
    this.countEl.textContent = `${this.nodes.length} nodes · ${this.edges.length} edges`;

    // Buttons group
    const grp = mk('div', 'display:flex;gap:4px;flex-shrink:0;margin-left:auto;', hdr);
    const mkBtn = (lbl, tip, fn) => {
      const b = mk('button', BTN, grp);
      b.textContent = lbl; b.title = tip; b.onclick = fn;
      b.addEventListener('mouseenter', () => b.style.background = '#21262d');
      b.addEventListener('mouseleave', () => b.style.background = '#161b22');
      return b;
    };

    let settingsPanel = null;
    mkBtn('⚙ Settings', 'Customise graph', () => {
      if (!settingsPanel) settingsPanel = this._buildSettingsPanel(root);
      settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    });

    const eBtn = mkBtn('⬡ Edges', 'Toggle edges', () => {
      this.cfg.showEdges = !this.cfg.showEdges;
      if (this.edgeLines) this.edgeLines.visible = this.cfg.showEdges;
      eBtn.style.background  = this.cfg.showEdges ? '#1f6feb22' : '#161b22';
      eBtn.style.borderColor = this.cfg.showEdges ? '#1f6feb'   : '#30363d';
    });
    eBtn.style.background = '#1f6feb22'; eBtn.style.borderColor = '#1f6feb';

    mkBtn('⌖ Reset', 'Reset camera', () => this._resetCamera());
    mkBtn('⏯ Layout', 'Restart physics', () => { this.alpha = 1; this.simSteps = 0; this.simActive = true; });

    // ── 3D Canvas ────────────────────────────────────────────────────────
    this.container3d = mk('div', 'position:absolute;top:42px;left:0;right:0;bottom:0;cursor:grab;', root);

    // ── Tooltip ──────────────────────────────────────────────────────────
    this.tooltip = mk('div', `position:absolute;display:none;pointer-events:none;z-index:50;
      padding:10px 13px;border-radius:8px;max-width:280px;
      background:#161b22;color:#c9d1d9;
      border:1px solid #30363d;box-shadow:0 8px 24px rgba(0,0,0,0.9);
      font-size:12px;line-height:1.5;`, root);
    
    // ── Labels overlay ─────────────────────────────────────────────────
    this._labelContainer = mk('div', 'position:absolute;top:42px;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;', root);
    this._legendEl = mk('div', 'position:absolute;top:42px;right:0;pointer-events:none;', root);

    // ── Info Panel (right) ───────────────────────────────────────────────
    this.infoPanel = mk('div', `position:absolute;top:52px;right:10px;width:255px;display:none;
      background:#161b22;border:1px solid #30363d;border-radius:10px;
      padding:13px;font-size:12px;color:#c9d1d9;z-index:30;
      box-shadow:0 8px 32px rgba(0,0,0,0.9);max-height:calc(100% - 62px);overflow-y:auto;`, root);

    // ── Legend (bottom right) ────────────────────────────────────────────
    const leg = mk('div', `position:absolute;bottom:10px;right:10px;
      background:#161b22;border:1px solid #21262d;border-radius:7px;
      padding:7px 10px;font-size:10px;color:#6e7681;z-index:20;line-height:1.8;`, root);
    leg.innerHTML = `<div style="color:#8b949e;font-weight:600;font-size:10px;margin-bottom:2px">Controls</div>
      Drag — orbit &nbsp; Alt+Drag — pan<br>Scroll — zoom &nbsp; Click — select`;
  }
}

// ─── Plugin entry ─────────────────────────────────────────────────────────────
class MikkPlugin extends obsidian.Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new MikkGraphView(leaf));
    this.addCommand({
      id: 'open-mikk-graph-3d',
      name: 'Open Mikk 3D Graph',
      callback: async () => {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
      },
    });
    obsidian.addIcon('mg', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
      <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
      <line x1="6" y1="7" x2="10" y2="11"/><line x1="18" y1="7" x2="14" y2="11"/>
      <line x1="6" y1="17" x2="10" y2="13"/><line x1="18" y1="17" x2="14" y2="13"/>
    </svg>`);
    this.addRibbonIcon('mg', 'Mikk 3D Graph', async () => {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    });
  }
  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(l => l.detach());
  }
}

module.exports = MikkPlugin;