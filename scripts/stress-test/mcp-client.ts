import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TOOL_MAPPING: Record<string, string> = {
  "index_project": "mikk_index_project",
  "scan_secrets": "mikk_secrets_scan",
  "analyze_file": "mikk_read_file",
  "rename_symbol": "mikk_rename",
  "get_project_overview": "mikk_get_session_context",
  "get_call_graph": "mikk_get_call_graph",
  "semantic_search": "mikk_semantic_search",
  "taint_analysis": "mikk_taint_analysis",
  "impact_analysis": "mikk_impact_analysis",
  "search_functions": "mikk_search_functions",
  "mikk_before_edit": "mikk_before_edit",
};

const ARG_MAPPING: Record<string, Record<string, string>> = {
  "mikk_read_file": { "filePath": "file" },
  // T39 fix: map both entryPoint and startFunction to target for get_call_graph
  "mikk_get_call_graph": { "entryPoint": "target", "startFunction": "target" },
  "mikk_impact_analysis": { "changedFile": "file" },
  "mikk_analyze_file": { "filePath": "file" },
  "mikk_secrets_scan": { "path": "path" },
  "mikk_rename": { "symbolName": "functionName", "oldName": "functionName" },
};

let currentRoot: string | null = null;
let client: Client | null = null;
let transport: StdioClientTransport | null = null;
let callChain: Promise<void> = Promise.resolve();

import * as path from "path";
import * as fs from "fs";

async function ensureClient(projectRoot: string) {
  let actualRoot = projectRoot;
  try {
    if (fs.statSync(projectRoot).isFile()) {
      actualRoot = path.dirname(projectRoot);
    }
  } catch {
    // If it doesn't exist yet, assume it's a directory
  }

  if (client && currentRoot === actualRoot) return;

  if (transport) {
    try {
      await transport.close();
    } catch (e) {
      // ignore
    }
    client = null;
    transport = null;
  }

  currentRoot = actualRoot;
  const serverBin = path.resolve(__dirname, "../../packages/mcp-server/bin/mikk-mcp.js");
  transport = new StdioClientTransport({
    command: "node",
    args: [serverBin],
    env: { ...process.env, MIKK_PROJECT_ROOT: actualRoot },
  });

  // T25 fix: unref the child process so it doesn't keep Node.js alive after close
  const childProcess = (transport as any)._process;
  if (childProcess && typeof childProcess.unref === "function") {
    childProcess.unref();
  }

  client = new Client(
    { name: "stress-tester", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  // T25 fix: unref after connect since spawn happens during connect
  const proc = (transport as any)._process;
  if (proc && typeof proc.unref === "function") {
    proc.unref();
  }
}

export async function closeClient(): Promise<void> {
  if (transport) {
    try {
      await transport.close();
    } catch {
      // ignore
    }
    transport = null;
    client = null;
    currentRoot = null;
  }
}

export async function callTool(toolName: string, args: Record<string, any>): Promise<any> {
  const run = async () => {
    const root = args.projectRoot || args.filePath || process.cwd();
    await ensureClient(root);

    let mcpToolName = TOOL_MAPPING[toolName] || toolName;
    if (!mcpToolName.startsWith("mikk_")) {
      mcpToolName = `mikk_${mcpToolName}`;
    }

    // Apply argument mapping — startFunction takes priority over entryPoint for get_call_graph
    const mappedArgs: Record<string, any> = { ...args };
    if (mcpToolName === "mikk_get_call_graph" && "startFunction" in mappedArgs) {
      mappedArgs.target = mappedArgs.startFunction;
      delete mappedArgs.startFunction;
      if ("entryPoint" in mappedArgs) delete mappedArgs.entryPoint;
    } else {
      const argMap = ARG_MAPPING[mcpToolName];
      if (argMap) {
        for (const [oldName, newName] of Object.entries(argMap)) {
          if (oldName in mappedArgs) {
            mappedArgs[newName] = mappedArgs[oldName];
            delete mappedArgs[oldName];
          }
        }
      }
    }

    // Special case: limit -> topK for semantic search
    if (mcpToolName === "mikk_semantic_search" && "limit" in mappedArgs) {
      mappedArgs.topK = mappedArgs.limit;
      delete mappedArgs.limit;
    }

    try {
      const result = await client!.callTool({ name: mcpToolName, arguments: mappedArgs });
      if (result.isError) {
        throw new Error((result.content as any)[0]?.text ?? "Tool error");
      }

      const text = (result.content as any)[0]?.text;
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e: any) {
      if (e.message?.includes("Method not found")) {
        throw new Error(`MCP error: Tool "${mcpToolName}" not found on server.`);
      }
      throw e;
    }
  };

  // Serialize tool invocations so project-root switches cannot disconnect an in-flight call.
  const wrapped = callChain.then(run, run);
  callChain = wrapped.then(() => undefined, () => undefined);
  return wrapped;
}
