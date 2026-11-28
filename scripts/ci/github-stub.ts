/**
 * CI-only stand-in for the GitHub REST API that /admin reads (ADM-08, ADM-12), so TEST-01 can
 * render the page with tables and a diagram without the private ledger. Usage:
 *   OPS_LEDGER_TOKEN=<token> node scripts/ci/github-stub.ts <port>
 * It listens on 127.0.0.1 only and answers 401 unless the request carries `Bearer <token>`, so
 * the dashboard's token handling is still exercised. Every value below is invented (dates in
 * the last 14 days relative to the run, issue numbers that do not exist): nothing here comes from
 * the private ledger. Long goals, file names and skills are deliberate: they stress the tables' and
 * charts' width. The sessions span all six kinds of work and several models and days, and the six
 * workflows of ADM-18 answer with a mix of statuses, so the screenshots show filled charts.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2]);
const token = process.env.OPS_LEDGER_TOKEN;
if (!Number.isInteger(port) || port < 1024 || !token) {
  console.error("usage: OPS_LEDGER_TOKEN=<token> node scripts/ci/github-stub.ts <port>");
  process.exit(2);
}

const LEDGER = "/repos/vbenedito/careeros-ops/git";
const PUBLIC = "/repos/vbenedito/careeros";
const LONG_FILE = `apps/web/components/dashboard/${"very-long-directory-name-".repeat(4)}panel.tsx`;

const agent = (over: Record<string, unknown>) => ({
  model: "sonnet",
  work: "author",
  kind: "code",
  issue: null,
  pr: null,
  tokens: 0,
  minutes: null,
  rounds: 1,
  findings: null,
  files: [],
  skills: [],
  ...over,
});

/** The current date in America/Sao_Paulo, as the page computes "today" (ADM-10a). */
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
/** The date `n` days before today (calendar arithmetic), as YYYY-MM-DD. */
const daysAgo = (n: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const id = (n: number, suffix: string) => `${daysAgo(n)}-${suffix}`;

const sessions = [
  {
    schema: 1,
    session: id(5, "a"),
    date: daysAgo(5),
    goal: "Fixture session with a deliberately long goal sentence so the goal column has to wrap inside its own table box on a phone",
    corrects: null,
    main: { tokens: 120000, measure: "estimate" },
    agents: [
      agent({
        issue: 7001,
        pr: 7101,
        tokens: 40000,
        files: [LONG_FILE, "docs/a.md"],
        skills: ["design-skills:accessibility-audit", "x:one"],
      }),
      agent({ model: "opus", issue: 7001, pr: 7101, tokens: 90000, files: ["docs/b.md"] }),
      agent({
        work: "review",
        issue: 7001,
        pr: 7101,
        tokens: 30000,
        rounds: 2,
        findings: { high: 1, medium: 2 },
      }),
      agent({ model: "haiku", tokens: 500 }),
    ],
  },
  {
    schema: 1,
    session: id(4, "a"),
    date: daysAgo(4),
    goal: "Second fixture session",
    corrects: id(5, "a"),
    main: { tokens: null, measure: "estimate" },
    agents: [
      agent({ model: "haiku", issue: 7001, tokens: 1000, skills: ["x:one"] }),
      agent({
        model: "opus",
        work: "review",
        issue: 7002,
        pr: 7102,
        tokens: 20000,
        rounds: 3,
        findings: { high: 0, medium: 1 },
      }),
      agent({ issue: 7002, pr: 7102, tokens: 8000, files: ["specs/z.md"] }),
    ],
  },
  {
    schema: 1,
    session: id(13, "a"),
    date: daysAgo(13),
    goal: "Fixture ideas session",
    corrects: null,
    main: { tokens: 60000, measure: "measured" },
    agents: [
      agent({ model: "opus", kind: "ideas", tokens: 70000, skills: ["x:brainstorm", "x:one"] }),
      agent({ kind: "ideas", tokens: 25000, skills: ["x:brainstorm"] }),
    ],
  },
  {
    schema: 1,
    session: id(9, "a"),
    date: daysAgo(9),
    goal: "Fixture docs and marketing session",
    corrects: null,
    main: { tokens: 90000, measure: "estimate" },
    agents: [
      agent({ kind: "docs", issue: 7003, tokens: 35000, skills: ["x:docs", "x:one"] }),
      agent({ model: "haiku", kind: "docs", tokens: 4000 }),
      agent({
        model: "opus",
        kind: "marketing",
        tokens: 52000,
        skills: ["x:copy", "x:seo", "x:one", "x:brand", "x:copy"],
      }),
      agent({ kind: "video", tokens: 18000, skills: ["x:video"] }),
    ],
  },
  {
    schema: 1,
    session: id(2, "a"),
    date: daysAgo(2),
    goal: "Fixture post and code session",
    corrects: null,
    main: { tokens: 150000, measure: "estimate" },
    agents: [
      agent({ kind: "post", tokens: 9000, skills: ["x:post"] }),
      agent({ model: "opus", issue: 7004, pr: 7103, tokens: 110000, skills: ["x:one", "x:two"] }),
      agent({ model: "haiku", issue: 7004, tokens: 3000, skills: ["x:two"] }),
      agent({ issue: 7004, tokens: 26000, skills: ["x:three", "x:four"] }),
    ],
  },
  {
    schema: 1,
    session: id(0, "a"),
    date: daysAgo(0),
    goal: "Fixture session of today",
    corrects: null,
    main: { tokens: 40000, measure: "estimate" },
    agents: [agent({ issue: 7004, tokens: 15000, skills: ["x:one"] })],
  },
];

const blobs = new Map<string, string>();
const file = (path: string, body: unknown) => {
  const text = JSON.stringify(body);
  const sha = createHash("sha1").update(text).digest("hex");
  blobs.set(sha, text);
  return { path, type: "blob", sha };
};

/** ADM-21: invented posts (no real URL or id). One is live on Instagram, one is scheduled. */
const postEntry = (status: string, extra: Record<string, unknown> = {}) => ({
  status,
  caption: "Fixture caption",
  hashtags: ["#fixture"],
  link: null,
  alt_text: null,
  text_version: "Fixture text",
  ...extra,
});
const postRecord = (date: string, slug: string, title: string) => ({
  schema: 1,
  slug,
  date,
  time: "19:00",
  timezone: "America/Sao_Paulo",
  pillar: "your-real-week",
  format: "chart",
  video: { release: `post-${date}-${slug}`, asset: `${date}-${slug}.mp4`, sha256: "b".repeat(64) },
  music_license: "original:careeros_music:1",
  ai_label: false,
  platforms: { instagram: postEntry("ready"), youtube: postEntry("ready", { title }) },
});
const postFiles = [
  file(
    "posts/2030/2030-01-02-fixture-live.json",
    postRecord("2030-01-02", "fixture-live", "Fixture live post"),
  ),
  file(
    "posts/2030/2030-01-09-fixture-next.json",
    postRecord("2030-01-09", "fixture-next", "Fixture next post"),
  ),
  file("posts-state/2030/2030-01-02-fixture-live.json", {
    schema: 1,
    platforms: {
      instagram: {
        status: "published",
        attempts: 1,
        platform_id: "fixture-id",
        url: "https://example.test/p/fixture-live",
        published_at: "2030-01-02T22:03:00.000Z",
        issue: null,
        error: null,
        metrics: null,
      },
    },
  }),
  file("posts-state/tokens.json", { schema: 1, checked_on: "2030-01-02" }),
];

const tree = [...sessions.map((s) => file(`ledger/${s.session}.json`, s)), ...postFiles];

const HEAD = "a".repeat(40);
const issues = [
  { number: 7001, title: "Fixture issue that is done", state: "closed", labels: ["v1"] },
  { number: 7002, title: "Fixture issue waiting for approval", state: "open", labels: ["v1"] },
  { number: 7003, title: "Fixture blocked issue", state: "open", labels: ["v1", "blocked"] },
  {
    number: 7004,
    title: `Fixture open issue ${"with-a-very-long-unbroken-title-".repeat(3)}`,
    state: "open",
    labels: ["v1"],
  },
];
const pulls = [
  {
    number: 7101,
    state: "closed",
    draft: false,
    merged_at: "2030-01-02T12:00:00Z",
    body: "Closes #7001",
    head: { sha: "b".repeat(40) },
  },
  {
    number: 7102,
    state: "open",
    draft: false,
    merged_at: null,
    body: "Closes #7002",
    head: { sha: HEAD },
  },
];
const checkRuns = {
  check_runs: [
    { name: "Lint, typecheck, test, build", conclusion: "success" },
    { name: "Database (Supabase in Docker)", conclusion: "success" },
  ],
};

/** ADM-18: the last completed run of each workflow on main; a mix of statuses, ages in hours. */
const hoursAgo = (h: number) =>
  `${new Date(Date.now() - h * 3_600_000).toISOString().slice(0, 19)}Z`;
const completed = (conclusion: string, hours: number) => ({
  status: "completed",
  conclusion,
  updated_at: hoursAgo(hours),
});
const WORKFLOW_RUNS: Record<string, { latest: unknown | null; success?: unknown | null }> = {
  // Passing, 3 hours old (limit 36 hours).
  "smoke.yml": { latest: completed("success", 3) },
  // Older than its limit: Stale.
  "health.yml": { latest: completed("success", 40) },
  // A failed run after a good one: Failing, with "last good backup 3 days ago".
  "backup.yml": { latest: completed("failure", 2), success: completed("success", 72) },
  // Never ran: No run yet.
  "migrate.yml": { latest: null },
  "ci.yml": { latest: completed("success", 1) },
  // Cancelled.
  "codeql.yml": { latest: completed("cancelled", 120) },
};

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") return json(res, 200, { ok: true });
  if (req.method !== "GET") return json(res, 405, {});
  if (req.headers.authorization !== `Bearer ${token}`)
    return json(res, 401, { message: "Bad credentials" });
  const path = url.pathname;
  if (path === `${LEDGER}/trees/main`) return json(res, 200, { truncated: false, tree });
  const blob = path.startsWith(`${LEDGER}/blobs/`)
    ? blobs.get(path.slice(`${LEDGER}/blobs/`.length))
    : undefined;
  if (blob !== undefined) {
    res.writeHead(200, { "content-type": "application/vnd.github.raw+json" });
    return res.end(blob);
  }
  if (path === `${PUBLIC}/issues`) return json(res, 200, issues);
  if (path === `${PUBLIC}/pulls`) return json(res, 200, pulls);
  const runs = /^\/repos\/vbenedito\/careeros\/actions\/workflows\/([a-z.]+)\/runs$/.exec(path);
  if (runs) {
    const entry = WORKFLOW_RUNS[runs[1] ?? ""];
    if (!entry) return json(res, 404, { message: "Not Found" });
    const run =
      url.searchParams.get("status") === "success" ? (entry.success ?? entry.latest) : entry.latest;
    return json(res, 200, { total_count: run ? 1 : 0, workflow_runs: run ? [run] : [] });
  }
  if (path === `${PUBLIC}/commits/${HEAD}/check-runs`) return json(res, 200, checkRuns);
  return json(res, 404, { message: "Not Found" });
}).listen(port, "127.0.0.1");
