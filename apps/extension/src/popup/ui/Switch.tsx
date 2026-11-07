import { cn } from "./cn";

/** Accessible on/off switch (role="switch"); the label is part of the control. */
export function Switch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      // aria-disabled (not `disabled`) while busy, so keyboard focus is not lost (EXT-UI-09).
      aria-disabled={props.disabled === true}
      onClick={() => {
        if (!props.disabled) props.onChange(!props.checked);
      }}
      className="flex w-full items-center justify-between gap-3 text-left aria-disabled:opacity-60"
    >
      <span className="flex flex-col">
        <span className="text-sm font-medium">{props.label}</span>
        {props.description ? (
          <span className="text-xs text-muted-foreground">{props.description}</span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
          props.checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
            props.checked ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
