import { formatDuration } from "@careeros/shared";
import type { DomainTime } from "../../lib/popup-view";
import { Meter } from "../ui";

/** Up to 3 domains; bar width = domain time ÷ today's total (shared scale). */
export function TopSites({ sites }: { sites: DomainTime[] }) {
  if (sites.length === 0) return null;
  return (
    <section aria-label="Top sites today">
      <ul className="flex flex-col gap-2">
        {sites.map((d) => (
          <li key={d.domain} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span>{d.domain}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatDuration(d.seconds)}
              </span>
            </div>
            <Meter value={d.share} />
          </li>
        ))}
      </ul>
    </section>
  );
}
