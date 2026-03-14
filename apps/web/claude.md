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


