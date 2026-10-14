// Shared in-memory model of windows and tabs. The `tabs`, `windows`, and
// `sessions` fakes are views over one World, because their behaviour is
// intertwined (cross-window moves, window close on last visible tab, values).
import { Dispatcher, FakeEvent } from "./events";

type Tab = browser.tabs.Tab;
type ChangeInfo = browser.tabs._OnUpdatedChangeInfo;

export const WINDOW_ID_NONE = -1;
export const WINDOW_ID_CURRENT = -2;
export const TAB_GROUP_ID_NONE = -1;

export function toIds(tabIds: number | number[]): number[] {
  return Array.isArray(tabIds) ? tabIds : [tabIds];
}

export interface TabRecord {
  id: number;
  windowId: number;
  url: string;
  title: string;
  active: boolean;
  pinned: boolean;
  hidden: boolean;
  discarded: boolean;
  lastAccessed: number;
  /** Native Firefox tab group id; -1 when ungrouped. */
  groupId: number;
  sharing: browser.tabs.SharingState;
  /** `sessions` tab values as JSON strings. */
  values: Map<string, string>;
}

export interface WindowRecord {
  id: number;
  type: browser.windows.WindowType;
  focused: boolean;
  tabIds: number[];
  /** `sessions` window values as JSON strings. */
  values: Map<string, string>;
}

/** An entry of `sessions.getRecentlyClosed()`. */
export interface ClosedEntry {
  sessionId: string;
  closedAt: number;
  tab?: { record: TabRecord; index: number };
  window?: { record: WindowRecord; tabs: TabRecord[] };
}

function matchesUpdateFilter(
  filter: browser.tabs.UpdateFilter,
  [tabId, changeInfo, tab]: [number, ChangeInfo, Tab],
): boolean {
  if (filter.tabId !== undefined && filter.tabId !== tabId) return false;
  if (filter.windowId !== undefined && filter.windowId !== tab.windowId) return false;
  const properties = filter.properties;
  return properties === undefined || properties.some((p) => p in changeInfo);
}

function createEvents(d: Dispatcher) {
  return {
    tabs: {
      onCreated: new FakeEvent<[Tab]>(d),
      onUpdated: new FakeEvent<[number, ChangeInfo, Tab], browser.tabs.UpdateFilter>(
        d,
        matchesUpdateFilter,
      ),
      onRemoved: new FakeEvent<[number, browser.tabs._OnRemovedRemoveInfo]>(d),
      onActivated: new FakeEvent<[browser.tabs._OnActivatedActiveInfo]>(d),
      onAttached: new FakeEvent<[number, browser.tabs._OnAttachedAttachInfo]>(d),
      onDetached: new FakeEvent<[number, browser.tabs._OnDetachedDetachInfo]>(d),
      onMoved: new FakeEvent<[number, browser.tabs._OnMovedMoveInfo]>(d),
    },
    windows: {
      onCreated: new FakeEvent<[browser.windows.Window]>(d),
      onRemoved: new FakeEvent<[number]>(d),
      onFocusChanged: new FakeEvent<[number]>(d),
    },
  };
}

export type WorldEvents = ReturnType<typeof createEvents>;

export class World {
  readonly events: WorldEvents;
  tabs = new Map<number, TabRecord>();
  windows = new Map<number, WindowRecord>();
  closed: ClosedEntry[] = [];
  nextTabId = 1;
  nextWindowId = 1;
  nextGroupId = 1;
  private nextSessionId = 1;
  private clock = 1_000_000;

  constructor(readonly dispatcher: Dispatcher) {
    this.events = createEvents(dispatcher);
  }

  /** Empties the world and removes every tab and window listener. */
  reset(): void {
    this.tabs.clear();
    this.windows.clear();
    this.closed = [];
    this.nextTabId = 1;
    this.nextWindowId = 1;
    this.nextGroupId = 1;
    this.nextSessionId = 1;
    this.clock = 1_000_000;
    this.clearListeners();
  }

  clearListeners(): void {
    for (const ns of [this.events.tabs, this.events.windows]) {
      for (const event of Object.values(ns)) event.clear();
    }
  }

  /** Monotonic fake time for `lastAccessed` and recently-closed entries. */
  tick(): number {
    this.clock += 1;
    return this.clock;
  }

  newSessionId(): string {
    return `session-${this.nextSessionId++}`;
  }

  getTab(tabId: number): TabRecord {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error(`Invalid tab ID: ${tabId}`);
    return tab;
  }

  getWindow(windowId: number): WindowRecord {
    const win = this.windows.get(windowId);
    if (!win) throw new Error(`Invalid window ID: ${windowId}`);
    return win;
  }

  /** The focused window, else the most recently created one. */
  currentWindow(): WindowRecord | undefined {
    const all = [...this.windows.values()];
    return all.find((w) => w.focused) ?? all.at(-1);
  }

  resolveWindow(windowId: number | undefined): WindowRecord {
    if (windowId === undefined || windowId === WINDOW_ID_CURRENT) {
      const current = this.currentWindow();
      if (!current) throw new Error("No current window");
      return current;
    }
    return this.getWindow(windowId);
  }

  indexOf(tab: TabRecord): number {
    return this.getWindow(tab.windowId).tabIds.indexOf(tab.id);
  }

  snapshotTab(tab: TabRecord): Tab {
    return {
      id: tab.id,
      index: this.indexOf(tab),
      windowId: tab.windowId,
      highlighted: tab.active,
      active: tab.active,
      pinned: tab.pinned,
      hidden: tab.hidden,
      discarded: tab.discarded,
      lastAccessed: tab.lastAccessed,
      incognito: false,
      url: tab.url,
      title: tab.title,
      groupId: tab.groupId,
      sharingState: { ...tab.sharing },
    };
  }

  snapshotWindow(win: WindowRecord, populate = false): browser.windows.Window {
    return {
      id: win.id,
      focused: win.focused,
      incognito: false,
      alwaysOnTop: false,
      type: win.type,
      state: "normal",
      tabs: populate ? win.tabIds.map((id) => this.snapshotTab(this.getTab(id))) : undefined,
    };
  }

  newTabRecord(windowId: number, init: Partial<TabRecord> = {}): TabRecord {
    const url = init.url ?? "about:newtab";
    return {
      id: this.nextTabId++,
      windowId,
      url,
      title: url,
      active: false,
      pinned: false,
      hidden: false,
      discarded: false,
      lastAccessed: this.tick(),
      groupId: TAB_GROUP_ID_NONE,
      sharing: { camera: false, microphone: false },
      values: new Map(),
      ...init,
    };
  }

  newWindowRecord(type: browser.windows.WindowType = "normal"): WindowRecord {
    const win: WindowRecord = {
      id: this.nextWindowId++,
      type,
      focused: false,
      tabIds: [],
      values: new Map(),
    };
    this.windows.set(win.id, win);
    return win;
  }

  /**
   * Inserts a tab into a window; pinned tabs stay in the leading pinned block.
   * An index of -1 or undefined appends to the block (past a hidden tail, F6).
   */
  insertTab(win: WindowRecord, tab: TabRecord, index?: number): number {
    const pinnedCount = win.tabIds.filter((id) => this.tabs.get(id)?.pinned).length;
    const [min, max] = tab.pinned ? [0, pinnedCount] : [pinnedCount, win.tabIds.length];
    const wanted = index === undefined || index < 0 ? max : index;
    const at = Math.min(Math.max(wanted, min), max);
    win.tabIds.splice(at, 0, tab.id);
    tab.windowId = win.id;
    this.tabs.set(tab.id, tab);
    return at;
  }

  /** Removes a tab from its window's order; activates a successor if needed. */
  detachTab(tab: TabRecord): number {
    const win = this.getWindow(tab.windowId);
    const position = win.tabIds.indexOf(tab.id);
    win.tabIds.splice(position, 1);
    if (tab.active) {
      tab.active = false;
      const successor = this.successor(win, position);
      if (successor) this.activate(successor, tab.id);
    }
    return position;
  }

  /** Adjacent visible tab, right first, then left (Firefox default). */
  private successor(win: WindowRecord, position: number): TabRecord | undefined {
    const visible = (id: number | undefined) =>
      id !== undefined && this.tabs.get(id)?.hidden === false ? this.tabs.get(id) : undefined;
    for (let i = position; i < win.tabIds.length; i++) {
      const tab = visible(win.tabIds[i]);
      if (tab) return tab;
    }
    for (let i = position - 1; i >= 0; i--) {
      const tab = visible(win.tabIds[i]);
      if (tab) return tab;
    }
    return undefined;
  }

  /** Makes a tab active in its window; a hidden tab is shown first. */
  activate(tab: TabRecord, previousTabId?: number): void {
    const win = this.getWindow(tab.windowId);
    let previous = previousTabId;
    for (const id of win.tabIds) {
      const other = this.getTab(id);
      if (other.active && other !== tab) {
        other.active = false;
        previous = other.id;
      }
    }
    if (tab.hidden) this.setHidden(tab, false);
    tab.active = true;
    tab.discarded = false;
    tab.lastAccessed = this.tick();
    this.events.tabs.onActivated.emitLater({
      tabId: tab.id,
      previousTabId: previous,
      windowId: win.id,
    });
  }

  setHidden(tab: TabRecord, hidden: boolean): void {
    tab.hidden = hidden;
    this.emitUpdated(tab, { hidden });
  }

  emitUpdated(tab: TabRecord, changeInfo: ChangeInfo): void {
    this.events.tabs.onUpdated.emitLater(tab.id, changeInfo, this.snapshotTab(tab));
  }

  hasVisibleTab(win: WindowRecord): boolean {
    return win.tabIds.some((id) => !this.getTab(id).hidden);
  }

  /** F5: a window without a visible tab closes together with its hidden tabs. */
  closeIfNoVisibleTab(win: WindowRecord): void {
    if (this.windows.has(win.id) && !this.hasVisibleTab(win)) this.closeWindow(win);
  }

  /** Closes a window and all its tabs and records it as recently closed. */
  closeWindow(win: WindowRecord): void {
    const tabs = win.tabIds.map((id) => this.getTab(id));
    for (const tab of tabs) {
      this.tabs.delete(tab.id);
      this.events.tabs.onRemoved.emitLater(tab.id, { windowId: win.id, isWindowClosing: true });
    }
    this.windows.delete(win.id);
    this.closed.unshift({
      sessionId: this.newSessionId(),
      closedAt: this.tick(),
      window: { record: { ...win, tabIds: [...win.tabIds] }, tabs },
    });
    this.events.windows.onRemoved.emitLater(win.id);
    if (win.focused) {
      const next = [...this.windows.values()].at(-1);
      if (next) this.focus(next);
    }
  }

  focus(win: WindowRecord): void {
    for (const other of this.windows.values()) other.focused = other === win;
    this.events.windows.onFocusChanged.emitLater(win.id);
  }
}
