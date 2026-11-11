// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sidebar, SidebarItem, SidebarProvider, SidebarTrigger } from "./sidebar";

function mockViewport(mobile: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

function renderShell(defaultOpen = true) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar label="Main navigation">
        <SidebarItem href="/dashboard" label="Dashboard" icon={<LayoutDashboard />} active />
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  // biome-ignore lint/suspicious/noDocumentCookie: resetting the test document
  document.cookie = "sidebar_state=; max-age=0; path=/";
});
afterEach(cleanup);

describe("app sidebar (DASH-01, DASH-02)", () => {
  it("DASH-01 collapses to icons and persists the state in a cookie", () => {
    mockViewport(false);
    renderShell();
    const aside = screen.getByRole("complementary", { name: "Main navigation" });
    expect(aside.dataset.state).toBe("expanded");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(aside.dataset.state).toBe("collapsed");
    expect(document.cookie).toContain("sidebar_state=false");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(aside.dataset.state).toBe("expanded");
    expect(document.cookie).toContain("sidebar_state=true");
  });

  it("DASH-01 starts collapsed when the cookie says so; the label stays available to screen readers", () => {
    mockViewport(false);
    renderShell(false);
    const aside = screen.getByRole("complementary", { name: "Main navigation" });
    expect(aside.dataset.state).toBe("collapsed");
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link.getAttribute("aria-current")).toBe("page");
  });

  it("DASH-02 below md the trigger opens a drawer", async () => {
    mockViewport(true);
    renderShell();
    fireEvent.click(await screen.findByRole("button", { name: "Open menu" }));
    expect(await screen.findByRole("dialog", { name: "Main navigation" })).toBeTruthy();
  });
});
