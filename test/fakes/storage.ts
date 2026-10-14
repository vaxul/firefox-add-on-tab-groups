// Fake of `browser.storage` with the `local` and `session` areas. Values are
// cloned on write and read, as the real API serialises them.
import { Dispatcher, FakeEvent } from "./events";

type Changes = Record<string, browser.storage.StorageChange>;
type Keys = string | string[] | Record<string, unknown> | null | undefined;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function pick(data: Map<string, unknown>, keys: Keys): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (keys === null || keys === undefined) {
    for (const [key, value] of data) result[key] = clone(value);
    return result;
  }
  const defaults: Record<string, unknown> =
    typeof keys === "string" || Array.isArray(keys) ? {} : keys;
  const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
  for (const name of names) {
    const value = data.has(name) ? data.get(name) : defaults[name];
    if (value !== undefined) result[name] = clone(value);
  }
  return result;
}

export function createStorageArea(name: string, onChanged: FakeEvent<[Changes, string]>) {
  const data = new Map<string, unknown>();
  const notify = (changes: Changes) => {
    if (Object.keys(changes).length > 0) onChanged.emitLater(changes, name);
  };
  return {
    get: async (keys?: Keys) => pick(data, keys),
    set: async (items: Record<string, unknown>) => {
      const changes: Changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: clone(data.get(key)), newValue: clone(value) };
        data.set(key, clone(value));
      }
      notify(changes);
    },
    remove: async (keys: string | string[]) => {
      const changes: Changes = {};
      for (const key of [keys].flat()) {
        if (data.has(key)) changes[key] = { oldValue: clone(data.get(key)) };
        data.delete(key);
      }
      notify(changes);
    },
    clear: async () => {
      data.clear();
    },
    /** Empties the area without change events. */
    reset(): void {
      data.clear();
    },
  };
}

export type FakeStorageArea = ReturnType<typeof createStorageArea>;

export function createStorageFake(dispatcher: Dispatcher) {
  const onChanged = new FakeEvent<[Changes, string]>(dispatcher);
  const local = createStorageArea("local", onChanged);
  const session = createStorageArea("session", onChanged);
  return {
    onChanged,
    local,
    session,
    reset(): void {
      local.reset();
      session.reset();
      onChanged.clear();
    },
  };
}

export type FakeStorage = ReturnType<typeof createStorageFake>;
