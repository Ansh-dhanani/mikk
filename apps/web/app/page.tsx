import Link from "next/link";
import { ArrowRight, GitBranch, Zap, Shield, Network, Terminal, Search } from "lucide-react";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CopyCommand } from "@/components/landing/copy-command";

const FEATURES = [
  {
    icon: GitBranch,
    title: "Real Dependency Graph",
    desc: "Bidirectional DAG built from actual ASTs. O(1) lookups forward and reverse — no guessing what imports what.",
  },
  {
    icon: Zap,
    title: "Merkle-tree Hashing",
    desc: "SHA-256 at every level: function → file → module → root. One hash = full codebase drift check in milliseconds.",
  },
  {
    icon: Network,
    title: "MCP Server",
    desc: "15 tools, 3 resources. Plug into Claude Desktop, Cursor, or VS Code Copilot with a single command.",
  },
  {
    icon: Search,
    title: "AI Context Builder",
    desc: "BFS from seed functions, scored by relevance, packed within your token budget. No hallucinated imports.",
  },
  {
    icon: Shield,
    title: "Architecture Contracts",
    desc: "Define module boundaries in mikk.json. 6 constraint types. CI fails on violations — automatically.",
  },
  {
    icon: Terminal,
    title: "Intent Pre-flight",
    desc: "Describe a change in plain English. Mikk checks it against your contracts before you write a line.",
  },
];

const STATS = [
  { value: "3.1s", label: "average init time" },
  { value: "15", label: "MCP tools" },
  { value: "−60%", label: "vs raw source size" },
  { value: "O(1)", label: "graph lookups" },
];

export default function Page() {
  return (
    <div className="bg-background text-foreground">

      {/* ── Nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">

          <div className="flex items-center gap-3">
            <div className="size-5 bg-foreground rounded-[3px]" />
            <span className="font-semibold text-sm">Mikk</span>
            <span className="hidden sm:inline text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
              v1.7
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {[
              ["Docs", "/docs"],
              ["GitHub", "https://github.com/ansh-dhanani/mikk"],
              ["npm", "https://www.npmjs.com/org/getmikk"],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href as string}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            Get started <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-6 text-xs text-muted-foreground border border-border/60 rounded-full px-3 py-1.5">
            <span className="size-1.5 rounded-full bg-green-500" />
            Open source · Apache 2.0
          </div>

          <h1 className="text-[2.75rem] md:text-[4rem] lg:text-[5rem] font-bold tracking-[-0.03em] leading-[1.05] mb-6">
            Your AI doesn&apos;t<br />
            understand your codebase.
            <br />
            <span className="text-muted-foreground/35">Mikk fixes that.</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed mb-10">
            Parse your project into a real dependency graph, hash every node with Merkle-tree SHA-256,
            and serve it to Claude, Cursor, or VS Code via MCP.{" "}
            <span className="text-foreground/60">Zero cloud. Zero config. Zero hallucination.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              Read the docs <ArrowRight className="size-4" />
            </Link>

            <div className="flex items-center h-11 rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
              <span className="pl-4 pr-2 font-mono text-sm text-muted-foreground/50">$</span>
              <span className="font-mono text-sm text-foreground/80 pr-2">
                npm install -g @getmikk/cli
              </span>
              <CopyCommand value="npm install -g @getmikk/cli" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────── */}
      <section className="border-y border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <div className="text-2xl font-bold tracking-tight tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mb-12">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight max-w-xl">
            From codebase to connected AI in four steps.
          </h2>
        </div>
        <HowItWorks />
      </section>

      {/* ── Terminal ────────────────────────────────── */}
      <section className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">
                Under the hood
              </p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-5">
                Runs entirely on your machine.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6 max-w-md">
                No API keys. No cloud upload. Mikk uses the TypeScript Compiler API locally,
                stores hashes in SQLite WAL mode, and writes atomic JSON snapshots. Your code
                never leaves your machine.
              </p>
              <Link href="/docs/core/concepts"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Read the architecture docs <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
                <span className="size-2.5 rounded-full bg-red-400/50" />
                <span className="size-2.5 rounded-full bg-yellow-400/50" />
                <span className="size-2.5 rounded-full bg-green-400/50" />
                <span className="ml-3 text-xs font-mono text-muted-foreground">bash</span>
              </div>
              <div className="p-5 font-mono text-sm space-y-1 text-muted-foreground/80">
                {[
                  { c: "fg",  t: "$ mikk init" },
                  { c: "dim", t: "  Scanning TypeScript files..." },
                  { c: "ok",  t: "  ✓ 2,847 functions parsed" },
                  { c: "dim", t: "  Building dependency graph..." },
                  { c: "ok",  t: "  ✓ 3,201 nodes · 9,442 edges" },
                  { c: "dim", t: "  Merkle hashing..." },
                  { c: "ok",  t: "  ✓ SHA-256 root: a3f82c..." },
                  { c: "dim", t: "  Writing artifacts..." },
                  { c: "ok",  t: "  ✓ mikk.lock.json  (−60% vs raw)" },
                  { c: "ok",  t: "  ✓ claude.md + AGENTS.md" },
                  { c: "hi",  t: "  Done in 3.1s." },
                ].map((l, i) => (
                  <div key={i} className={
                    l.c === "fg"  ? "text-foreground" :
                    l.c === "ok"  ? "text-green-600 dark:text-green-400" :
                    l.c === "hi"  ? "text-foreground font-semibold" :
                    "text-muted-foreground/50"
                  }>
                    {l.t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="mb-12">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">
            Capabilities
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Everything your AI needs.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-border/60 hover:border-border bg-card/40 hover:bg-card/80 transition-all group"
            >
              <div className="size-8 rounded-lg bg-muted/60 border border-border/60 flex items-center justify-center mb-4 group-hover:border-border transition-colors">
                <f.icon className="size-4 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Give your AI a real understanding of your code.
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Start in under 3 minutes. No account. No cloud. Just install, run{" "}
              <code className="text-sm font-mono text-foreground/70 bg-muted px-1.5 py-0.5 rounded">mikk init</code>,
              and connect.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Get started <ArrowRight className="size-4" />
              </Link>
              <Link
                href="https://github.com/ansh-dhanani/mikk"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                View on GitHub
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-4 bg-foreground rounded-[3px]" />
            <span className="text-sm font-medium">Mikk</span>
            <span className="text-xs text-muted-foreground">Apache-2.0 · Built by Ansh Dhanani</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="https://github.com/ansh-dhanani/mikk" target="_blank" className="hover:text-foreground transition-colors">GitHub</Link>
            <Link href="https://www.npmjs.com/org/getmikk" target="_blank" className="hover:text-foreground transition-colors">npm</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
