/**
 * Production smoke check (ENV-12, grill T2): read-only requests against the live site and the
 * hosted Supabase project, run by `.github/workflows/smoke.yml`. No secrets: every value is a
 * public repository variable. Usage: node scripts/ci/smoke.ts
 * Variables: SMOKE_SITE_URL, SMOKE_STORE_URL, SMOKE_SUPABASE_URL, SMOKE_SUPABASE_PUBLISHABLE_KEY;
 * optional SMOKE_ATTEMPTS (default 1) and SMOKE_RETRY_DELAY_S (default 30) for the post-deploy run,
 * where the production alias may need a moment.
 */
import { appendFileSync } from "node:fs";
import {
  checkDashboardRedirect,
  checkExposeDate,
  checkLanding,
  checkPreflight,
  checkPrivacy,
  checkRobots,
  checkSitemap,
  type HeaderMap,
  parseConfig,
  type SmokeConfig,
} from "./smoke-lib.ts";

const TIMEOUT_MS = 20_000;

function headerMap(headers: Headers): HeaderMap {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

async function get(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...init,
  });
  return {
    status: response.status,
    headers: headerMap(response.headers),
    text: async () => response.text(),
  };
}

interface Check {
  name: string;
  run: () => Promise<string[]>;
}

function checksFor(config: SmokeConfig): Check[] {
  const origin = `chrome-extension://${config.extensionId}`;
  const rest = `${config.supabaseUrl}/rest/v1`;
  return [
    {
      name: "Landing /",
      run: async () => {
        const r = await get(`${config.site}/`);
        return checkLanding({ status: r.status, headers: r.headers, html: await r.text() }, config);
      },
    },
    {
      name: "/robots.txt",
      run: async () => {
        const r = await get(`${config.site}/robots.txt`);
        return checkRobots({ status: r.status, body: await r.text() }, config);
      },
    },
    {
      name: "/sitemap.xml",
      run: async () => {
        const r = await get(`${config.site}/sitemap.xml`);
        return checkSitemap({ status: r.status, body: await r.text() }, config);
      },
    },
    {
      name: "/privacy",
      run: async () => checkPrivacy(await get(`${config.site}/privacy`)),
    },
    {
      name: "/dashboard signed out",
      run: async () => {
        const r = await get(`${config.site}/dashboard`);
        return checkDashboardRedirect({ status: r.status, location: r.headers.location }, config);
      },
    },
    {
      name: "Supabase CORS preflight",
      run: async () => {
        const r = await get(`${rest}/rpc/ingest_study_sessions`, {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "apikey,authorization,content-type,x-client-info",
          },
        });
        return checkPreflight(r, origin);
      },
    },
    {
      name: "Supabase REST exposes Date",
      run: async () => {
        // Anonymous callers have no table privileges (DATA-04), so the status is 401/403/200;
        // only the CORS and Date headers matter here.
        const r = await get(`${rest}/tracked_domains?select=domain&limit=1`, {
          headers: { Origin: origin, apikey: config.publishableKey },
        });
        return checkExposeDate(r, origin);
      },
    },
  ];
}

async function runOnce(config: SmokeConfig): Promise<{ name: string; problems: string[] }[]> {
  const results: { name: string; problems: string[] }[] = [];
  for (const check of checksFor(config)) {
    try {
      results.push({ name: check.name, problems: await check.run() });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "error";
      results.push({ name: check.name, problems: [`The request failed (${reason}).`] });
    }
  }
  return results;
}

const parsed = parseConfig(process.env);
if ("problems" in parsed) {
  for (const problem of parsed.problems)
    console.error(`::error::Smoke check configuration: ${problem}`);
  process.exit(1);
}

const attempts = Math.max(1, Number(process.env.SMOKE_ATTEMPTS ?? "1") || 1);
const delayS = Math.max(0, Number(process.env.SMOKE_RETRY_DELAY_S ?? "30") || 0);
let results = await runOnce(parsed.config);
for (
  let attempt = 2;
  attempt <= attempts && results.some((r) => r.problems.length > 0);
  attempt++
) {
  process.stdout.write(`Attempt ${attempt - 1} failed; retrying in ${delayS} s.\n`);
  await new Promise((resolve) => setTimeout(resolve, delayS * 1000));
  results = await runOnce(parsed.config);
}

const lines = ["## Production smoke check", "", `Site: ${parsed.config.site}`, ""];
for (const { name, problems } of results) {
  process.stdout.write(`${problems.length === 0 ? "PASS" : "FAIL"}  ${name}\n`);
  lines.push(`- ${problems.length === 0 ? "pass" : "**FAIL**"}: ${name}`);
  for (const problem of problems) {
    console.error(`::error title=Smoke: ${name}::${problem}`);
    lines.push(`  - ${problem}`);
  }
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}
process.exit(results.some((r) => r.problems.length > 0) ? 1 : 0);
