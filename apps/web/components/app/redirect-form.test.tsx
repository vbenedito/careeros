// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RedirectForm } from "./redirect-form";

afterEach(cleanup);

const renderSignIn = () =>
  render(
    <RedirectForm
      action="/auth/sign-in"
      name="provider"
      hidden={{ next: "/" }}
      choices={[
        { value: "google", label: "Continue with Google", pendingLabel: "Redirecting to Google…" },
        { value: "github", label: "Continue with GitHub", pendingLabel: "Redirecting to GitHub…" },
      ]}
    />,
  );

/** Submits like a click on `button` would (jsdom does not navigate). */
function submitWith(button: HTMLElement) {
  const form = button.closest("form") as HTMLFormElement;
  const event = new Event("submit", { bubbles: true, cancelable: true }) as SubmitEvent;
  Object.defineProperty(event, "submitter", { value: button });
  act(() => {
    form.dispatchEvent(event);
  });
  return event;
}

describe("redirect form (#93, AUTH-01)", () => {
  it("#93 the clicked provider shows a loading label; both buttons become aria-disabled", () => {
    renderSignIn();
    const github = screen.getByRole("button", { name: "Continue with GitHub" });
    expect(submitWith(github).defaultPrevented).toBe(false); // the browser goes on to submit
    expect(screen.getByRole("button", { name: "Redirecting to GitHub…" })).toBeTruthy();
    for (const b of screen.getAllByRole("button"))
      expect(b.getAttribute("aria-disabled")).toBe("true");
    // Announced to screen readers.
    expect(document.querySelector("[aria-live]")?.textContent).toBe("Redirecting to GitHub…");
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
  });

  it("#93 the submitter keeps its name and value (never `disabled`, which would drop them)", () => {
    renderSignIn();
    const google = screen.getByRole("button", { name: "Continue with Google" });
    submitWith(google);
    const pending = screen.getByRole("button", {
      name: "Redirecting to Google…",
    }) as HTMLButtonElement;
    expect(pending.disabled).toBe(false);
    expect([pending.name, pending.value]).toEqual(["provider", "google"]);
    const next = document.querySelector('input[name="next"]') as HTMLInputElement;
    expect(next.value).toBe("/");
  });

  it("#93 a second submit is cancelled (no double click)", () => {
    renderSignIn();
    submitWith(screen.getByRole("button", { name: "Continue with Google" }));
    const again = submitWith(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(again.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Redirecting to Google…" })).toBeTruthy();
  });

  it("#93 coming back with the Back button (bfcache) resets the buttons", () => {
    renderSignIn();
    submitWith(screen.getByRole("button", { name: "Continue with GitHub" }));
    act(() => {
      const event = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });
    expect(
      screen.getByRole("button", { name: "Continue with GitHub" }).getAttribute("aria-disabled"),
    ).toBe("false");
  });
});
