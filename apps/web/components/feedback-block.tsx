"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function FeedbackBlock() {
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState<"good" | "bad" | null>(null);

  if (submitted) {
    return (
      <div className="mt-16 p-10 border border-border/40 rounded-2xl bg-muted/20 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center mb-5 border border-primary/20 shadow-[0_0_20px_-10px_var(--primary)]">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-mono font-bold uppercase tracking-wider mb-2 text-foreground/90">Feedback Received</h3>
        <p className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-[0.1em] max-w-xs leading-relaxed">
          Your input has been indexed. This helps us optimize Mikk for everyone.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-20 pt-16 border-t border-border/40">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <CornerDownRight className="size-3.5 text-muted-foreground/60 shrink-0" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
              Was this page helpful?
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setRating("good")}
              className={cn(
                "group flex items-center gap-3 px-5 py-2.5 rounded-lg border font-mono text-[11px] uppercase tracking-wider transition-all duration-200",
                rating === "good"
                  ? "bg-primary border-primary/40 text-primary-foreground shadow-[0_0_15px_-8px_var(--primary)]"
                  : "border-border/40 hover:border-primary/30 text-muted-foreground hover:text-foreground hover:bg-muted/10"
              )}
            >
              <ThumbsUp className={cn("h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5", rating === "good" ? "fill-primary-foreground/20" : "")} />
              <span>Yes</span>
            </button>
            <button
              onClick={() => setRating("bad")}
              className={cn(
                "group flex items-center gap-3 px-5 py-2.5 rounded-lg border font-mono text-[11px] uppercase tracking-wider transition-all duration-200",
                rating === "bad"
                  ? "bg-destructive/10 border-destructive/40 text-destructive shadow-[0_0_15px_-8px_var(--destructive)]"
                  : "border-border/40 hover:border-destructive/30 text-muted-foreground/60 hover:text-foreground hover:bg-muted/10"
              )}
            >
              <ThumbsDown className={cn("h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5", rating === "bad" ? "fill-destructive/20" : "")} />
              <span>No</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative group">
            <textarea
              placeholder="How can we make this better? (Optional)"
              className={cn(
                "w-full min-h-[140px] p-5 rounded-xl border border-border/40 bg-card/50 outline-none transition-all duration-300 font-mono text-[13px] leading-relaxed",
                "focus:border-primary/40 focus:bg-accent/10 text-foreground placeholder:text-muted-foreground/30",
                "resize-none overflow-hidden"
              )}
            />
            <div className="absolute top-0 right-0 p-3 opacity-0 group-focus-within:opacity-100 transition-opacity">
              <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-[0.2em] pointer-events-none">
                Compose Mode
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/40 uppercase tracking-[0.2em]">
              <div className="h-1 w-1 rounded-full bg-primary/60" />
              Studio Indexing Active
            </div>
            <Button
              onClick={() => setSubmitted(true)}
              disabled={!rating}
              className={cn(
                "px-8 h-10 text-[11px] font-mono font-bold uppercase tracking-widest rounded-lg transition-all border border-border/40",
                "bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:grayscale",
                "shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)]"
              )}
            >
              Submit Response
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-16 border-t border-border/10 py-6 flex items-center justify-center opacity-30 hover:opacity-60 transition-opacity">
        <span className="text-[8.5px] font-mono uppercase tracking-[0.3em] flex items-center gap-3 text-muted-foreground">
          Metadata Tracking <span className="text-primary">●</span> Community Powered
        </span>
      </div>
    </div>
  );
}
