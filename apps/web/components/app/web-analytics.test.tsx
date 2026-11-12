// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => <div data-testid="analytics" /> }));

import { WebAnalytics } from "./web-analytics";

afterEach(cleanup);

describe("WebAnalytics routes (SEC-15)", () => {
  it("SEC-15 renders on the dashboard, sign-in and privacy", () => {
    for (const p of ["/dashboard", "/sign-in", "/privacy"]) {
      nav.pathname = p;
      const { queryByTestId, unmount } = render(<WebAnalytics />);
      expect(queryByTestId("analytics"), p).not.toBeNull();
      unmount();
    }
  });

  it("SEC-15 renders nothing on /connect, /settings and /auth/*", () => {
    for (const p of ["/connect", "/settings", "/auth/callback"]) {
      nav.pathname = p;
      const { queryByTestId, unmount } = render(<WebAnalytics />);
      expect(queryByTestId("analytics"), p).toBeNull();
      unmount();
    }
  });
});
