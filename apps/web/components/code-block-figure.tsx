"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

/* ── tiny copy button that grabs text from the sibling <pre> ── */
function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label="Copy code"
      onClick={async () => {
        await navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className={cn(
        "absolute top-2.5 right-2.5 z-10",
        "flex items-center justify-center h-7 w-7",
        "border border-border/50 bg-background/80 backdrop-blur-sm",
        "text-muted-foreground hover:text-foreground hover:border-border",
        "opacity-0 group-hover/codeblock:opacity-100 transition-all duration-150"
      )}
    >
      {copied
        ? <CheckIcon className="h-3 w-3 text-primary" />
        : <CopyIcon className="h-3 w-3" />
      }
    </button>
  );
}

/* ── code block figure shell — adds copy button overlay ── */
export function CodeBlockFigure({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  const figRef = useRef<HTMLElement>(null);

  function getRawText() {
    return figRef.current?.querySelector("code")?.textContent ?? "";
  }

  return (
    <figure
      ref={figRef as React.RefObject<HTMLDivElement>}
      className={cn(
        "relative group/codeblock my-5",
        "border border-border/50 overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
      <CopyButton getText={getRawText} />
    </figure>
  );
}
