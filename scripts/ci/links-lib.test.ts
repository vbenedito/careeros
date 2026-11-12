import { describe, expect, it } from "vitest";
import { checkDocument, extractLinks, headingAnchors, isExternal, slugify } from "./links-lib.ts";

describe("#155 slugify (GitHub-style)", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["4. Quality never goes down", "4-quality-never-goes-down"],
    ["What's new? (v0.2)", "whats-new-v02"],
    [
      "Write backward-compatible migrations: expand → deploy → contract",
      "write-backward-compatible-migrations-expand--deploy--contract",
    ],
    ["snake_case stays", "snake_case-stays"],
    ["Ünïcode Ñame", "ünïcode-ñame"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("#155 headingAnchors", () => {
  it("numbers duplicate headings like GitHub", () => {
    const a = headingAnchors("# A\n## Same\n## Same\n## Same\n");
    expect([...a]).toEqual(["a", "same", "same-1", "same-2"]);
  });
  it("strips inline markup and links from headings", () => {
    const a = headingAnchors("## The `code` and [a link](x.md) *here*\n");
    expect(a.has("the-code-and-a-link-here")).toBe(true);
  });
  it("ignores headings inside code fences and indented 4+ spaces", () => {
    const a = headingAnchors("```sh\n# not a heading\n```\n    # code\n## Real\n");
    expect([...a]).toEqual(["real"]);
  });
  it("accepts explicit HTML anchors", () => {
    expect(headingAnchors('<a name="x"></a>\n').has("x")).toBe(true);
  });
});

describe("#155 extractLinks", () => {
  it("finds inline, image and reference links with line numbers", () => {
    const md = 'a [b](one.md) c\n![i](img/x.png "t")\n[ref]: two.md#h\n';
    expect(extractLinks(md)).toEqual([
      { target: "one.md", line: 1 },
      { target: "img/x.png", line: 2 },
      { target: "two.md#h", line: 3 },
    ]);
  });
  it("skips code spans and fenced blocks", () => {
    expect(extractLinks("`[a](nope.md)`\n```\n[b](nope2.md)\n```\n")).toEqual([]);
  });
  it("classifies external targets", () => {
    expect(isExternal("https://x.dev")).toBe(true);
    expect(isExternal("mailto:a@b.c")).toBe(true);
    expect(isExternal("../a.md#x")).toBe(false);
  });
});

describe("#155 checkDocument", () => {
  const file = "/r/docs/a.md";
  const docs: Record<string, string> = {
    "/r/docs/a.md": "# Top\n## Part two\n",
    "/r/docs/b.md": "# B\n## Section\n",
  };
  const run = (markdown: string, extra = {}) =>
    checkDocument({
      file,
      markdown,
      anchorsOf: (p) => (docs[p] === undefined ? undefined : headingAnchors(docs[p])),
      exists: (p) => p in docs,
      ...extra,
    });

  it("passes valid file, in-file and cross-file anchors", () => {
    expect(run("[x](b.md) [y](#part-two) [z](b.md#section) [w](https://e.com/#nope)")).toEqual([]);
  });
  it("reports a missing file", () => {
    expect(run("[x](missing.md)")).toMatchObject([{ reason: "file does not exist", line: 1 }]);
  });
  it("reports a missing in-file anchor", () => {
    expect(run("[x](#nope)")).toMatchObject([{ reason: "no heading for #nope" }]);
  });
  it("reports a missing cross-file anchor", () => {
    expect(run("[x](b.md#nope)")).toHaveLength(1);
  });
  it("skips anchors (not files) under skipAnchorsUnder", () => {
    const skip = { skipAnchorsUnder: ["/r/docs"] };
    expect(run("[x](b.md#nope)", skip)).toEqual([]);
    expect(run("[x](gone.md#nope)", skip)).toHaveLength(1);
  });
});
