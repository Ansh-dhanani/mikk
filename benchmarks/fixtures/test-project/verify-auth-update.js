const { spawn } = require('child_process');

async function runTool(toolName, args) {
  const mcpProcess = spawn('node', ['c:/Users/Ansh/Desktop/web/Mesh/packages/cli/bin/mikk.js', 'mcp'], {
    cwd: 'c:/Users/Ansh/Desktop/web/test-project',
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  return new Promise((resolve, reject) => {
    let outputData = '';
    mcpProcess.stdout.on('data', (data) => {
      outputData += data.toString();
      const lines = outputData.split('\n');
      outputData = lines.pop(); // keep partial line
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.result && !parsed.result.tools) {
            resolve(parsed.result);
            mcpProcess.kill();
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
  });
}

runTool('mikk_before_edit', {
  files: ['nextjs-project/apps/web/src/store/slices/auth/auth.slice.ts']
}).then(res => {
  console.log('RESULT:' + JSON.stringify(res, null, 2));
}).catch(err => {
  console.error(err);
});
