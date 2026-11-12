// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFRESH_TIMEOUT_MS, TimeZoneGate, UtcHint } from "./time-zone-sync";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const HINT = "Days are shown in UTC because your time zone couldn't be detected.";

function browserZone(zone: string | undefined) {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: zone,
  } as Intl.ResolvedDateTimeFormatOptions);
}

function renderGate(status: "viewer" | "unresolved" | "fallback") {
  return render(
    <TimeZoneGate status={status} skeleton={<p>skeleton</p>}>
      <UtcHint />
      <p>dashboard</p>
    </TimeZoneGate>,
  );
}

beforeEach(() => {
  refresh.mockReset();
  // biome-ignore lint/suspicious/noDocumentCookie: resetting the test document
  document.cookie = "tz=; max-age=0; path=/";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("DASH-07 time zone (#70)", () => {
  it("first visit: shows the skeleton, not UTC days, while the page refreshes with the zone", () => {
    browserZone("America/Sao_Paulo");
    renderGate("unresolved");
    expect(screen.getByText("skeleton")).toBeTruthy();
    expect(screen.queryByText("dashboard")).toBeNull();
    expect(document.cookie).toContain("tz=America%2FSao_Paulo");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("first visit: if the refresh never arrives, the UTC page is shown with the hint", () => {
    vi.useFakeTimers();
    browserZone("America/Sao_Paulo");
    renderGate("unresolved");
    act(() => vi.advanceTimersByTime(REFRESH_TIMEOUT_MS));
    expect(screen.getByText("dashboard")).toBeTruthy();
    expect(screen.getByText(HINT)).toBeTruthy();
  });

  it("undetectable zone: shows the UTC page with the hint, no refresh", () => {
    browserZone(undefined);
    renderGate("unresolved");
    expect(screen.getByText("dashboard")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toBe(HINT);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("zone the database rejects: shows the hint", () => {
    browserZone("Mars/Olympus");
    // biome-ignore lint/suspicious/noDocumentCookie: test setup
    document.cookie = "tz=Mars%2FOlympus; path=/";
    renderGate("fallback");
    expect(screen.getByText(HINT)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("known zone: no hint, no skeleton, no refresh", () => {
    browserZone("Europe/Lisbon");
    // biome-ignore lint/suspicious/noDocumentCookie: test setup
    document.cookie = "tz=Europe%2FLisbon; path=/";
    renderGate("viewer");
    expect(screen.getByText("dashboard")).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("the viewer moved to another zone: the cookie is updated and the page refreshed once", () => {
    browserZone("Asia/Tokyo");
    // biome-ignore lint/suspicious/noDocumentCookie: test setup
    document.cookie = "tz=Europe%2FLisbon; path=/";
    renderGate("viewer");
    expect(screen.getByText("dashboard")).toBeTruthy();
    expect(document.cookie).toContain("tz=Asia%2FTokyo");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
