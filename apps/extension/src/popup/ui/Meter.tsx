/**
 * Horizontal bar for a share between 0 and 1. Decorative: the value is always shown as text
 * next to it (EXT-UI-09).
 */
export function Meter({ value }: { value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}
