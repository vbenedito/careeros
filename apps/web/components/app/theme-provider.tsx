"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/** Light / Dark / System (DASH-03). The nonce lets next-themes' inline script pass the CSP. */
export function ThemeProvider({
  nonce,
  children,
}: {
  nonce: string | undefined;
  children: ReactNode;
}) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...(nonce ? { nonce } : {})}
    >
      {children}
    </NextThemes>
  );
}
