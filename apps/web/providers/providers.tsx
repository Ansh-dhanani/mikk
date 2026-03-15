import React from "react";
import { RootLayout } from "./fuma-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <RootLayout>{children}</RootLayout>;
}
