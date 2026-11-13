/**
 * Serializes async work inside the service worker (AUTH-10: one refresh at a time).
 *
 * Chrome runs at most one service worker per extension, and only the worker touches the
 * session (EXT-UI-05a), so an in-memory lock serializes every refresh. A lock persisted in
 * storage would add nothing: a killed worker could not release it, and the next worker would
 * have to wait for it to expire.
 *
 * AUTH-10c (grill E1): a caller waits at most `acquireTimeoutMs` for the lock. A holder that
 * never finishes then makes later callers fail with `LockTimeoutError` (a temporary failure)
 * instead of blocking them forever. A caller that gave up never runs its task.
 */
export class LockTimeoutError extends Error {
  override name = "LockTimeoutError";
  constructor() {
    super("timed out waiting for the lock");
  }
}

export interface MutexOptions {
  /** Give up waiting for the lock after this long. Omitted: wait forever. */
  acquireTimeoutMs?: number;
  timers?: Pick<typeof globalThis, "setTimeout" | "clearTimeout">;
}

export function createMutex(options: MutexOptions = {}) {
  const timers = options.timers ?? globalThis;
  /** Settles when every task queued so far has finished or given up. */
  let tail: Promise<void> = Promise.resolve();
  return function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = tail;
    let release: () => void = () => undefined;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The next caller waits for the current holder and then for this slot.
    tail = previous.then(() => mine);

    const acquired =
      options.acquireTimeoutMs === undefined
        ? previous.then(() => true)
        : new Promise<boolean>((resolve) => {
            const timer = timers.setTimeout(() => resolve(false), options.acquireTimeoutMs);
            void previous.then(() => {
              timers.clearTimeout(timer);
              resolve(true);
            });
          });

    return acquired.then(async (ok) => {
      if (!ok) {
        // Give the slot up at once: nothing of ours will run.
        release();
        throw new LockTimeoutError();
      }
      try {
        return await task();
      } finally {
        release();
      }
    });
  };
}
