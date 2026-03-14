"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  MoveRight, Terminal, Cpu, Activity, Globe, GitBranch,
  Zap, Shield, Search, Eye, Code2, Network, ChevronRight,
  Package, ArrowRight, Layers, Box, Cpu as CoreIcon, Command
} from "lucide-react";
import { GraphView } from "@/components/graph-view";
import { cn } from "@/lib/utils";

const PIPELINE_STEPS = [
  { step: "01", label: "Parse", detail: "TS Compiler API — real AST, not regex. Every function, class, import, and type." },
  { step: "02", label: "Graph", detail: "Two-pass DependencyGraph with O(1) adjacency lookups. Forward + reverse maps." },
  { step: "03", label: "Cluster", detail: "Greedy agglomeration into logical modules. Auto-detected or contract-defined." },
  { step: "04", label: "Hash", detail: "Merkle-tree SHA-256: function → file → module → root. One hash = full drift check." },
  { step: "05", label: "Contract", detail: "Constraint validation against mikk.json. 6 constraint types. CI-ready." },
  { step: "06", label: "Context", detail: "BFS graph traversal. Token budgeting. Greedy knapsack by relevance score." },
  { step: "07", label: "Serve", detail: "MCP server — 15 tools, 3 resources. Millisecond response. Zero re-parsing." },
];

const FEATURES = [
  {
    icon: Search,
    title: "AI Context Builder",
    desc: "Graph-traced, token-budgeted context payloads. BFS walks your call graph from seed functions, scores by relevance, and packs the optimal context within your token limit.",
    tag: "Zero Hallucination",
  },
  {
    icon: Eye,
    title: "Impact Analysis",
    desc: "See what breaks before you change it. BFS backward walk traces the full blast radius of any file — every upstream caller, every downstream dependency — in milliseconds.",
    tag: "Blast Radius",
  },
  {
    icon: Terminal,
    title: "Intent Pre-flight",
    desc: "Describe what you want to build in plain English. Mikk parses it into structured intents, checks against 6 constraint types, and suggests an implementation plan.",
    tag: "Pre-flight Check",
  },
  {
    icon: Shield,
    title: "Strict Contracts",
    desc: "Define module boundaries in mikk.json. CI fails if an import violates your architecture. Supports no-import, must-use, no-call, layer, naming, and max-files constraints.",
    tag: "Contract Enforcement",
  },
  {
    icon: Network,
    title: "MCP Server",
    desc: "Expose your architecture to Claude, Cursor, VS Code Copilot — any MCP-compatible AI assistant. 15 tools, 3 resources, one command: mikk mcp.",
    tag: "15 Tools",
  },
  {
    icon: Zap,
    title: "Merkle Drift Detection",
    desc: "SHA-256 hashes at every level: function → file → module → root. One hash comparison = full codebase drift check. Persisted in SQLite with WAL mode.",
    tag: "Incremental",
  },
];

const TERMINAL_LINES = [
  { t: "cmd", text: "mikk init" },
  { t: "info", text: "  Scanning TypeScript files..." },
  { t: "info", text: "  Parsing ASTs via TS Compiler API..." },
  { t: "ok", text: "  ✓ 2,847 functions across 91 files parsed" },
  { t: "info", text: "  Building dependency graph..." },
  { t: "ok", text: "  ✓ Graph: 3,201 nodes, 9,442 edges (O(1) lookups)" },
  { t: "info", text: "  Clustering into modules..." },
  { t: "ok", text: "  ✓ 8 modules auto-detected (auth, payments, users...)" },
  { t: "info", text: "  Merkle-tree hashing..." },
  { t: "ok", text: "  ✓ SHA-256: function → file → module → root" },
  { t: "info", text: "  Writing artifacts..." },
  { t: "ok", text: "  ✓ mikk.lock.json  (−60% vs raw source)" },
  { t: "ok", text: "  ✓ .mikk/diagrams/ (8 Mermaid files)" },
  { t: "ok", text: "  ✓ claude.md + AGENTS.md (493 lines)" },
  { t: "done", text: "  Done in 3.1s. AI finally understands your code." },
];

const MOCK_GRAPH_DATA = {
  nodes: [
    { id: "1", title: "auth-module", url: "#" },
    { id: "2", title: "api-server", url: "#" },
    { id: "3", title: "db-provider", url: "#" },
    { id: "4", title: "intent-engine", url: "#" },
    { id: "5", title: "watcher-daemon", url: "#" },
    { id: "6", title: "cli-parser", url: "#" },
  ],
  links: [
    { source: "1", target: "2" },
    { source: "2", target: "3" },
    { source: "4", target: "2" },
    { source: "5", target: "4" },
    { source: "6", target: "4" },
  ]
};

export default function Page() {
  return (
    <div className="relative min-h-screen bg-background font-sans overflow-x-hidden selection:bg-primary/10 selection:text-primary">
      {/* ─────────────────────────────────────
         BACKGROUND SYSTEM
      ───────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Fine Dot Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(1_0_0_/_0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        
        {/* Large Decorative Circles */}
        <div className="absolute -top-[20%] -left-[10%] size-[800px] bg-primary/[0.03] rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -right-[15%] size-[600px] bg-primary/[0.02] rounded-full blur-[100px]" />
        
        {/* Horizontal Line Scanners */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent animate-pulse" />
        <div className="absolute top-1/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
      </div>

      {/* ─────────────────────────────────────
         NAVBAR
      ───────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-xl px-6 lg:px-12 flex h-14 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-5 bg-foreground rounded-[2px] flex items-center justify-center">
             <div className="size-2 bg-background rotate-45" />
          </div>
          <span className="font-mono text-sm font-black tracking-[-0.05em] uppercase">Mikk</span>
          <div className="h-3 w-px bg-border mx-1" />
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em] opacity-40">Core v1.7</span>
        </div>

        <nav className="hidden md:flex items-center gap-10">
          {[
            ["Docs", "/docs"],
            ["Changelog", "#"],
            ["Enterprise", "#"],
            ["GitHub", "https://github.com/ansh-dhanani/mikk"],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="font-mono text-[9px] font-bold tracking-[0.2em] text-muted-foreground/60 hover:text-foreground transition-all uppercase"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/docs">
            <Button
              className="h-8 rounded-lg px-4 bg-foreground text-background font-mono text-[10px] font-black uppercase tracking-widest hover:bg-foreground/90 transition-all active:scale-95"
            >
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* ─────────────────────────────────────
         HERO SECTION
      ───────────────────────────────────── */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12 pt-20 pb-32">
        <div className="flex flex-col items-center text-center mb-24">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/40 bg-muted/20 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Knowledge Graph Powered AI Context
            </span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-[-0.03em] uppercase leading-[0.88] mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            Automate <span className="text-muted-foreground/30 italic">Pure</span><br />
            Intelligence.
          </h1>

          <p className="max-w-2xl text-lg text-muted-foreground/60 leading-relaxed font-medium mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            Mikk builds a real-time Merkle-tree dependency graph of your codebase. 
            It provides the exact context your AI needs, with zero hallucination and contract-enforced boundaries.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <Link href="/docs">
              <Button size="lg" className="h-14 px-10 rounded-2xl bg-foreground text-background font-mono text-xs font-black uppercase tracking-widest hover:bg-foreground/90 shadow-2xl shadow-foreground/10 transition-all active:scale-95 group">
                Initialize Core
                <ArrowRight className="ml-2 size-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <div className="h-14 px-6 rounded-2xl border border-border/60 bg-muted/10 backdrop-blur-md flex items-center gap-4 group hover:border-border transition-all">
              <span className="font-mono text-xs text-muted-foreground/40">$</span>
              <code className="font-mono text-xs text-foreground/80">npm install @getmikk/cli</code>
              <button 
                onClick={() => navigator.clipboard.writeText("npm install @getmikk/cli")}
                className="ml-2 text-muted-foreground/30 hover:text-foreground transition-colors"
                title="Copy to clipboard"
              >
                <Layers className="size-3" />
              </button>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────
           MAIN VISUAL — THE GRAPH
        ───────────────────────────────────── */}
        <div className="relative animate-in fade-in zoom-in-95 duration-1000 delay-500">
             <div className="absolute inset-0 bg-primary/5 blur-[120px] rounded-full opacity-30" />
             <GraphView graph={MOCK_GRAPH_DATA} className="h-[550px] border-border/40 bg-card/10 backdrop-blur-2xl shadow-3xl" />
             
             {/* Floating Info Panels */}
             <div className="absolute -bottom-8 -left-8 md:bottom-12 md:left-12 p-6 rounded-2xl border border-border/40 bg-background/80 backdrop-blur-xl shadow-2xl max-w-[240px] hidden md:block group hover:border-primary/30 transition-all duration-500 cursor-default">
                <div className="flex items-center gap-2 mb-3">
                   <div className="size-2 rounded-full bg-primary" />
                   <span className="font-mono text-[9px] font-black uppercase tracking-widest">Blast Radius</span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground/60 leading-relaxed uppercase">
                   O(1) dependency resolution across 3,201 unique identifiers. No drift.
                </p>
             </div>
             
             <div className="absolute -top-8 -right-8 md:top-12 md:right-12 p-6 rounded-2xl border border-border/40 bg-background/80 backdrop-blur-xl shadow-2xl max-w-[240px] hidden md:block group hover:border-primary/30 transition-all duration-500 cursor-default">
                <div className="flex items-center gap-2 mb-3">
                   <div className="size-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
                   <span className="font-mono text-[9px] font-black uppercase tracking-widest">MCP Active</span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground/60 leading-relaxed uppercase">
                   Claude/Cursor connected tools: 15. Real-time architecture stream.
                </p>
             </div>
        </div>
      </main>

      {/* ─────────────────────────────────────
         TERMINAL SECTION
      ───────────────────────────────────── */}
      <section className="relative z-10 border-t border-border/10 py-32 px-6 lg:px-12 bg-muted/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
           <div>
              <div className="font-mono text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-6">Engine Logic</div>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-[0.9] mb-8">
                 Code intelligence<br />
                 without the latency.
              </h2>
              <p className="text-muted-foreground/60 leading-relaxed mb-10 max-w-lg">
                 Mikk runs entirely locally on your machine. It uses the TS Compiler API to extract raw ASTs, 
                 converts them into a Merkle-DAG, and persists state in an optimized SQLite WAL database.
              </p>
              
              <div className="space-y-6">
                 {[
                   { icon: Command, label: "Deterministic Hashing", detail: "SHA-256 graph signatures for every function." },
                   { icon: Layers, label: "Merkle Drift Check", detail: "Verify codebase integrity in 12ms." },
                   { icon: Network, label: "Graph-Traced Context", detail: "BFS walk ensures no missing dependencies." },
                 ].map((item, i) => (
                   <div key={i} className="flex gap-4 group">
                      <div className="size-10 rounded-xl bg-card border border-border/40 flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-all">
                         <item.icon className="size-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                         <div className="font-mono text-[11px] font-black uppercase tracking-wider mb-1">{item.label}</div>
                         <div className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-widest leading-relaxed">{item.detail}</div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div className="relative group">
              <div className="absolute -inset-4 bg-primary/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative border border-border bg-card/20 backdrop-blur-md rounded-2xl overflow-hidden shadow-3xl">
                <div className="flex items-center gap-3 border-b border-border/50 px-5 py-3.5 bg-background/40">
                  <div className="flex gap-1.5">
                    <div className="size-2.5 rounded-full bg-border/20" />
                    <div className="size-2.5 rounded-full bg-border/20" />
                    <div className="size-2.5 rounded-full bg-border/20" />
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground/30 uppercase tracking-[0.2em] ml-2">Studio Terminal — bash</span>
                </div>
                <div className="p-8 font-mono text-[11px] space-y-2 overflow-auto max-h-[400px]">
                  {TERMINAL_LINES.map((line, i) => (
                    <div key={i} className={cn(
                      "flex gap-4",
                      line.t === "cmd" ? "text-foreground font-bold" :
                      line.t === "ok" ? "text-primary opacity-90" :
                      line.t === "done" ? "text-foreground font-black pt-4 border-t border-border/10 mt-4" :
                      "text-muted-foreground opacity-40 uppercase tracking-widest text-[9px]"
                    )}>
                      {line.t === "cmd" && <span className="opacity-20">$</span>}
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
           </div>
        </div>
      </section>

      {/* ─────────────────────────────────────
         FEATURES GRID
      ───────────────────────────────────── */}
      <section id="features" className="relative z-10 py-32 px-6 lg:px-12 border-t border-border/10">
        <div className="max-w-7xl mx-auto flex flex-col items-center mb-24 text-center">
            <div className="font-mono text-[10px] text-primary font-black uppercase tracking-[0.4em] mb-6">Core Capability</div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">
               Studio-grade Features.
            </h2>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="p-10 rounded-[32px] border border-border/40 bg-card/20 backdrop-blur-sm hover:bg-card/40 transition-all duration-500 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                 <div className="size-2 rounded-full bg-primary" />
              </div>
              
              <div className="size-12 rounded-2xl bg-muted/20 border border-border flex items-center justify-center mb-8 group-hover:border-primary/20 transition-all">
                <f.icon className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              
              <div className="font-mono text-[9px] text-primary font-black uppercase tracking-[0.3em] mb-4 opacity-60">
                 {f.tag}
              </div>
              
              <h3 className="font-mono text-sm font-black text-foreground uppercase tracking-widest mb-4">
                {f.title}
              </h3>
              <p className="font-mono text-[11px] text-muted-foreground/60 leading-relaxed uppercase tracking-tight">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────
         CTA 
      ───────────────────────────────────── */}
      <section className="relative z-10 py-48 px-6 text-center overflow-hidden border-t border-border/10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 size-[600px] bg-primary/[0.04] rounded-full blur-[100px]" />
        
        <div className="relative max-w-4xl mx-auto space-y-12">
          <h2 className="text-6xl md:text-8xl font-black tracking-[-0.04em] uppercase leading-[0.88]">
            Bridge the gap.<br />
            <span className="text-muted-foreground/20 italic">Sync your reality.</span>
          </h2>
          
          <div className="flex flex-wrap justify-center gap-6 pt-8">
            <Link href="/docs">
              <Button size="lg" className="h-16 px-12 rounded-2xl bg-foreground text-background font-mono text-sm font-black uppercase tracking-widest hover:bg-foreground/90 shadow-3xl shadow-foreground/20 active:scale-95 transition-all">
                Access Documentation
              </Button>
            </Link>
            <Link href="https://github.com/ansh-dhanani/mikk" target="_blank">
              <Button size="lg" variant="outline" className="h-16 px-12 rounded-2xl border-border bg-background backdrop-blur-md font-mono text-sm font-black uppercase tracking-widest hover:bg-muted/50 active:scale-95 transition-all">
                GitHub Repository
              </Button>
            </Link>
          </div>
          
          <div className="pt-24 font-mono text-[9px] text-muted-foreground/20 uppercase tracking-[0.5em] font-bold">
            Trusted by AI Assistants worldwide • Built for deterministic scale
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────
         FOOTER
      ───────────────────────────────────── */}
      <footer className="relative z-10 border-t border-border/40 py-16 px-6 lg:px-12 bg-background flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex flex-col items-center md:items-start gap-4">
          <div className="flex items-center gap-2.5">
            <div className="size-4 bg-foreground rounded-[2px]" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest">Mikk Engine</span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground/30 uppercase tracking-[0.2em]">
            Apache-2.0 · Built by Ansh Dhanani
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-10">
          {[
            ["DOCS", "/docs"],
            ["GITHUB", "https://github.com/ansh-dhanani/mikk"],
            ["NPM", "https://www.npmjs.com/org/getmikk"],
            ["LEGAL", "#"],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="font-mono text-[10px] font-bold text-muted-foreground/40 hover:text-foreground transition-all uppercase tracking-[0.2em]"
            >
              {label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
