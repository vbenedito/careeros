import { useState } from "react";
import { Switch } from "../ui";

/** EXT-UI-06: per-device switch; off closes the open interval and tracks nothing. */
export function TrackingSetting(props: {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Switch
      label="Tracking"
      description="On this device only"
      checked={props.enabled}
      disabled={busy}
      onChange={async (value) => {
        setBusy(true);
        await props.onChange(value);
        setBusy(false);
      }}
    />
  );
}
