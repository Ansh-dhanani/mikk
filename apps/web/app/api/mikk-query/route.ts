import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface MikkQueryRequest {
  query: string;
  repoPath?: string;
  selectedNode?: {
    id: string;
    name: string;
    type: string;
    file?: string;
    moduleId?: string;
  };
  context?: {
    files?: string[];
    functions?: string[];
    maxHops?: number;
    tokenBudget?: number;
  };
}

async function callMikkTool(
  repoPath: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const argsStr = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `--${k} ${JSON.stringify(v)}`)
    .join(" ");

  const cmd = `mikk ${toolName} ${argsStr}`.trim();
  console.log(`[mikk-query] Running: ${cmd} in ${repoPath}`);

  try {
    const { stdout, stderr } = await execAsync(cmd, { 
      cwd: repoPath, 
      timeout: 60000 
    });
    if (stderr) console.log(`[mikk-query] stderr: ${stderr}`);
    return stdout;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`[mikk-query] Error: ${errorMessage}`);
    throw error;
  }
}

function buildNodeContext(node: MikkQueryRequest["selectedNode"]): string {
  if (!node) return "";
  
  let context = `## Selected Node\n`;
  context += `- **Name**: ${node.name}\n`;
  context += `- **Type**: ${node.type}\n`;
  if (node.file) context += `- **File**: ${node.file}\n`;
  if (node.moduleId) context += `- **Module**: ${node.moduleId}\n`;
  
  return context;
}

export async function POST(request: NextRequest) {
  try {
    const body: MikkQueryRequest = await request.json();
    const { query, repoPath, selectedNode } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (!repoPath) {
      // Without a repo path, return a helpful message
      return NextResponse.json({
        query,
        selectedNode,
        explanation: "To use Mikk's full capabilities, analyze a GitHub repository first.",
        wouldUse: [
          "mikk_query_context - to find relevant code",
          "mikk_get_function_detail - for function details",
          "mikk_impact_analysis - for blast radius",
        ],
        prompt: `You are helping analyze a codebase. ${buildNodeContext(selectedNode)}

## User Query
${query}

Please explain what Mikk would do to answer this query and what tools it would use.`,
      });
    }

    // Build context from Mikk tools
    let mikkContext = "";
    const toolsUsed: string[] = [];

    // Get session context (project overview)
    try {
      const sessionContext = await callMikkTool(repoPath, "context");
      mikkContext += `## Project Context\n\`\`\`\n${sessionContext}\n\`\`\`\n\n`;
      toolsUsed.push("mikk context");
    } catch {}

    // If a function is selected, get its details
    if (selectedNode?.type === "function" && selectedNode.name) {
      try {
        const fnDetail = await callMikkTool(repoPath, "fn-detail", { name: selectedNode.name });
        mikkContext += `## Function Details\n\`\`\`\n${fnDetail}\n\`\`\`\n\n`;
        toolsUsed.push("mikk fn-detail");
      } catch {}
    }

    // If a module is selected, get module details
    if (selectedNode?.type === "module" && selectedNode.moduleId) {
      try {
        const moduleDetail = await callMikkTool(repoPath, "module", { moduleId: selectedNode.moduleId });
        mikkContext += `## Module Details\n\`\`\`\n${moduleDetail}\n\`\`\`\n\n`;
        toolsUsed.push("mikk module");
      } catch {}
    }

    // Query context based on the user's question
    if (query.toLowerCase().includes("find") || query.toLowerCase().includes("search") || query.toLowerCase().includes("where")) {
      try {
        const searchResults = await callMikkTool(repoPath, "search", { query: query.replace(/find|search|where/gi, "").trim() });
        mikkContext += `## Search Results\n\`\`\`\n${searchResults}\n\`\`\`\n\n`;
        toolsUsed.push("mikk search");
      } catch {}
    }

    // Impact analysis for dependencies
    if (query.toLowerCase().includes("depend") || query.toLowerCase().includes("impact") || query.toLowerCase().includes("affect")) {
      if (selectedNode?.file) {
        try {
          const impact = await callMikkTool(repoPath, "impact", { file: selectedNode.file });
          mikkContext += `## Impact Analysis\n\`\`\`\n${impact}\n\`\`\`\n\n`;
          toolsUsed.push("mikk impact");
        } catch {}
      }
    }

    // Routes if asked
    if (query.toLowerCase().includes("route") || query.toLowerCase().includes("endpoint") || query.toLowerCase().includes("api")) {
      try {
        const routes = await callMikkTool(repoPath, "routes");
        mikkContext += `## Routes\n\`\`\`\n${routes}\n\`\`\`\n\n`;
        toolsUsed.push("mikk routes");
      } catch {}
    }

    // Dead code check
    if (query.toLowerCase().includes("dead") || query.toLowerCase().includes("unused")) {
      try {
        const deadCode = await callMikkTool(repoPath, "dead-code");
        mikkContext += `## Dead Code Analysis\n\`\`\`\n${deadCode}\n\`\`\`\n\n`;
        toolsUsed.push("mikk dead-code");
      } catch {}
    }

    // Constraints if asked
    if (query.toLowerCase().includes("constraint") || query.toLowerCase().includes("rule") || query.toLowerCase().includes("architecture")) {
      try {
        const constraints = await callMikkTool(repoPath, "constraints");
        mikkContext += `## Constraints\n\`\`\`\n${constraints}\n\`\`\`\n\n`;
        toolsUsed.push("mikk constraints");
      } catch {}
    }

    // Build the response
    const response = {
      query,
      selectedNode,
      toolsUsed,
      explanation: `Used ${toolsUsed.length > 0 ? toolsUsed.join(", ") : "Mikk's codebase intelligence"} to analyze your query.`,
      context: mikkContext,
      prompt: `${mikkContext}

${buildNodeContext(selectedNode)}

## User Query
${query}

Please provide a helpful answer based on the Mikk analysis above.`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Mikk query error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed. Make sure Mikk is installed and the repository has been analyzed." },
      { status: 500 }
    );
  }
}
