# Mikk Obsidian Plugin

A visually clean and feature-rich Obsidian plugin for visualizing `mikk.lock.json` files with interactive graph exploration and detailed information panels.

## Features

### 🔒 Lock File Information
- **Complete lock file details**: Version, generation timestamp, generator version
- **Sync status monitoring**: Visual indicators for clean/dirty states
- **Parse diagnostics**: File parsing statistics and error counts
- **Graph statistics**: Node/edge counts and root hash information

### 📦 Module Statistics
- **Module breakdown**: Function and class counts per module
- **Visual hierarchy**: Color-coded modules with statistics
- **Export tracking**: Identify exported symbols at a glance
- **Interactive panels**: Toggleable information displays

### 🎨 Enhanced Visualization
- **Modern UI design**: Clean, professional interface with smooth transitions
- **Module backgrounds**: Subtle visual grouping by module
- **Smart rendering**: Adaptive detail based on zoom level
- **Export indicators**: Visual markers for exported functions

### 🔍 Advanced Search
- **Multi-word search**: Support for complex queries
- **Fuzzy matching**: Intelligent partial matching
- **Cross-field search**: Search names, files, and modules
- **Real-time highlighting**: Instant visual feedback

### 📊 Interactive Exploration
- **Detailed tooltips**: Rich information on hover
- **Comprehensive info panels**: In-depth function details
- **Call relationship visualization**: See callers and callees
- **Parameter and type information**: Full function signatures

### 🎯 Node Types
- **Functions** (⚙️): Circular nodes
- **Methods** (⚡): Diamond shapes
- **Classes** (📦): Rounded squares
- **Export indicators**: Green dots for exported symbols

## Installation

### Method 1: Manual Installation
1. Build the plugin: `npm run build`
2. Copy the following files to your Obsidian vault's plugin folder:
   - `main.js`
   - `manifest.json`
3. Reload Obsidian (Ctrl+R)
4. Enable "Mikk" in Settings → Community plugins

### Method 2: For Development
Link the built plugin to your Obsidian vault:
```
cp -r /path/to/mikk/packages/obsidian-plugin ~/.obsidian/plugins/mikk/
```

## Usage

1. **Generate Mikk data**: Run `mikk scan` in your project to create `mikk.lock.json`
2. **Place lock file**: Ensure `mikk.lock.json` is in your vault root
3. **Open graph**: Click the Mikk icon in the left ribbon or use the command palette

## Controls

### Navigation
- **Drag**: Pan the graph
- **Scroll**: Zoom in/out
- **Click node**: Select and view details
- **Double-click**: Deselect

### Search
- **Search bar**: Find functions, modules, or files
- **Multi-word**: Use spaces for AND search
- **Real-time**: Results highlight instantly

### Panels
- **🔒 Lock Info**: Toggle lock file details
- **📦 Module Stats**: Toggle module statistics
- **⟳ Reset View**: Reset zoom and position

## Data Structure

The plugin reads `mikk.lock.json` files with the following structure:

```json
{
  "version": "2.0.0",
  "generatedAt": "2026-04-07T15:05:19.462Z",
  "generatorVersion": "@getmikk/cli@1.2.1",
  "projectRoot": "/path/to/project",
  "syncState": {
    "status": "clean",
    "lastSyncAt": "2026-04-07T15:05:19.462Z",
    "lockHash": "...",
    "contractHash": "...",
    "generationId": "...",
    "writeVersion": 7,
    "parseDiagnostics": {
      "requestedFiles": 27,
      "parsedFiles": 27,
      "fallbackFiles": 0,
      "diagnostics": 0
    }
  },
  "graph": {
    "nodes": 200,
    "edges": 230,
    "rootHash": "..."
  },
  "fnIndex": ["fn:path/to/file:functionName", ...],
  "functions": {
    "0": {
      "id": "functionName",
      "name": "functionName",
      "file": "path/to/file",
      "moduleId": "module-name",
      "calls": [1, 2, 3],
      "calledBy": [4, 5],
      "isExported": true,
      "purpose": "Function description",
      "params": [
        {"name": "param1", "type": "string", "optional": false}
      ],
      "returnType": "boolean"
    }
  },
  "classes": {
    "0": {
      "name": "ClassName",
      "file": "path/to/file",
      "moduleId": "module-name",
      "isExported": true
    }
  }
}
```

## Customization

### Module Colors
The plugin uses a predefined color palette for modules. You can modify the `MODULE_COLORS` object in the source code to customize colors.

### UI Styling
The plugin uses Obsidian's CSS variables for theming. It automatically adapts to your current theme.

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode
npm run dev
```

## Requirements

- Obsidian 0.15.0 or higher
- A `mikk.lock.json` file in your vault root

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and feature requests, please use the GitHub issue tracker.