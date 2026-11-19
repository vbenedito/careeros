/**
 * The admin page guard against the running dashboard (ADM-02..04, acceptance 1). CI runs the server with a canary
 * OPS_LEDGER_TOKEN that GitHub rejects, so the admin page shows "Ledger unavailable (HTTP 401)" (ADM-08).
 */
import { describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env, sql } from "./helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");
const get = (path: string, cookie?: string) =>
  fetch(`${DASHBOARD_URL}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

/** The body with this response's CSP nonce masked, so two renders can be compared. */
async function body(res: Response): Promise<string> {
  const nonce = /'nonce-([^']+)'/.exec(res.headers.get("content-security-policy") ?? "")?.[1];
  const text = await res.text();
  return nonce ? text.replaceAll(nonce, "NONCE") : text;
}

describe("admin page (integration)", () => {
  it("ADM-02 acceptance 1: signed out, not admin, admin answer 404, 404, 200", async () => {
    const stamp = Date.now();
    createOAuthUser(`admin-no-${stamp}@example.test`);
    const plain = await dashboardSession(`admin-no-${stamp}@example.test`);
    const adminId = createOAuthUser(`admin-yes-${stamp}@example.test`);
    // Seeded like the owner does it: by hand, with SQL (ADM-01).
    sql(`insert into public.admins (user_id) values ('${adminId}')`);
    const admin = await dashboardSession(`admin-yes-${stamp}@example.test`);

    const signedOut = await get("/admin");
    expect(signedOut.status).toBe(404);
    expect(signedOut.headers.get("location")).toBeNull();
    const notAdmin = await get("/admin", plain.header);
    expect(notAdmin.status).toBe(404);
    const allowed = await get("/admin", admin.header);
    expect(allowed.status).toBe(200);
    const html = await allowed.text();
    expect(html).toContain("<h1");
    expect(html).toContain("Sessions");
    // The canary token (integration.sh) is rejected by GitHub: 401, and the token stays hidden (ADM-08).
    // React separates adjacent text parts with <!-- --> in server HTML.
    expect(html.replaceAll("<!-- -->", "")).toContain("Ledger unavailable (HTTP 401)");
    const canary = process.env.OPS_LEDGER_TOKEN;
    if (canary) expect(html).not.toContain(canary);
    expect(html).toContain('name="robots" content="noindex, nofollow"');

    // The 404 is the not-found page of an unknown path: same status, same noindex, same content.
    // Next.js renders a 404 thrown by a matched route as an error shell that shows the same
    // app/not-found.tsx on the client, so the bytes of /does-not-exist (a signed-out unknown path
    // goes to sign-in, AUTH-03, so the signed-in one is the reference) differ from it. What must
    // not differ is signed out versus not admin: nothing tells "not signed in" from "not admin".
    const unknown = await get("/does-not-exist", plain.header);
    expect(unknown.status).toBe(404);
    const unknownBody = await body(unknown);
    const signedOutBody = await body(signedOut);
    expect(await body(notAdmin)).toBe(signedOutBody);
    for (const text of [signedOutBody, unknownBody]) {
      expect(text).toContain("Page not found");
      expect(text).toContain('name="robots" content="noindex, nofollow"');
    }

    // A sub-path is guarded too, and the guard is not cached between visitors.
    expect((await get("/admin/anything", plain.header)).status).toBe(404);
    expect((await get("/admin", plain.header)).status).toBe(404);
    expect((await get("/admin", admin.header)).status).toBe(200);
  });

  it("ADM-03 /admin is not in the sitemap and not linked from the signed-in pages", async () => {
    expect(await (await get("/sitemap.xml")).text()).not.toContain("/admin");
    const email = `admin-links-${Date.now()}@example.test`;
    createOAuthUser(email);
    const { header } = await dashboardSession(email);
    for (const path of ["/dashboard", "/settings"]) {
      expect(await (await get(path, header)).text(), path).not.toMatch(/href="\/admin/);
    }
  });
});
