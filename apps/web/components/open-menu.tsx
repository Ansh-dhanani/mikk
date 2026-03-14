"use client";

import * as React from "react";
import {
  Github,
  FileText,
  Sparkles,
  MessageSquare,
  SquareTerminal,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

interface OpenMenuProps {
  rawContent: string;
  absolutePath: string;
  relativePath: string;
  slug: string;
}

export function OpenMenu({ absolutePath, relativePath, slug }: OpenMenuProps) {
  const pageUrl = `${siteConfig.baseUrl}/docs/${slug}`;
  const prompt = encodeURIComponent(`Read ${pageUrl}, I want to ask questions about it.`);
  const githubUrl = `${siteConfig.github}/blob/main/${relativePath}`;

  const items = [
    { label: "Open in GitHub", icon: Github, href: githubUrl },
    { label: "View as Markdown", icon: FileText, href: `${siteConfig.baseUrl}/docs/${slug}.mdx` },
    null,
    { label: "Open in Scira AI", icon: Sparkles, href: `https://scira.app/new?q=${prompt}` },
    { label: "Open in ChatGPT", icon: MessageSquare, href: `https://chatgpt.com/?q=${prompt}` },
    { label: "Open in Claude", icon: MessageSquare, href: `https://claude.ai/new?q=${prompt}` },
    null,
    { label: "Open in Cursor", icon: SquareTerminal, href: `cursor://file/${absolutePath}`, noExternal: true },
  ] as const;

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-md",
          "text-xs font-medium font-mono",
          "border border-border/60 bg-muted/10",
          "text-muted-foreground hover:text-foreground hover:bg-muted/30 hover:border-border",
          "transition-colors duration-150 outline-none",
          "data-[state=open]:bg-muted/30 data-[state=open]:border-border data-[state=open]:text-foreground"
        )}>
          Open <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[200px] overflow-hidden p-1",
            "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=bottom]:slide-in-from-top-2"
          )}
        >
          {items.map((item, i) =>
            item === null ? (
              <DropdownMenuPrimitive.Separator
                key={i}
                className="my-1 h-px bg-border/50 -mx-1"
              />
            ) : (
              <DropdownMenuPrimitive.Item key={item.label} asChild>
                <a
                  href={item.href}
                  target={"noExternal" in item ? undefined : "_blank"}
                  rel={"noExternal" in item ? undefined : "noopener noreferrer"}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md",
                    "text-sm text-foreground/80 cursor-pointer",
                    "hover:bg-muted hover:text-foreground",
                    "focus:bg-muted focus:text-foreground focus:outline-none",
                    "transition-colors duration-100 [&_svg]:shrink-0"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 font-sans font-normal">{item.label}</span>
                  {"noExternal" in item
                    ? null
                    : <ExternalLink className="h-3 w-3 text-muted-foreground/40" />
                  }
                </a>
              </DropdownMenuPrimitive.Item>
            )
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
