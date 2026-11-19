import { formatDuration } from "@careeros/shared";
import type { PopupView } from "../../lib/popup-view";

/**
 * Current session (spec 05 §2). EXT-UI-11, PRB-14: a second line with the problem name and its
 * time today on this device (`Two Sum · 18m today`) while the open interval has a problem.
 */
export function CurrentSession({ domain, seconds, problem }: NonNullable<PopupView["current"]>) {
  return (
    <div className="flex flex-col gap-0.5" data-testid="current-session">
      <p className="text-sm">
        <span className="font-medium">{domain}</span>
        <span className="text-muted-foreground"> · {formatDuration(seconds)}</span>
      </p>
      {problem ? (
        <p className="text-xs text-muted-foreground" data-testid="current-problem">
          {problem.name} · {formatDuration(problem.seconds)} today
        </p>
      ) : null}
    </div>
  );
}
