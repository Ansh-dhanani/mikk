// source.config.ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";
import { remarkNpm } from "fumadocs-core/mdx-plugins";
import rehypeSlug from "rehype-slug";
import { transformerNotationDiff, transformerNotationHighlight } from "@shikijs/transformers";
var { docs, meta } = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      extractLinkReferences: true
    }
  }
});
var source_config_default = defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: "github-light",
        dark: "github-dark"
      },
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight()
      ]
    },
    rehypePlugins: [rehypeSlug],
    remarkPlugins: [[remarkNpm, { persist: { id: "package-manager" } }]]
  }
});
export {
  source_config_default as default,
  docs,
  meta
};
