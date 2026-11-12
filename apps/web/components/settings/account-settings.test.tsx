// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card, CardTitle } from "@/components/ui/card";
import { AccountSettings } from "./account-settings";

afterEach(cleanup);

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
