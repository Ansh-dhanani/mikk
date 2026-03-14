"use client";

import { ChevronRight, FileText, Hash, Search as SearchIcon, CornerDownRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useDocsSearch } from "fumadocs-core/search/client";
import {
  SearchDialog as SearchDialogPrimitive,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  SearchDialogListItem,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { cn } from "@/lib/utils";
import type { ReactSortedResult } from "fumadocs-core/search";

export type SearchItemType =
  | (ReactSortedResult & {
      external?: boolean;
    })
  | {
      id: string;
      type: "action";
      onSelect: () => void;
      node: ReactNode;
    };

export function SearchDialog(props: SharedProps) {
  const { search, setSearch, query } = useDocsSearch({
    type: "fetch",
  });

  return (
    <SearchDialogPrimitive 
      search={search} 
      onSearchChange={setSearch} 
      isLoading={query.isLoading} 
      {...props}
    >
      <SearchDialogOverlay className="bg-black/60 backdrop-blur-md" />
      <SearchDialogContent className="max-w-2xl border-border/40 bg-popover shadow-2xl rounded-2xl overflow-hidden mt-[8vh]">
        <SearchDialogHeader className="p-4 border-b border-border/40 flex items-center gap-4 bg-muted/20">
          <SearchIcon className="h-4.5 w-4.5 text-muted-foreground/40" />
          <SearchDialogInput 
            placeholder="Search documentation..." 
            className="flex-1 bg-transparent border-none focus:outline-none font-mono text-sm placeholder:text-muted-foreground/30 text-foreground/90 selection:bg-primary/20"
          />
          <kbd className="font-mono text-[9px] border border-border/40 px-1.5 py-0.5 rounded-md text-muted-foreground/50 bg-muted">ESC</kbd>
        </SearchDialogHeader>

        <SearchDialogList
          items={query.data !== "empty" ? query.data : null}
          className="p-2"
          Item={({ item, onClick }) => (
            <SearchItem item={item as SearchItemType} onClick={onClick} />
          )}
        />
        
        <div className="border-t border-border/40 px-5 py-3 bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-5 text-[9px] font-mono text-muted-foreground/40 uppercase tracking-[0.1em]">
             <span className="flex items-center gap-1.5"><kbd className="border border-border/40 px-1 rounded bg-muted">↑↓</kbd> Navigate</span>
             <span className="flex items-center gap-1.5"><kbd className="border border-border/40 px-1 rounded bg-muted">↵</kbd> Select</span>
          </div>
          <div className="font-mono text-[9px] text-muted-foreground/30 uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary/40" />
            Studio Search v5
          </div>
        </div>
      </SearchDialogContent>
    </SearchDialogPrimitive>
  );
}

function SearchItem({ item, onClick }: { item: SearchItemType; onClick: () => void }) {
  if (item.type === "action") {
    return (
      <SearchDialogListItem item={item} onClick={onClick} className="mx-1 my-0.5 rounded-xl border border-transparent transition-all">
        {item.node}
      </SearchDialogListItem>
    );
  }

  return (
    <SearchDialogListItem
      item={item}
      onClick={onClick}
      className={cn(
        "group relative mx-1 my-1 px-4 py-4 rounded-xl border border-transparent transition-all duration-200",
        "hover:bg-accent/50 hover:border-border/40",
        "data-[active=true]:bg-accent data-[active=true]:border-primary/20 data-[active=true]:shadow-sm"
      )}
      renderMarkdown={(text) => (
        <span 
          className="font-mono text-[13px] leading-relaxed text-foreground/80 block min-w-0"
          dangerouslySetInnerHTML={{ 
            __html: (String(text || "")).replace(/<mark>/g, '<mark class="bg-primary/10 text-primary font-bold rounded-none px-0.5 shadow-none">') 
          }} 
        />
      )}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 overflow-hidden opacity-60 group-data-[active=true]:opacity-90 transition-opacity">
          <div className="flex items-center text-[10px] uppercase font-mono tracking-[0.15em] truncate text-muted-foreground group-data-[active=true]:text-foreground/70">
            {item.breadcrumbs && item.breadcrumbs.length > 0 ? (
              (item.breadcrumbs as ReactNode[]).map((crumb, i) => (
                <Fragment key={i}>
                  {i > 0 && <ChevronRight className="size-3 mx-1 opacity-40 shrink-0" />}
                  <span className="truncate">{crumb}</span>
                </Fragment>
              ))
            ) : (
              <span className="truncate">{item.url.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ")}</span>
            )}
          </div>
        </div>
        
        {item.content && typeof item.content === 'string' && (
          <div className="mt-1 text-[11px] font-mono leading-relaxed text-muted-foreground/50 group-data-[active=true]:text-muted-foreground/70 transition-colors line-clamp-2">
             <div dangerouslySetInnerHTML={{ 
               __html: item.content.replace(/<mark>/g, '<mark class="bg-transparent text-primary/70 font-semibold underline decoration-primary/30 underline-offset-2 shadow-none">') 
             }} />
          </div>
        )}
      </div>
    </SearchDialogListItem>
  );
}
