import { siteConfig } from "@/lib/site-config";
import type { MetadataRoute } from "next";
import fs from "fs";
import path from "path";

type RouteInfo = {
  route: string;
  lastModified?: string;
};

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

function mdxFileToRoute(filePath: string): RouteInfo {
  const relative = path.relative(DOCS_DIR, filePath).replace(/\\/g, "/");
  const withoutExt = relative.replace(/\.mdx$/, "");
  const isIndex = path.basename(withoutExt) === "index";
  const routePart = isIndex ? path.dirname(withoutExt) : withoutExt;
  const normalized = routePart === "." ? "" : routePart;
  const stat = fs.statSync(filePath);

  return {
    route: `/docs${normalized ? `/${normalized}` : ""}`,
    lastModified: stat.mtime.toISOString(),
  };
}

function collectDocsRoutes(dir: string = DOCS_DIR): RouteInfo[] {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const routes: RouteInfo[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...collectDocsRoutes(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      routes.push(mdxFileToRoute(fullPath));
    }
  }

  return routes;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (
    siteConfig.baseUrl.startsWith("http") ? siteConfig.baseUrl : `https://${siteConfig.baseUrl}`
  ).replace(/\/$/, "");
  const now = new Date().toISOString();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
  ];

  const docsRoutes: MetadataRoute.Sitemap = collectDocsRoutes().map(({ route, lastModified }) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // De-duplicate in case static entries overlap with docs entries.
  const seen = new Set<string>();
  const allRoutes = [...staticRoutes, ...docsRoutes].filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });

  return allRoutes;
}
