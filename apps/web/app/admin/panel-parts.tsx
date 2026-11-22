import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** A table that scrolls sideways inside its own box, so the page never does (TEST-01). */
export function ScrollTable({ minWidth, children }: { minWidth: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} text-left text-sm`}>{children}</table>
    </div>
  );
}

export const TH = "py-2 pr-3 font-medium";
export const TD = "py-2 pr-3 align-top";
export const TR = "border-b border-border last:border-b-0";

/** The sentence shown in place of a panel's content when its source could not be read. */
export function Unavailable({ what, note }: { what: string; note: string | null }) {
  return (
    <p className="text-sm" role="status">
      {what} unavailable{note === null ? "" : ` (${note})`}
    </p>
  );
}

/**
 * ADM-20.5: a native `<details>`, closed by default. The whole summary row is the target (at least
 * 44 px high), it works with Enter and Space, and it shows a focus ring. `label` reads
 * "Details: <what>". No client JavaScript.
 */
export function Details({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group border-t border-border">
      <summary className="flex min-h-11 cursor-pointer list-none px-2 items-center gap-2 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        {label}
      </summary>
      <div className="flex flex-col gap-3 pt-1 pb-2">{children}</div>
    </details>
  );
}

/** A colour key for a legend: the mark's colour next to text that names it (never colour alone). */
export function Swatch({ className }: { className: string }) {
  return <span aria-hidden="true" className={`size-3 shrink-0 rounded-sm ${className}`} />;
}
