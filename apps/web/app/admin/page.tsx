import { CostPanel } from "@/app/admin/cost-panel";
import { DiagramPanel } from "@/app/admin/diagram-panel";
import { DocsPanel } from "@/app/admin/docs-panel";
import { HealthPanel } from "@/app/admin/health-panel";
import { ProgressPanel } from "@/app/admin/progress-panel";
import { ReviewsPanel } from "@/app/admin/reviews-panel";
import { SessionsPanel } from "@/app/admin/sessions-panel";
import { SkillsPanel } from "@/app/admin/skills-panel";
import { GITHUB_CACHE_S } from "@/lib/admin/config";
import { buildCostView } from "@/lib/admin/cost-view";
import { buildDailyCost } from "@/lib/admin/daily-view";
import { buildIssueDocs } from "@/lib/admin/docs-view";
import { requireAdmin } from "@/lib/admin/guard";
import { buildHealth } from "@/lib/admin/health-view";
import { type LedgerLoad, loadLedger } from "@/lib/admin/ledger";
import { buildProgress, mergeStates } from "@/lib/admin/progress-view";
import { loadRepo, type RepoLoad } from "@/lib/admin/repo";
import { buildReviewRows } from "@/lib/admin/reviews-view";
import { buildSessionRows } from "@/lib/admin/sessions-view";
import { buildSkills } from "@/lib/admin/skills-view";
import { loadWorkflows } from "@/lib/admin/workflows";

/** What follows "unavailable": the HTTP status only, or why a 200 was unusable. */
function unavailableNote(
  source:
    | Extract<LedgerLoad, { status: "unavailable" }>
    | Extract<RepoLoad, { status: "unavailable" }>,
): string | null {
  if (source.httpStatus !== null) return `HTTP ${source.httpStatus}`;
  if (source.reason === "unreadable") return "unreadable response";
  if (source.reason === "truncated") return "listing truncated";
  return null;
}

/**
 * ADM-02..13, ADM-15, ADM-17..20. A layout does not hold back its page's data loading, so the guard is
 * awaited here too, before anything is read. Read-only (ADM-04): no form, no action.
 */
export default async function AdminPage() {
  await requireAdmin();
  const [ledger, repo, workflows] = await Promise.all([loadLedger(), loadRepo(), loadWorkflows()]);
  const now = new Date();
  const ledgerNote = ledger.status === "ok" ? null : unavailableNote(ledger);
  const repoNote = repo.status === "ok" ? null : unavailableNote(repo);
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">Admin</h1>
        {/* ADM-20.8 */}
        <p className="text-sm text-muted-foreground">
          GitHub data is up to {GITHUB_CACHE_S / 60} minutes old
        </p>
      </header>
      {/* ADM-17: below 768 px one column; from 768 px progress and health side by side, then
          cost and skills across both columns. The DOM order is the reading order. */}
      <div className="grid gap-4 md:grid-cols-2">
        {repo.status === "ok" ? (
          <ProgressPanel
            view={buildProgress(repo.issues, repo.prs, repo.checks)}
            checksUnknown={repo.checksUnknown}
          />
        ) : (
          <ProgressPanel unavailableNote={repoNote} />
        )}
        {workflows.status === "ok" ? (
          <HealthPanel view={buildHealth(workflows.inputs, now)} />
        ) : (
          <HealthPanel unavailableNote={null} />
        )}
        {ledger.status === "ok" ? (
          <CostPanel
            daily={buildDailyCost(ledger.sessions, now)}
            view={buildCostView(ledger.sessions)}
          />
        ) : (
          <CostPanel unavailableNote={ledgerNote} />
        )}
        {ledger.status === "ok" ? (
          <SkillsPanel view={buildSkills(ledger.sessions)} />
        ) : (
          <SkillsPanel unavailableNote={ledgerNote} />
        )}
      </div>
      {ledger.status === "ok" ? (
        <ReviewsPanel
          rows={buildReviewRows(
            ledger.sessions,
            repo.status === "ok" ? mergeStates(repo.prs) : null,
          )}
          {...(repo.status === "ok" ? {} : { githubNote: repoNote })}
        />
      ) : (
        <ReviewsPanel unavailableNote={ledgerNote} />
      )}
      {ledger.status === "ok" ? (
        <SessionsPanel rows={buildSessionRows(ledger.sessions)} invalid={ledger.invalid} />
      ) : (
        <SessionsPanel unavailableNote={ledgerNote} />
      )}
      {ledger.status === "ok" ? (
        <DocsPanel rows={buildIssueDocs(ledger.sessions)} />
      ) : (
        <DocsPanel unavailableNote={ledgerNote} />
      )}
      <DiagramPanel />
    </>
  );
}
