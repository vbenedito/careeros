/**
 * EXT-UI-02 duration format, shared by the popup and the dashboard:
 * `0m`, `<1m`, `45m`, `1h 05m`, `12h 30m`. Seconds are truncated, never rounded up.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  if (seconds === 0) return "0m";
  if (seconds < 60) return "<1m";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
