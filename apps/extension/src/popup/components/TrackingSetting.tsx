import { useState } from "react";
import type { TrackingResult } from "../data";
import { errorMessage } from "../messages";
import { Switch } from "../ui";

/**
 * EXT-UI-06: per-device switch; off closes the open interval and tracks nothing.
 * EXT-UI-05c (#65): it shows the new position at once, then the value the worker stored, until
 * storage reloads with it (no flicker back); no reply shows an error.
 */
export function TrackingSetting(props: {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<TrackingResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The worker's answer, held until the stored value (props.enabled) catches up.
  const [shown, setShown] = useState<{ value: boolean; over: boolean } | null>(null);
  if (shown && !busy && shown.over !== props.enabled) setShown(null);

  return (
    <div className="flex flex-col gap-1">
      <Switch
        label="Tracking"
        description="On this device only"
        checked={shown?.value ?? props.enabled}
        disabled={busy}
        onChange={async (value) => {
          const over = props.enabled;
          setBusy(true);
          setError(null);
          setShown({ value, over });
          const result = await props.onChange(value);
          if (result.ok) setShown({ value: result.enabled, over });
          else {
            setShown(null);
            setError(errorMessage(result.error));
          }
          setBusy(false);
        }}
      />
      {error ? (
        <p role="alert" className="text-xs text-warning">
          {error}
        </p>
      ) : null}
    </div>
  );
}
