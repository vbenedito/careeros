import { type FormEvent, useState } from "react";
import type { CommandResult } from "../data";
import { errorMessage } from "../messages";
import { Button, Input } from "../ui";

/** EXT-UI-07: the same server list as the dashboard; edits go to the server first (SYNC-10). */
export function SitesSetting(props: {
  sites: readonly string[] | null;
  onAdd: (input: string) => Promise<CommandResult>;
  onRemove: (domain: string) => Promise<CommandResult>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<CommandResult>, onSuccess?: () => void) {
    setBusy(true);
    setError(null);
    const result = await task();
    setBusy(false);
    if (result.ok) onSuccess?.();
    else setError(errorMessage(result.error));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim())
      void run(
        () => props.onAdd(value.trim()),
        () => setValue(""),
      );
  }

  return (
    <section aria-labelledby="sites-heading" className="flex flex-col gap-2">
      <h2 id="sites-heading" className="text-sm font-medium">
        Tracked sites
      </h2>
      {props.sites === null ? (
        <p className="text-xs text-muted-foreground">Loading your sites…</p>
      ) : props.sites.length === 0 ? (
        <p className="text-xs text-muted-foreground">No sites yet. Add the sites you study on.</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" data-testid="sites">
          {props.sites.map((site) => (
            <li key={site} className="flex items-center justify-between text-sm">
              <span>{site}</span>
              <Button
                variant="destructive-ghost"
                size="sm"
                disabled={busy}
                aria-label={`Remove ${site}`}
                onClick={() => void run(() => props.onRemove(site))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <Input
          aria-label="Site to track"
          placeholder="leetcode.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          autoComplete="off"
        />
        <Button type="submit" size="md" disabled={busy || !value.trim()}>
          Add
        </Button>
      </form>
      {/* #60 (product owner): a domain counts with all its subdomains and pages (TRK-03). */}
      <p className="text-xs text-muted-foreground">
        Broad sites like youtube.com count every page on them.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-warning">
          {error}
        </p>
      ) : null}
    </section>
  );
}
