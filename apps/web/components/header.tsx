"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Moon, Sun, Github } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useCallback } from "react";
import { SearchDialog } from "@/components/search-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" />;
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex h-8 w-8 items-center justify-center border border-border/40 bg-muted/5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors rounded-md"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((seg, i) => ({
    label: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));
}

export function Header() {
  const crumbs = useBreadcrumbs();
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSearch]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border/40 bg-background/95 backdrop-blur-md px-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="font-mono text-[11px] flex-nowrap">
              {crumbs.map((crumb, i) => (
                <span key={crumb.href} className="flex items-center gap-1">
                  {i > 0 && <BreadcrumbSeparator className="text-muted-foreground/20" />}
                  <BreadcrumbItem>
                    {crumb.isLast ? (
                      <BreadcrumbPage className="text-foreground/60 truncate max-w-[200px] font-bold uppercase tracking-wider">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.href} className="text-muted-foreground/30 hover:text-primary transition-colors uppercase tracking-wider">{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={openSearch} className="hidden sm:flex h-8 w-48 items-center justify-between border border-border/40 bg-muted/20 px-3 text-muted-foreground/40 transition-all hover:bg-muted/40 hover:text-foreground hover:border-border/60 rounded-md group">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider opacity-70 group-hover:opacity-100"><Search className="h-3 w-3" />Search...</span>
            <kbd className="font-mono text-[9px] border border-border/40 px-1.5 py-0.5 text-muted-foreground/25 bg-muted/30 rounded">⌘K</kbd>
          </button>
          <button onClick={openSearch} className="sm:hidden flex h-8 w-8 items-center justify-center border border-border/40 text-muted-foreground hover:text-primary transition-colors rounded-md">
            <Search className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-border/20 mx-1" />
          <ThemeToggle />
          <Link href="https://github.com/ansh-dhanani/mikk" target="_blank" className="flex h-8 w-8 items-center justify-center border border-border/40 bg-muted/5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors rounded-md" aria-label="GitHub">
            <Github className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
