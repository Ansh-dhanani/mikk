const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLI_PATH = path.resolve(__dirname, '../cli/bin/mikk.js');
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const INVALID_PROJECT_ROOT = path.resolve(__dirname, '../../tmp-invalid-project');

async function runMcpTest(name, params, method = 'tools/call', project = PROJECT_ROOT) {
    console.log(`\n[TEST] ${name}...`);
    
    const mcpProcess = spawn('node', [CLI_PATH, 'mcp', 'start', '--project', project], {
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let resolved = false;

        mcpProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            try {
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('{')) {
                        const resp = JSON.parse(line);
                        if (resp.id === 1) {
                            resolved = true;
                            mcpProcess.kill();
                            resolve({ success: true, data: resp });
                            return;
                        }
                    }
                }
            } catch (e) {}
        });

        mcpProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        mcpProcess.on('exit', (code) => {
            if (!resolved) {
                console.log(`[EXIT] Code: ${code}`);
                resolve({ success: false, code, stderr });
            }
        });

        const req = {
            jsonrpc: '2.0',
            id: 1,
            method,
            params: method === 'tools/call' ? { name, arguments: params } : params,
        };
        mcpProcess.stdin.write(JSON.stringify(req) + '\n');

        setTimeout(() => {
            if (!resolved) {
                mcpProcess.kill();
                resolve({ success: false, error: 'Timeout', stderr });
            }
        }, 10000);
    });
}

async function main() {
    const tests = [
        {
            name: 'mikk_get_function_detail',
            params: { name: 'non-existent-id' },
            desc: 'Invalid function ID'
        },
        {
            name: 'mikk_search_functions',
            params: { query: '' },
            desc: 'Empty search query'
        },
        {
            name: 'mikk_impact_analysis',
            params: { file: 'non-existent-file.ts' },
            desc: 'Impact analysis on missing file'
        },
        {
            name: 'mikk_before_edit',
            params: { files: ['src/app.tsx'] },
            desc: 'Valid before_edit schema on existing file'
        },
        {
            name: 'mikk_get_function_detail',
            params: { name: 'Path With Spaces.js' },
            desc: 'Function name with spaces'
        },
        {
            name: 'mikk_read_file',
            params: { file: 'dir with space/file.ts' },
            desc: 'File path with spaces'
        },
        {
            name: 'mikk_get_project_overview',
            params: {},
            project: PROJECT_ROOT,
            desc: 'Sanity check on valid project'
        }
    ];

    if (!fs.existsSync(INVALID_PROJECT_ROOT)) {
        fs.mkdirSync(INVALID_PROJECT_ROOT);
    }

    let passed = 0;
    for (const test of tests) {
        const result = await runMcpTest(test.name, test.params, 'tools/call', test.project || PROJECT_ROOT);
        console.log(`Result for ${test.desc}:`);
        if (result.success) {
            console.log('  SUCCESS (Got JSON response)');
            const content = result.data.result?.content || [];
            const text = content.map(c => c.text).join('\n');
            if (result.data.result?.isError) {
                console.log('  [ERROR RESPONSE] ' + text.split('\n')[0]);
            } else {
                console.log('  [VALID RESPONSE] ' + text.slice(0, 50) + '...');
            }
            passed++;
        } else {
            console.log('  FAILED to get JSON-RPC response');
            console.log('  Stderr:', result.stderr.split('\n').slice(-5).join('\n'));
        }
    }

    console.log(`\nTests finished: ${passed}/${tests.length} passed.`);
    
    // Cleanup
    if (fs.existsSync(INVALID_PROJECT_ROOT)) {
        fs.rmSync(INVALID_PROJECT_ROOT, { recursive: true });
    }
    
    process.exit(passed === tests.length ? 0 : 1);
}

main().catch(console.error);
