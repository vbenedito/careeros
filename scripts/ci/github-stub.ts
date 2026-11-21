/**
 * CI-only stand-in for the GitHub REST API that /admin reads (ADM-08, ADM-12), so TEST-01 can
 * render the page with tables and a diagram without the private ledger. Usage:
 *   OPS_LEDGER_TOKEN=<token> node scripts/ci/github-stub.ts <port>
 * It listens on 127.0.0.1 only and answers 401 unless the request carries `Bearer <token>`, so
 * the dashboard's token handling is still exercised. Every value below is invented (dates in
 * 2030, issue numbers that do not exist): nothing here comes from the private ledger. Long
 * goals, file names and skills are deliberate: they stress the tables' width.
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

const sessions = [
  {
    schema: 1,
    session: "2030-01-02-a",
    date: "2030-01-02",
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
    session: "2030-01-03-a",
    date: "2030-01-03",
    goal: "Second fixture session",
    corrects: "2030-01-02-a",
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
];

const blobs = new Map<string, string>();
const tree = sessions.map((s) => {
  const text = JSON.stringify(s);
  const sha = createHash("sha1").update(text).digest("hex");
  blobs.set(sha, text);
  return { path: `ledger/${s.session}.json`, type: "blob", sha };
});

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
  if (path === `${PUBLIC}/commits/${HEAD}/check-runs`) return json(res, 200, checkRuns);
  return json(res, 404, { message: "Not Found" });
}).listen(port, "127.0.0.1");
