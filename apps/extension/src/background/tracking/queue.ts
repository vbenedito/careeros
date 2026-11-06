/**
 * TRK-17: runs tasks strictly one at a time, in arrival order. A failing task never blocks
 * the ones after it.
 */
export function createSerialQueue(onError: (error: unknown) => void = () => {}) {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    tail = run.catch((error: unknown) => onError(error));
    return run;
  };
}

export type SerialQueue = ReturnType<typeof createSerialQueue>;
