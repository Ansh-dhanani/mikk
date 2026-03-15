import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/lib/site-config";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const fontSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

const baseUrl = (
  siteConfig.baseUrl.startsWith("http") ? siteConfig.baseUrl : `https://${siteConfig.baseUrl}`
).replace(/\/$/, "");
const ogImage = `${baseUrl}/logo.png`;
const defaultTitle = "Mikk - Codebase Intelligence for AI";
const defaultDescription =
  "The codebase nervous system. Parses your architecture, maps every dependency, and delivers the exact context your AI needs. Zero cloud. Zero config. Zero hallucination.";
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Mikk",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Cross-platform",
  image: ogImage,
  url: baseUrl,
  description: defaultDescription,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Person",
    name: "Ansh Dhanani",
    url: "https://github.com/ansh-dhanani",
  },
  publisher: {
    "@type": "Organization",
    name: "Mikk",
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  applicationName: "Mikk",
  title: {
    default: defaultTitle,
    template: "%s - Mikk",
  },
  description: defaultDescription,
  keywords: [
    "mikk",
    "codebase intelligence",
    "ai context",
    "mcp server",
    "dependency graph",
    "monorepo",
    "typescript",
    "ast parsing",
    "software architecture map",
    "llm tools",
    "impact analysis",
    "developer productivity",
  ],
  authors: [{ name: "Ansh Dhanani", url: "https://github.com/ansh-dhanani" }],
  creator: "Ansh Dhanani",
  publisher: "Mikk",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: defaultTitle,
    description:
      "Your AI doesn't understand your codebase. Mikk fixes that. Parse, graph, hash, and serve your entire architecture to any AI assistant.",
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "Mikk",
    images: [
      {
        url: ogImage,
        width: 512,
        height: 512,
        alt: "Mikk logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: siteConfig.twitter,
    title: defaultTitle,
    description:
      "Your AI doesn't understand your codebase. Mikk fixes that.",
    images: [ogImage],
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
        fontMono.variable,
        fontSerif.variable
      )}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      {/* Ignore hydration mismatches caused by browser extensions adding attributes (e.g. cz-shortcut-listen). */}
      <body className="min-h-dvh" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
