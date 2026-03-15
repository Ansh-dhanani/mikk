import { source } from "@/lib/source";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import { CopyMarkdownButton } from "@/components/copy-markdown-button";
import { OpenMenu } from "@/components/open-menu";
import { siteConfig } from "@/lib/site-config";
import { getGithubLastEdit } from "fumadocs-core/content/github";
import { FeedbackBlock } from "@/components/feedback-block";
import type { Metadata } from "next";
import path from "path";
import fs from "fs";
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  let rawContent = "";
  let absolutePathStr = "";
  let relativePathStr = "";
  let slugStr = "";

  try {
    const p = page as unknown as { absolutePath?: string; path: string };
    absolutePathStr =
      p.absolutePath ?? path.resolve(process.cwd(), p.path);
    relativePathStr = `content/docs/${p.path}`;
    slugStr = (params.slug ?? []).join("/");
    rawContent = fs.readFileSync(absolutePathStr, "utf-8");
  } catch {
    // silently skip — Copy Markdown button just shows empty
  }

  const lastUpdate = await getGithubLastEdit({
    owner: "ansh-dhanani",
    repo: "mikk",
    path: relativePathStr,
    token: process.env.GITHUB_TOKEN
      ? `Bearer ${process.env.GITHUB_TOKEN}`
      : undefined,
  }).catch(() => null);

  const toc = (page.data as { toc?: unknown }).toc ?? [];

  return (
    <DocsPage
      toc={toc as never}
      lastUpdate={lastUpdate ? new Date(lastUpdate) : undefined}
      breadcrumb={{ enabled: true }}
      tableOfContent={{ style: "clerk" }}
    >
      {/* ── Header: title + action buttons on same line ── */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <DocsTitle>{page.data.title ?? ""}</DocsTitle>
        <div className="flex items-center gap-2 pt-1 shrink-0">
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

      {/* ── Body: fumadocs-ui owns all prose + spacing ── */}
      <DocsBody>
        <MDX components={getMDXComponents()} />
        <FeedbackBlock />
      </DocsBody>
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
