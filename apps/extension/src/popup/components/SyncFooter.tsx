import { Button } from "../ui";

export function SyncFooter(props: {
  syncLabel: string;
  quarantined: number;
  version: string;
  onOpenDashboard: () => void;
}) {
  return (
    <footer className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
      <span
        data-testid="sync-label"
        title={
          props.quarantined > 0
            ? "These intervals were rejected by the server and are kept on this device."
            : undefined
        }
      >
        {props.syncLabel}
        {props.quarantined > 0 ? ` · ${props.quarantined} not synced` : ""}
      </span>
      <span className="flex items-center gap-2">
        <span>v{props.version}</span>
        <Button variant="link-xs" onClick={props.onOpenDashboard}>
          Open dashboard ↗
        </Button>
      </span>
    </footer>
  );
}
