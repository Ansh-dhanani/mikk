import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const meshRoot = path.resolve(__dirname, '..');
const sandboxDir = path.join(meshRoot, 'cli-sandbox');
const mikkBin = path.join(meshRoot, 'packages', 'cli', 'bin', 'mikk.js');

const commandsToTest = [
    // Init & Lifecycle
    { name: 'init (default)', args: ['init'] },
    { name: 'init --force', args: ['init', '--force'] },
    { name: 'init --no-context', args: ['init', '--no-context'] },

    // Analyze
    { name: 'analyze (default)', args: ['analyze'] },
    { name: 'analyze --strict-parsing', args: ['analyze', '--strict-parsing'] },

    // Search (The Heavy Lifter)
    { name: 'search (basic)', args: ['search', 'test'] },
    { name: 'search --rich', args: ['search', 'test', '--rich'] },
    { name: 'search --minimal', args: ['search', 'test', '--minimal'] },
    { name: 'search --json', args: ['search', 'test', '--json'] },
    { name: 'search --top 5', args: ['search', 'test', '--top', '5'] },
    { name: 'search --exported', args: ['search', 'test', '--exported'] },
    { name: 'search --async', args: ['search', 'test', '--async'] },
    { name: 'search --mode semantic', args: ['search', 'test', '--mode', 'semantic'] },
    { name: 'search --mode exact', args: ['search', 'test', '--mode', 'exact'] },
    { name: 'search --body', args: ['search', 'test', '--body'] },
    { name: 'search --list-modules', args: ['search', '--list-modules'] },
    { name: 'search --list-files', args: ['search', '--list-files'] },

    // Stats
    { name: 'stats (text)', args: ['stats'] },
    { name: 'stats --format json', args: ['stats', '--format', 'json'] },

    // Doctor & CI
    { name: 'doctor', args: ['doctor'] },
    { name: 'ci', args: ['ci'] },

    // Context & Intelligence
    { name: 'context list', args: ['context', 'list'] },
    { name: 'context query', args: ['context', 'query', 'where is the test function?'] },
    { name: 'context impact', args: ['context', 'impact', 'test'] },
    { name: 'context for', args: ['context', 'for', 'add a new feature'] },
    { name: 'intent (default)', args: ['intent', 'refactor code'] },

    // Dead Code
    { name: 'dead-code (default)', args: ['dead-code'] },
    { name: 'dead-code --json', args: ['dead-code', '--json'] },

    // Contract
    { name: 'contract validate', args: ['contract', 'validate'] },
    { name: 'contract show-boundaries', args: ['contract', 'show-boundaries'] },

    // Embeddings
    { name: 'embeddings (default)', args: ['embeddings'] },
    { name: 'embeddings --force', args: ['embeddings', '--force'] },

    // Suggest
    { name: 'suggest', args: ['suggest'] },

    // Daemons
    { name: 'watch', args: ['watch'], isDaemon: true },
    { name: 'mcp', args: ['mcp'], isDaemon: true },

    // Cleanup (Final)
    { name: 'remove --force', args: ['remove', '--force'] },
];

async function setupSandbox() {
    console.log('Setting up secure cli-sandbox...');
    try {
        await fs.rm(sandboxDir, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(sandboxDir, { recursive: true });
    
    // Create a dummy file so analyze has something to work with
    await fs.writeFile(path.join(sandboxDir, 'index.ts'), 'export function test() { return 1; }\n');
    await fs.writeFile(path.join(sandboxDir, 'package.json'), JSON.stringify({ name: "sandbox", version: "1.0.0" }));
    
    // Initialize standard config manually to avoid interactive prompt blocks
    await fs.writeFile(path.join(sandboxDir, 'mikk.json'), JSON.stringify({
      version: "2.0.0",
      project: { name: "sandbox", language: "typescript", description: "testing" },
      declared: { modules: [], constraints: [], decisions: [] },
      overwrite: { mode: "explicit" }
    }));
}

async function runMikkCommand(commandConfig) {
    return new Promise((resolve) => {
        console.log(`\n========================================`);
        console.log(`Running: mikk ${commandConfig.args.join(' ')}`);
        
        const child = spawn('node', [mikkBin, ...commandConfig.args], {
            cwd: sandboxDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, MIKK_DISABLE_COLORS: '1' }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => stdout += d.toString());
        child.stderr.on('data', (d) => stderr += d.toString());

        let timeoutId;
        if (commandConfig.isDaemon) {
            timeoutId = setTimeout(() => {
                child.kill('SIGTERM');
            }, 3000);
        } else {
            // General timeout of 30 seconds for normal commands to prevent hangs
            timeoutId = setTimeout(() => {
                child.kill('SIGKILL');
                stderr += '\n[FUZZER ERROR]: Command timed out after 30 seconds!';
            }, 30000);
        }

        child.on('close', (code, signal) => {
            clearTimeout(timeoutId);
            
            // If it's a daemon and we killed it, code is null but signal is SIGTERM -> Treat as success
            const isDaemonSuccess = commandConfig.isDaemon && signal === 'SIGTERM';
            const crashed = !isDaemonSuccess && code !== 0 && code !== null;
            
            resolve({
                name: commandConfig.name,
                crashed,
                code,
                signal,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            });
        });
    });
}

async function main() {
    await setupSandbox();

    const results = [];
    
    for (const cmd of commandsToTest) {
        const result = await runMikkCommand(cmd);
        results.push(result);
        
        if (result.crashed) {
            console.log(`[FAILED] Exit code: ${result.code}`);
        } else {
            console.log(`[SUCCESS]`);
        }
    }
    
    console.log('\n================ SUMMARY ================');
    const crashedCount = results.filter(r => r.crashed).length;
    console.log(`Total Tested: ${results.length}`);
    console.log(`Crashes/Errors: ${crashedCount}`);
    
    const reportPath = path.join(meshRoot, 'cli_stability_report.json');
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`\nDetailed report written to: ${reportPath}`);

    // Cleanup
    await fs.rm(sandboxDir, { recursive: true, force: true });
}

main().catch(console.error);
