const fs = require('fs');
const { spawn } = require('child_process');

const serverName = process.argv[2] || 'mikk';
const mode = process.argv[3] || 'call'; // list | call
const toolName = process.argv[4] || '';
const rawArgs = process.argv[5] || '{}';
const configPath = process.argv[6] || 'C:/Users/Ansh/AppData/Roaming/Code/User/mcp.json';

if (mode === 'call' && !toolName) {
  console.error('Usage: node call-configured-mcp-tool.js <serverName> call <toolName> [jsonArgs] [configPath]');
  process.exit(1);
}

let args = {};
try {
  args = JSON.parse(rawArgs);
} catch {
  console.error('Invalid JSON args:', rawArgs);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const server = cfg?.servers?.[serverName];
if (!server) {
  console.error(`Server "${serverName}" not found in ${configPath}`);
  process.exit(1);
}

const command = process.platform === 'win32' && server.command === 'npx' ? 'npx.cmd' : server.command;
const proc = spawn(command, server.args || [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
});

let buffer = '';
let initialized = false;
let requestId = 1;
let completed = false;

proc.stderr.on('data', (d) => {
  const s = d.toString();
  if (s.trim()) process.stderr.write(s);
});

function send(method, params) {
  const payload = { jsonrpc: '2.0', id: requestId++, method, params };
  proc.stdin.write(JSON.stringify(payload) + '\n');
  return payload.id;
}

proc.stdout.on('data', (d) => {
  buffer += d.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    if (!initialized && msg.id === 1 && msg.result) {
      initialized = true;
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      if (mode === 'list') {
        send('tools/list', {});
      } else {
        send('tools/call', { name: toolName, arguments: args });
      }
      continue;
    }

    if (!completed && mode === 'list' && msg.id === 2 && msg.result?.tools) {
      completed = true;
      console.log(JSON.stringify(msg.result.tools.map(t => t.name)));
      proc.kill();
      return;
    }

    if (!completed && mode === 'call' && msg.id === 2 && (msg.result || msg.error)) {
      completed = true;
      console.log(JSON.stringify(msg));
      proc.kill();
      return;
    }
  }
});

send('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'configured-mcp-caller', version: '1.0.0' },
});
