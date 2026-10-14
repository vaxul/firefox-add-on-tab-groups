// Fake of `browser.sessions`: tab/window values and recently closed restore.
import type { ClosedEntry, TabRecord, WindowRecord, World } from "./world";

type Session = browser.sessions.Session;

function readValue(values: Map<string, string>, key: string): unknown {
  const json = values.get(key);
  return json === undefined ? undefined : JSON.parse(json);
}

function writeValue(values: Map<string, string>, key: string, value: unknown): void {
  values.set(key, JSON.stringify(value));
}

/** A new tab carrying the closed tab's url, pinned state, and values (F7). */
function reopen(world: World, closed: TabRecord, windowId: number): TabRecord {
  return world.newTabRecord(windowId, {
    url: closed.url,
    title: closed.title,
    pinned: closed.pinned,
    discarded: !closed.active,
    values: new Map(closed.values),
  });
}

function restoreTab(world: World, entry: NonNullable<ClosedEntry["tab"]>): browser.tabs.Tab {
  const original = world.windows.get(entry.record.windowId);
  const win = original ?? world.resolveWindow(undefined);
  const tab = reopen(world, entry.record, win.id);
  world.insertTab(win, tab, entry.index);
  // F7: values are readable in tabs.onCreated.
  world.events.tabs.onCreated.emitLater(world.snapshotTab(tab));
  world.activate(tab);
  return world.snapshotTab(tab);
}

function restoreWindow(
  world: World,
  entry: NonNullable<ClosedEntry["window"]>,
): browser.windows.Window {
  const win: WindowRecord = world.newWindowRecord(entry.record.type);
  win.values = new Map(entry.record.values);
  world.events.windows.onCreated.emitLater(world.snapshotWindow(win));
  const restored = entry.tabs.map((closed) => {
    const tab = reopen(world, closed, win.id);
    world.insertTab(win, tab);
    world.events.tabs.onCreated.emitLater(world.snapshotTab(tab));
    return { tab, closed };
  });
  const active = restored.find(({ closed }) => closed.active) ?? restored[0];
  if (active) world.activate(active.tab);
  // F7: undo-close-window re-hides the hidden tabs via onUpdated {hidden: true}.
  for (const { tab, closed } of restored) {
    if (closed.hidden && !tab.active) world.setHidden(tab, true);
  }
  world.focus(win);
  return world.snapshotWindow(win, true);
}

function restore(world: World, sessionId?: string): Session {
  const entry =
    sessionId === undefined ? world.closed[0] : world.closed.find((e) => e.sessionId === sessionId);
  if (!entry) throw new Error(`Could not restore object using sessionId ${sessionId}`);
  world.closed = world.closed.filter((e) => e !== entry);
  const lastModified = entry.closedAt;
  if (entry.tab) return { lastModified, tab: restoreTab(world, entry.tab) };
  if (entry.window) return { lastModified, window: restoreWindow(world, entry.window) };
  throw new Error("Empty closed entry");
}

function closedTab(tab: TabRecord, index: number, sessionId?: string): browser.tabs.Tab {
  const { id, windowId, url, title, pinned, hidden } = tab;
  const flags = { active: false, highlighted: false, incognito: false };
  return { id, index, windowId, url, title, pinned, hidden, sessionId, ...flags };
}

function recentlyClosed(world: World): Session[] {
  return world.closed.map(({ closedAt, sessionId, tab, window }) => ({
    lastModified: closedAt,
    tab: tab && closedTab(tab.record, tab.index, sessionId),
    window: window && {
      id: window.record.id,
      sessionId,
      focused: false,
      incognito: false,
      alwaysOnTop: false,
      tabs: window.tabs.map((t, i) => closedTab(t, i)),
    },
  }));
}

export function createSessionsFake(world: World) {
  const tabValues = (tabId: number) => world.getTab(tabId).values;
  const windowValues = (windowId: number) => world.getWindow(windowId).values;
  return {
    MAX_SESSION_RESULTS: 25,
    setTabValue: async (tabId: number, key: string, value: unknown) =>
      writeValue(tabValues(tabId), key, value),
    getTabValue: async (tabId: number, key: string) => readValue(tabValues(tabId), key),
    removeTabValue: async (tabId: number, key: string) => void tabValues(tabId).delete(key),
    setWindowValue: async (windowId: number, key: string, value: unknown) =>
      writeValue(windowValues(windowId), key, value),
    getWindowValue: async (windowId: number, key: string) => readValue(windowValues(windowId), key),
    removeWindowValue: async (windowId: number, key: string) =>
      void windowValues(windowId).delete(key),
    getRecentlyClosed: async () => recentlyClosed(world),
    restore: async (sessionId?: string) => restore(world, sessionId),
    /** Forgets every recently closed tab and window. */
    reset(): void {
      world.closed = [];
    },
  };
}

export type FakeSessions = ReturnType<typeof createSessionsFake>;
