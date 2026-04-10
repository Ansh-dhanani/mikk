# web — Architecture Overview

## Modules
- **Providers** (`providers`): 5 functions — Root layout; Theme provider; Is typing target
- **Components** (`components`): 190 functions — Code block command; ── tiny copy button that grabs text from the sibling <pre...; ── code block figure shell — adds copy button overlay ──
- **Layout (App)** (`app`): 2 functions — Root layout; Page
- **Utils** (`lib`): 3 functions — Track event; Base options; Cn
- **Layout (App Docs)** (`app-docs`): 1 functions — Docs layout; Page; Generate static params
- **Media & Components** (`components-kibo-ui-image-zoom`): 15 functions — primarily contribution, marquee, image operations across 3 files

## Stats
- 64 files, 219 functions, 6 modules
- Language: typescript

## Tech Stack
Next.js 16.1.6 · React · Tailwind CSS · Radix UI · shadcn/ui · Fumadocs

## Commands
- `npm run dev` — `next dev --turbopack`
- `npm run build` — `next build`
- `npm run start` — `next start`
- `npm run lint` — `eslint`
- `npm run format` — `prettier --write "**/*.{ts,tsx}"`
- `npm run typecheck` — `tsc --noEmit`

## Providers module
**Location:** providers/**
**Purpose:** Root layout; Theme provider; Is typing target

**Entry points:**
  - `ThemeHotkey() [providers/theme-provider.tsx:34]` — Theme hotkey
  - `RootLayout({ children }) [providers/fuma-provider.tsx:4]` — Root layout
  - `providers({ children }) [providers/providers.tsx:6]` — Providers ({ children })
  - `ThemeProvider({ children, ...props }) [providers/theme-provider.tsx:6]` — Theme provider

**Key internal functions:**
  - `isTypingTarget` (called by 1) — Is typing target

## Components module
**Location:** components/**
**Purpose:** Code block command; ── tiny copy button that grabs text from the sibling <pre...; ── code block figure shell — adds copy button overlay ──

**Entry points:**
  - `CopyButton({ value, getValue, event, className, ...props }) [components/copy-button.tsx:33]` — Copy button
  - `Header() [components/header.tsx:49]` — Header
  - `SidebarItem({ item, pathname, depth, onNavigate, }) [components/sidebar.tsx:177]` — ──────────────────────────────────────────────
  - `CollapsibleChevronsIcon() [components/ui/collapsible.tsx:68]` — Collapsible chevrons icon
  - `FormLabel({ className, ...props }) [components/ui/form.tsx:92]` — Form label

**Key internal functions:**
  - `useFormField` (called by 4) — Hook for form field
  - `copyToClipboardWithEvent` (called by 1) — Copy to clipboard with event
  - `useBreadcrumbs` (called by 1) — Use breadcrumbs
  - `getIcon` (called by 1) — Get icon
  - `useCollapsible` (called by 1) — Hook for collapsible

## Layout (App) module
**Location:** app/**
**Purpose:** Root layout; Page

**Entry points:**
  - `RootLayout({ children, }) [app/layout.tsx:50]` — Root layout
  - `Page() [app/page.tsx:106]` — Page

## Utils module
**Location:** lib/**
**Purpose:** Track event; Base options; Cn

**Entry points:**
  - `trackEvent(_event) [lib/events.ts:8]` — Track event
  - `baseOptions() [lib/layout.shared.tsx:2]` — Base options
  - `cn(inputs) [lib/utils.ts:4]` — Cn

## Layout (App Docs) module
**Location:** app/docs/**, app/docs/[[...slug]]/**
**Purpose:** Docs layout; Page; Generate static params

**Entry points:**
  - `DocsLayout({ children }) [app/docs/layout.tsx:5]` — Docs layout

## Media & Components module
**Location:** components/kibo-ui/**
**Purpose:** primarily contribution, marquee, image operations across 3 files

**Entry points:**
  - `ContributionGraphCalendar({ title = "Contribution Graph", hideMonthLabels = false, className, children, ...props }) [components/kibo-ui/contribution-graph/index.tsx:369]` — Contribution graph calendar ({ title = "Contribution Graph", hideMonthLabels = false, className, children, ...props })
  - `ContributionGraph({ data, blockMargin = 4, blockRadius = 2, blockSize = 12, fontSize = 14, labels: labelsProp = undefined, maxLevel: maxLevelProp = 4, style = {}, totalCount: totalCountProp = undefined, weekStart = 0, className, ...props }) [components/kibo-ui/contribution-graph/index.tsx:251]` — Contribution graph ({ data, blockMargin = 4, blockRadius = 2, blockSize = 12, fontSize = 14, labels: labelsProp = undefined, maxLevel: maxLevelProp = 4, style = {}, totalCount: totalCountProp = undefined, weekStart = 0, className, ...props })
  - `ContributionGraphBlock({ activity, dayIndex, weekIndex, className, ...props }) [components/kibo-ui/contribution-graph/index.tsx:323]` — Contribution graph block ({ activity, dayIndex, weekIndex, className, ...props })
  - `ContributionGraphTotalCount({ className, children, ...props }) [components/kibo-ui/contribution-graph/index.tsx:449]` — Contribution graph total count ({ className, children, ...props })
  - `ContributionGraphLegend({ className, children, ...props }) [components/kibo-ui/contribution-graph/index.tsx:478]` — Contribution graph legend ({ className, children, ...props })

**Key internal functions:**
  - `useContributionGraph` (called by 4) — Hook for contribution graph
  - `fillHoles` (called by 1) — Fill holes (activities)
  - `groupByWeeks` (called by 1) — Group by weeks (activities, weekStart)
  - `getMonthLabels` (called by 1) — Get month labels (weeks, monthNames)

## File Import Graph

Which files import which — useful for understanding data flow.

### Components
- `components/code-block-command.tsx` → `components/copy-button.tsx`
- `components/code-tabs.tsx` → `components/base/ui/tabs.tsx`
- `components/command-menu.tsx` → `components/ui/button.tsx`, `components/ui/kbd.tsx`, `components/ui/separator.tsx`
- `components/consent-manager.tsx` → `components/consent-manager-client.tsx`
- `components/copy-button.tsx` → `components/ui/button.tsx`
- `components/mdx copy.tsx` → `components/code-block-command.tsx`, `components/code-tabs.tsx`, `components/copy-button.tsx`
- `components/ui/collapsible.tsx` → `components/animated-icons/chevrons-down-up-icon.tsx`

### Providers
- `providers/providers.tsx` → `providers/fuma-provider.tsx`, `providers/theme-provider.tsx`

## HTTP Routes

### API Routes (Next.js App Router)
- **handler** `/api/search` *(app/api/search/route.ts)*
- **PAGE** `/docs/[:slug*]` *(app/docs/[[...slug]]/page.tsx)*

<!-- MIKK-START -->

<repository_context>
  <name>web</name>
  <stats>
    <files>84</files>
    <functions>260</functions>
    <modules>7</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
<tech_stack>
  <technology>Next.js 16.1.6</technology>
  <technology>React</technology>
  <technology>Tailwind CSS</technology>
  <technology>Radix UI</technology>
  <technology>shadcn/ui</technology>
  <technology>Zod validation</technology>
  <technology>Fumadocs</technology>
  <technology>Motion</technology>
  <technology>Vercel Analytics</technology>
</tech_stack>
<commands>
  <command>
    <run>npm run dev</run>
    <executes>cross-env NEXT_WEBPACK=1 next dev --webpack</executes>
  </command>
  <command>
    <run>npm run build</run>
    <executes>cross-env NEXT_WEBPACK=1 next build --webpack</executes>
  </command>
  <command>
    <run>npm run start</run>
    <executes>next start</executes>
  </command>
  <command>
    <run>npm run lint</run>
    <executes>eslint</executes>
  </command>
  <command>
    <run>npm run format</run>
    <executes>prettier --write &quot;**/*.{ts,tsx}&quot;</executes>
  </command>
  <command>
    <run>npm run typecheck</run>
    <executes>tsc --noEmit</executes>
  </command>
</commands>
  <module id="mesh-apps-web">
    <name>Config & API</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/**</location>
    <purpose>5 files, 0 functions</purpose>
    <entry_points>
      <function signature="CodeChat({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/code-chat.tsx:92]" purpose="Code chat ({...})" />
      <function signature="CodeChat({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/code-chat.tsx:92]" purpose="Code chat ({...})" />
      <function signature="GraphView({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/graph-view.tsx:20]" purpose="Graph view ({...})" />
      <function signature="CommandMenu({...}) [c:/users/ansh/desktop/web/mesh/apps/web/components/command-menu.tsx:156]" purpose="Command menu ({...})" />
      <function signature="FeedbackBlock() [c:/users/ansh/desktop/web/mesh/apps/web/components/feedback-block.tsx:11]" purpose="Feedback block" />
    </entry_points>
    <key_internal_functions>
      <function name="cn" callers="132" purpose="Cn (inputs)" />
      <function name="trackEvent" callers="5" purpose="Track event (properties)" />
      <function name="useFormField" callers="4" purpose="Hook for form field" />
      <function name="useContributionGraph" callers="4" purpose="Hook for contribution graph" />
      <function name="collectDocsRoutes" callers="3" purpose="Collect docs routes (dir)" />
    </key_internal_functions>
  </module>
  <module id="apps-web-providers">
    <name>Providers</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/providers/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="ThemeHotkey() [c:/users/ansh/desktop/web/mesh/apps/web/providers/theme-provider.tsx:34]" purpose="Theme hotkey" />
      <function signature="onKeyDown(event) [c:/users/ansh/desktop/web/mesh/apps/web/providers/theme-provider.tsx:37]" purpose="Handle key down" />
      <function signature="ThemeHotkey() [c:/users/ansh/desktop/web/mesh/apps/web/providers/fuma-provider.tsx:8]" purpose="Theme hotkey" />
      <function signature="onKeyDown(e) [c:/users/ansh/desktop/web/mesh/apps/web/providers/fuma-provider.tsx:11]" purpose="Handle key down" />
      <function signature="RootLayout({...}) [c:/users/ansh/desktop/web/mesh/apps/web/providers/fuma-provider.tsx:32]" purpose="Root layout ({...})" />
    </entry_points>
    <key_internal_functions>
      <function name="isTypingTarget" callers="3" purpose="Check if typing target (target)" />
    </key_internal_functions>
  </module>
  <module id="app-api-analyze-repo">
    <name>API</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/api/analyze-repo/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async POST(request) [c:/users/ansh/desktop/web/mesh/apps/web/app/api/analyze-repo/route.ts:303]" purpose="Post (request)" />
    </entry_points>
    <key_internal_functions>
      <function name="getModuleColor" callers="2" purpose="Get module color (module)" />
      <function name="parseFileForFunctions" callers="1" purpose="Parse file for functions (content, _relativePath)" />
      <function name="analyzeRepoFromGitHub" callers="1" purpose="Analyze repo from git hub (owner, repo)" />
    </key_internal_functions>
  </module>
  <module id="app-api-feedback">
    <name>API & Blog</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async POST(req) [c:/users/ansh/desktop/web/mesh/apps/web/app/api/feedback/route.ts:133]" purpose="Post (req)" />
    </entry_points>
    <key_internal_functions>
      <function name="getOctokit" callers="1" purpose="Get octokit" />
      <function name="getRepoInfo" callers="1" purpose="Get repo info (octokit)" />
      <function name="findDiscussion" callers="1" purpose="Find discussion (octokit, title)" />
    </key_internal_functions>
  </module>
  <module id="app-api-mikk-query">
    <name>API</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/api/mikk-query/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async POST(request) [c:/users/ansh/desktop/web/mesh/apps/web/app/api/mikk-query/route.ts:64]" purpose="Post (request)" />
    </entry_points>
    <key_internal_functions>
      <function name="callMikkTool" callers="1" purpose="Call mikk tool (repoPath, toolName)" />
      <function name="buildNodeContext" callers="1" purpose="Build node context (node)" />
    </key_internal_functions>
  </module>
  <module id="web-app-playground">
    <name>Layout</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/playground/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="PlaygroundPage() [c:/users/ansh/desktop/web/mesh/apps/web/app/playground/page.tsx:727]" purpose="Playground page" />
      <function signature="PlaygroundPage() [c:/users/ansh/desktop/web/mesh/apps/web/app/playground/page.tsx:727]" purpose="Playground page" />
    </entry_points>
    <key_internal_functions>
      <function name="toggleCategory" callers="2" purpose="Toggle category (id)" />
      <function name="copyToClipboard" callers="2" purpose="Copy to clipboard (text, toolId)" />
    </key_internal_functions>
    <depends_on>Config & API</depends_on>
  </module>
  <module id="web-app--marketing-">
    <name>Layout</name>
    <location>c:/users/ansh/desktop/web/mesh/apps/web/app/(marketing)/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="Page() [c:/users/ansh/desktop/web/mesh/apps/web/app/(marketing)/page.tsx:220]" purpose="Page" />
      <function signature="Page() [c:/users/ansh/desktop/web/mesh/apps/web/app/(marketing)/page.tsx:220]" purpose="Page" />
      <function signature="DeckNav({...}) [c:/users/ansh/desktop/web/mesh/apps/web/app/(marketing)/page.tsx:62]" purpose="Deck nav ({...})" />
      <function signature="onKeyDown(e) [c:/users/ansh/desktop/web/mesh/apps/web/app/(marketing)/page.tsx:681]" purpose="Handle key down" />
      <function signature="Badge({...}) [c:/users/ansh/desktop/web/mesh/apps/web/app/(marketing)/page.tsx:40]" purpose="Badge ({...})" />
    </entry_points>
    <depends_on>Config & API</depends_on>
  </module>
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `.env.example` (config)

```example
NEXT_PUBLIC_BASE_URL=http://localhost:3000
GITHUB_TOKEN=ghp_****************************9KRLs
GITHUB_REPO_OWNER=your_name
GITHUB_REPO_NAME=mikk
DOCS_FEEDBACK_CATEGORY=Docs Feedback
```

## File Import Graph

Which files import which — useful for understanding data flow.

### Config & API
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/eslint.config.mjs` → `eslint/config`, `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/next.config.mjs` → `fumadocs-mdx/next`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/middleware.ts` → `next/server`, `fumadocs-core/negotiation`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/source.config.ts` → `fumadocs-mdx/config`, `fumadocs-core/mdx-plugins`, `rehype-slug`, `@shikijs/transformers`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/layout.tsx` → `next/font/google`, `./globals.css`, `@/lib/utils`, `@/components/ui/sonner`, `@/lib/site-config`, `@vercel/analytics/react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/robots.ts` → `@/lib/site-config`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/sitemap.ts` → `@/lib/site-config`, `fs`, `path`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/code-block-command.tsx` → `react`, `@/components/base/ui/tabs`, `@/hooks/use-config`, `./copy-button`, `./icons`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/code-block-figure.tsx` → `react`, `lucide-react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/code-chat.tsx` → `react`, `lucide-react`, `@/components/ui/button`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/code-collapsible-wrapper.tsx` → `@/components/ui/button`, `@/components/ui/collapsible`, `@/components/ui/separator`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/code-tabs.tsx` → `@/hooks/use-config`, `@/lib/utils`, `./base/ui/tabs`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/collapsible-list.tsx` → `lucide-react`, `radix-ui`, `react`, `@/components/ui/button`, `@/components/ui/collapsible`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/command-menu.tsx` → `cmdk`, `lucide-react`, `next/image`, `next/navigation`, `next-themes`, `react`, `react-hotkeys-hook`, `sonner`, `@/components/ui/command`, `@/features/portfolio/data/social-links`, `@/hooks/use-sound`, `@/lib/events`, `@/utils/copy`, `./chanhdai-mark`, `./chanhdai-wordmark`, `./icons`, `./ui/button`, `./ui/kbd`, `./ui/separator`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/consent-manager-client.tsx` → `@c15t/nextjs/client`, `posthog-js`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/consent-manager.tsx` → `@c15t/nextjs`, `@/components/ui/button`, `@/lib/utils`, `./consent-manager-client`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/copy-button.tsx` → `lucide-react`, `framer-motion`, `react`, `@/lib/events`, `@/lib/utils`, `./ui/button`, `class-variance-authority`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/copy-markdown-button.tsx` → `@/lib/utils`, `@/components/copy-button`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/feedback-block.tsx` → `react`, `sonner`, `next/navigation`, `lucide-react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/graph-view.tsx` → `react`, `d3`, `next/navigation`, `@/lib/build-graph`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/header.tsx` → `next/link`, `next/navigation`, `lucide-react`, `next-themes`, `react`, `@/components/search-dialog`, `@/components/ui/breadcrumb`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/markdown.tsx` → `react-markdown`, `rehype-external-links`, `rehype-raw`, `remark-gfm`, `@/config/site`, `@/lib/rehype-add-query-params`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/mdx.tsx` → `fumadocs-ui/mdx`, `fumadocs-ui/components/tabs`, `fumadocs-ui/components/steps`, `fumadocs-ui/components/callout`, `fumadocs-ui/components/card`, `fumadocs-ui/components/files`, `fumadocs-ui/components/type-table`, `fumadocs-ui/components/accordion`, `fumadocs-ui/components/image-zoom`, `fumadocs-ui/components/inline-toc`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/not-found.tsx` → `lucide-react`, `next/link`, `@/components/ui/button`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/open-menu.tsx` → `react`, `lucide-react`, `@/lib/site-config`, `@/lib/utils`, `radix-ui`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/search-dialog.tsx` → `lucide-react`, `react`, `fumadocs-core/search/client`, `fumadocs-ui/components/dialog/search`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/toc.tsx` → `react`, `@/lib/utils`, `lucide-react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/lib/build-graph.ts` → `@/lib/source`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/lib/source.ts` → `collections/server`, `fumadocs-core/source`, `fumadocs-mdx/runtime/server`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/lib/utils.ts` → `clsx`, `tailwind-merge`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/docs/layout.tsx` → `fumadocs-ui/layouts/docs`, `@/lib/source`, `@/providers/fuma-provider`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/animated-icons/chevrons-down-up-icon.tsx` → `framer-motion`, `react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/animated-icons/moon.tsx` → `framer-motion`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/animated-icons/sun-medium.tsx` → `framer-motion`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/landing/copy-command.tsx` → `react`, `lucide-react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/landing/how-it-works.tsx` → `react`, `framer-motion`, `@/lib/utils`, `lucide-react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/breadcrumb.tsx` → `react`, `radix-ui`, `@/lib/utils`, `lucide-react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/button.tsx` → `class-variance-authority`, `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/button_1.tsx` → `class-variance-authority`, `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/collapsible.tsx` → `radix-ui`, `react`, `../animated-icons/chevrons-down-up-icon`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/command.tsx` → `cmdk`, `react`, `@/components/ui/dialog`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/context-menu.tsx` → `lucide-react`, `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/dialog.tsx` → `lucide-react`, `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/dropdown-menu.tsx` → `lucide-react`, `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/form.tsx` → `radix-ui`, `react`, `react-hook-form`, `@/components/ui/label`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/input-group.tsx` → `class-variance-authority`, `react`, `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/textarea`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/input.tsx` → `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/kbd.tsx` → `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/label.tsx` → `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/navigation-menu.tsx` → `react`, `class-variance-authority`, `radix-ui`, `@/lib/utils`, `lucide-react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/scroll-area copy.tsx` → `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/scroll-area.tsx` → `react`, `radix-ui`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/separator.tsx` → `react`, `radix-ui`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/sheet.tsx` → `react`, `radix-ui`, `@/lib/utils`, `@/components/ui/button`, `lucide-react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/sonner.tsx` → `next-themes`, `sonner`, `lucide-react`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/table.tsx` → `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/tabs.tsx` → `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/tag.tsx` → `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/textarea.tsx` → `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/tooltip.tsx` → `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/ui/typography.tsx` → `lucide-react`, `radix-ui`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/api/chat/route.ts` → `next/server`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/api/lock/route.ts` → `next/server`, `fs/promises`, `path`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/api/search/route.ts` → `@/lib/source`, `fumadocs-core/search/server`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/docs/[[...slug]]/page.tsx` → `@/lib/source`, `next/navigation`, `@/components/mdx`, `@/components/copy-markdown-button`, `@/components/open-menu`, `@/lib/site-config`, `fumadocs-core/content/github`, `@/components/feedback-block`, `path`, `fs`, `fumadocs-ui/page`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/base/ui/tabs.tsx` → `@base-ui/react/tabs`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/base/ui/tooltip.tsx` → `@base-ui/react/tooltip`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/kibo-ui/contribution-graph/index.tsx` → `date-fns`, `react`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/kibo-ui/image-zoom/index.tsx` → `react-medium-image-zoom`, `@/lib/utils`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/components/kibo-ui/marquee/index.tsx` → `react-fast-marquee`, `@/lib/utils`

### Providers
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/providers/fuma-provider.tsx` → `fumadocs-ui/provider/next`, `react`, `next-themes`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/providers/providers.tsx` → `react`, `./fuma-provider`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/providers/theme-provider.tsx` → `react`, `next-themes`

### Layout
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/(marketing)/layout.tsx` → `@/providers/theme-provider`
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/(marketing)/page.tsx` → `next/link`, `react`, `framer-motion`, `react-dom`, `next-themes`, `lucide-react`, `@/lib/utils`, `@/components/landing/copy-command`

### Layout
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/playground/page.tsx` → `react`, `lucide-react`, `@/components/ui/button`, `@/components/ui/tag`, `@/components/ui/collapsible`, `@/lib/utils`

### API
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/api/analyze-repo/route.ts` → `next/server`

### API & Blog
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/api/feedback/route.ts` → `next/server`, `octokit`, `zod`

### API
- `C:/Users/Ansh/Desktop/web/Mesh/apps/web/app/api/mikk-query/route.ts` → `next/server`, `child_process`, `util`


## Architectural Decisions
- **Use lib/utils for utilities:** All utility functions should be in lib/utils module
- **Marketing module isolation:** Marketing pages should not access core web functionality

<!-- MIKK-END -->
