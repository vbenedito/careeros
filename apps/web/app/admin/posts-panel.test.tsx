import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PostsView } from "@/lib/admin/posts-view";
import { PostsPanel } from "./posts-panel";

/** Invented view (never real URLs). */
const VIEW: PostsView = {
  headline: "2 posts: 1 of 3 network posts are live",
  invalid: ["posts/2030/2030-01-07-broken.json"],
  rows: [
    {
      stem: "2030-01-09-new-post",
      when: "Wed, Jan 9, 19:00",
      title: "New post title",
      pillar: "your-real-week",
      platforms: [
        {
          platform: "instagram",
          name: "Instagram",
          status: "ready",
          word: "Scheduled",
          url: null,
          httpNote: null,
          publishedAt: null,
        },
      ],
    },
    {
      stem: "2030-01-02-old-post",
      when: "Wed, Jan 2, 19:00",
      title: "Old post title",
      pillar: "your-real-week",
      platforms: [
        {
          platform: "instagram",
          name: "Instagram",
          status: "published",
          word: "Published",
          url: "https://example.test/p/fixture1",
          httpNote: null,
          publishedAt: "2030-01-02T22:03:00.000Z",
        },
        {
          platform: "youtube",
          name: "YouTube",
          status: "failed",
          word: "Failed",
          url: null,
          httpNote: "HTTP 403",
          publishedAt: null,
        },
      ],
    },
  ],
};

describe("posts panel (ADM-21)", () => {
  const out = renderToStaticMarkup(<PostsPanel view={VIEW} />);

  it("ADM-21 headline, titles newest first, a word for every status", () => {
    expect(out).toContain("Posts");
    expect(out).toContain("2 posts: 1 of 3 network posts are live");
    expect(out.indexOf("New post title")).toBeLessThan(out.indexOf("Old post title"));
    for (const word of ["Scheduled", "Published", "Failed (HTTP 403)"]) expect(out).toContain(word);
  });

  it("ADM-21 the live post opens in a new tab with a named, safe link", () => {
    expect(out).toContain('href="https://example.test/p/fixture1"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('aria-label="Open on Instagram (opens in a new tab)"');
    expect(out).toContain("min-h-11");
  });

  it("ADM-21 ADM-20 invalid files are named; the Details table is closed by default", () => {
    expect(out).toContain("Invalid file, skipped: posts/2030/2030-01-07-broken.json");
    expect(out).toContain("Details: posts");
    expect(out).not.toContain("<details open");
  });

  it("ADM-21 empty and unavailable", () => {
    expect(
      renderToStaticMarkup(
        <PostsPanel view={{ headline: "No posts yet.", rows: [], invalid: [] }} />,
      ),
    ).toContain("No posts yet.");
    expect(renderToStaticMarkup(<PostsPanel unavailableNote="HTTP 502" />)).toContain(
      "Posts unavailable (HTTP 502)",
    );
  });
});
