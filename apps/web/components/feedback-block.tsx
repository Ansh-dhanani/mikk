"use client";

import { useState } from "react";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

type State = "idle" | "rated" | "submitted";

export function FeedbackBlock() {
  // Build GitHub discussions URL
  const repoOwner = process.env.NEXT_PUBLIC_GITHUB_REPO_OWNER || "ansh-dhanani";
  const repoName = process.env.NEXT_PUBLIC_GITHUB_REPO_NAME || "mikk";
  const feedbackCategory = process.env.NEXT_PUBLIC_DOCS_FEEDBACK_CATEGORY || "Docs Feedback";
  const githubDiscussionsUrl = `https://github.com/${repoOwner}/${repoName}/discussions/categories/${encodeURIComponent(feedbackCategory)}`;
  const pathname = usePathname();
  const [state, setState] = useState<State>("idle");
  const [rating, setRating] = useState<"good" | "bad" | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!rating) return;
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, message: message.trim(), path: pathname }),
      });
      if (res.ok) {
        toast.success("Feedback submitted!", {
          description: "Thank you for helping us improve."
        });
        setState("submitted");
      } else {
        toast.error("Feedback submission failed.");
      }
    } catch {
      toast.error("Feedback submission failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleRating(r: "good" | "bad") {
    setRating(r);
    setState("rated");
  }


  if (state === "submitted") {
    return (
      <div className="not-prose mt-12 pt-8 border-t border-fd-border ">
        <p className="text-sm text-fd-muted-foreground">
          Thank you for the feedback!
        </p>
        <a
          href={githubDiscussionsUrl}
          target="_blank"
          rel="noopener noreferrer"
            className="mt-4 inline-block px-4 py-2 rounded-md bg-fd-primary text-fd-primary-foreground text-sm font-medium hover:bg-fd-primary/80 transition"
          >
            View feedback on GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="not-prose mt-12 pt-8 border-t border-fd-border">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-fd-foreground">
          Was this page helpful?
        </p>

        {/* Rating buttons */}
        <div className="flex items-center gap-2">
          <button
            disabled={loading}
            onClick={() => handleRating("good")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm",
              "transition-colors duration-150 disabled:opacity-50",
              rating === "good"
                ? "border-fd-primary/40 bg-fd-primary/10 text-fd-primary"
                : "border-fd-border text-fd-muted-foreground hover:border-fd-primary/30 hover:text-fd-foreground"
            )}
          >
            <ThumbsUp className="size-3.5" />
            Yes
          </button>

          <button
            disabled={loading}
            onClick={() => handleRating("bad")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm",
              "transition-colors duration-150 disabled:opacity-50",
              rating === "bad"
                ? "border-red-400/40 bg-red-400/10 text-red-500 dark:text-red-400"
                : "border-fd-border text-fd-muted-foreground hover:border-red-400/30 hover:text-fd-foreground"
            )}
          >
            <ThumbsDown className="size-3.5" />
            No
          </button>
        </div>

        {/* Comment box and submit button for both ratings */}
        {state === "rated" && rating && (
          <div className="flex flex-col gap-2 mt-1">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                rating === "good"
                  ? "Any additional comments? (optional)"
                  : "What could be improved? (optional)"
              }
              rows={3}
              className={cn(
                "w-full max-w-sm resize-none rounded-md border border-fd-border",
                "bg-fd-background px-3 py-2 text-sm text-fd-foreground",
                "placeholder:text-fd-muted-foreground/50 outline-none",
                "focus:border-fd-primary/40 transition-colors"
              )}
            />
            <button
              disabled={loading}
              onClick={submit}
              className={cn(
                "self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md",
                "border border-fd-border bg-fd-secondary text-fd-secondary-foreground",
                "text-sm transition-colors hover:bg-fd-accent disabled:opacity-50"
              )}
            >
              {loading ? "Submitting…" : "Submit feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
