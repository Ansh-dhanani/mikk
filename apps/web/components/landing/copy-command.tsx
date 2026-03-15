"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="p-1.5 rounded hover:bg-border/60 transition-colors text-muted-foreground hover:text-foreground"
      aria-label="Copy"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}
