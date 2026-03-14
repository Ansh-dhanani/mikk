

import { source } from "@/lib/source";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import { TOC } from "@/components/toc";
import { CopyMarkdownButton } from "@/components/copy-markdown-button";
import { OpenMenu } from "@/components/open-menu";
import { siteConfig } from "@/lib/site-config";
import { getGithubLastEdit } from "fumadocs-core/content/github";
import { FeedbackBlock } from "@/components/feedback-block";
import { Github } from "lucide-react";
import type { Metadata } from "next";
import path from "path";
import fs from "fs";

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
  } catch {
    // silently skip
  }

  const lastUpdate = await getGithubLastEdit({
    owner: "ansh-dhanani",
    repo: "mikk",
    path: relativePathStr,
    token: process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : undefined,
  }).catch(() => null);

  return (
    <div className="flex min-h-0 items-start gap-10 xl:gap-14">
      {/* ── Main article ──────────────────────────────── */}
      <article className="flex-1 min-w-0 max-w-[840px]">
        {/* Fumadocs-style page header */}
        <header className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {page.data.title}
            </h1>
            <div className="flex items-center gap-2 shrink-0">
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
            <p className="text-[0.97rem] text-muted-foreground leading-relaxed">
              {page.data.description}
            </p>
          )}
          <hr className="mt-8 border-border/40" />
        </header>

        {/* MDX body — Removing prose classes to avoid conflicts with custom design */}
        <div className="docs-content text-foreground/90">
          <MDX components={getMDXComponents()} />
        </div>

        {/* Feedback Section */}
        <div className="mt-16">
          <FeedbackBlock />
        </div>

        {/* Last Updated Footer */}
        {lastUpdate && (
          <div className="mt-16 pt-8 border-t border-border/40 text-[11px] text-muted-foreground/40 font-mono flex items-center gap-2">
            <Github className="h-3 w-3" />
            <span>
              Last updated on{" "}
              {new Date(lastUpdate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "numeric",
                day: "numeric",
              })}
            </span>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-border/40 flex items-center justify-between gap-4">
          <span className="font-mono text-[11px] text-muted-foreground/30">
            Apache-2.0 · Mikk v1.7.0
          </span>
          <a
            href={siteConfig.github}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-muted-foreground/40 hover:text-primary transition-colors"
          >
            Edit on GitHub →
          </a>
        </footer>
      </article>

      {/* ── TOC sticky right col ── */}
      {/* @ts-expect-error — Fumadocs MDX types */}
      <TOC items={page.data.toc} />
    </div>
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
    alternates: {
      canonical: url,
    },
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
