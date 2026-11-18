// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemsSetting } from "./problems-setting";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: nav.refresh }) }));

let calls: { url: string; init: RequestInit }[] = [];
const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }),
  );
const sent = () => calls.map((c) => JSON.parse(String(c.init.body)));

beforeEach(() => {
  calls = [];
  nav.refresh.mockClear();
  respond(200, { enabled: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = (props: { enabled: boolean; stored: boolean; tracked?: boolean }) =>
  render(
    <ProblemsSetting
      enabled={props.enabled}
      hasStoredProblems={props.stored}
      leetcodeTracked={props.tracked ?? true}
    />,
  );
const toggle = () => screen.getByRole("switch", { name: "Track LeetCode problems" });

describe("DASH-16 Track LeetCode problems switch", () => {
  it("DASH-16 shows the switch with the one-line description, off by default", () => {
    view({ enabled: false, stored: false });
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByText(
        "Saves the problem name from LeetCode addresses (like two-sum) with your study time. Nothing else from the address.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/within about 5 minutes/)).toBeTruthy();
  });

  it("PRB-02 turning on saves with PUT and refreshes the page", async () => {
    view({ enabled: false, stored: true });
    fireEvent.click(toggle());
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(calls[0]?.url).toBe("/api/settings/problems");
    expect(calls[0]?.init.method).toBe("PUT");
    expect(sent()).toEqual([{ enabled: true }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("DASH-16 when leetcode.com is not tracked the card says the feature needs it", () => {
    view({ enabled: false, stored: false, tracked: false });
    expect(screen.getByTestId("problems-needs-leetcode").textContent).toContain("leetcode.com");
  });

  it("DASH-16 when leetcode.com is tracked there is no such note", () => {
    view({ enabled: false, stored: false });
    expect(screen.queryByTestId("problems-needs-leetcode")).toBeNull();
  });

  it("DASH-16 a failed save is announced and the switch keeps its state", async () => {
    respond(500, { error: "INTERNAL" });
    view({ enabled: false, stored: false });
    fireEvent.click(toggle());
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't save/);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});

describe("PRB-16 turning off", () => {
  it("PRB-16 without stored slugs the switch turns off with no dialog", async () => {
    respond(200, { enabled: false });
    view({ enabled: true, stored: false });
    fireEvent.click(toggle());
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(sent()).toEqual([{ enabled: false }]);
  });

  it("PRB-16 with stored slugs the dialog asks, with exactly two choices and Cancel", () => {
    view({ enabled: true, stored: true });
    fireEvent.click(toggle());
    const dialog = screen.getByRole("dialog", { name: "Also delete your problem history?" });
    expect(dialog.textContent).toContain(
      "Your study time stays. Only the problem names are deleted.",
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
      expect.arrayContaining([
        "Turn off and keep history",
        "Turn off and delete history",
        "Cancel",
      ]),
    );
    expect(calls).toEqual([]); // nothing is saved until a choice is made
  });

  it("PRB-16 Turn off and keep history sends deleteHistory false", async () => {
    respond(200, { enabled: false });
    view({ enabled: true, stored: true });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Turn off and keep history" }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(sent()).toEqual([{ enabled: false, deleteHistory: false }]);
  });

  it("PRB-16 Turn off and delete history sends deleteHistory true", async () => {
    respond(200, { enabled: false });
    view({ enabled: true, stored: true });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Turn off and delete history" }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(sent()).toEqual([{ enabled: false, deleteHistory: true }]);
  });

  it("PRB-16 Cancel closes the dialog, saves nothing and the switch stays on", async () => {
    view({ enabled: true, stored: true });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toEqual([]);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("PRB-16 Escape cancels like Cancel", async () => {
    view({ enabled: true, stored: true });
    fireEvent.click(toggle());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toEqual([]);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("PRB-16 closing the dialog returns focus to the switch", async () => {
    view({ enabled: true, stored: true });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(toggle()));
  });

  it("PRB-16 the delete choice is the destructive one", () => {
    view({ enabled: true, stored: true });
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "Turn off and delete history" }).className).toContain(
      "bg-destructive",
    );
    expect(
      screen.getByRole("button", { name: "Turn off and keep history" }).className,
    ).not.toContain("bg-destructive");
  });
});
