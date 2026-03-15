import type { ReactNode } from "react";
import { ThemeProvider } from "@/providers/theme-provider";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  // Keep the marketing/landing bundle lightweight. Docs has its own heavier provider tree.
  return <ThemeProvider>{children}</ThemeProvider>;
}

