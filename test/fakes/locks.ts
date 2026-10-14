// Web Locks stand-in (`navigator.locks`): exclusive locks, granted per name in
// request order (D5). Only the subset the extension uses is modelled.

type LockCallback<T> = (lock: { name: string; mode: "exclusive" }) => T | Promise<T>;

export function createLocksFake() {
  let tails = new Map<string, Promise<void>>();
  let held = new Set<string>();

  function request<T>(
    name: string,
    optionsOrCallback: object | LockCallback<T>,
    maybeCallback?: LockCallback<T>,
  ): Promise<T> {
    const callback =
      typeof optionsOrCallback === "function"
        ? optionsOrCallback
        : (maybeCallback as LockCallback<T>);
    const previous = tails.get(name) ?? Promise.resolve();
    const run = previous.then(async () => {
      held.add(name);
      try {
        return await callback({ name, mode: "exclusive" });
      } finally {
        held.delete(name);
      }
    });
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    tails.set(name, tail);
    return run;
  }

  return {
    request,
    /** Test helper: whether a lock with this name is currently held. */
    isHeld: (name: string) => held.has(name),
    reset(): void {
      tails = new Map();
      held = new Set();
    },
  };
}

export type FakeLocks = ReturnType<typeof createLocksFake>;
