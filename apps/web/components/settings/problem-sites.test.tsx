// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProblemSiteRule } from "@/lib/problems/sites";
import { ProblemSites } from "./problem-sites";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: nav.refresh }) }));

let calls: { url: string; init: RequestInit }[] = [];
let reply = { status: 201, body: { id: "00000000-0000-4000-8000-000000000001" } as unknown };
beforeEach(() => {
  calls = [];
  nav.refresh.mockClear();
  reply = { status: 201, body: { id: "00000000-0000-4000-8000-000000000001" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const EXAMPLE =
  "https://www.hellointerview.com/practice/system-design/cmlz26cxp08st08adxvy89hr1?q=non-functional-requirements";
const rule = (patch: Partial<ProblemSiteRule> = {}): ProblemSiteRule => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  domain: "hellointerview.com",
  prefix: ["practice", "system-design"],
  label: "System design",
  hasHistory: true,
  sharesDomain: false,
  ...patch,
});
const view = (rules: ProblemSiteRule[] = [], tracked = ["hellointerview.com"]) =>
  render(<ProblemSites rules={rules} trackedDomains={tracked} />);
const paste = (url: string) => {
  fireEvent.change(screen.getByLabelText("Example address"), { target: { value: url } });
  fireEvent.click(screen.getByRole("button", { name: "Check address" }));
};
const bodies = () => calls.map((c) => JSON.parse(String(c.init.body)));

describe("PSR-12 add a problem site", () => {
  it("PSR-12 PSR-14 the preview shows what is kept and what is never kept, and the rule in words", () => {
    view();
    paste(EXAMPLE);
    expect(screen.getByTestId("preview-keep").textContent).toBe(
      "We will keep: cmlz26cxp08st08adxvy89hr1",
    );
    expect(screen.getByTestId("preview-not-kept").textContent).toContain(
      "We never keep: the rest of the address (?q=non-functional-requirements)",
    );
    expect(screen.getByTestId("proposal").textContent).toContain(
      "Pages under hellointerview.com/practice/system-design/…",
    );
    expect((screen.getByLabelText("Name for this site") as HTMLInputElement).value).toBe(
      "hellointerview.com",
    );
  });

  it("PSR-11 PSR-12 nothing is sent before the confirm, and the request never carries the address", async () => {
    view();
    paste(EXAMPLE);
    expect(calls).toEqual([]);
    const add = screen.getByRole("button", { name: "Add problem site" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Name for this site"), {
      target: { value: "System design" },
    });
    fireEvent.click(add);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe("/api/settings/problem-rules");
    expect(bodies()[0]).toEqual({
      domain: "hellointerview.com",
      prefix: ["practice", "system-design"],
      kind: "id",
      label: "System design",
      confirmedProblemId: true,
    });
    expect(String(calls[0]?.init.body)).not.toContain("cmlz26cx");
    expect(String(calls[0]?.init.body)).not.toContain("non-functional");
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it("PSR-25 a random-looking id shows the warning text; a plain id does not", () => {
    view();
    paste(EXAMPLE);
    expect(screen.getByTestId("personal-data-warning").textContent).toBe(
      "This part of the address may name a person, an account or a private link. Only continue if it names a problem.",
    );
    paste("https://hellointerview.com/problems/two-sum");
    expect(screen.queryByTestId("personal-data-warning")).toBeNull();
    paste("https://hellointerview.com/u/john-doe");
    expect(screen.getByTestId("personal-data-warning")).toBeTruthy();
  });

  it("PSR-25 the confirmation is required and worded as approved", () => {
    view();
    paste(EXAMPLE);
    expect(
      screen.getByLabelText(
        "This part of the address names a problem. It is not a person, an account or a private link.",
      ),
    ).toBeTruthy();
  });

  it("PSR-12 the user can pick another part as the id", () => {
    view([], ["example.com"]);
    paste("https://example.com/a/b/c-1");
    expect(screen.getByTestId("preview-keep").textContent).toContain("c-1");
    fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    expect(screen.getByTestId("preview-keep").textContent).toContain("b");
  });

  it("PSR-12 a site that is not tracked offers to add it, sending only the host", async () => {
    reply = {
      status: 201,
      body: { id: "00000000-0000-4000-8000-000000000009", domain: "example.com" },
    };
    view([], []);
    paste("https://www.example.com/a/b?secret=1");
    expect(screen.getByRole("alert").textContent).toContain("not one of your tracked sites yet");
    fireEvent.click(screen.getByRole("button", { name: "Add example.com as a study site" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe("/api/sites");
    expect(bodies()[0]).toEqual({ domain: "example.com" });
  });

  it("PSR-12 a built-in site and a non-http address are refused with a reason", () => {
    view([], ["leetcode.com"]);
    paste("https://leetcode.com/problems/two-sum");
    expect(screen.getByRole("alert").textContent).toContain("already supported");
    paste("ftp://leetcode.com/x");
    expect(screen.getByRole("alert").textContent).toContain("http://");
  });

  it("PSR-15 PSR-16 the cap and other refusals show their message", async () => {
    reply = { status: 422, body: { error: "LIMIT_REACHED", limit: 5 } };
    view();
    paste("https://hellointerview.com/problems/two-sum");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Add problem site" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "You can add up to 5 problem sites. Remove one to add another.",
      ),
    );
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});

describe("PSR-13 the list and Remove", () => {
  it("PSR-13 built-in sites have no Remove button; user rules show label, domain and prefix", () => {
    view([rule()]);
    const list = screen.getByTestId("problem-site-list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("leetcode.com/problems/…");
    expect(within(items[0] as HTMLElement).queryByRole("button")).toBeNull();
    expect(items[2]?.textContent).toContain("System design");
    expect(items[2]?.textContent).toContain("hellointerview.com/practice/system-design/…");
  });

  it("PSR-12 PSR-13 the extension version note is always shown", () => {
    view([]);
    expect(screen.getByTestId("problem-rules-version-note").textContent).toContain(
      "need CareerOS extension 0.4.0 or later",
    );
    expect(screen.getByText("You haven't added a problem site yet.")).toBeTruthy();
  });

  it("PSR-13 with stored ids Remove asks: keep history, delete history or cancel", async () => {
    reply = { status: 200, body: { id: "00000000-0000-4000-8000-0000000000aa" } };
    view([rule()]);
    fireEvent.click(screen.getByRole("button", { name: "Remove System design" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove and delete history" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe("/api/settings/problem-rules/00000000-0000-4000-8000-0000000000aa");
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(bodies()[0]).toEqual({ deleteHistory: true });
  });

  it("PSR-13 keep history sends deleteHistory false", async () => {
    reply = { status: 200, body: { id: "00000000-0000-4000-8000-0000000000aa" } };
    view([rule()]);
    fireEvent.click(screen.getByRole("button", { name: "Remove System design" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove and keep history" }));
    await waitFor(() => expect(bodies()).toEqual([{ deleteHistory: false }]));
  });

  it("PSR-13 another rule on the domain: the dialog says the history is shared", () => {
    view([rule({ sharesDomain: true })]);
    fireEvent.click(screen.getByRole("button", { name: "Remove System design" }));
    expect(screen.getByRole("dialog").textContent).toContain("share this history");
  });

  it("PSR-13 without stored ids there is no dialog; the rule is removed at once", async () => {
    reply = { status: 200, body: { id: "00000000-0000-4000-8000-0000000000aa" } };
    view([rule({ hasHistory: false })]);
    fireEvent.click(screen.getByRole("button", { name: "Remove System design" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(bodies()).toEqual([{ deleteHistory: false }]));
  });
});

describe("PSR-11 the address cannot leave through a native submit", () => {
  it("PSR-11 the address field has no name and the form posts to # (never a GET with the address)", () => {
    const { container } = view();
    const input = screen.getByLabelText("Example address");
    expect(input.getAttribute("name")).toBeNull();
    const form = container.querySelector("form");
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form?.getAttribute("action")).toBe("#");
  });
});
