import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkNpm } from 'fumadocs-core/mdx-plugins';
import rehypeSlug from 'rehype-slug';
import { transformerNotationDiff, transformerNotationHighlight } from '@shikijs/transformers';

export const { docs, meta } = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      extractLinkReferences: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark:  'github-dark',
      },
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight(),
      ],
    },
    rehypePlugins: [rehypeSlug],
    remarkPlugins: [[remarkNpm, { persist: { id: "package-manager" } }]],
  },
});
