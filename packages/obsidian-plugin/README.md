# Mikk Obsidian Plugin

Visualize your codebase architecture inside Obsidian — interactive **3D graph** powered by Three.js, plus a full Markdown vault with one note per file, function, class, type, route, and variable.

> Part of [Mikk](../../README.md) — live architectural context for your AI agent.

---

## Features

### 3D Graph View
- **Module nodes** — one sphere per module; click to expand/collapse files + functions
- **File nodes** — visible when a module is expanded (LOD level 1)
- **Function nodes** — visible on module expand; exported functions are larger and brighter
- **Class nodes** — rendered alongside functions inside expanded modules
- **Generic / type nodes** — rendered as smaller pale-blue spheres (added in v1.3.0)
- **Color-coded modules** — each module has a unique color from a fixed 20-color palette
- **Module halos** — wireframe rings group each module's children visually
- **Inter-module edges** — lighter grey; intra-module edges use module color
- **Truncation badge** — when a module has >120 functions, badge shows `120/690f ⚠` instead of silently clipping

### Interaction
- **Left drag** → orbit (spherical camera)
- **Right drag / Alt+drag** → pan
- **Scroll** → zoom (80–8000 units)
- **Click module** → expand / collapse (LOD toggle)
- **Click function/class/type** → select + highlight neighborhood + open info panel
- **Hover** → tooltip with name, purpose, file, caller count

### UI Controls
| Control | Description |
|---|---|
| LOD selector | **📦 Modules** / **📄 +Files** / **ƒ +Functions** — expand all at once |
| Search box | Real-time substring match on name, moduleId, purpose, file path |
| ⬡ Edges | Toggle edge visibility |
| ↺ Reset | Reset camera to default orbit |
| ⟳ Reload | Re-read `mikk.lock.json` from disk |
| ⚙ Settings | Sliders for node size, edge opacity, label size, dim strength; toggles for edges/halos/labels; physics restart |

### Stats Counter
```
45 vis · 12 edges · 1561 fns · 11 mods · 87 types
```

---

## Obsidian Vault (via `mikk watch --obsidian`)

Running `mikk watch --obsidian` continuously regenerates a full Obsidian vault in `mikk-vault/` on every graph update. The vault contains:

| Folder | Content |
|---|---|
| `file/` | One note per source file — package, path, exported functions, calls, calledBy |
| `fn/` | One note per exported function — signature, params, returnType, purpose, calls |
| `class/` | One note per class — file, package, purpose, **methods list** |
| `type/` | One note per generic/type/enum — kind, file, package |
| `route/` | One note per HTTP route — method, path, handler, file:line |
| `var/` | One note per exported variable |
| `prop/` | One note per class property |
| `ctxfile/` | One note per config/env/schema file |
| `module-*.md` | Module index — files, functions, classes, types counts and links |
| `index.md` | Project index — all packages table with file/fn counts |
| `.obsidian/graph.json` | Pre-configured Obsidian graph view with color groups per package |

Open the vault: **Obsidian → Open folder as vault → select `mikk-vault/`** → `Ctrl+G` for Graph view.

---

## Installation

### Manual (recommended)
1. Build: `npm run build` (or `node esbuild.mjs`)
2. Copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/mikk-v2/` folder
3. Reload Obsidian (`Ctrl+R`)
4. Enable **"Mikk"** in Settings → Community Plugins

### Development
```bash
npm install
node esbuild.mjs
```

---

## Usage

### Live sync with `mikk watch --obsidian`
```bash
# Terminal 1 — keep the lock file and vault in sync
mikk watch --obsidian

# The vault at mikk-vault/ is regenerated on every save
# The plugin reloads automatically when mikk.lock.json changes
```

### Manual workflow
```bash
mikk analyze                       # update mikk.lock.json
node scripts/mikk-to-obsidian.mjs  # regenerate the vault
```

### Plugin settings
- **Lock file path** — path inside vault to `mikk.lock.json` (default: vault root)
- **Auto-detect lock file** — search vault for `mikk.lock.json` if not found at configured path

---

## Lock File Format

The plugin reads `mikk.lock.json` produced by `@getmikk/cli`:

```json
{
  "version": "2.0.0",
  "generatedAt": "2026-04-25T08:30:00.000Z",
  "syncState": { "status": "clean", "parseDiagnostics": { "parsedFiles": 127 } },
  "graph": { "nodes": 3201, "edges": 9442, "rootHash": "sha256:..." },
  "fnIndex": ["fn:path/to/file:functionName"],
  "functions": {
    "0": {
      "name": "functionName",
      "file": "path/to/file",
      "moduleId": "module-name",
      "calls": [1, 2],
      "calledBy": [3],
      "isExported": true,
      "params": [{ "name": "param1", "type": "string", "optional": false }],
      "returnType": "boolean"
    }
  },
  "classes": { "class:path:ClassName": { "name": "ClassName", "isExported": true } },
  "generics": { "type:path:TypeName": { "name": "TypeName", "type": "interface" } },
  "modules": { "module-id": { "name": "Module Name" } }
}
```

---

## Requirements

- Obsidian 0.15.0 or higher
- A `mikk.lock.json` file (generated by `mikk init` or `mikk analyze`)
- Three.js is loaded via CDN (r128) — requires internet on first open; thereafter cached by Obsidian

---

## Known Limitations

| Issue | Detail |
|---|---|
| **Function cap** | Maximum 120 function nodes per module in the 3D view (performance limit). Badge shows actual count when clipped. |
| **Three.js version** | Uses r128 (2021) via CDN. Offline vaults will fail to load the 3D view if the CDN is unavailable. |
| **Route notes** | Route paths in vault notes may be malformed if Next.js file-system routes are used (inherits CLI parser limitation). |
| **No Command Palette search** | Fuzzy jump-to-node via Command Palette not yet implemented. Use the search bar in the graph header. |

---

## License

[Apache-2.0](../../LICENSE)
