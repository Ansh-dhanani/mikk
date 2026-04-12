import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SANDBOX_DIR = path.join(PROJECT_ROOT, 'audit-sandbox');
const MIKK_BIN = path.join(PROJECT_ROOT, 'packages/cli/bin/mikk.js');

const TARGETS = [
    { lang: 'python', repo: 'https://github.com/pallets/click' },
    { lang: 'go', repo: 'https://github.com/gin-gonic/gin' },
    { lang: 'rust', repo: 'https://github.com/rust-lang/libc' },
    { lang: 'csharp', repo: 'https://github.com/dotnet/command-line-api' },
];

async function run(cmd, args, cwd = PROJECT_ROOT) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { 
            cwd, 
            stdio: 'inherit',
            env: { ...process.env, MIKK_DEBUG: '1' }
        });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command ${cmd} ${args.join(' ')} failed with code ${code}`));
        });
    });
}

async function runCapture(cmd, args, cwd = PROJECT_ROOT) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { 
            cwd, 
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, MIKK_DEBUG: '1' }
        });
        let stdout = ''; let stderr = '';
        child.stdout.on('data', d => stdout += d);
        child.stderr.on('data', d => stderr += d);
        child.on('close', code => resolve({ code, stdout, stderr }));
    });
}

async function audit() {
    console.log(`\n🚀 Starting Small-Repo Multi-Language Audit (${TARGETS.length} targets)\n`);
    
    // Clean start
    await fs.rm(SANDBOX_DIR, { recursive: true, force: true });
    await fs.mkdir(SANDBOX_DIR, { recursive: true });
    
    const results = [];

    for (const target of TARGETS) {
        console.log(`\n--- [${target.lang.toUpperCase()}] Testing ${target.repo} ---`);
        const repoName = target.repo.split('/').pop();
        const repoPath = path.join(SANDBOX_DIR, repoName);
        
        try {
            // 1. Clone
            console.log(`  Cloning ${target.repo}...`);
            await run('git', ['clone', '--depth', '1', target.repo, repoPath]);

            // 2. Initialize
            console.log(`  Initializing Mikk...`);
            await runCapture('node', [MIKK_BIN, 'init'], repoPath);

            // 3. Analyze
            console.log(`  Analyzing with Mikk...`);
            const analyzeRes = await runCapture('node', [MIKK_BIN, 'analyze'], repoPath);
            
            if (analyzeRes.code !== 0) {
                console.error(`  ✖ Analysis failed for ${target.lang}`);
                results.push({ lang: target.lang, repo: target.repo, status: 'fail', error: analyzeRes.stderr.slice(0, 500) });
            } else {
                // 4. Extract stats using mikk stats --format json
                console.log(`  Fetching stats...`);
                const statsRes = await runCapture('node', [MIKK_BIN, 'stats', '--format', 'json'], repoPath);
                
                if (statsRes.code !== 0) {
                    console.error(`  ✖ Stats failed for ${target.lang}`);
                    results.push({ lang: target.lang, repo: target.repo, status: 'fail', error: statsRes.stderr.slice(0, 500) || 'Unknown stats error' });
                } else {
                    const stats = JSON.parse(statsRes.stdout);
                    // Adjust these property names based on the actual JSON structure of 'mikk stats'
                    const nodeCount = stats.totalNodes || stats.nodes || 0;
                    const functionCount = stats.functionCount || stats.functions || 0;
                    const diagnosticCount = stats.diagnostics?.length || 0;

                    console.log(`  ✅ Success: ${nodeCount} nodes, ${functionCount} functions.`);
                    results.push({ 
                        lang: target.lang, 
                        repo: target.repo,
                        status: 'pass', 
                        nodes: nodeCount, 
                        functions: functionCount, 
                        diagnostics: diagnosticCount 
                    });
                }
            }

        } catch (err) {
            console.error(`  ✖ Error during audit for ${target.lang}:`, err.message);
            results.push({ lang: target.lang, repo: target.repo, status: 'error', message: err.message });
        } finally {
            // Clean up repo to save space
            try {
                await fs.rm(repoPath, { recursive: true, force: true });
            } catch {}
        }
    }

    console.log('\n\n' + '='.repeat(50));
    console.log('FINAL AUDIT RESULTS');
    console.log('='.repeat(50));
    console.table(results.map(r => ({ lang: r.lang, status: r.status, nodes: r.nodes || 0 })));
    
    await fs.writeFile(path.join(PROJECT_ROOT, 'multi_lang_audit.json'), JSON.stringify(results, null, 2));
    console.log(`\nResults saved to multi_lang_audit.json`);
}

audit();
