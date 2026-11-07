"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import { type ReactNode, useState } from "react";

/**
 * Light / Dark / System (DASH-03). The nonce lets next-themes' inline script pass the CSP.
 * It is pinned to the first render: a client refresh (router.refresh) brings a *new* request
 * nonce, which the document's CSP — set once per page load — would reject. No
 * `disableTransitionOnChange`: it injects a <style> element at runtime.
 */
export function ThemeProvider({
  nonce,
  children,
}: {
  nonce: string | undefined;
  children: ReactNode;
}) {
  const [pinnedNonce] = useState(nonce);
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      {...(pinnedNonce ? { nonce: pinnedNonce } : {})}
    >
      {children}
    </NextThemes>
  );
}
