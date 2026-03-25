import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run via: node scripts/bundle-code.mjs <file1> <folder1> ...
// Example: node scripts/bundle-code.mjs packages/core/src packages/cli/src/index.ts

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const OUTPUT_FILE = path.join(PROJECT_ROOT, 'mikk-tasks-code.txt');

// Allowed extensions and excluded folders
const INCLUDE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.turbo', '.gemini']);

/** Recursively get all valid files from a directory or file path */
async function getFiles(targetPath) {
    let files = [];
    try {
        const stats = await fs.stat(targetPath);
        
        if (stats.isFile()) {
            if (INCLUDE_EXTS.has(path.extname(targetPath))) {
                files.push(targetPath);
            }
        } else if (stats.isDirectory()) {
            const items = await fs.readdir(targetPath, { withFileTypes: true });
            for (const item of items) {
                if (EXCLUDE_DIRS.has(item.name)) continue;

                const fullPath = path.join(targetPath, item.name);
                if (item.isDirectory()) {
                    files = files.concat(await getFiles(fullPath));
                } else if (item.isFile() && INCLUDE_EXTS.has(path.extname(item.name))) {
                    files.push(fullPath);
                }
            }
        }
    } catch (err) {
        console.warn(`WARNING: Could not access ${targetPath}: ${err.message}`);
    }
    return files;
}

async function main() {
    const args = process.argv.slice(2);
    
    // Default targets if none are provided
    let targets = args.length > 0 ? args : [
        'packages/core/src',
        'packages/cli/src',
        'packages/mcp-server/src'
    ];

    targets = targets.map(t => path.resolve(PROJECT_ROOT, t));

    console.log('Gathering files from:');
    targets.forEach(t => console.log(` - ${path.relative(PROJECT_ROOT, t)}`));

    const allFiles = new Set();
    for (const target of targets) {
        const found = await getFiles(target);
        found.forEach(f => allFiles.add(f));
    }

    const filesToProcess = Array.from(allFiles).sort();
    
    if (filesToProcess.length === 0) {
        console.log('No matching files found. Exiting.');
        return;
    }

    let outputContent = `# MIKK 2.0 CODE BUNDLE\n`;
    outputContent += `Generated at: ${new Date().toISOString()}\n\n`;

    for (const file of filesToProcess) {
        const relativePath = path.relative(PROJECT_ROOT, file);
        try {
            const content = await fs.readFile(file, 'utf-8');
            outputContent += `\n// ==========================================\n`;
            outputContent += `// File: ${relativePath}\n`;
            outputContent += `// ==========================================\n\n`;
            outputContent += content;
            outputContent += `\n`;
        } catch (err) {
            console.error(`Error reading ${relativePath}: ${err.message}`);
        }
    }

    await fs.writeFile(OUTPUT_FILE, outputContent, 'utf-8');
    
    console.log(`\nSUCCESS: Bundled ${filesToProcess.length} files into ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
