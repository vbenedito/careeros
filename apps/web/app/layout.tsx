import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "CareerOS",
  description: "Track your technical-interview study time.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers renders every page per request, which the nonce-based CSP requires
  // (SEC-09): a statically built page would have no nonce and its scripts would be blocked.
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
