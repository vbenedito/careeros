"use client";

import { setNonce } from "get-nonce";
import { ThemeProvider as NextThemes } from "next-themes";
import { type ReactNode, useState } from "react";

/**
 * Light / Dark / System (DASH-03). The nonce lets next-themes' inline script pass the CSP.
 * It is pinned to the first render: a client refresh (router.refresh) brings a *new* request
 * nonce, which the document's CSP — set once per page load — would reject. No
 * `disableTransitionOnChange`: it injects a <style> element at runtime.
 *
 * The same nonce goes to `get-nonce`, which Radix's scroll lock (dialogs, the mobile sidebar)
 * uses for the <style> element it injects while open; without it the CSP blocks that style.
 */
export function ThemeProvider({
  nonce,
  children,
}: {
  nonce: string | undefined;
  children: ReactNode;
}) {
  const [pinnedNonce] = useState(() => {
    // Browser only: on the server this module state would be shared between requests.
    if (nonce && typeof window !== "undefined") setNonce(nonce);
    return nonce;
  });
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
