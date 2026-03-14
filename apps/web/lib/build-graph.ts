import { source } from "@/lib/source";

export interface GraphData {
  nodes: { id: string; title: string; url: string }[];
  links: { source: string; target: string }[];
}

export function buildGraph(): GraphData {
  const pages = source.getPages();
  const nodes = pages.map((page) => ({
    id: page.url,
    title: page.data.title ?? page.url,
    url: page.url,
  }));

  const links: { source: string; target: string }[] = [];

  pages.forEach((page) => {
    // Fumadocs-mdx with extractLinkReferences adds this to structuredData
    // We can also check page.data for links if structuredData isn't populated yet
    const structuredData = (page.data as any).structuredData;
    if (structuredData?.linkReferences) {
      structuredData.linkReferences.forEach((ref: any) => {
        // Find if the reference URL exists in our pages
        const target = pages.find((p) => p.url === ref.url || p.url === ref.url.split("#")[0]);
        if (target && target.url !== page.url) {
          links.push({
            source: page.url,
            target: target.url,
          });
        }
      });
    }
  });

  // Deduplicate links
  const uniqueLinks = links.filter(
    (link, index, self) =>
      index === self.findIndex((l) => l.source === link.source && l.target === link.target)
  );

  return { nodes, links: uniqueLinks };
}
