const { spawn } = require('child_process');

const toolName = process.argv[2];
const args = JSON.parse(process.argv[3]);

const mcpProcess = spawn('npx.cmd', ['mikk', 'mcp'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let output = '';
mcpProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.result && !parsed.result.tools) {
        console.log(JSON.stringify(parsed.result, null, 2));
        mcpProcess.kill();
        process.exit(0);
      }
    } catch (e) {
      // ignore
    }
  }
});

const req = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: toolName,
    arguments: args,
  },
};

mcpProcess.stdin.write(JSON.stringify(req) + '\n');
