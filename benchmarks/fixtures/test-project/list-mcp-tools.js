const { spawn } = require('child_process');

const mcpProcess = spawn('npx', ['mikk', 'mcp'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

mcpProcess.stdout.on('data', (data) => {
  const responses = data.toString().split('\n').filter(Boolean);
  for (const res of responses) {
    try {
      const parsed = JSON.parse(res);
      console.log(JSON.stringify(parsed, null, 2));
      mcpProcess.kill();
    } catch (e) {
      // ignore
    }
  }
});

const req = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
};

mcpProcess.stdin.write(JSON.stringify(req) + '\n');
