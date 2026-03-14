
import { source } from "@/lib/source";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import { CopyMarkdownButton } from "@/components/copy-markdown-button";
import { OpenMenu } from "@/components/open-menu";
import { siteConfig } from "@/lib/site-config";
import { getGithubLastEdit } from "fumadocs-core/content/github";
import { FeedbackBlock } from "@/components/feedback-block";
import { Github } from "lucide-react";
import type { Metadata } from "next";
import path from "path";
import fs from "fs";
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from "fumadocs-ui/page";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  // @ts-expect-error — Fumadocs MDX compiled body
  const MDX = page.data.body;

  let rawContent = "";
  let absolutePathStr = "";
  let relativePathStr = "";
  let slugStr = "";

  try {
    const p = page as unknown as { absolutePath?: string; path: string };
    absolutePathStr = p.absolutePath ?? path.resolve(process.cwd(), p.path);
    relativePathStr = `content/docs/${p.path}`;
    slugStr = (params.slug ?? []).join("/");
    rawContent = fs.readFileSync(absolutePathStr, "utf-8");
  } catch (error) {
    console.warn("Failed to read raw content for page:", params.slug, error);
  }

  const lastUpdate = await getGithubLastEdit({
    owner: "ansh-dhanani",
    repo: "mikk",
    path: relativePathStr,
    token: process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : undefined,
  }).catch(() => null);

  const toc = (page.data as any).toc ?? [];

  return (
    <DocsPage
      toc={toc}
      lastUpdate={lastUpdate ? new Date(lastUpdate) : undefined}
      breadcrumb={{ enabled: true }}
      tableOfContent={{ style: "clerk" }}
    >
      {/* Title + action buttons on the same line */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <DocsTitle>{page.data.title ?? ""}</DocsTitle>
        <div className="flex items-center gap-2 mt-1 shrink-0">
          <CopyMarkdownButton rawContent={rawContent} />
          <OpenMenu
            rawContent={rawContent}
            absolutePath={absolutePathStr}
            relativePath={relativePathStr}
            slug={slugStr}
          />
        </div>
      </div>

      {page.data.description && (
        <DocsDescription>{page.data.description}</DocsDescription>
      )}

      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>

      <div className="mt-6 border-t border-border/5 pt-4">
        <FeedbackBlock />
      </div>

      <footer className="mt-8 mb-4 flex flex-col md:flex-row items-center justify-between gap-3 border-t border-border/5 pt-3">
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
          <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground/50">
            APACHE-2.0 · MIKK v1.7.0
          </span>
        </div>
        <a
          href={siteConfig.github}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40 hover:text-primary transition-all flex items-center gap-2 group"
        >
          View source <Github className="h-3 w-3 transition-transform group-hover:scale-110" />
        </a>
      </footer>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const title = page.data.title;
  const description = page.data.description;
  const url = `${siteConfig.baseUrl}/docs/${(params.slug ?? []).join("/")}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "Mikk",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: siteConfig.twitter,
    },
  };
}
