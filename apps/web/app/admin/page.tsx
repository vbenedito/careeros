import { SessionsPanel } from "@/app/admin/sessions-panel";
import { requireAdmin } from "@/lib/admin/guard";
import { loadLedger } from "@/lib/admin/ledger";
import { buildSessionRows } from "@/lib/admin/sessions-view";

/**
 * ADM-02..09. A layout does not hold back its page's data loading, so the guard is awaited here
 * too, before anything is read. Read-only (ADM-04): no form, no action.
 */
export default async function AdminPage() {
  await requireAdmin();
  const ledger = await loadLedger();
  return (
    <>
      <header>
        <h1 className="text-base font-semibold">Admin</h1>
      </header>
      {ledger.status === "ok" ? (
        <SessionsPanel rows={buildSessionRows(ledger.sessions)} invalid={ledger.invalid} />
      ) : (
        <SessionsPanel unavailableStatus={ledger.httpStatus} />
      )}
    </>
  );
}
