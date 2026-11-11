import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/app/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareerOS",
  description: "Track your technical-interview study time.",
  // LAND-07: app pages stay out of search results; /privacy opts back in, the landing page
  // is not rendered by this layout.
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers renders every page per request, which the nonce-based CSP requires
  // (SEC-09): a statically built page would have no nonce and its scripts would be blocked.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // next-themes sets the theme class before hydration.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
