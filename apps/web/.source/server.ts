// @ts-nocheck
import { default as __fd_glob_12 } from "../content/docs/reference/meta.json?collection=meta"
import { default as __fd_glob_11 } from "../content/docs/guides/meta.json?collection=meta"
import { default as __fd_glob_10 } from "../content/docs/core/meta.json?collection=meta"
import { default as __fd_glob_9 } from "../content/docs/meta.json?collection=meta"
import * as __fd_glob_8 from "../content/docs/reference/mcp.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/reference/contracts.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/reference/config.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/reference/cli.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/core/installation.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/core/concepts.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/guides/vscode.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/guides/ai-context.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/index.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
    docs: {
      /**
       * extracted references (e.g. hrefs, paths), useful for analyzing relationships between pages.
       */
      extractedReferences: import("fumadocs-mdx").ExtractedReference[];
    },
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.doc("docs", "content/docs", {"index.mdx": __fd_glob_0, "guides/ai-context.mdx": __fd_glob_1, "guides/vscode.mdx": __fd_glob_2, "core/concepts.mdx": __fd_glob_3, "core/installation.mdx": __fd_glob_4, "reference/cli.mdx": __fd_glob_5, "reference/config.mdx": __fd_glob_6, "reference/contracts.mdx": __fd_glob_7, "reference/mcp.mdx": __fd_glob_8, });

export const meta = await create.meta("meta", "content/docs", {"meta.json": __fd_glob_9, "core/meta.json": __fd_glob_10, "guides/meta.json": __fd_glob_11, "reference/meta.json": __fd_glob_12, });