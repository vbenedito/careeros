/**
 * Serializes async work inside the service worker (AUTH-10: one refresh at a time).
 *
 * Chrome runs at most one service worker per extension, and only the worker touches the
 * session (EXT-UI-05a), so an in-memory lock serializes every refresh. A lock persisted in
 * storage would add nothing: a killed worker could not release it, and the next worker would
 * have to wait for it to expire.
 */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
