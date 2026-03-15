"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  GitBranch,
  Hash,
  MessageSquare,
  Network,
  Plug,
  Shield,
  X,
  Minus,
  Sparkles,
  Moon,
  Sun,
  ArrowDown,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyCommand } from "@/components/landing/copy-command";

type MatrixCell = "yes" | "no" | "partial";
type Slide = {
  id: string;
  badges: Array<{ label: string; tone?: "primary" | "muted" }>;
  title: React.ReactNode;
  version?: string;
  subtitle?: React.ReactNode;
  body?: React.ReactNode;
};

function Badge({ label, tone = "muted" }: { label: string; tone?: "primary" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] leading-none border font-mono tracking-wide",
        tone === "primary"
          ? "bg-primary/10 text-primary border-primary/20 shadow-sm shadow-primary/10"
          : "bg-background/60 text-muted-foreground border-border/60 shadow-sm shadow-black/5 dark:shadow-black/30",
      )}
    >
      {label}
    </span>
  );
}

function MatrixIcon({ v }: { v: MatrixCell }) {
  const cls = "inline-flex items-center justify-center size-6 rounded-md border border-border/60 bg-background/60";
  if (v === "yes") return <span className={cls}><Check className="size-3.5 text-green-600 dark:text-green-400" /></span>;
  if (v === "partial") return <span className={cls}><Minus className="size-3.5 text-muted-foreground" /></span>;
  return <span className={cls}><X className="size-3.5 text-destructive" /></span>;
}

function DeckNav({
  index,
  total,
  canPrev,
  canNext,
  prev,
  next,
}: {
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  prev: () => void;
  next: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [showNextHint, setShowNextHint] = useState(false);
  const NEXT_HINT_KEY = "mikk_next_hint_seen_v1";

  // Rendering via portal avoids "fixed inside transformed ancestor" issues.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    try {
      const seen = localStorage.getItem(NEXT_HINT_KEY) === "1";
      if (!seen) setShowNextHint(true);
    } catch {
      // Ignore storage failures (private mode, etc).
      setShowNextHint(true);
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (index > 0) {
      setShowNextHint(false);
      try {
        localStorage.setItem(NEXT_HINT_KEY, "1");
      } catch {
        // ignore
      }
    }
  }, [index, mounted]);

  const isDark = resolvedTheme === "dark";
  const shouldShowHint = mounted && index === 0 && canNext && showNextHint;

  if (!mounted) return null;

  return createPortal(
    <div className="deck-nav z-50">
      <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-border/60 bg-background/70 backdrop-blur p-1.5 sm:p-2 shadow-sm shadow-black/5 dark:shadow-black/30 max-w-[calc(100vw-1.25rem)] overflow-x-hidden overflow-y-visible">
        <Link
          href="/docs"
          className="h-8 sm:h-10 px-2.5 sm:px-3.5 rounded-full border border-border/60 bg-background/70 inline-flex items-center justify-center gap-2 font-mono text-[11px] sm:text-xs text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground shrink-0"
          aria-label="Open docs"
          title="Docs"
        >
          <BookOpen className="size-4 sm:size-5" />
          <span className="hidden sm:inline">Docs</span>
        </Link>

        <button
          type="button"
          onClick={prev}
          disabled={!canPrev}
          className={cn(
            "size-8 sm:size-10 rounded-full border border-border/60 bg-background/70 flex items-center justify-center transition-colors",
            canPrev ? "hover:bg-muted/20" : "opacity-40 cursor-not-allowed",
          )}
          aria-label="Previous slide"
        >
          <ArrowLeft className="size-4 sm:size-5" />
        </button>

        <div className="px-1 min-w-[3.75rem] text-center text-[11px] sm:text-xs leading-none text-muted-foreground tabular-nums font-mono whitespace-nowrap">
          {index + 1} / {total}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowNextHint(false);
              try {
                localStorage.setItem(NEXT_HINT_KEY, "1");
              } catch {
                // ignore
              }
              next();
            }}
            disabled={!canNext}
            className={cn(
              "size-8 sm:size-10 rounded-full border border-border/60 bg-background/70 flex items-center justify-center transition-colors",
              shouldShowHint && canNext && "border-primary/35 bg-primary/10 text-primary shadow-sm shadow-primary/10",
              canNext ? "hover:bg-muted/20" : "opacity-40 cursor-not-allowed",
            )}
            aria-label="Next slide"
          >
            <ArrowRight className="size-4 sm:size-5" />
          </button>

          <AnimatePresence>
            {shouldShowHint ? (
              <motion.div
                key="next-hint"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2"
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-mono tracking-wide text-primary shadow-sm shadow-primary/10">
                    Next
                  </div>
                  <ArrowDown className="size-4 text-primary drop-shadow-sm" />
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="size-8 sm:size-10 rounded-full border border-border/60 bg-background/70 flex items-center justify-center transition-colors hover:bg-muted/20"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? <Sun className="size-4 sm:size-5" /> : <Moon className="size-4 sm:size-5" />}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function Page() {
  const slides: Slide[] = useMemo(
    () => [
      {
        id: "intro",
        badges: [
          { label: "MCP Server", tone: "primary" },
          { label: "Context Drift" },
          { label: "Local-first" },
          { label: "18 tools" },
          { label: "v1.7" },
        ],
        title: "Mikk",
        subtitle: (
          <>
            Stop context drift.
            <br />
            Know the blast radius <span className="italic text-primary">before</span> you edit.
          </>
        ),
        body: (
          <div className="mt-10 text-[15px] md:text-base text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-primary/80" />
              Instant answers for <span className="text-foreground/80">dependents</span>,{" "}
              <span className="text-foreground/80">impact</span>, and <span className="text-foreground/80">constraints</span>.
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Get started <ChevronRight className="size-4" />
              </Link>
              <Link
                href="/docs/reference/mcp"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-border/60 bg-background/70 hover:bg-muted/20 transition-colors text-sm font-medium"
              >
                MCP tools <ChevronRight className="size-4" />
              </Link>
              <Link
                href="https://github.com/ansh-dhanani/mikk"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-border/60 bg-background/70 hover:bg-muted/20 transition-colors text-sm font-medium"
              >
                GitHub <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        ),
      },
      {
        id: "problem",
        badges: [{ label: "Problem", tone: "primary" }, { label: "Drift" }, { label: "Scale" }],
        title: (
          <>
            Your repo changes.
            <br />
            Your prompt <span className="italic text-primary">does not</span>.
          </>
        ),
        body: (
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
            {[
              { icon: Hash, t: "Context drift", d: "New files, renamed symbols, new modules. The model keeps yesterday's picture." },
              { icon: MessageSquare, t: "Wrong blast radius", d: "You change a file and miss callers, dependents, and cross-module edges." },
              { icon: Shield, t: "No safety check", d: "Agents need a before-edit checklist: constraints, risks, and what will break." },
            ].map((x) => (
              <div
                key={x.t}
                className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur p-5 shadow-sm shadow-black/5 dark:shadow-black/30"
              >
                <div className="size-9 rounded-lg bg-muted/30 border border-border/60 flex items-center justify-center mb-3">
                  <x.icon className="size-4 text-muted-foreground" />
                </div>
                <div className="text-sm font-semibold text-foreground/90">{x.t}</div>
                <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{x.d}</div>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "model",
        badges: [{ label: "Solution", tone: "primary" }, { label: "Snapshot" }, { label: "Graph" }, { label: "Drift" }],
        title: (
          <>
            Build a local snapshot
            <br />
            that tools can <span className="italic text-primary">query</span>.
          </>
        ),
        subtitle: "Mikk compiles your repo into mikk.lock.json, then serves answers via MCP tools (not a giant paste).",
        body: (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-left">
            {[
              { icon: GitBranch, t: "AST parse", d: "Compiler-grade symbol + location index." },
              { icon: Network, t: "Graph", d: "Dependencies and call edges with O(1) lookups." },
              { icon: Hash, t: "Drift", d: "Merkle hashes warn when the snapshot is stale." },
              { icon: Shield, t: "Contracts", d: "Constraints from mikk.json inform safer edits." },
            ].map((x) => (
              <div
                key={x.t}
                className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur p-5 shadow-sm shadow-black/5 dark:shadow-black/30"
              >
                <div className="size-9 rounded-lg bg-muted/30 border border-border/60 flex items-center justify-center mb-3">
                  <x.icon className="size-4 text-muted-foreground" />
                </div>
                <div className="text-sm font-semibold text-foreground/90">{x.t}</div>
                <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{x.d}</div>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "steps",
        badges: [{ label: "Workflow", tone: "primary" }, { label: "Keep it fresh" }, { label: "Ask before edit" }],
        title: (
          <>
            Treat the lock file
            <br />
            as an <span className="italic text-primary">index</span>, not a prompt.
          </>
        ),
        body: (
          <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-5 text-left">
            {[
              { icon: GitBranch, t: "1. Generate", d: "mikk init builds mikk.lock.json and context files." },
              { icon: Hash, t: "2. Detect drift", d: "mikk diff shows added/modified/deleted files." },
              { icon: Network, t: "3. Keep in sync", d: "mikk watch updates incrementally as you work." },
              { icon: Plug, t: "4. Query via tools", d: "Use MCP tools when the assistant needs specifics." },
            ].map((x) => (
              <div
                key={x.t}
                className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur p-5 shadow-sm shadow-black/5 dark:shadow-black/30"
              >
                <div className="size-9 rounded-lg bg-muted/30 border border-border/60 flex items-center justify-center mb-3">
                  <x.icon className="size-4 text-muted-foreground" />
                </div>
                <div className="text-sm font-semibold text-foreground/90">{x.t}</div>
                <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{x.d}</div>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "onboarding",
        badges: [{ label: "Onboarding", tone: "primary" }, { label: "CLI" }, { label: "MCP" }],
        title: (
          <>
            Install. Snapshot. Connect.
            <br />
            <span className="italic text-primary">Done</span>.
          </>
        ),
        body: (
          <div className="mt-10 max-w-3xl mx-auto text-left">
            <div className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur overflow-hidden shadow-sm shadow-black/5 dark:shadow-black/30">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20 text-xs text-muted-foreground uppercase tracking-wider">
                Quick start
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3">
                {[
                  { n: "1", t: "Install", c: "npm install -g @getmikk/cli" },
                  { n: "2", t: "Snapshot", c: "mikk init" },
                  { n: "3", t: "Connect", c: "mikk mcp install" },
                ].map((s) => (
                  <div
                    key={s.n}
                    className="p-4 border-b border-border/60 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center justify-center size-6 rounded-md border border-border/60 bg-muted/20 text-xs text-muted-foreground font-semibold tabular-nums">
                        {s.n}
                      </span>
                      <span className="text-sm font-semibold">{s.t}</span>
                    </div>
                    <div className="flex items-center h-10 rounded-lg border border-border/60 bg-background/60 overflow-hidden">
                      <span className="pl-3 pr-2 font-mono text-xs text-muted-foreground/50">$</span>
                      <span className="font-mono text-xs text-foreground/80 pr-2 truncate">{s.c}</span>
                      <CopyCommand value={s.c} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Read the docs <ChevronRight className="size-4" />
              </Link>
              <Link
                href="/docs/reference/mcp"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/30 transition-colors"
              >
                MCP setup <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        ),
      },
      {
        id: "before-after",
        badges: [{ label: "Before / After", tone: "primary" }, { label: "Grounded" }],
        title: (
          <>
            Before you edit,
            <br />
            ask the <span className="italic text-primary">middleman</span>.
          </>
        ),
        body: (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-4 text-left">
            <div className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur overflow-hidden shadow-sm shadow-black/5 dark:shadow-black/30">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20 text-xs font-mono text-muted-foreground">
                Without Mikk
              </div>
              <div className="p-4 font-mono text-[13px] leading-6 text-muted-foreground/80 space-y-2">
                <div className="text-foreground/80">User:</div>
                <div>Change src/auth/login.ts to add rate limiting.</div>
                <div className="pt-2 text-foreground/80">Assistant:</div>
                <div>
                  I&apos;ll update <span className="text-foreground/70">src/auth/rateLimit.ts</span> and import it into{" "}
                  <span className="text-foreground/70">login.ts</span>.
                </div>
                <div className="text-destructive">Problem: wrong file paths. Missed dependents and constraints.</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur overflow-hidden shadow-sm shadow-black/5 dark:shadow-black/30">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20 text-xs font-mono text-muted-foreground">
                With Mikk (via MCP)
              </div>
              <div className="p-4 font-mono text-[13px] leading-6 text-muted-foreground/80 space-y-2">
                <div className="text-foreground/80">User:</div>
                <div>Change src/auth/login.ts to add rate limiting.</div>
                <div className="pt-2 text-foreground/80">Assistant:</div>
                <div className="text-foreground/80">Calls:</div>
                <div className="text-muted-foreground/70">mikk_before_edit(["src/auth/login.ts"]) {"->"} risks + constraints</div>
                <div className="text-muted-foreground/70">mikk_impact_analysis({"{"} file: "src/auth/login.ts" {"}"}) {"->"} blast radius</div>
                <div className="text-muted-foreground/70">mikk_get_changes() {"->"} what changed since analysis</div>
                <div className="text-green-600 dark:text-green-400">Result: correct scope, correct dependencies, safer edits.</div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "matrix",
        badges: [{ label: "Matrix", tone: "primary" }, { label: "What scales" }],
        title: (
          <>
            What scales
            <br />
            when the repo <span className="italic text-primary">keeps changing</span>.
          </>
        ),
        body: (
          <div className="mt-10 max-w-4xl mx-auto">
            <div className="sm:hidden mb-3 text-xs text-muted-foreground font-mono">
              Tip: swipe the table sideways.
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur overflow-hidden shadow-sm shadow-black/5 dark:shadow-black/30">
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[1.4fr_.8fr_.8fr_.8fr] bg-muted/20 border-b border-border/60">
                    <div className="p-4 text-xs font-semibold text-muted-foreground">Capability</div>
                    <div className="p-4 text-xs font-semibold text-muted-foreground text-center">Paste code</div>
                    <div className="p-4 text-xs font-semibold text-muted-foreground text-center">Paste lock</div>
                    <div className="p-4 text-xs font-semibold text-foreground text-center">Mikk tools</div>
                  </div>
                  {(
                    [
                      { label: "Stays current as files are added/renamed", paste: "no", rag: "partial", mikk: "yes" },
                      { label: "Answers dependents / impact on demand", paste: "no", rag: "partial", mikk: "yes" },
                      { label: "Before-edit safety check (constraints + risk)", paste: "no", rag: "no", mikk: "yes" },
                      { label: "Drift warning when snapshot is stale", paste: "no", rag: "no", mikk: "yes" },
                      { label: "Token budget context (BFS-traced)", paste: "no", rag: "partial", mikk: "yes" },
                      { label: "Works via MCP (no prompt gymnastics)", paste: "no", rag: "no", mikk: "yes" },
                    ] as Array<{ label: string; paste: MatrixCell; rag: MatrixCell; mikk: MatrixCell }>
                  ).map((r) => (
                    <div
                      key={r.label}
                      className="grid grid-cols-[1.4fr_.8fr_.8fr_.8fr] border-b border-border/60 last:border-b-0"
                    >
                      <div className="p-4 text-sm text-foreground/80">{r.label}</div>
                      <div className="p-4 flex items-center justify-center">
                        <MatrixIcon v={r.paste} />
                      </div>
                      <div className="p-4 flex items-center justify-center">
                        <MatrixIcon v={r.rag} />
                      </div>
                      <div className="p-4 flex items-center justify-center">
                        <MatrixIcon v={r.mikk} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "tools",
        badges: [{ label: "Tools", tone: "primary" }, { label: "MCP" }, { label: "Callable" }],
        title: (
          <>
            Ask the questions
            <br />
            that prevent <span className="italic text-primary">breakage</span>.
          </>
        ),
        subtitle: "The lock file can be big. Let tools answer only what the assistant needs, right now.",
        body: (
          <div className="mt-10 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
            {[
              { name: "mikk_before_edit", desc: "Safety check: blast radius, exported APIs at risk, constraints, warnings." },
              { name: "mikk_impact_analysis", desc: "Blast radius of changing a file, with risk breakdown." },
              { name: "mikk_get_changes", desc: "What changed since the last analysis (the drift list)." },
              { name: "mikk_query_context", desc: "Graph-traced, token-budgeted context for a specific question." },
              { name: "mikk_find_usages", desc: "Everything that calls a function (rename safely)." },
              { name: "mikk_get_session_context", desc: "One-shot session start: overview, changes, hot modules, constraints." },
            ].map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur p-5 shadow-sm shadow-black/5 dark:shadow-black/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-foreground/85">{t.name}</div>
                    <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{t.desc}</div>
                  </div>
                  <span className="shrink-0 inline-flex items-center rounded-md px-2 py-1 text-[11px] border border-border/60 bg-muted/20 text-muted-foreground">
                    MCP
                  </span>
                </div>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "local",
        badges: [{ label: "Local-first", tone: "primary" }, { label: "Fast" }, { label: "Private" }],
        title: (
          <>
            Answers are fast
            <br />
            because the work is <span className="italic text-primary">precomputed</span>.
          </>
        ),
        body: (
          <div className="mt-10 max-w-3xl mx-auto text-left">
            <div className="rounded-2xl border border-border/60 bg-background/65 backdrop-blur overflow-hidden shadow-sm shadow-black/5 dark:shadow-black/30">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/20">
                <span className="size-2.5 rounded-full bg-red-400/50" />
                <span className="size-2.5 rounded-full bg-yellow-400/50" />
                <span className="size-2.5 rounded-full bg-green-400/50" />
                <span className="ml-3 text-xs font-mono text-muted-foreground">bash</span>
              </div>
              <div className="p-4 font-mono text-sm space-y-1 text-muted-foreground/80">
                {[
                  { c: "fg", t: "$ mikk init" },
                  { c: "dim", t: "  Scanning TypeScript files..." },
                  { c: "ok", t: "  OK 2,847 functions parsed" },
                  { c: "dim", t: "  Building dependency graph..." },
                  { c: "ok", t: "  OK 3,201 nodes - 9,442 edges" },
                  { c: "dim", t: "  Merkle hashing..." },
                  { c: "ok", t: "  OK SHA-256 root: a3f82c..." },
                  { c: "dim", t: "  Writing artifacts..." },
                  { c: "ok", t: "  OK mikk.lock.json  (-60% vs raw)" },
                  { c: "ok", t: "  OK claude.md + AGENTS.md" },
                  { c: "hi", t: "  Done in 3.1s." },
                ].map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.c === "fg"
                        ? "text-foreground"
                        : l.c === "ok"
                          ? "text-green-600 dark:text-green-400"
                          : l.c === "hi"
                            ? "text-foreground font-semibold"
                            : "text-muted-foreground/50"
                    }
                  >
                    {l.t}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
              No API keys. No uploads. MCP tools read from mikk.lock.json and include a warning when the snapshot is drifted.
            </p>
          </div>
        ),
      },
      {
        id: "cta",
        badges: [{ label: "Get started", tone: "primary" }, { label: "Docs" }, { label: "GitHub" }],
        title: (
          <>
            Stop guessing.
            <br />
            Ask <span className="italic text-primary">before you edit</span>.
          </>
        ),
        subtitle: "Keep your snapshot fresh, then let the assistant query dependents, impact, and constraints on demand.",
        body: (
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="flex items-center h-11 rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
              <span className="pl-4 pr-2 font-mono text-sm text-muted-foreground/50">$</span>
              <span className="font-mono text-sm text-foreground/80 pr-2">npm install -g @getmikk/cli</span>
              <CopyCommand value="npm install -g @getmikk/cli" />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Read the docs <ChevronRight className="size-4" />
              </Link>
              <Link
                href="/docs/reference/mcp"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/30 transition-colors"
              >
                MCP tools <ChevronRight className="size-4" />
              </Link>
              <Link
                href="https://github.com/ansh-dhanani/mikk"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/30 transition-colors"
              >
                View on GitHub <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[index];

  const canPrev = index > 0;
  const canNext = index < total - 1;

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const next = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight" || e.key === " ") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev]);

  const slideVariants = {
    enter: { opacity: 0, y: 10, filter: "blur(6px)" },
    center: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, y: -10, filter: "blur(6px)" },
  };

  return (
    <div className="relative min-h-dvh bg-background text-foreground overflow-x-hidden overflow-y-auto">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[620px] w-[980px] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
        <div
          className={cn(
            "absolute inset-0 opacity-[0.35] dark:opacity-[0.18]",
            "[background-image:linear-gradient(to_right,rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.06)_1px,transparent_1px)]",
            "dark:[background-image:linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)]",
            "[background-size:72px_72px]",
            "[mask-image:radial-gradient(60%_60%_at_50%_0%,black,transparent)]",
          )}
        />
      </div>

      <div className="mx-auto max-w-[88rem] px-6 md:px-10 min-h-dvh flex flex-col">
        <div className="pt-10 md:pt-14 pb-8 md:pb-10 flex items-center justify-center gap-2 flex-wrap">
          {slide.badges.map((b) => (
            <Badge key={b.label} label={b.label} tone={b.tone} />
          ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-start sm:justify-center text-center pt-10 sm:pt-0 pb-[calc(7.25rem+env(safe-area-inset-bottom))] sm:pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className="w-full"
            >
              <h1 className="font-brand-serif text-[clamp(2.65rem,9.2vw,7.25rem)] md:text-[clamp(3.6rem,7vw,7.25rem)] leading-[0.9] md:leading-[0.86] tracking-[-0.045em] font-normal">
                {slide.title}
              </h1>

              {slide.version ? (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <div className="text-primary font-mono text-sm tracking-wide">{slide.version}</div>
                  <div className="h-px w-12 bg-primary/45" />
                </div>
              ) : (
                <div className="mt-6 h-px w-12 bg-primary/35 mx-auto" />
              )}

              {slide.subtitle ? (
                  <div className="mx-auto mt-6 max-w-[52ch] text-[1.15rem] md:text-[1.35rem] leading-relaxed text-muted-foreground">
                    {slide.subtitle}
                  </div>
                ) : null}

              {slide.body ? <div className="mt-8">{slide.body}</div> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <DeckNav
        index={index}
        total={total}
        canPrev={canPrev}
        canNext={canNext}
        prev={prev}
        next={next}
      />
    </div>
  );
}
