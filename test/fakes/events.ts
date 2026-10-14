// Event plumbing shared by all fakes. Listener calls and their returned promises
// are tracked by a Dispatcher so a test can `await flush()` until every event,
// including the late ones (F4), has been delivered and handled.

export type Listener<A extends unknown[]> = (...args: A) => unknown;

/** Tracks pending deliveries and listener errors across all fake events. */
export class Dispatcher {
  private readonly pending = new Set<Promise<unknown>>();
  private errors: unknown[] = [];
  private generation = 0;

  /** Remembers a listener result so `flush()` waits for it. */
  track(result: unknown): void {
    if (!(result instanceof Promise)) return;
    const tracked: Promise<unknown> = result.then(
      () => this.pending.delete(tracked),
      (error: unknown) => {
        this.errors.push(error);
        this.pending.delete(tracked);
      },
    );
    this.pending.add(tracked);
  }

  /**
   * Runs `fn` in a later macrotask. Models F4: events of an own action can
   * arrive after the API call that caused them has resolved.
   */
  later(fn: () => void): void {
    const generation = this.generation;
    this.track(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          if (generation === this.generation) fn();
          resolve();
        }, 0);
      }),
    );
  }

  recordError(error: unknown): void {
    this.errors.push(error);
  }

  /** Waits until no delivery is pending; rethrows listener errors. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
    const errors = this.errors;
    this.errors = [];
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Listener errors");
  }

  /** Cancels pending late deliveries and drops recorded errors. */
  reset(): void {
    this.generation += 1;
    this.pending.clear();
    this.errors = [];
  }
}

interface Registration<A extends unknown[], F> {
  callback: Listener<A>;
  filter: F | undefined;
}

/** A `browser.*.on*` event with `addListener`/`removeListener`/`hasListener`. */
export class FakeEvent<A extends unknown[], F = undefined> {
  private registrations: Registration<A, F>[] = [];

  constructor(
    private readonly dispatcher: Dispatcher,
    private readonly matches: (filter: F, args: A) => boolean = () => true,
  ) {}

  addListener(callback: Listener<A>, filter?: F): void {
    if (this.hasListener(callback)) return;
    this.registrations.push({ callback, filter });
  }

  removeListener(callback: Listener<A>): void {
    this.registrations = this.registrations.filter((r) => r.callback !== callback);
  }

  hasListener(callback: Listener<A>): boolean {
    return this.registrations.some((r) => r.callback === callback);
  }

  get listenerCount(): number {
    return this.registrations.length;
  }

  /** Delivers the event to every matching listener now. */
  emit(...args: A): void {
    for (const { callback, filter } of [...this.registrations]) {
      if (filter !== undefined && !this.matches(filter, args)) continue;
      try {
        this.dispatcher.track(callback(...args));
      } catch (error) {
        this.dispatcher.recordError(error);
      }
    }
  }

  /** Delivers the event now and returns each listener's return value. */
  collect(...args: A): unknown[] {
    return this.registrations.map(({ callback }) => {
      try {
        const result = callback(...args);
        this.dispatcher.track(result);
        return result;
      } catch (error) {
        this.dispatcher.recordError(error);
        return undefined;
      }
    });
  }

  /** Delivers the event in a later macrotask (F4). */
  emitLater(...args: A): void {
    this.dispatcher.later(() => this.emit(...args));
  }

  /** Removes every listener, as an unloaded event page would. */
  clear(): void {
    this.registrations = [];
  }
}
