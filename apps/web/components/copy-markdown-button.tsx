"use client";

import { FileTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";

interface CopyMarkdownButtonProps {
  rawContent: string;
}

export function CopyMarkdownButton({ rawContent }: CopyMarkdownButtonProps) {
  return (
    <div className="flex items-center">
      <CopyButton
        value={rawContent}
        label="Copy Markdown"
        size="sm"
        variant="secondary"
        className={cn(
          "inline-flex items-center gap-2 h-9 px-3 w-auto",
          "rounded-md border border-border/60 bg-muted/15",
          "text-foreground hover:bg-muted/30 hover:border-border transition-colors duration-150"
        )}
      />
    </div>
  );
}
