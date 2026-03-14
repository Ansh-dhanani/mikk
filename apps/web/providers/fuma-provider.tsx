"use client";

import type { ReactNode } from 'react';
import { RootProvider } from "fumadocs-ui/provider/next";
import { SearchDialog } from "@/components/search-dialog";

export function RootLayout({ children }: { children: ReactNode }) {
    return (
        <RootProvider search={{ 
            enabled: true,
            SearchDialog
        }}>
            {children}
        </RootProvider>
    );
}