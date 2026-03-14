import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Providers from "@/providers/providers";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Mikk — Codebase Intelligence for AI",
    template: "%s — Mikk",
  },
  description:
    "The codebase nervous system. Parses your architecture, maps every dependency, and delivers the exact context your AI needs. Zero cloud. Zero config. Zero hallucination.",
  keywords: [
    "mikk",
    "codebase intelligence",
    "ai context",
    "mcp server",
    "dependency graph",
    "monorepo",
    "typescript",
    "ast parsing",
  ],
  authors: [{ name: "Ansh Dhanani" }],
  openGraph: {
    title: "Mikk — Codebase Intelligence for AI",
    description:
      "Your AI doesn't understand your codebase. Mikk fixes that. Parse, graph, hash, and serve your entire architecture to any AI assistant.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mikk — Codebase Intelligence for AI",
    description:
      "Your AI doesn't understand your codebase. Mikk fixes that.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable
      )}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
