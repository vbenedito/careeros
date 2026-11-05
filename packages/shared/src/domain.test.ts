import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  hostnameFromUrl,
  isValidDomain,
  matchTrackedDomain,
  normalizeHostname,
  parseDomainInput,
} from "./domain";

const label = fc.stringMatching(/^[a-z0-9]([a-z0-9-]{0,10}[a-z0-9])?$/);
const tld = fc.stringMatching(/^[a-z]{2,6}$/);
/** Arbitrary valid tracked domain such as `ab-1.c9.xyz` (no leading www). */
const domainArb = fc
  .tuple(fc.array(label, { minLength: 1, maxLength: 3 }), tld)
  .map(([labels, end]) => [...labels, end].join("."))
  .filter((d) => !d.startsWith("www.") && d.length <= 253);

describe("normalizeHostname", () => {
  it("TRK-03 lowercases, removes trailing dot and leading www.", () => {
    expect(normalizeHostname(" WWW.LeetCode.com. ")).toBe("leetcode.com");
    expect(normalizeHostname("docs.python.org")).toBe("docs.python.org");
    expect(normalizeHostname("wwwx.com")).toBe("wwwx.com");
  });

  it("is idempotent for valid domains (property)", () => {
    fc.assert(
      fc.property(
        domainArb,
        (d) => normalizeHostname(normalizeHostname(d)) === normalizeHostname(d),
      ),
    );
  });
});

describe("isValidDomain", () => {
  it.each([
    "leetcode.com",
    "neetcode.io",
    "docs.python.org",
    "a.co",
    "xn--bcher-kva.example",
    "study.test",
  ])("accepts %s", (d) => {
    expect(isValidDomain(d)).toBe(true);
  });

  it.each([
    "",
    "localhost",
    "com",
    "192.168.0.1",
    "-bad.com",
    "bad-.com",
    "LeetCode.com",
    "www.leetcode.com",
    "leetcode.com.",
    "has space.com",
    "under_score.com",
    `${"a".repeat(64)}.com`,
    `${"a.".repeat(127)}com`,
  ])("rejects %j", (d) => {
    expect(isValidDomain(d)).toBe(false);
  });
});

describe("hostnameFromUrl", () => {
  it("TRK-02 returns only the normalized hostname of http(s) URLs", () => {
    expect(hostnameFromUrl("https://www.leetcode.com/problems/two-sum?x=1#y")).toBe("leetcode.com");
    expect(hostnameFromUrl("http://NeetCode.io:8080/roadmap")).toBe("neetcode.io");
  });

  it.each([
    undefined,
    "",
    "chrome://extensions",
    "chrome-extension://abc/popup.html",
    "file:///Users/me/notes.html",
    "about:blank",
    "not a url",
  ])("TRK-02 ignores %j", (url) => {
    expect(hostnameFromUrl(url)).toBeNull();
  });

  it("never leaks path or query (property)", () => {
    fc.assert(
      fc.property(domainArb, fc.webPath(), fc.webQueryParameters(), (d, path, query) => {
        const host = hostnameFromUrl(`https://${d}${path}?${query}`);
        return host === d && !host.includes("/") && !host.includes("?");
      }),
    );
  });
});

describe("matchTrackedDomain", () => {
  const tracked = ["leetcode.com", "python.org", "docs.python.org"];

  it("TRK-03 matches the domain itself and its subdomains", () => {
    expect(matchTrackedDomain("leetcode.com", tracked)).toBe("leetcode.com");
    expect(matchTrackedDomain("www.leetcode.com", tracked)).toBe("leetcode.com");
    expect(matchTrackedDomain("assets.leetcode.com", tracked)).toBe("leetcode.com");
  });

  it("TRK-03 does not match lookalike suffixes", () => {
    expect(matchTrackedDomain("notleetcode.com", tracked)).toBeNull();
    expect(matchTrackedDomain("leetcode.com.evil.io", tracked)).toBeNull();
    expect(matchTrackedDomain("example.com", tracked)).toBeNull();
    expect(matchTrackedDomain("leetcode.com", [])).toBeNull();
  });

  it("TRK-03 longest match wins regardless of list order", () => {
    expect(matchTrackedDomain("docs.python.org", tracked)).toBe("docs.python.org");
    expect(matchTrackedDomain("api.docs.python.org", [...tracked].reverse())).toBe(
      "docs.python.org",
    );
    expect(matchTrackedDomain("wiki.python.org", tracked)).toBe("python.org");
  });

  it("any subdomain of a tracked domain matches it (property)", () => {
    fc.assert(
      fc.property(domainArb, fc.array(label, { maxLength: 3 }), (d, sub) => {
        const host = [...sub, d].join(".");
        return matchTrackedDomain(host, [d]) === normalizeHostname(d);
      }),
    );
  });

  it("a domain glued to another label never matches (property)", () => {
    fc.assert(
      fc.property(
        domainArb,
        label,
        (d, prefix) => matchTrackedDomain(`${prefix}${d}`, [d]) === null,
      ),
    );
  });
});

describe("parseDomainInput", () => {
  it("EXT-UI-07 accepts bare hosts and URLs, normalizing them", () => {
    expect(parseDomainInput("LeetCode.com")).toEqual({ ok: true, domain: "leetcode.com" });
    expect(parseDomainInput(" https://www.neetcode.io/practice ")).toEqual({
      ok: true,
      domain: "neetcode.io",
    });
    expect(parseDomainInput("docs.python.org/3/")).toEqual({ ok: true, domain: "docs.python.org" });
  });

  it.each(["", "   ", "localhost", "chrome://extensions", "not a site", "192.168.0.1"])(
    "rejects %j with a message",
    (input) => {
      const result = parseDomainInput(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    },
  );
});
