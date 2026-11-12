/**
 * SYNC-05a (#58, product owner decision A): the server rejects study time that ends in its
 * future, so a computer clock that runs ahead holds new sessions back until their end time has
 * passed on the server. Tells the user to fix the clock.
 */
export function ClockHint({ minutes, deferred }: { minutes: number; deferred: number }) {
  return (
    <section
      aria-label="Clock"
      data-testid="clock-hint"
      className="flex flex-col gap-0.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
    >
      <p>
        Your computer's clock is about {minutes} min ahead. Fix it so new study time syncs right
        away.
      </p>
      {deferred > 0 ? (
        <p className="text-muted-foreground">
          {deferred === 1 ? "1 session" : `${deferred} sessions`} waiting to sync.
        </p>
      ) : null}
    </section>
  );
}
