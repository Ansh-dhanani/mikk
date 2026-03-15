"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  GitBranch, Hash, Plug, MessageSquare, CheckCircle2, ArrowRight
} from "lucide-react";

const STEPS = [
  {
    id: 1,
    icon: GitBranch,
    label: "Parse",
    title: "Real AST parsing - not regex",
    body: "Mikk reads every .ts, .tsx, .js, and .go file via the TypeScript Compiler API. It extracts functions, classes, imports, and exact line numbers - building a complete picture of your project.",
    visual: "parse",
  },
  {
    id: 2,
    icon: Hash,
    label: "Graph + Hash",
    title: "Dependency graph with Merkle hashing",
    body: "A bidirectional DAG maps every import and function call. SHA-256 hashes roll up from function -> file -> module -> root. One comparison tells you if anything changed.",
    visual: "graph",
  },
  {
    id: 3,
    icon: Plug,
    label: "Connect",
    title: "Connect your AI assistant via MCP",
    body: "Start the MCP server with one command. Claude Desktop, Cursor, and VS Code Copilot can call any of the 18 tools directly - impact analysis, context building, contract validation.",
    visual: "connect",
  },
  {
    id: 4,
    icon: MessageSquare,
    label: "Ask",
    title: "Your AI finally knows your code",
    body: "Ask Claude to refactor a module. It calls mikk_get_module_detail, mikk_get_impact, and mikk_build_context automatically. Real file paths. Real line numbers. No hallucinated imports.",
    visual: "ask",
  },
];

/* Visuals */

function ParseVisual() {
  const lines = [
    { t: "dim", s: "// src/auth/login.ts" },
    { t: "kw",  s: "export async function " , rest: "login(email: string, password: string) {" },
    { t: "dim", s: "  const user = await db.findUser(email);" },
    { t: "dim", s: "  if (!user) throw new AuthError('NOT_FOUND');" },
    { t: "dim", s: "  const valid = await bcrypt.compare(password, user.hash);" },
    { t: "kw",  s: "  return " , rest: "createSession(user.id);" },
    { t: "dim", s: "}" },
    { t: "empty", s: "" },
    { t: "dim", s: "// Extracted ->" },
    { t: "tag",  s: '{ name: "login", file: "src/auth/login.ts", line: 2, calls: ["db.findUser", "createSession"] }' },
  ];

  return (
    <div className="font-mono text-[12.5px] leading-6 space-y-0.5">
      {lines.map((l, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, duration: 0.2 }}
          className={cn(
            l.t === "dim"   && "text-muted-foreground/60",
            l.t === "kw"    && "text-primary",
            l.t === "tag"   && "text-green-600 dark:text-green-400 text-[11px]",
            l.t === "empty" && "h-3"
          )}
        >
          {l.t === "kw" ? (
            <span><span className="text-primary">{l.s}</span><span className="text-foreground/80">{l.rest}</span></span>
          ) : l.s}
        </motion.div>
      ))}
    </div>
  );
}

function GraphVisual() {
  const nodes = [
    { id: "auth",     x: 160, y: 60,  label: "auth" },
    { id: "login",    x: 80,  y: 160, label: "login.ts" },
    { id: "session",  x: 240, y: 160, label: "session.ts" },
    { id: "db",       x: 160, y: 260, label: "db" },
    { id: "jwt",      x: 320, y: 260, label: "jwt.ts" },
  ];
  const edges = [
    { from: "auth", to: "login" },
    { from: "auth", to: "session" },
    { from: "login", to: "db" },
    { from: "session", to: "jwt" },
  ];

  const getNode = (id: string) => nodes.find(n => n.id === id)!;

  return (
    <div className="relative">
      <svg viewBox="0 0 400 320" className="w-full h-[240px]">
        {edges.map((e, i) => {
          const f = getNode(e.from), t = getNode(e.to);
          return (
            <motion.line
              key={i}
              x1={f.x} y1={f.y} x2={t.x} y2={t.y}
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-border"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: i * 0.12, duration: 0.4 }}
            />
          );
        })}
        {nodes.map((n, i) => (
          <motion.g key={n.id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 300 }}
          >
            <circle cx={n.x} cy={n.y} r="22" className="fill-card stroke-border" strokeWidth="1.5" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="10"
              className="fill-foreground/70 font-mono select-none">
              {n.label}
            </text>
          </motion.g>
        ))}
      </svg>
      <div className="mt-2 text-xs font-mono text-muted-foreground/60 text-center">
        3,201 nodes - 9,442 edges - O(1) lookups
      </div>
    </div>
  );
}

function ConnectVisual() {
  return (
    <div className="space-y-3">
      <div className="font-mono text-xs text-muted-foreground/60 mb-2">claude_desktop_config.json</div>
      <div className="bg-muted/40 dark:bg-muted/20 rounded-lg border border-border/60 p-4 font-mono text-[12px] leading-5">
        {[
          '{',
          '  "mcpServers": {',
          '    "mikk": {',
          '      "command": "npx",',
          '      "args": [',
          '        "-y",',
          '        "@getmikk/mcp-server",',
          '        "/path/to/your/project"',
          '      ]',
          '    }',
          '  }',
          '}',
        ].map((line, i) => (
          <motion.div key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="text-foreground/80"
          >
            {line}
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 font-mono"
      >
        <CheckCircle2 className="size-3.5" />
        Mikk connected - 18 tools available
      </motion.div>
    </div>
  );
}

function AskVisual() {
  return (
    <div className="space-y-3">
      {/* User message */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-primary/8 border border-primary/20 rounded-lg px-4 py-3">
        <div className="text-xs font-medium text-foreground/80 mb-1">You</div>
        <div className="text-sm text-foreground/70">Add rate limiting to the auth module</div>
      </motion.div>

      {/* Tool call */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="bg-muted/40 border border-border/60 rounded-lg px-4 py-3 font-mono text-[11px] text-muted-foreground/70 space-y-1">
        <div className="text-primary/70">{"->"} mikk_check_intent("Add rate limiting to auth")</div>
        <div className="text-muted-foreground/50">{"->"} mikk_get_module_detail("auth")</div>
        <div className="text-muted-foreground/50">{"->"} mikk_get_impact("src/auth/login.ts")</div>
      </motion.div>

      {/* Claude answer */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
        className="bg-card border border-border/60 rounded-lg px-4 py-3 text-sm text-foreground/75 leading-relaxed">
        <div className="text-xs font-medium text-foreground/80 mb-2">Claude</div>
        I&apos;ll add rate limiting to <code className="text-primary text-xs">src/auth/login.ts</code> (line 2).
        The auth module has a <code className="text-primary text-xs">no-import: [&quot;payments&quot;]</code> constraint -
        I&apos;ll use the existing <code className="text-primary text-xs">@getmikk/core</code> rate-limit util at line 47.
      </motion.div>
    </div>
  );
}

const VISUALS: Record<string, React.ReactNode> = {
  parse:   <ParseVisual />,
  graph:   <GraphVisual />,
  connect: <ConnectVisual />,
  ask:     <AskVisual />,
};

/* Main component */
export function HowItWorks() {
  const [active, setActive] = useState(0);

  // Auto-advance every 6 seconds
  useEffect(() => {
    const t = setTimeout(() => setActive(a => (a + 1) % STEPS.length), 6000);
    return () => clearTimeout(t);
  }, [active]);

  const step = STEPS[active];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 lg:gap-12 items-start">
      {/* Step list */}
      <div className="flex flex-col gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => {
              setActive(i);
              // trackEvent('landing_stepper_select', { stepId: s.id, index: i, stepName: s.title });
            }}
            className={cn(
              "group flex items-start gap-4 p-4 rounded-xl text-left transition-all duration-200",
              active === i
                ? "bg-primary/8 border border-primary/20"
                : "hover:bg-muted/50 border border-transparent"
            )}
          >
            <div className={cn(
              "size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200",
              active === i
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground group-hover:bg-muted"
            )}>
              <s.icon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className={cn(
                "text-sm font-semibold leading-snug transition-colors",
                active === i ? "text-foreground" : "text-foreground/60"
              )}>
                {s.title}
              </div>
              {active === i && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-1.5 text-sm text-muted-foreground leading-relaxed"
                >
                  {s.body}
                </motion.div>
              )}
            </div>
          </button>
        ))}

        {/* Progress bar */}
        <div className="mt-4 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 rounded-full bg-border/60 overflow-hidden">
              {active === i && (
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 6, ease: "linear" }}
                />
              )}
              {active > i && <div className="h-full w-full bg-primary/40" />}
            </div>
          ))}
        </div>
      </div>

      {/* Visual panel */}
      <div className="rounded-xl border border-border/60 bg-background dark:bg-card overflow-hidden">
        {/* Chrome bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
          <span className="size-2.5 rounded-full bg-red-400/50" />
          <span className="size-2.5 rounded-full bg-yellow-400/50" />
          <span className="size-2.5 rounded-full bg-green-400/50" />
          <span className="ml-3 text-xs text-muted-foreground font-mono">
            {["parse", "graph.ts", "mcp", "claude"][active]}
          </span>
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground/50 font-mono">
            Step {active + 1} of {STEPS.length}
            <ArrowRight className="size-3 ml-1" />
          </div>
        </div>

        <div className="p-6 min-h-[280px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {VISUALS[step.visual]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
