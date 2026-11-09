"use client";

/** DASH-12: list, add and remove tracked sites (shared with the extension, SYNC-09). */
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
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
import { type Site, SiteSchema, siteErrorMessage } from "@/lib/settings/sites";

export function TrackedSites({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Site | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await request("/api/sites", {
      method: "POST",
      json: { domain: value },
      schema: SiteSchema,
    });
    setBusy(false);
    if (!result.ok) return setError(siteErrorMessage(result.error, result.status));
    setValue("");
    setError(null);
    router.refresh();
  }

  async function remove(site: Site) {
    setBusy(true);
    const result = await request(`/api/sites/${site.id}`, {
      method: "DELETE",
      schema: SiteSchema.pick({ id: true }),
    });
    setBusy(false);
    setRemoving(null);
    if (!result.ok) return setRemoveError(siteErrorMessage(result.error, result.status));
    setRemoveError(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex flex-col gap-2" noValidate>
        <label htmlFor="site" className="text-sm">
          Add a site you study on
        </label>
        <div className="flex gap-2">
          <Input
            id="site"
            name="domain"
            placeholder="leetcode.com"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? "site-error" : undefined}
          />
          <Button type="submit" disabled={busy}>
            Add
          </Button>
        </div>
        {error ? (
          <p id="site-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      {removeError ? (
        <p role="alert" className="text-sm text-destructive">
          {removeError}
        </p>
      ) : null}
      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sites yet. Time is only tracked on the sites you add here or in the extension.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="site-list">
          {sites.map((site) => (
            <li key={site.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={site.domain}>
                {site.domain}
              </span>
              <Button
                variant="destructive-ghost"
                size="icon"
                aria-label={`Remove ${site.domain}`}
                onClick={() => setRemoving(site)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogTitle>Remove {removing?.domain}?</DialogTitle>
          <DialogDescription>
            Time on this site stops being tracked. Study time already recorded is kept.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => removing && void remove(removing)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
