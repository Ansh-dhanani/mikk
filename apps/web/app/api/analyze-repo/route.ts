import { NextRequest, NextResponse } from "next/server";

interface GraphNode {
  id: string;
  name: string;
  type: "module" | "file" | "function";
  moduleId: string;
  file?: string;
  size: number;
  color: string;
  depth: number;
  purpose?: string;
  params?: string[];
  isExported?: boolean;
  isAsync?: boolean;
  calls?: string[];
  startLine?: number;
  endLine?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "imports" | "calls" | "contains";
}

interface RepoAnalysis {
  name: string;
  description: string;
  owner: string;
  defaultBranch: string;
  language: string;
  stars: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    modules: number;
    files: number;
    functions: number;
    imports: number;
    linesOfCode: number;
  };
}

const MODULE_COLORS: Record<string, string> = {};
const MODULE_COLOR_PALETTE = [
  "#00ff88", "#00d4ff", "#ff6b6b", "#ffd93d",
  "#6bcb77", "#4d96ff", "#ff85a2", "#a66cff",
];

function getModuleColor(module: string): string {
  if (!MODULE_COLORS[module]) {
    const index = Object.keys(MODULE_COLORS).length % MODULE_COLOR_PALETTE.length;
    MODULE_COLORS[module] = MODULE_COLOR_PALETTE[index];
  }
  return MODULE_COLORS[module];
}

function parseFileForFunctions(content: string): { functions: string[], imports: string[], lineCount: number } {
  const lines = content.split("\n");
  const functions: string[] = [];
  const imports: string[] = [];
  let inMultilineComment = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
    
    // Handle multiline comments
    if (trimmed.includes("/*")) inMultilineComment = true;
    if (inMultilineComment) {
      if (trimmed.includes("*/")) inMultilineComment = false;
      continue;
    }
    
    // ES6 imports
    const importMatch = trimmed.match(/^import\s+.*?from\s+['"](.+)['"]/);
    if (importMatch) imports.push(importMatch[1]);
    
    // CommonJS require
    const requireMatch = trimmed.match(/^const\s+\w+\s*=\s*require\s*\(\s*['"](.+)['"]/);
    if (requireMatch) imports.push(requireMatch[1]);
    
    // ES6 export function
    const es6FnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (es6FnMatch) {
      functions.push(es6FnMatch[1]);
      continue;
    }
    
    // Regular function
    const fnMatch = trimmed.match(/^(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) {
      functions.push(fnMatch[1]);
      continue;
    }
    
    // Arrow function: const foo = () =>
    const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\s*\(/);
    if (arrowMatch && (trimmed.includes("=>") || lines[i + 1]?.includes("=>"))) {
      functions.push(arrowMatch[1]);
      continue;
    }
    
    // CommonJS method: app.use = function( or exports.foo = function(
    const methodMatch = trimmed.match(/^(\w+)\.(\w+)\s*=\s*(?:async\s+)?function/);
    if (methodMatch) {
      functions.push(`${methodMatch[1]}.${methodMatch[2]}`);
      continue;
    }
    
    // module.exports = function or module.exports.foo = function
    const moduleExportsMatch = trimmed.match(/^module\.exports\.?(\w*)\s*=\s*(?:async\s+)?function/);
    if (moduleExportsMatch && moduleExportsMatch[1]) {
      functions.push(moduleExportsMatch[1]);
      continue;
    }
  }
  
  return { functions, imports, lineCount: lines.length };
}

async function analyzeRepoFromGitHub(owner: string, repo: string): Promise<RepoAnalysis> {
  // Get repo info
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { 
      Accept: "application/vnd.github.v3+json", 
      "User-Agent": "Mikk-Playground"
    },
  });

  if (!repoRes.ok) {
    throw new Error(`Repository not found: ${owner}/${repo}`);
  }

  const repoData = await repoRes.json();
  const branch = repoData.default_branch || "main";

  // Get file tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "Mikk-Playground" } }
  );

  if (!treeRes.ok) {
    throw new Error(`Failed to fetch repository tree`);
  }

  const treeData = await treeRes.json();
  const files = treeData.tree as { path: string; type: string; sha: string }[];

  // Filter source files - be more restrictive
  const sourceExts = [".ts", ".tsx", ".js", ".jsx"];
  const excludePatterns = ["node_modules", ".git", "dist", "build", "test", "spec", "example", "__tests__", ".min."];
  
  const sourceFiles = files.filter(f =>
    f.type === "blob" &&
    sourceExts.some(ext => f.path.endsWith(ext)) &&
    !excludePatterns.some(pattern => f.path.includes(pattern))
  ).slice(0, 30); // Limit to 30 files

  console.log(`[analyze-repo] Found ${sourceFiles.length} source files to analyze`);

  // Fetch and parse files
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const moduleSet = new Set<string>();

  // Reset module colors
  Object.keys(MODULE_COLORS).forEach(k => delete MODULE_COLORS[k]);

  // Create a root module
  const rootModule = repo;
  moduleSet.add(rootModule);
  nodes.push({
    id: `module:${rootModule}`,
    name: repo,
    type: "module",
    moduleId: rootModule,
    size: 0,
    color: getModuleColor(rootModule),
    depth: 0,
  });

  const totalLines = 0;
  const totalImports = 0;

  // Fetch first 3 files in parallel to get module structure
  const filesToFetch = sourceFiles.slice(0, 20);
  
  for (const file of filesToFetch) {
    try {
      const contentRes = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`
      );
      
      if (!contentRes.ok) continue;
      
      const content = await contentRes.text();
      const { functions, imports, lineCount } = parseFileForFunctions(content);
      
      // Determine module from path
      const pathParts = file.path.split("/");
      const moduleId = pathParts.length > 1 ? pathParts[0] : rootModule;
      moduleSet.add(moduleId);
      
      // Create module if not exists
      if (!nodes.find(n => n.id === `module:${moduleId}`)) {
        nodes.push({
          id: `module:${moduleId}`,
          name: moduleId,
          type: "module",
          moduleId,
          size: 0,
          color: getModuleColor(moduleId),
          depth: 0,
        });
      }
      
      // Create file node
      const fileName = pathParts[pathParts.length - 1];
      const fileNodeId = `file:${file.path}`;
      nodes.push({
        id: fileNodeId,
        name: fileName,
        type: "file",
        moduleId,
        file: file.path,
        size: lineCount,
        color: getModuleColor(moduleId),
        depth: 1,
      });
      
      // File -> Module edge
      edges.push({ source: fileNodeId, target: `module:${moduleId}`, type: "contains" });
      
      // Create function nodes
      for (let i = 0; i < functions.length && i < 20; i++) {
        const fnName = functions[i];
        const fnId = `fn:${file.path}:${fnName}`;
        
        nodes.push({
          id: fnId,
          name: fnName,
          type: "function",
          moduleId,
          file: file.path,
          size: 1,
          color: "#94a3b8",
          depth: 2,
          startLine: 1,
          endLine: 1,
          isExported: content.includes(`export`) || content.includes(`module.exports`),
        });
        
        // Function -> File edge
        edges.push({ source: fnId, target: fileNodeId, type: "contains" });
      }
      
      // Create import edges
      for (const imp of imports.slice(0, 10)) {
        const impFileName = imp.replace(/^\.\//, "").replace(/\.[^.]+$/, "");
        const resolvedId = `file:${impFileName}`;
        if (resolvedId !== fileNodeId) {
          edges.push({ source: fileNodeId, target: resolvedId, type: "imports" });
        }
      }
      
    } catch (error) {
      console.log(`[analyze-repo] Error processing ${file.path}: ${error}`);
    }
  }

  console.log(`[analyze-repo] Created ${nodes.length} nodes, ${edges.length} edges`);

  return {
    name: repo,
    description: repoData.description || "",
    owner,
    defaultBranch: branch,
    language: repoData.language || "TypeScript",
    stars: repoData.stargazers_count || 0,
    nodes,
    edges,
    stats: {
      modules: moduleSet.size,
      files: nodes.filter(n => n.type === "file").length,
      functions: nodes.filter(n => n.type === "function").length,
      imports: totalImports,
      linesOfCode: totalLines,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Parse GitHub URL
    const urlMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (!urlMatch) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }

    const [, owner, repo] = urlMatch;
    const analysis = await analyzeRepoFromGitHub(owner, repo);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
