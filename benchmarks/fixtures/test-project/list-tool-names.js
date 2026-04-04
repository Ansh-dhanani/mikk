const { spawn } = require('child_process');

const mcpProcess = spawn('npx.cmd', ['mikk', 'mcp'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let _output = '';
mcpProcess.stdout.on('data', (data) => {
  _output += data.toString();
  try {
    const parsed = JSON.parse(_output);
    if(parsed.result && parsed.result.tools) {
      console.log(parsed.result.tools.map(t => t.name).join('\n'));
      mcpProcess.kill();
      process.exit(0);
    }
  } catch (e) {
    // wait for more data
  }
});

const req = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
};

mcpProcess.stdin.write(JSON.stringify(req) + '\n');
