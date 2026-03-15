// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
    docs: {
      /**
       * extracted references (e.g. hrefs, paths), useful for analyzing relationships between pages.
       */
      extractedReferences: import("fumadocs-mdx").ExtractedReference[];
    },
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "guides/ai-context.mdx": () => import("../content/docs/guides/ai-context.mdx?collection=docs"), "guides/vscode.mdx": () => import("../content/docs/guides/vscode.mdx?collection=docs"), "core/concepts.mdx": () => import("../content/docs/core/concepts.mdx?collection=docs"), "core/installation.mdx": () => import("../content/docs/core/installation.mdx?collection=docs"), "reference/cli.mdx": () => import("../content/docs/reference/cli.mdx?collection=docs"), "reference/config.mdx": () => import("../content/docs/reference/config.mdx?collection=docs"), "reference/contracts.mdx": () => import("../content/docs/reference/contracts.mdx?collection=docs"), "reference/mcp.mdx": () => import("../content/docs/reference/mcp.mdx?collection=docs"), }),
};
export default browserCollections;