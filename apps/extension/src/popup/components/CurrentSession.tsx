import { formatDuration } from "@careeros/shared";

export function CurrentSession({ domain, seconds }: { domain: string; seconds: number }) {
  return (
    <p className="text-sm" data-testid="current-session">
      <span className="font-medium">{domain}</span>
      <span className="text-muted-foreground"> · {formatDuration(seconds)}</span>
    </p>
  );
}
