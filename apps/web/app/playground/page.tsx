"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  UserIcon,
  BotIcon,
  SparklesIcon,
  SearchIcon,
  GitBranchIcon,
  ShieldCheckIcon,
  LayersIcon,
  CodeIcon,
  ZapIcon,
  EyeIcon,
  RouteIcon,
  GitCompareIcon,
  LockIcon,
  TerminalIcon,
  ArrowRightIcon,
  MessageSquareIcon,
  SettingsIcon,
  CheckCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ToolDetail {
  name: string;
  badge?: string;
  description: string;
  userQuestion: string;
  aiThinking: string[];
  toolCalls: { name: string; params: Record<string, unknown> }[];
  response: string;
  tokenSavings?: string;
}

const TOOL_DETAILS: Record<string, ToolDetail> = {
  mikk_get_session_context: {
    name: "mikk_get_session_context",
    badge: "START HERE",
    description: "One-shot context for session start: project overview + constraints + hot modules",
    userQuestion: "Hi! I need to add password reset functionality to our API.",
    aiThinking: [
      "Starting new conversation - loading project context",
      "Fetching session context to understand project structure",
    ],
    toolCalls: [{ name: "mikk_get_session_context", params: {} }],
    response: `{
  "project": {
    "name": "express-api",
    "language": "typescript",
    "description": "RESTful API with Express.js"
  },
  "summary": {
    "totalFunctions": 47,
    "totalFiles": 12,
    "totalModules": 4,
    "constraintViolations": 0,
    "constraintsPass": true,
    "estimatedChanges": 0
  },
  "modules": [
    { "id": "auth", "name": "Authentication", "functions": 8, "files": 2, "exported": 5 },
    { "id": "users", "name": "Users", "functions": 12, "files": 3, "exported": 7 },
    { "id": "routes", "name": "Routes", "functions": 15, "files": 4, "exported": 9 },
    { "id": "middleware", "name": "Middleware", "functions": 5, "files": 2, "exported": 3 }
  ],
  "constraints": [
    { "type": "no-import", "from": "auth", "to": "users", "reason": "Auth should be reusable" }
  ],
  "decisions": [
    { "id": "ADR-001", "title": "Use JWT for authentication", "reason": "Stateless, scalable" }
  ],
  "hint": "Next: Use mikk_query_context with your task description"
}`,
    tokenSavings: "~85% tokens saved vs reading all source files",
  },

  mikk_query_context: {
    name: "mikk_query_context",
    description: "Ask architecture questions - returns graph-traced context with relevant functions",
    userQuestion: "How does the authentication flow work?",
    aiThinking: [
      "Analyzing authentication flow through the codebase",
      "Traversing call graph from auth entry points",
      "Filtering to relevant functions within token budget",
    ],
    toolCalls: [{ name: "mikk_query_context", params: { question: "authentication flow" } }],
    response: `{
  "modules": [
    {
      "id": "auth",
      "name": "Authentication",
      "context": [
        {
          "name": "login",
          "file": "src/auth.ts",
          "startLine": 1,
          "endLine": 7,
          "calls": ["hashPassword", "generateToken"],
          "calledBy": [],
          "purpose": "Authenticate a user and return a session token"
        },
        {
          "name": "verifyToken",
          "file": "src/auth.ts",
          "startLine": 20,
          "endLine": 35,
          "calls": ["decodeToken"],
          "calledBy": ["requireAuth"],
          "purpose": "Verify JWT token and return user data"
        }
      ]
    }
  ],
  "tokenGuard": {
    "budget": 6000,
    "estimatedTokens": 1200,
    "minimized": false
  }
}`,
  },

  mikk_before_edit: {
    name: "mikk_before_edit",
    badge: "REQUIRED",
    description: "MANDATORY: Blast radius + constraint violations + circular dependency warnings",
    userQuestion: "I'm going to edit src/auth.ts. Is it safe?",
    aiThinking: [
      "Scanning for all usages of functions in auth.ts",
      "Calculating blast radius",
      "Checking for constraint violations",
    ],
    toolCalls: [
      { name: "mikk_before_edit", params: { files: ["src/auth.ts"] } },
    ],
    response: `{
  "summary": "Editing 1 file(s). Blast radius: 0 dependent node(s). Constraint violations: 0.",
  "constraintStatus": "pass",
  "files": {
    "src/auth.ts": {
      "functionsInFile": ["login", "hashPassword", "generateToken"],
      "exportedAtRisk": [
        { "name": "login", "calledBy": [] }
      ],
      "impactedNodes": 0,
      "depth": 1,
      "confidence": 1,
      "impacted": [],
      "truncated": false,
      "constraints": ["Do not use global state", "All async functions must handle errors explicitly"],
      "constraintStatus": "pass",
      "violations": [],
      "circularDependencies": []
    }
  },
  "warning": null,
  "hint": "All constraints satisfied. If safe, proceed with your edits.",
  "tokenGuard": {
    "budget": 1200,
    "estimatedTokens": 144,
    "minimized": false,
    "shouldAbort": false
  },
  "tokens": {
    "used": 166,
    "raw": 632,
    "saved": 466,
    "sessionSaved": 466,
    "sessionCalls": 1
  }
}`,
  },

  mikk_validate_edit: {
    name: "mikk_validate_edit",
    badge: "RECOMMENDED",
    description: "Intent analysis + impact + auto-correction + 6 safety gates",
    userQuestion: "I want to add a cache parameter to verifyToken. Will it break anything?",
    aiThinking: [
      "Analyzing impact of adding new parameter",
      "Running all 6 safety gates",
      "Checking for breaking changes",
    ],
    toolCalls: [
      {
        name: "mikk_validate_edit",
        params: {
          files: ["src/auth/jwt.ts"],
          description: "Add optional cache parameter to verifyToken",
        },
      },
    ],
    response: `{
  "allowed": true,
  "confidence": 0.87,
  "intent": {
    "isIntentionalBreakingChange": false,
    "confidence": 0.82,
    "reasoning": "Adding optional parameter with default value - backward compatible"
  },
  "impact": {
    "totalFiles": 1,
    "totalFunctions": 4,
    "riskScore": 32,
    "blastRadius": "LOW"
  },
  "gates": [
    { "name": "RISK_SCORE", "passed": true, "severity": "warning", "message": "Score 32 < 90" },
    { "name": "IMPACT_SCALE", "passed": true, "severity": "warning", "message": "4 functions < 10" },
    { "name": "PROTECTED_MODULE", "passed": true, "severity": "error", "message": "No protected modules" },
    { "name": "BREAKING_CHANGE", "passed": true, "severity": "error", "message": "Optional parameter - safe" },
    { "name": "TEST_COVERAGE", "passed": true, "severity": "warning", "message": "Tests found" },
    { "name": "DOCUMENTATION", "passed": true, "severity": "warning", "message": "No changes needed" }
  ],
  "recommendations": ["Add JSDoc for new parameter", "Add test for cached verification"],
  "nextSteps": ["Implement the change", "Run tests", "Commit"],
  "hint": "OK: Edit approved. Review recommendations before proceeding."
}`,
  },

  mikk_impact_analysis: {
    name: "mikk_impact_analysis",
    description: "Analyze blast radius of changing a file. Returns impacted functions by severity.",
    userQuestion: "What will break if I modify src/core/database.ts?",
    aiThinking: [
      "Analyzing database.ts dependencies",
      "Computing impact graph from all entry points",
      "Classifying affected nodes by risk level",
    ],
    toolCalls: [{ name: "mikk_impact_analysis", params: { file: "src/core/database.ts" } }],
    response: `{
  "file": "src/core/database.ts",
  "changedNodes": 1,
  "impactedNodes": 12,
  "depth": 3,
  "confidence": 0.94,
  "classified": {
    "critical": 2,
    "high": 4,
    "medium": 3,
    "low": 3,
    "criticalItems": [
      { "nodeId": "fn:src/routes/users.ts:getUserProfile", "risk": "CRITICAL", "depth": 1 },
      { "nodeId": "fn:src/routes/users.ts:removeUser", "risk": "CRITICAL", "depth": 1 }
    ]
  },
  "impacted": [
    { "function": "getUserProfile", "file": "src/routes/users.ts", "module": "users" },
    { "function": "removeUser", "file": "src/routes/users.ts", "module": "users" }
  ],
  "tokenGuard": {
    "budget": 1200,
    "estimatedTokens": 890,
    "minimized": false
  }
}`,
  },

  mikk_find_usages: {
    name: "mikk_find_usages",
    description: "Find every function that calls a specific function",
    userQuestion: "Where is hashPassword called from? I want to refactor it.",
    aiThinking: [
      "Scanning call graph for hashPassword",
      "Finding all direct callers",
      "Tracking cascade of dependencies",
    ],
    toolCalls: [{ name: "mikk_find_usages", params: { name: "hashPassword" } }],
    response: `{
  "function": "hashPassword",
  "file": "src/auth.ts",
  "module": "auth",
  "usageCount": 1,
  "usages": [
    { "name": "login", "file": "src/auth.ts", "module": "auth", "line": 1 }
  ],
  "warning": null
}`,
  },

  mikk_search_functions: {
    name: "mikk_search_functions",
    description: "Search for functions by name or ID using hybrid BM25 + substring search",
    userQuestion: "I need a function to validate email. Do we have one?",
    aiThinking: [
      "Searching for 'email' and 'validate' keywords",
      "Running hybrid BM25 + substring search",
      "Ranking by relevance score",
    ],
    toolCalls: [{ name: "mikk_search_functions", params: { query: "email validate" } }],
    response: `{
  "matches": [
    {
      "name": "isValidEmail",
      "file": "src/utils/validation.ts",
      "module": "utils",
      "exported": true,
      "lines": "5-18",
      "relevance": 0.9876
    },
    {
      "name": "validateEmailFormat",
      "file": "src/auth/helpers.ts",
      "module": "auth",
      "exported": true,
      "lines": "34-52",
      "relevance": 0.8543
    },
    {
      "name": "normalizeEmail",
      "file": "src/utils/email.ts",
      "module": "utils",
      "exported": false,
      "lines": "12-28",
      "relevance": 0.7234
    }
  ],
  "searchMethod": "hybrid (BM25 + substring via RRF)",
  "warning": null
}`,
  },

  mikk_semantic_search: {
    name: "mikk_semantic_search",
    description: "Find functions by meaning using local vector embeddings",
    userQuestion: "How do I check if a user has permission for an action?",
    aiThinking: [
      "Converting natural language to embeddings",
      "Searching vector space for semantic similarity",
      "Finding functions with related meaning",
    ],
    toolCalls: [{ name: "mikk_semantic_search", params: { query: "check user permission action" } }],
    response: `{
  "query": "check user permission action",
  "method": "semantic (vector similarity)",
  "model": "Xenova/all-MiniLM-L6-v2",
  "matches": [
    { "name": "hasPermission", "file": "src/auth/permissions.ts", "score": 0.94 },
    { "name": "canAccess", "file": "src/auth/rbac.ts", "score": 0.89 },
    { "name": "checkRole", "file": "src/auth/roles.ts", "score": 0.85 },
    { "name": "validateScope", "file": "src/auth/jwt.ts", "score": 0.82 }
  ],
  "requires": "@xenova/transformers (optional)"
}`,
  },

  mikk_get_function_detail: {
    name: "mikk_get_function_detail",
    description: "360-degree view: params, return type, body, call graph, error handling",
    userQuestion: "Tell me everything about the login function.",
    aiThinking: [
      "Fetching function details from lock file",
      "Loading body, params, and metadata",
      "Building complete call graph",
    ],
    toolCalls: [{ name: "mikk_get_function_detail", params: { name: "login" } }],
    response: `[
  {
    "id": "fn:src/auth.ts:login",
    "name": "login",
    "file": "src/auth.ts",
    "lines": "1-7",
    "module": "auth",
    "isExported": true,
    "isAsync": true,
    "params": [
      { "name": "username", "type": "string" },
      { "name": "password", "type": "string" }
    ],
    "returnType": "Promise<string>",
    "purpose": "Authenticate a user and return a session token",
    "body": "export async function login(username: string, password: string): Promise<string> {\\n    const hash = await hashPassword(password)\\n    if (!hash) {\\n        throw new Error('Invalid credentials')\\n    }\\n    return generateToken(username)\\n}",
    "calls": ["hashPassword", "generateToken"],
    "calledBy": [],
    "errorHandling": [
      { "line": 4, "type": "throw", "detail": "Throws on invalid credentials" }
    ],
    "edgeCases": ["invalid credentials", "empty password"],
    "warning": null
  }
]`,
  },

  mikk_rename: {
    name: "mikk_rename",
    description: "Plan a coordinated multi-file rename with step-by-step edit plan",
    userQuestion: "Help me rename the getUserById function to findUserById.",
    aiThinking: [
      "Finding all occurrences of getUserById",
      "Generating safe rename plan",
      "Checking for shadowing issues",
    ],
    toolCalls: [{ name: "mikk_rename", params: { functionName: "getUserById", newName: "findUserById" } }],
    response: `{
  "target": {
    "currentName": "getUserById",
    "newName": "findUserById",
    "file": "src/users/service.ts",
    "line": 34,
    "module": "users",
    "isExported": true
  },
  "callSites": [
    { "callerName": "loginUser", "file": "src/routes/auth.ts", "lineRange": "12-30" },
    { "callerName": "getProfile", "file": "src/routes/users.ts", "lineRange": "20-40" },
    { "callerName": "updateUser", "file": "src/routes/users.ts", "lineRange": "50-70" }
  ],
  "importSites": [
    { "file": "src/routes/auth.ts", "module": "api" },
    { "file": "src/routes/users.ts", "module": "api" }
  ],
  "totalEdits": 5,
  "instructions": [
    "1. Rename in src/users/service.ts:34",
    "2. Update import in src/routes/auth.ts",
    "3. Update import in src/routes/users.ts",
    "4. Update 3 call sites",
    "5. Run mikk analyze"
  ]
}`,
  },

  mikk_get_routes: {
    name: "mikk_get_routes",
    description: "Get all detected HTTP routes with methods, paths, handlers, and middleware chains",
    userQuestion: "Show me all the API endpoints in our application.",
    aiThinking: [
      "Scanning for route registrations",
      "Extracting middleware chains",
      "Building route table",
    ],
    toolCalls: [{ name: "mikk_get_routes", params: {} }],
    response: `{
  "routes": [
    {
      "method": "POST",
      "path": "/auth/login",
      "handler": "login",
      "middlewares": ["rateLimiter"],
      "file": "src/auth.ts",
      "line": 1
    }
  ],
  "warning": null
}`,
  },

  mikk_dead_code: {
    name: "mikk_dead_code",
    description: "Detect dead code with zero callers, exempting exports, entry points, routes",
    userQuestion: "Are there any unused functions in the codebase?",
    aiThinking: [
      "Analyzing call graph for unreferenced functions",
      "Exempting exports, routes, tests, entry points",
      "Filtering false positives",
    ],
    toolCalls: [{ name: "mikk_dead_code", params: {} }],
    response: `{
  "deadCount": 3,
  "totalFunctions": 47,
  "percentage": 6.4,
  "deadFunctions": [
    { "name": "legacyParser", "file": "src/utils/parser.ts", "module": "utils", "line": 89 },
    { "name": "formatDateOld", "file": "src/utils/dates.ts", "module": "utils", "line": 156 },
    { "name": "unusedHelper", "file": "src/auth/password.ts", "module": "auth", "line": 201 }
  ],
  "byModule": {
    "utils": { "dead": 2, "total": 8 },
    "auth": { "dead": 1, "total": 12 }
  },
  "exemptions": {
    "exports": 89,
    "entryPoints": 12,
    "routeHandlers": 15,
    "tests": 34,
    "constructors": 2
  },
  "hint": "Review dead functions before removal"
}`,
  },

  mikk_get_changes: {
    name: "mikk_get_changes",
    description: "Detect files added, modified, and deleted since last analyze",
    userQuestion: "What changed since yesterday?",
    aiThinking: [
      "Comparing git diff with last analyze timestamp",
      "Detecting new, modified, deleted files",
      "Mapping to affected functions",
    ],
    toolCalls: [{ name: "mikk_get_changes", params: {} }],
    response: `{
  "added": [],
  "modified": ["src/routes/users.ts", "src/auth/jwt.ts"],
  "deleted": [],
  "summary": "2 modified, 0 new, 0 deleted since last analysis",
  "totalChanges": 2,
  "warning": "Lock is 4 hours behind. Run mikk analyze to sync.",
  "hint": "Run mikk analyze to update lock file"
}`,
  },

  mikk_security_scan: {
    name: "mikk_security_scan",
    description: "Scan for hardcoded secrets, SQL injection, XSS, weak crypto, path traversal",
    userQuestion: "Run a security scan on our codebase.",
    aiThinking: [
      "Scanning for hardcoded secrets",
      "Checking for injection vulnerabilities",
      "Analyzing crypto usage",
    ],
    toolCalls: [{ name: "mikk_security_scan", params: { severity: "high" } }],
    response: `{
  "summary": { "total": 2, "critical": 0, "high": 2, "medium": 3, "low": 5 },
  "findings": [
    {
      "severity": "high",
      "category": "secrets",
      "title": "Hardcoded API Key",
      "file": "src/config.ts",
      "line": 15,
      "code": "apiKey: 'sk-1234567890'",
      "suggestion": "Use process.env.API_KEY",
      "cwe": "CWE-798"
    },
    {
      "severity": "high",
      "category": "injection",
      "title": "Potential SQL Injection",
      "file": "src/db/query.ts",
      "line": 42,
      "code": "query: \\\`SELECT * FROM users WHERE id = \${userId}\\\`",
      "suggestion": "Use parameterized query",
      "cwe": "CWE-89"
    }
  ],
  "scanDuration": 1250,
  "filesScanned": 47
}`,
  },

  mikk_get_constraints: {
    name: "mikk_get_constraints",
    description: "Get all architectural constraints and ADRs",
    userQuestion: "What are the architectural rules for this project?",
    aiThinking: [
      "Loading constraints from contract",
      "Fetching architectural decisions",
      "Building constraint matrix",
    ],
    toolCalls: [{ name: "mikk_get_constraints", params: {} }],
    response: `{
  "constraints": [
    { "type": "no-import", "from": "auth", "to": "users", "reason": "Auth must be reusable across projects" },
    { "type": "layer", "module": "core", "layers": ["0"], "reason": "Core is foundation" },
    { "type": "layer", "module": "api", "layers": ["2"], "reason": "API is top layer" },
    { "type": "naming", "module": "api", "pattern": "^get|^post|^put|^delete", "reason": "REST naming required" }
  ],
  "decisions": [
    { "id": "ADR-001", "title": "Use JWT for authentication", "reason": "Stateless, scalable", "date": "2024-01-15" },
    { "id": "ADR-002", "title": "PostgreSQL for database", "reason": "ACID compliance", "date": "2024-02-20" }
  ],
  "overwrite": false,
  "hint": "Use mikk_manage_adr to add/update decisions"
}`,
  },

  mikk_token_stats: {
    name: "mikk_token_stats",
    description: "Show token savings - how many tokens Mikk saved vs reading raw source",
    userQuestion: "How efficient has Mikk been in this session?",
    aiThinking: [
      "Calculating tokens used vs raw source",
      "Computing session statistics",
      "Generating efficiency report",
    ],
    toolCalls: [{ name: "mikk_token_stats", params: {} }],
    response: `{
  "session": { "calls": 12, "elapsedMinutes": 45 },
  "tokens": {
    "used": 4230,
    "rawWouldHaveCost": 28900,
    "saved": 24670,
    "savingsPercent": 85
  },
  "context": {
    "fullCodebaseTokens": 125000,
    "percentOfCodebaseRead": 3.4
  },
  "cumulative": {
    "totalSaved": 142000,
    "sessions": 28,
    "avgSavings": 82
  }
}`,
  },

  mikk_list_modules: {
    name: "mikk_list_modules",
    description: "List all declared modules with file counts, function counts, and entry points",
    userQuestion: "What's the structure of this codebase?",
    aiThinking: [
      "Loading module declarations from contract",
      "Counting files and functions per module",
      "Identifying entry points",
    ],
    toolCalls: [{ name: "mikk_list_modules", params: {} }],
    response: `{
  "modules": [
    {
      "id": "auth",
      "name": "Authentication",
      "description": "Handles user authentication and token generation",
      "paths": ["src/**"],
      "functions": 3,
      "files": 1,
      "entryFunctions": ["login"]
    }
  ],
  "warning": null
}`,
  },

  mikk_get_module_detail: {
    name: "mikk_get_module_detail",
    description: "Deep dive into a module: all functions, files, exported API surface",
    userQuestion: "Tell me everything about the auth module.",
    aiThinking: [
      "Loading auth module from lock file",
      "Building function dependency graph",
      "Extracting exported API surface",
    ],
    toolCalls: [{ name: "mikk_get_module_detail", params: { moduleId: "auth" } }],
    response: `{
  "module": {
    "id": "auth",
    "name": "Authentication",
    "description": "Handles user authentication and token generation",
    "intent": "Authenticate users and return JWT tokens",
    "paths": ["src/**"],
    "entryFunctions": ["login"]
  },
  "files": [
    { "path": "src/auth.ts", "imports": [] }
  ],
  "functions": [
    {
      "name": "login",
      "file": "src/auth.ts",
      "startLine": 1,
      "endLine": 7,
      "isExported": true,
      "isAsync": true,
      "params": [{ "name": "username", "type": "string" }, { "name": "password", "type": "string" }],
      "returnType": "Promise<string>",
      "calls": ["hashPassword", "generateToken"],
      "calledBy": []
    },
    {
      "name": "hashPassword",
      "file": "src/auth.ts",
      "startLine": 9,
      "endLine": 11,
      "isExported": false,
      "isAsync": false,
      "params": [{ "name": "password", "type": "string" }],
      "returnType": "Promise<string>",
      "calls": [],
      "calledBy": ["login"]
    }
  ],
  "exported": ["login"],
  "internal": ["hashPassword", "generateToken"],
  "warning": null
}`,
  },
};

const TOOL_CATEGORIES = [
  { id: "session", name: "Session Start", icon: <ZapIcon className="size-4" /> },
  { id: "understanding", name: "Understanding Code", icon: <SearchIcon className="size-4" /> },
  { id: "safety", name: "Safety Gates", icon: <ShieldCheckIcon className="size-4" /> },
  { id: "impact", name: "Impact Analysis", icon: <GitBranchIcon className="size-4" /> },
  { id: "details", name: "Code Details", icon: <CodeIcon className="size-4" /> },
  { id: "architecture", name: "Architecture", icon: <LockIcon className="size-4" /> },
  { id: "routes", name: "Routes & APIs", icon: <RouteIcon className="size-4" /> },
  { id: "deadcode", name: "Dead Code", icon: <EyeIcon className="size-4" /> },
  { id: "changes", name: "Change Detection", icon: <GitCompareIcon className="size-4" /> },
  { id: "security", name: "Security", icon: <ShieldCheckIcon className="size-4" /> },
  { id: "analytics", name: "Analytics", icon: <TerminalIcon className="size-4" /> },
];

const TOOL_TO_CATEGORY: Record<string, string> = {
  mikk_get_session_context: "session",
  mikk_query_context: "understanding",
  mikk_list_modules: "understanding",
  mikk_search_functions: "understanding",
  mikk_semantic_search: "understanding",
  mikk_before_edit: "safety",
  mikk_validate_edit: "safety",
  mikk_impact_analysis: "impact",
  mikk_find_usages: "impact",
  mikk_rename: "impact",
  mikk_get_function_detail: "details",
  mikk_get_module_detail: "details",
  mikk_get_file: "details",
  mikk_get_routes: "routes",
  mikk_dead_code: "deadcode",
  mikk_get_changes: "changes",
  mikk_git_diff_impact: "changes",
  mikk_security_scan: "security",
  mikk_token_stats: "analytics",
  mikk_get_constraints: "architecture",
  mikk_manage_adr: "architecture",
};

export default function PlaygroundPage() {
  const [activeTool, setActiveTool] = useState<string>("mikk_get_session_context");
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(["session", "understanding"])
  );
  const [activeTab, setActiveTab] = useState<"conversation" | "tool">("conversation");
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  const toggleCategory = (id: string) => {
    const newOpen = new Set(openCategories);
    if (newOpen.has(id)) {
      newOpen.delete(id);
    } else {
      newOpen.add(id);
    }
    setOpenCategories(newOpen);
  };

  const copyToClipboard = (text: string, toolId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTool(toolId);
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const activeDetail = TOOL_DETAILS[activeTool];

  const toolsByCategory = TOOL_CATEGORIES.map((cat) => ({
    ...cat,
    tools: Object.entries(TOOL_DETAILS)
      .filter(([, detail]) => TOOL_TO_CATEGORY[detail.name] === cat.id)
      .map(([id, detail]) => ({ id, ...detail })),
  })).filter((cat) => cat.tools.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <MessageSquareIcon className="size-4" />
            AI Conversation Playground
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight">
            See How AI Uses Mikk
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Explore realistic conversations showing what users ask, how AI thinks, and how Mikk MCP tools power every response.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          {/* Sidebar - Tool List */}
          <div className="space-y-4">
            <div className="sticky top-4 rounded-xl border bg-card/50 backdrop-blur-sm p-4 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <BotIcon className="size-4" />
                24 MCP Tools
              </h2>
              <div className="space-y-2">
                {toolsByCategory.map((category) => (
                  <Collapsible
                    key={category.id}
                    open={openCategories.has(category.id)}
                    onOpenChange={() => toggleCategory(category.id)}
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
                      <span className="flex items-center gap-2">
                        {category.icon}
                        {category.name}
                      </span>
                      {openCategories.has(category.id) ? (
                        <ChevronDownIcon className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4 pt-1">
                      <div className="space-y-1">
                        {category.tools.map((tool) => (
                          <button
                            key={tool.id}
                            onClick={() => setActiveTool(tool.id)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                              activeTool === tool.id
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-accent"
                            )}
                          >
                            <span className="flex-1 truncate text-left">
                              {tool.name.replace("mikk_", "")}
                            </span>
                            {tool.badge && (
                              <Tag className="text-[9px]">{tool.badge}</Tag>
                            )}
                          </button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="space-y-6">
            {activeDetail && (
              <>
                {/* Tool Header */}
                <div className="rounded-xl border bg-card p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <BotIcon className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{activeDetail.name}</h2>
                      {activeDetail.badge && (
                        <Tag className="mt-1">{activeDetail.badge}</Tag>
                      )}
                    </div>
                  </div>
                  <p className="text-muted-foreground">{activeDetail.description}</p>
                </div>

                {/* Tab Toggle */}
                <div className="flex gap-2 rounded-lg border bg-card p-1 w-fit">
                  <button
                    onClick={() => setActiveTab("conversation")}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                      activeTab === "conversation"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    <MessageSquareIcon className="size-4" />
                    Conversation
                  </button>
                  <button
                    onClick={() => setActiveTab("tool")}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                      activeTab === "tool"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    <CodeIcon className="size-4" />
                    Raw Tool Call
                  </button>
                </div>

                {activeTab === "conversation" ? (
                  <div className="space-y-4">
                    {/* User Question */}
                    <div className="flex gap-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                        <UserIcon className="size-5 text-blue-600" />
                      </div>
                      <div className="flex-1 rounded-xl bg-blue-500/5 border border-blue-500/20 p-4">
                        <p className="text-sm font-medium text-blue-600 mb-2">User</p>
                        <p className="text-foreground">{activeDetail.userQuestion}</p>
                      </div>
                    </div>

                    {/* AI Thinking */}
                    <div className="flex gap-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <BotIcon className="size-5 text-primary" />
                      </div>
                      <div className="flex-1 rounded-xl bg-muted/50 border p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <SparklesIcon className="size-4 text-primary" />
                          <p className="text-sm font-medium">AI is thinking...</p>
                        </div>
                        <div className="space-y-2">
                          {activeDetail.aiThinking.map((thought, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <ArrowRightIcon className="size-3" />
                              <span>{thought}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {activeDetail.toolCalls.map((call, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-mono text-primary"
                            >
                              <SettingsIcon className="size-3" />
                              {call.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* AI Response */}
                    <div className="flex gap-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <BotIcon className="size-5 text-primary" />
                      </div>
                      <div className="flex-1 rounded-xl border bg-card p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium flex items-center gap-2">
                            <BotIcon className="size-4" />
                            AI Response (JSON)
                          </p>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs"
                            onClick={() => copyToClipboard(activeDetail.response, activeDetail.name)}
                          >
                            {copiedTool === activeDetail.name ? (
                              <>
                                <CheckCircleIcon className="size-3 mr-1" />
                                Copied!
                              </>
                            ) : (
                              "Copy"
                            )}
                          </Button>
                        </div>
                        <pre className="text-xs font-mono bg-muted/50 p-4 rounded-lg overflow-auto max-h-[500px]">
                          {activeDetail.response}
                        </pre>
                        {activeDetail.tokenSavings && (
                          <div className="mt-4 flex items-center gap-3 rounded-lg bg-green-500/10 p-3">
                            <SparklesIcon className="size-5 text-green-600" />
                            <div>
                              <p className="text-sm font-medium text-green-600">Token Savings</p>
                              <p className="text-xs text-muted-foreground">{activeDetail.tokenSavings}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Raw Tool Call */
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <CodeIcon className="size-4" />
                        Raw MCP Tool Call
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => copyToClipboard(JSON.stringify(
                          activeDetail.toolCalls.map((call) => ({
                            tool: call.name,
                            parameters: call.params,
                          })),
                          null,
                          2
                        ), activeDetail.name + "-raw")}
                      >
                        {copiedTool === activeDetail.name + "-raw" ? (
                          <>
                            <CheckCircleIcon className="size-3 mr-1" />
                            Copied!
                          </>
                        ) : (
                          "Copy"
                        )}
                      </Button>
                    </div>
                    <pre className="text-sm font-mono bg-muted p-4 rounded-lg overflow-auto">
                      {JSON.stringify(
                        activeDetail.toolCalls.map((call) => ({
                          tool: call.name,
                          parameters: call.params,
                        })),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </>
            )}

            {/* Quick Reference */}
            <div className="rounded-xl border bg-card p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <LayersIcon className="size-5" />
                Typical AI Workflow
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h4 className="mb-3 flex items-center gap-2 font-medium">
                    <SparklesIcon className="size-4 text-primary" />
                    New Task
                  </h4>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs">1</span>
                      <span>AI calls mikk_get_session_context</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs">2</span>
                      <span>AI calls mikk_query_context with task</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs">3</span>
                      <span>AI understands codebase and plans approach</span>
                    </li>
                  </ol>
                </div>
                <div className="rounded-lg border p-4">
                  <h4 className="mb-3 flex items-center gap-2 font-medium">
                    <ShieldCheckIcon className="size-4 text-primary" />
                    Before Editing
                  </h4>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs">1</span>
                      <span>AI calls mikk_validate_edit</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs">2</span>
                      <span>Safety gates check for issues</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs">3</span>
                      <span>AI proceeds or redesigns based on results</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
