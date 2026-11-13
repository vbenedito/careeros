/**
 * Production build validation (ENV-05b, SEC-13). Pure, so it is unit-tested; `next.config.ts`
 * calls it when `VERCEL_ENV === "production"` and fails the build on any problem. Preview, CI
 * and local builds are never checked, so they keep working without these values.
 *
 * Each message names the variable and where to fix it: the settings must exist in the Vercel
 * project that builds production, in the Production scope (and `NEXT_PUBLIC_*` values are
 * inlined at build time, so a redeploy is needed after changing them).
 */

type Env = Readonly<Record<string, string | undefined>>;

const WHERE =
  "set it in the Vercel project that builds production (Settings → Environment Variables, Production scope), then redeploy";
const EXTENSION_ID = /^[a-p]{32}$/;
const STORE_HOST = "chromewebstore.google.com";

function parse(value: string | undefined): URL | null {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

/** Human-readable problems with the production configuration; empty when it is valid. */
export function productionEnvProblems(env: Env): string[] {
  const problems: string[] = [];
  const get = (name: string) => env[name]?.trim() ?? "";

  const missingPrivacy = ["PRIVACY_CONTROLLER", "PRIVACY_CONTACT_EMAIL", "DATA_REGION"].filter(
    (name) => !get(name),
  );
  if (missingPrivacy.length > 0) {
    problems.push(`${missingPrivacy.join(", ")} missing (shown on /privacy, SEC-13); ${WHERE}`);
  }

  if (parse(get("SITE_URL"))?.protocol !== "https:") {
    problems.push(
      `SITE_URL must be the https origin of the dashboard (without it, redirects, Origin checks, the canonical URL and HSTS break); ${WHERE}`,
    );
  }
  if (!EXTENSION_ID.test(get("NEXT_PUBLIC_EXTENSION_ID"))) {
    problems.push(
      `NEXT_PUBLIC_EXTENSION_ID must be the 32-letter (a-p) ID of the published extension; ${WHERE}`,
    );
  }
  if (parse(get("NEXT_PUBLIC_SUPABASE_URL"))?.protocol !== "https:") {
    problems.push(
      `NEXT_PUBLIC_SUPABASE_URL must be the https URL of the hosted Supabase project, not localhost; ${WHERE}`,
    );
  }
  if (!get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
    problems.push(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing; ${WHERE}`);
  }
  const install = parse(get("EXTENSION_INSTALL_URL"));
  if (
    install?.protocol !== "https:" ||
    install.hostname !== STORE_HOST ||
    !install.pathname.startsWith("/detail/")
  ) {
    problems.push(
      `EXTENSION_INSTALL_URL must be the Chrome Web Store listing (https://${STORE_HOST}/detail/…), not the store search; ${WHERE}`,
    );
  }
  return problems;
}

/** Throws one error listing every problem (used by `next.config.ts` for production builds). */
export function assertProductionEnv(env: Env): void {
  const problems = productionEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Invalid production configuration:\n${problems.map((p) => `- ${p}`).join("\n")}`,
    );
  }
}
