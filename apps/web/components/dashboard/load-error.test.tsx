// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadError } from "./load-error";

afterEach(cleanup);

describe("DASH-11 error state (#70)", () => {
  it("temporary: explains and offers a retry of the same period", () => {
    render(<LoadError kind="temporary" retryHref="/dashboard?view=month&date=2026-10-01" />);
    expect(screen.getByRole("alert").textContent).toContain("Try again in a moment.");
    const retry = screen.getByRole("link", { name: "Try again" });
    expect(retry.getAttribute("href")).toBe("/dashboard?view=month&date=2026-10-01");
  });

  it("permanent: says a retry won't help and offers none", () => {
    render(<LoadError kind="permanent" retryHref="/dashboard" />);
    expect(screen.getByRole("alert").textContent).toContain("trying again won't help yet");
    expect(screen.queryByRole("link", { name: "Try again" })).toBeNull();
  });
});
