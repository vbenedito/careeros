/**
 * /privacy (SEC-13) and the no-analytics rule (SEC-15) against the running dashboard.
 */
import { describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env } from "./helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");

/** Every <script src> on the page. */
const scriptSources = (html: string) =>
  [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1] ?? "");

describe("privacy (integration)", () => {
  it("SEC-13 /privacy is public and covers every required topic", async () => {
    const res = await fetch(`${DASHBOARD_URL}/privacy`, { redirect: "manual" });
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const heading of [
      "Who is responsible",
      "What we collect and why",
      "Legal basis",
      "Who processes it and where",
      "How long we keep it",
      "Your rights",
    ]) {
      expect(html).toContain(heading);
    }
    for (const fact of [
      "article 7",
      "Supabase",
      "Vercel",
      "GitHub",
      "outside Brazil",
      "never sold",
    ]) {
      expect(html).toContain(fact);
    }
  });

  it("SEC-15 no third-party scripts on public or signed-in pages", async () => {
    const email = `privacy-${Date.now()}@example.test`;
    createOAuthUser(email);
    const { header } = await dashboardSession(email);
    for (const [path, cookie] of [
      ["/sign-in", ""],
      ["/privacy", ""],
      ["/", header],
      ["/settings", header],
    ] as const) {
      const html = await (await fetch(`${DASHBOARD_URL}${path}`, { headers: { cookie } })).text();
      for (const src of scriptSources(html)) {
        expect(src, `${path}: ${src}`).toMatch(/^\/_next\//);
      }
    }
  });
});
