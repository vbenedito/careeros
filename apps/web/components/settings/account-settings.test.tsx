// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Card, CardTitle } from "@/components/ui/card";
import { AccountSettings } from "./account-settings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("account settings: delete needs a recent sign-in (AUTH-14)", () => {
  it("AUTH-14 recent sign-in: the Delete account button opens the typed confirmation", () => {
    render(<AccountSettings email="a@example.test" provider="GitHub" recentSignIn />);
    expect(screen.getByRole("button", { name: "Delete account" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sign in again/ })).toBeNull();
  });

  it("AUTH-14 older sign-in: only 'Sign in again' with the account's provider, back to this section", () => {
    const { container } = render(
      <AccountSettings email="a@example.test" provider="GitHub" reauthProviders={["github"]} />,
    );
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    const again = screen.getByRole("button", { name: "Sign in again with GitHub" });
    expect(again.closest("form")?.getAttribute("action")).toBe("/auth/sign-in");
    expect((container.querySelector('input[name="next"]') as HTMLInputElement).value).toBe(
      "/settings#delete-account",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("AUTH-14 refused by the server: the reason is announced", () => {
    render(<AccountSettings email="a@example.test" provider="Google" reauthRequired />);
    expect(screen.getByRole("alert").textContent).toContain("more than 10 minutes ago");
    expect(document.activeElement?.textContent).toBe("Delete account");
    expect(screen.getAllByRole("button", { name: /Sign in again with/ })).toHaveLength(2);
  });
});

describe("Settings heading outline (#78)", () => {
  it("the Account card is an h2 section title and Delete account an h3 below it, styled to match", () => {
    render(
      <>
        <h1>Settings</h1>
        <Card aria-labelledby="account-title">
          <CardTitle id="account-title" variant="section">
            Account
          </CardTitle>
          <AccountSettings email="a@example.test" provider="GitHub" recentSignIn />
        </Card>
      </>,
    );
    const h2 = screen.getByRole("heading", { level: 2, name: "Account" });
    const h3 = screen.getByRole("heading", { level: 3, name: "Delete account" });
    expect(h2.compareDocumentPosition(h3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The section title reads larger than its sub-heading (no "label" h2 above a bolder h3).
    expect(h2.className).toContain("text-base");
    expect(h2.className).toContain("font-semibold");
    expect(h3.className).toContain("text-sm");
    expect(screen.getByRole("region", { name: "Account" })).toBeTruthy();
  });
});

describe("Delete account with an expired session (#78)", () => {
  it("AUTH-03 the API's JSON 401 sends the viewer to sign-in, not to a JSON page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "NOT_AUTHENTICATED" }), { status: 401 }),
      );
    const assign = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { ...window.location, assign });
    render(<AccountSettings email="a@example.test" provider="GitHub" recentSignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Type DELETE to confirm" }), {
      target: { value: "DELETE" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete account" }).at(-1) as HTMLElement,
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/sign-in?next=%2Fsettings%23delete-account"),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url, "http://x").pathname).toBe("/api/account/delete");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("confirm")).toBe("DELETE");
  });

  it("a network failure keeps the dialog open with a message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<AccountSettings email="a@example.test" provider="GitHub" recentSignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Type DELETE to confirm" }), {
      target: { value: "DELETE" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete account" }).at(-1) as HTMLElement,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Check your connection");
  });
});

describe("account settings: delete errors (DASH-14, H6)", () => {
  it("DASH-14 a wrong confirmation and a backend failure show different messages", () => {
    const { unmount } = render(
      <AccountSettings email="a@example.test" provider="Google" recentSignIn deleteMismatch />,
    );
    expect(screen.getByRole("alert").textContent).toContain("confirmation didn't match");
    unmount();
    render(<AccountSettings email="a@example.test" provider="Google" recentSignIn deleteFailed />);
    expect(screen.getByRole("alert").textContent).toBe(
      "We couldn't delete your account right now. Try again in a few minutes.",
    );
  });
});
