// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCEMENT_KEY } from "@/lib/problems/announcement";
import { ProblemsAnnouncement } from "./problems-announcement";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stubStorage = (storage: Partial<Storage> | "throws") => {
  const value =
    storage === "throws"
      ? {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        }
      : storage;
  vi.spyOn(window, "localStorage", "get").mockReturnValue(value as Storage);
};

describe("DASH-18 announcement card", () => {
  it("DASH-18 PRB-13 shows the text, a link to Settings and Dismiss", async () => {
    stubStorage({ getItem: () => null, setItem: () => {} });
    await act(async () => void render(<ProblemsAnnouncement />));
    expect(screen.getByText("New: see your time per LeetCode problem.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Turn on in Settings" }).getAttribute("href")).toBe(
      "/settings#problems",
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("DASH-18 Dismiss hides it and writes the localStorage flag", async () => {
    const setItem = vi.fn();
    stubStorage({ getItem: () => null, setItem });
    await act(async () => void render(<ProblemsAnnouncement />));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(setItem).toHaveBeenCalledWith(ANNOUNCEMENT_KEY, "1");
    expect(screen.queryByTestId("problems-announcement")).toBeNull();
  });

  it("DASH-18 a dismissed card stays hidden on the next visit", async () => {
    stubStorage({ getItem: (k: string) => (k === ANNOUNCEMENT_KEY ? "1" : null) });
    await act(async () => void render(<ProblemsAnnouncement />));
    expect(screen.queryByTestId("problems-announcement")).toBeNull();
  });

  it("DASH-18 without usable storage the card shows and Dismiss hides it until reload", async () => {
    stubStorage("throws");
    await act(async () => void render(<ProblemsAnnouncement />));
    expect(screen.getByTestId("problems-announcement")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("problems-announcement")).toBeNull();
  });
});
