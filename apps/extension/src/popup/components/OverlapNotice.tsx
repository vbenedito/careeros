import { Button } from "../ui";

/**
 * SYNC-05c (product owner 2026-11-17): time the server could not store because it overlapped
 * time already stored for this device, e.g. after the clock moved back. Not an error. It stays
 * until dismissed; the dismiss sends back the seconds shown so only those are subtracted.
 */
export function OverlapNotice({ minutes, onDismiss }: { minutes: number; onDismiss: () => void }) {
  return (
    <section
      aria-label="Time not saved"
      data-testid="overlap-notice"
      className="flex items-start justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
    >
      <p>{minutes} min not saved: your computer's clock moved back</p>
      <Button
        variant="subtle"
        size="sm"
        className="-my-1 -mr-2"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ✕
      </Button>
    </section>
  );
}
