"use client";

import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { AlignLeft } from "lucide-react";

/* ── CONSTANTS & TYPES ────────────────────────────────── */
export interface TOCItemType {
  title: ReactNode;
  url: string;
  depth: number;
}

export type TableOfContents = TOCItemType[];

const ActiveAnchorContext = createContext<string[]>([]);
const ScrollContext = createContext<RefObject<HTMLElement | null>>({
  current: null,
});

/* ── HOOKS ───────────────────────────────────────────── */
export function useActiveAnchor(): string | undefined {
  return useContext(ActiveAnchorContext)[0];
}

export function useActiveAnchors(): string[] {
  return useContext(ActiveAnchorContext);
}

/* ── PROVIDERS ───────────────────────────────────────── */
export interface AnchorProviderProps {
  toc: TableOfContents;
  single?: boolean;
  children?: ReactNode;
}

export function AnchorProvider({ toc, single = false, children }: AnchorProviderProps) {
  const headings = useMemo(() => {
    return toc.map((item) => item.url.split("#")[1]);
  }, [toc]);

  return (
    <ActiveAnchorContext.Provider value={useAnchorObserver(headings, single)}>
      {children}
    </ActiveAnchorContext.Provider>
  );
}

export interface ScrollProviderProps {
  containerRef: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

export function ScrollProvider({ containerRef, children }: ScrollProviderProps) {
  return <ScrollContext.Provider value={containerRef}>{children}</ScrollContext.Provider>;
}

/* ── COMPONENTS ──────────────────────────────────────── */
export interface TOCItemProps extends Omit<ComponentProps<"a">, "href"> {
  href: string;
}

export function TOCItem({ ...props }: TOCItemProps) {
  const containerRef = useContext(ScrollContext);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const activeAnchors = useActiveAnchors();
  const isActive = activeAnchors.includes(props.href.slice(1));
  const isFirstActive = activeAnchors[0] === props.href.slice(1);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const container = containerRef.current;

    if (container && anchor && isFirstActive) {
      anchor.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [containerRef, isFirstActive]);

  return (
    <a
      ref={anchorRef}
      data-active={isActive}
      className={cn(
        "block py-1.5 pr-4 leading-snug transition-all duration-300 border-l-2 text-[12px]",
        isActive
          ? "text-primary font-semibold border-primary bg-primary/10 pl-4"
          : "text-muted-foreground/30 hover:text-foreground hover:pl-4 border-transparent pl-3",
        props.className
      )}
      {...props}
    >
      {props.children}
    </a>
  );
}

/* ── MAIN TOC COMPONENT ─────────────────────────────── */
export function TOC({ items }: { items: TOCItemType[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="xl:sticky xl:top-0 xl:max-h-screen xl:overflow-auto py-10">
      <div className="flex items-center gap-2.5 mb-6 group px-4">
        <AlignLeft className="h-3.5 w-3.5 text-primary/40 group-hover:text-primary transition-colors" />
        <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">
          On this page
        </span>
      </div>
      <AnchorProvider toc={items}>
        <div className="relative ">
          <ActiveIndicatorWrapper items={items} />
          <ul className="space-y-[4px] relative z-10">
            {items.map((item) => (
              <li key={item.url} data-toc-item={item.url.slice(1)}>
                <TOCItem
                  href={item.url}
                  className={item.depth >= 3 ? "pl-12 text-[11px]" : "pl-9 text-xs"}
                >
                  {item.title}
                </TOCItem>
              </li>
            ))}
          </ul>
        </div>
      </AnchorProvider>
    </div>
  );
}

/* ── INTERNAL HELPERS ────────────────────────────────── */
function ActiveIndicatorWrapper({ items }: { items: TOCItemType[] }) {
  const activeIds = useActiveAnchors();
  return <ActiveIndicator items={items} activeIds={activeIds} />;
}

function ActiveIndicator({ items, activeIds }: { items: TOCItemType[]; activeIds: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [fullPath, setFullPath] = useState("");
  const [dashState, setDashState] = useState({ array: "0 10000", offset: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current || items.length === 0) return;

    const container = containerRef.current;
    const itemEls = items.map((item) =>
      container.parentElement?.querySelector(`[data-toc-item="${item.url.slice(1)}"] a`) as HTMLElement
    );

    if (itemEls.some(el => !el)) return;

    const containerRect = container.getBoundingClientRect();
    const xBase = 4;
    const xIndent = 16;

    let d = "";
    items.forEach((item, i) => {
      const el = itemEls[i];
      const rect = el.getBoundingClientRect();
      const top = rect.top - containerRect.top + (rect.height / 2);
      const targetX = item.depth >= 3 ? xIndent : xBase;

      if (i === 0) {
        d = `M ${targetX} ${top}`;
      } else {
        d += ` L ${targetX} ${top}`;
      }
    });

    setFullPath(d);
  }, [items]);

  useEffect(() => {
    if (!pathRef.current || items.length === 0 || !fullPath || activeIds.length === 0) {
      setDashState({ array: "0 10000", offset: 0 });
      return;
    }

    const pathEl = pathRef.current;
    const totalLength = pathEl.getTotalLength();
    const container = containerRef.current!;
    const containerRect = container.getBoundingClientRect();

    const activeIndices = activeIds
      .map(id => items.findIndex(it => it.url.slice(1) === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (activeIndices.length === 0) return;

    const firstIdx = activeIndices[0];
    const lastIdx = activeIndices[activeIndices.length - 1];

    const getPathLenAtIdx = (idx: number) => {
      const el = container.parentElement?.querySelector(`[data-toc-item="${items[idx].url.slice(1)}"] a`) as HTMLElement;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const targetY = rect.top - containerRect.top + (rect.height / 2);

      let low = 0, high = totalLength;
      for (let j = 0; j < 15; j++) {
        const mid = (low + high) / 2;
        if (pathEl.getPointAtLength(mid).y < targetY) low = mid;
        else high = mid;
      }
      return low;
    };

    const startLen = getPathLenAtIdx(firstIdx);
    const endLen = getPathLenAtIdx(lastIdx);

    setDashState({
      array: `${Math.max(1, endLen - startLen)} ${totalLength}`,
      offset: -startLen
    });

  }, [activeIds, fullPath, items]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-visible">
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        <path
          d={fullPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-border/20"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          ref={pathRef}
          d={fullPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary transition-all duration-500 ease-in-out"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashState.array}
          strokeDashoffset={dashState.offset}
        />
      </svg>
    </div>
  );
}

function useAnchorObserver(watch: string[], single: boolean): string[] {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [activeAnchors, setActiveAnchors] = useState<string[]>([]);
  const stateRef = useRef<{ visible: Set<string> }>({ visible: new Set() });

  const onChange = (entries: IntersectionObserverEntry[]) => {
    const state = stateRef.current;

    for (const entry of entries) {
      if (entry.isIntersecting) {
        state.visible.add(entry.target.id);
      } else {
        state.visible.delete(entry.target.id);
      }
    }

    if (state.visible.size === 0) {
      const viewTop = 100;
      let fallback: string | null = null;
      let minDistance = -1;

      for (const id of watch) {
        const element = document.getElementById(id);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const dist = Math.abs(rect.top - viewTop);
        if (minDistance === -1 || dist < minDistance) {
          minDistance = dist;
          fallback = id;
        }
      }
      setActiveAnchors(fallback ? [fallback] : []);
    } else {
      const items = watch.filter((id) => state.visible.has(id));
      setActiveAnchors(single ? items.slice(0, 1) : items);
    }
  };

  useEffect(() => {
    observerRef.current = new IntersectionObserver(onChange, {
      rootMargin: "-20% 0% -40% 0%",
      threshold: 0,
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const observer = observerRef.current;
    if (!observer) return;
    const elements = watch.flatMap((id) => document.getElementById(id) ?? []);

    for (const el of elements) observer.observe(el);
    return () => {
      for (const el of elements) observer.unobserve(el);
    };
  }, [watch]);

  return activeAnchors;
}