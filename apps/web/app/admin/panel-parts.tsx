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
