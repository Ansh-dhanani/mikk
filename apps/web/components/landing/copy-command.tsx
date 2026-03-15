"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          // trackEvent('copy_success', { value });
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch (err) {
          // trackEvent('copy_failure', { value, error: err });
          // Optionally log error
        }
      }}
      className="p-1.5 rounded hover:bg-border/60 transition-colors text-muted-foreground hover:text-foreground"
      aria-label="Copy"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}
