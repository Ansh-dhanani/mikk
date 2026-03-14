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
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 w-auto",
          "text-xs font-medium font-mono",
          "border border-border/60 bg-muted/10 rounded-none",
          "text-muted-foreground hover:text-foreground hover:bg-muted/30 hover:border-border",
          "transition-colors duration-150"
        )}
      >
        <FileTextIcon className="h-3.5 w-3.5" />
        Copy Markdown
      </CopyButton>
    </div>
  );
}
