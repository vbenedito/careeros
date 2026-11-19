/** Admin page constants (spec 03-admin §2; `ADMIN_PATH` is in `lib/auth/routes.ts`). Not secrets. */

export const LEDGER_REPO = "vbenedito/careeros-ops";
export const LEDGER_DIR = "ledger/";
/** Seconds a GitHub listing is cached (ADM-08). */
export const GITHUB_CACHE_S = 600;
export const GITHUB_API = "https://api.github.com";
/** Source of issues, PRs and CI status (ADM-12). Public repository. */
export const PUBLIC_REPO = "vbenedito/careeros";
/** The two required checks of a pull request (ADM-12), by their job names in `ci.yml`. */
export const REQUIRED_CHECKS = [
  "Lint, typecheck, test, build",
  "Database (Supabase in Docker)",
] as const;
