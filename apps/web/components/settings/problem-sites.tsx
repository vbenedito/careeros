"use client";

/**
 * DASH-16: problem sites (PSR-12, PSR-13, PSR-25): the built-in sites, the user's rules with
 * Remove, and "Add a problem site". The pasted example URL is parsed here, in the page, by the
 * shared `proposeProblemRule` and is never sent anywhere (PSR-11): only the rule is. Nothing is
 * saved before the confirm.
 */
import { hostnameFromUrl, PROBLEMS, proposeProblemRule } from "@careeros/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { request } from "@/lib/http/request";
import {
  AddProblemRuleReplySchema,
  canAddRule,
  labelToSend,
  type ProblemSiteRule,
  previewLines,
  problemSiteErrorMessage,
  proposalFailure,
  RemoveProblemRuleReplySchema,
  removeNeedsDialog,
  ruleAddress,
  SITE_COPY,
} from "@/lib/problems/sites";
import { SiteSchema, siteErrorMessage } from "@/lib/settings/sites";

export function ProblemSites({
  rules,
  trackedDomains,
}: {
  rules: ProblemSiteRule[];
  trackedDomains: string[];
}) {
  const router = useRouter();
  const urlId = useId();
  const labelId = useId();
  const [typed, setTyped] = useState("");
  /** The pasted address; in memory only, never sent (PSR-11). */
  const [checked, setChecked] = useState<string | null>(null);
  const [pick, setPick] = useState<number | undefined>(undefined);
  const [label, setLabel] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProblemSiteRule | null>(null);

  // Recomputed when the tracked sites change (after "Add as a study site" the page refreshes).
  const proposal = useMemo(
    () => (checked === null ? null : proposeProblemRule(checked, trackedDomains, pick)),
    [checked, trackedDomains, pick],
  );
  const host = checked === null ? null : hostnameFromUrl(checked);

  function check(event: FormEvent) {
    event.preventDefault();
    setChecked(typed.trim());
    setPick(undefined);
    setLabel(null);
    setConfirmed(false);
    setError(null);
  }

  function reset() {
    setTyped("");
    setChecked(null);
    setPick(undefined);
    setLabel(null);
    setConfirmed(false);
  }

  async function addStudySite() {
    if (!host) return;
    setBusy(true);
    // Only the host is sent, never the pasted address (PSR-11).
    const result = await request("/api/sites", {
      method: "POST",
      json: { domain: host },
      schema: SiteSchema,
    });
    setBusy(false);
    if (!result.ok) return setError(siteErrorMessage(result.error, result.status, result.limit));
    setError(null);
    router.refresh();
  }

  async function add() {
    if (!proposal?.ok) return;
    setBusy(true);
    const result = await request("/api/settings/problem-rules", {
      method: "POST",
      json: {
        domain: proposal.domain,
        prefix: proposal.prefix,
        kind: proposal.kind,
        label: labelToSend(label ?? proposal.domain, proposal.domain),
        confirmedProblemId: true,
      },
      schema: AddProblemRuleReplySchema,
    });
    setBusy(false);
    if (!result.ok) {
      return setError(problemSiteErrorMessage(result.error, result.status, result.limit));
    }
    reset();
    setError(null);
    router.refresh();
  }

  async function remove(rule: ProblemSiteRule, deleteHistory: boolean) {
    setBusy(true);
    const result = await request(`/api/settings/problem-rules/${rule.id}`, {
      method: "DELETE",
      json: { deleteHistory },
      schema: RemoveProblemRuleReplySchema,
    });
    setBusy(false);
    setRemoving(null);
    if (!result.ok) {
      return setRemoveError(
        problemSiteErrorMessage(result.error, result.status, undefined, "remove"),
      );
    }
    setRemoveError(null);
    router.refresh();
  }

  const preview = proposal?.ok ? previewLines(proposal) : null;
  const shownLabel = label ?? (proposal?.ok ? proposal.domain : "");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{SITE_COPY.intro}</p>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{SITE_COPY.listTitle}</h3>
        <ul className="flex flex-col divide-y divide-border" data-testid="problem-site-list">
          {PROBLEMS.BUILT_IN_PROBLEM_RULES.map((rule) => (
            <li key={rule.domain} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 break-words">{ruleAddress(rule)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{SITE_COPY.builtInTag}</span>
            </li>
          ))}
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 break-words">
                {rule.label}
                <span className="block text-xs text-muted-foreground">{ruleAddress(rule)}</span>
              </span>
              <Button
                variant="destructive-ghost"
                size="sm"
                disabled={busy}
                aria-label={SITE_COPY.remove(rule.label)}
                onClick={() =>
                  removeNeedsDialog(rule) ? setRemoving(rule) : void remove(rule, false)
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{SITE_COPY.builtInHelp}</p>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{SITE_COPY.empty}</p>
        ) : null}
        {removeError ? (
          <p role="alert" className="text-sm text-destructive">
            {removeError}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground" data-testid="problem-rules-version-note">
          {SITE_COPY.versionNote}
        </p>
      </div>

      <form onSubmit={check} className="flex flex-col gap-2" noValidate>
        <h3 className="text-sm font-medium">{SITE_COPY.addTitle}</h3>
        <p className="text-sm text-muted-foreground">{SITE_COPY.addHelp}</p>
        <label htmlFor={urlId} className="text-sm">
          {SITE_COPY.urlLabel}
        </label>
        <div className="flex gap-2">
          <Input
            id={urlId}
            name="example"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={SITE_COPY.urlPlaceholder}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy || typed.trim() === ""}>
            {SITE_COPY.check}
          </Button>
        </div>
      </form>

      {proposal && !proposal.ok ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          <p>{proposalFailure(proposal.reason, host, host)}</p>
          {proposal.reason === "no_tracked_domain" && host ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void addStudySite()}>
              {SITE_COPY.addTrackedSite(host)}
            </Button>
          ) : null}
        </div>
      ) : null}

      {proposal?.ok && preview ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-border p-3"
          data-testid="proposal"
        >
          {proposal.candidates.length > 1 ? (
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1">{SITE_COPY.pickLegend}</legend>
              {proposal.candidates.map((index) => (
                <label key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="problem-id-part"
                    className="size-4 accent-primary"
                    checked={proposal.idIndex === index}
                    onChange={() => {
                      setPick(index);
                      setConfirmed(false);
                    }}
                  />
                  <code className="break-all">{proposal.segments[index]}</code>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-col gap-1 text-sm">
            <p data-testid="preview-keep">
              {SITE_COPY.keepPrefix} <code className="break-all">{preview.keep}</code>
            </p>
            <p data-testid="preview-not-kept">
              {SITE_COPY.notKeptPrefix} {SITE_COPY.notKeptRest}
              {preview.notKept ? (
                <>
                  {" "}
                  (<code className="break-all">{preview.notKept}</code>)
                </>
              ) : null}
            </p>
            <p className="text-muted-foreground">
              {SITE_COPY.rulePrefix} <code className="break-all">{preview.rule}</code>
            </p>
          </div>
          {proposal.warn ? (
            <p role="alert" className="text-sm font-medium" data-testid="personal-data-warning">
              {SITE_COPY.warning}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor={labelId} className="text-sm">
              {SITE_COPY.labelLabel}
            </label>
            <Input
              id={labelId}
              autoComplete="off"
              maxLength={PROBLEMS.PROBLEM_RULE_LABEL_MAX}
              value={shownLabel}
              onChange={(e) => setLabel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{SITE_COPY.labelHelp}</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>{SITE_COPY.confirm}</span>
          </label>
          <div>
            <Button
              disabled={busy || !canAddRule(confirmed, shownLabel)}
              onClick={() => void add()}
            >
              {SITE_COPY.add}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && !busy && setRemoving(null)}>
        <DialogContent>
          <DialogTitle>{SITE_COPY.dialogTitle(removing?.label ?? "")}</DialogTitle>
          <DialogDescription>
            {SITE_COPY.dialogBody(removing?.domain ?? "")}
            {removing?.sharesDomain ? ` ${SITE_COPY.dialogShared(removing.domain)}` : ""}
          </DialogDescription>
          <DialogFooter className="flex-col sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => removing && void remove(removing, false)}
            >
              {SITE_COPY.keepHistory}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => removing && void remove(removing, true)}
            >
              {SITE_COPY.deleteHistory}
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" disabled={busy}>
                {SITE_COPY.cancel}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
