"use client";

import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { useEffect } from "react";
import { useTheme } from "next-themes";

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== "d") return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      )
        return;
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resolvedTheme, setTheme]);
  return null;
}

export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{
        attribute: "class",
        defaultTheme: "dark",
        enableSystem: false,
        disableTransitionOnChange: true,
      }}
      search={{
        enabled: true,
        options: { type: "fetch" },
      }}
    >
      <ThemeHotkey />
      {children}
    </RootProvider>
  );
}
