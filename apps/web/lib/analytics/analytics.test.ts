import { describe, expect, it } from "vitest";
import { filterAnalyticsEvent } from "./before-send";
import { isAnalyticsEnabled } from "./config";

const view = (url: string) => filterAnalyticsEvent({ type: "pageview" as const, url })?.url ?? null;

describe("isAnalyticsEnabled (SEC-15)", () => {
  it("SEC-15 only on production deployments on Vercel", () => {
    expect(isAnalyticsEnabled({ VERCEL: "1", VERCEL_ENV: "production" })).toBe(true);
    expect(isAnalyticsEnabled({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe(false);
    expect(isAnalyticsEnabled({ VERCEL: "1", VERCEL_ENV: "development" })).toBe(false);
    expect(isAnalyticsEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(isAnalyticsEnabled({})).toBe(false);
  });

  it("SEC-15 off in this test run (local, CI)", () => {
    expect(isAnalyticsEnabled()).toBe(false);
  });
});

describe("filterAnalyticsEvent (SEC-15)", () => {
  it("SEC-15 drops auth routes and the extension handoff", () => {
    for (const url of [
      "https://site.example/auth/callback?code=secret",
      "https://site.example/auth/sign-in",
      "https://site.example/auth",
      "https://site.example/connect",
      "https://site.example/connect?ext=abc",
      "https://site.example/connect/x",
    ]) {
      expect(view(url), url).toBeNull();
    }
  });

  it("SEC-15 drops encoded, mixed-case and double-slash variants of excluded paths", () => {
    expect(view("https://x.example/%61uth/callback?code=1")).toBeNull();
    expect(view("https://x.example/AUTH/callback")).toBeNull();
    expect(view("https://x.example//connect?token=1")).toBeNull();
    expect(view("https://x.example/%E0%A4%A")).toBeNull();
  });

  it("SEC-15 keeps similar-looking paths that are not excluded", () => {
    expect(view("https://site.example/connected")).toBe("https://site.example/connected");
    expect(view("https://site.example/authors")).toBe("https://site.example/authors");
  });

  it("SEC-15 keeps only the dashboard period and utm_* parameters", () => {
    expect(view("https://site.example/dashboard?view=month&date=2026-11-01")).toBe(
      "https://site.example/dashboard?view=month",
    );
    expect(view("https://site.example/?utm_source=x&utm_campaign=launch&ref=me")).toBe(
      "https://site.example/?utm_source=x&utm_campaign=launch",
    );
    expect(view("https://site.example/sign-in?next=%2Fdashboard%3Fdate%3Dx&error=y")).toBe(
      "https://site.example/sign-in",
    );
    expect(view("https://site.example/settings?error=e#frag")).toBe(
      "https://site.example/settings",
    );
  });

  it("SEC-15 keeps the event type and drops unparsable URLs", () => {
    expect(
      filterAnalyticsEvent({ type: "event" as const, url: "https://a.example/p?q=1" }),
    ).toEqual({ type: "event", url: "https://a.example/p" });
    expect(filterAnalyticsEvent({ type: "pageview" as const, url: "not a url" })).toBeNull();
  });
});
