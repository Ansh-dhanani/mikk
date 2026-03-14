import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import { InlineTOC } from "fumadocs-ui/components/inline-toc";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    // fumadocs-ui handles pre → CodeBlock, code, headings, links natively
    ...defaultMdxComponents,

    // Additional fumadocs-ui components available in MDX files
    Callout,
    Cards,
    Card,
    Files,
    File,
    Folder,
    TypeTable,
    Steps,
    Step,
    Tabs,
    Tab,
    Accordion,
    Accordions,
    ImageZoom,
    InlineTOC,

    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
