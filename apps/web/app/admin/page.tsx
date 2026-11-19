import { CostPanel } from "@/app/admin/cost-panel";
import { DiagramPanel } from "@/app/admin/diagram-panel";
import { DocsPanel } from "@/app/admin/docs-panel";
import { ProgressPanel } from "@/app/admin/progress-panel";
import { ReviewsPanel } from "@/app/admin/reviews-panel";
import { SessionsPanel } from "@/app/admin/sessions-panel";
import { buildCostView } from "@/lib/admin/cost-view";
import { buildIssueDocs } from "@/lib/admin/docs-view";
import { requireAdmin } from "@/lib/admin/guard";
import { type LedgerLoad, loadLedger } from "@/lib/admin/ledger";
import { buildProgress, mergeStates } from "@/lib/admin/progress-view";
import { loadRepo, type RepoLoad } from "@/lib/admin/repo";
import { buildReviewRows } from "@/lib/admin/reviews-view";
import { buildSessionRows } from "@/lib/admin/sessions-view";

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
 * ADM-02..13, ADM-15. A layout does not hold back its page's data loading, so the guard is
 * awaited here too, before anything is read. Read-only (ADM-04): no form, no action.
 */
export default async function AdminPage() {
  await requireAdmin();
  const [ledger, repo] = await Promise.all([loadLedger(), loadRepo()]);
  const ledgerNote = ledger.status === "ok" ? null : unavailableNote(ledger);
  const repoNote = repo.status === "ok" ? null : unavailableNote(repo);
  return (
    <>
      <header>
        <h1 className="text-base font-semibold">Admin</h1>
      </header>
      {ledger.status === "ok" ? (
        <SessionsPanel rows={buildSessionRows(ledger.sessions)} invalid={ledger.invalid} />
      ) : (
        <SessionsPanel unavailableNote={ledgerNote} />
      )}
      {ledger.status === "ok" ? (
        <CostPanel view={buildCostView(ledger.sessions)} />
      ) : (
        <CostPanel unavailableNote={ledgerNote} />
      )}
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
      {repo.status === "ok" ? (
        <ProgressPanel
          view={buildProgress(repo.issues, repo.prs, repo.checks)}
          checksUnknown={repo.checksUnknown}
        />
      ) : (
        <ProgressPanel unavailableNote={repoNote} />
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
