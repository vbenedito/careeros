// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sidebar, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeProvider } from "./theme-provider";

afterEach(cleanup);

describe("CSP nonce for runtime styles (SEC-09, #68)", () => {
  it("the mobile drawer's scroll-lock <style> carries the request nonce", async () => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      // next-themes still uses the legacy listener API.
      addListener: () => {},
      removeListener: () => {},
    })) as unknown as typeof window.matchMedia;
    render(
      <ThemeProvider nonce="test-nonce-123">
        <SidebarProvider defaultOpen>
          <Sidebar label="Main navigation">
            <a href="/dashboard">Dashboard</a>
          </Sidebar>
          <SidebarTrigger />
        </SidebarProvider>
      </ThemeProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open menu" }));
    await screen.findByRole("dialog", { name: "Main navigation" });
    const styles = [...document.head.querySelectorAll("style")];
    const lock = styles.filter((s) => s.textContent?.includes("with-scroll-bars-hidden"));
    expect(lock.length).toBeGreaterThan(0);
    for (const style of lock) expect(style.getAttribute("nonce")).toBe("test-nonce-123");
  });
});
