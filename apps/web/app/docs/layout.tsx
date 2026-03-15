import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import type { ReactNode } from 'react';
import { RootLayout as FumaRootLayout } from "@/providers/fuma-provider";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FumaRootLayout>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <div className="flex items-center gap-2.5 group">
              <div className="h-[14px] w-[14px] bg-primary transition-opacity group-hover:opacity-70" />
              <span className="font-mono text-sm font-bold tracking-tight uppercase">Mikk</span>
            </div>
          ),
        }}
        githubUrl="https://github.com/ansh-dhanani/mikk"
        sidebar={{
          enabled: true,
          collapsible: true,
        }}
      >
        {children}
      </DocsLayout>
    </FumaRootLayout>
  );
}
