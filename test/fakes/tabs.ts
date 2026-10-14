// Fake of `browser.tabs`: lifecycle, query, and update. Visibility, moves, and
// native groups live in tabs-visibility.ts.
import { createVisibilityMethods } from "./tabs-visibility";
import { TAB_GROUP_ID_NONE, toIds, type TabRecord, type World } from "./world";

type Tab = browser.tabs.Tab;
type QueryInfo = browser.tabs._QueryQueryInfo;

function matchesQuery(world: World, tab: TabRecord, query: QueryInfo): boolean {
  const win = world.getWindow(tab.windowId);
  const checks: [unknown, unknown][] = [
    [query.active, tab.active],
    [query.pinned, tab.pinned],
    [query.hidden, tab.hidden],
    [query.discarded, tab.discarded],
    [query.url, tab.url],
    [query.groupId, tab.groupId],
    [query.windowType, win.type],
  ];
  if (checks.some(([wanted, actual]) => wanted !== undefined && wanted !== actual)) return false;
  if (query.windowId !== undefined && world.resolveWindow(query.windowId) !== win) return false;
  const current = world.currentWindow();
  const inCurrent = query.currentWindow ?? query.lastFocusedWindow;
  return inCurrent === undefined || inCurrent === (win === current);
}

function query(world: World, queryInfo: QueryInfo = {}): Tab[] {
  const result: Tab[] = [];
  for (const win of world.windows.values()) {
    for (const id of win.tabIds) {
      const tab = world.getTab(id);
      if (matchesQuery(world, tab, queryInfo)) result.push(world.snapshotTab(tab));
    }
  }
  return result;
}

function create(world: World, props: browser.tabs._CreateCreateProperties): Tab {
  // F6: an explicit about:newtab is refused; without `url` the tab opens it.
  if (props.url === "about:newtab") throw new Error("Illegal URL: about:newtab");
  const win = world.resolveWindow(props.windowId);
  const active = props.active ?? true;
  const tab = world.newTabRecord(win.id, {
    url: props.url ?? "about:newtab",
    pinned: props.pinned ?? false,
    discarded: !active && props.discarded === true && props.url !== undefined,
  });
  world.insertTab(win, tab, props.index);
  world.events.tabs.onCreated.emitLater(world.snapshotTab(tab));
  if (active) world.activate(tab);
  return world.snapshotTab(tab);
}

function setPinned(world: World, tab: TabRecord, pinned: boolean): void {
  if (tab.pinned === pinned) return;
  const win = world.getWindow(tab.windowId);
  win.tabIds.splice(win.tabIds.indexOf(tab.id), 1);
  tab.pinned = pinned;
  // F9: pinning strips native-group membership; `sessions` values survive.
  if (pinned) tab.groupId = TAB_GROUP_ID_NONE;
  world.insertTab(win, tab, pinned ? -1 : 0);
  world.emitUpdated(tab, { pinned });
}

function update(world: World, tabId: number, props: browser.tabs._UpdateUpdateProperties): Tab {
  const tab = world.getTab(tabId);
  if (props.pinned !== undefined) setPinned(world, tab, props.pinned);
  if (props.url !== undefined && props.url !== tab.url) {
    tab.url = props.url;
    tab.title = props.url;
    tab.discarded = false;
    world.emitUpdated(tab, { url: props.url });
  }
  if (props.active === true && !tab.active) world.activate(tab);
  return world.snapshotTab(tab);
}

function recordClosedTab(world: World, tab: TabRecord, index: number): void {
  world.closed.unshift({
    sessionId: world.newSessionId(),
    closedAt: world.tick(),
    tab: { record: tab, index },
  });
}

/** Removes tabs; F5: removing the last visible tab closes the whole window. */
function remove(world: World, tabIds: number[]): void {
  const removing = new Set(tabIds.map((id) => world.getTab(id).id));
  const windows = new Set([...removing].map((id) => world.getWindow(world.getTab(id).windowId)));
  for (const win of windows) {
    const keepsVisible = win.tabIds.some((id) => !removing.has(id) && !world.getTab(id).hidden);
    if (!keepsVisible) {
      world.closeWindow(win);
      continue;
    }
    for (const id of win.tabIds.filter((tabId) => removing.has(tabId))) {
      const tab = world.getTab(id);
      const index = world.detachTab(tab);
      world.tabs.delete(id);
      recordClosedTab(world, tab, index);
      world.events.tabs.onRemoved.emitLater(id, { windowId: win.id, isWindowClosing: false });
    }
  }
}

function discard(world: World, tabIds: number[]): void {
  for (const id of tabIds) {
    const tab = world.getTab(id);
    if (tab.active || tab.discarded) continue;
    tab.discarded = true;
    world.emitUpdated(tab, { discarded: true });
  }
}

/** Test helper: sets camera/microphone/screen sharing of a tab (F1). */
function setSharingState(
  world: World,
  tabId: number,
  sharing: Partial<browser.tabs.SharingState>,
): void {
  const tab = world.getTab(tabId);
  tab.sharing = { ...tab.sharing, ...sharing };
  world.emitUpdated(tab, { sharingState: { ...tab.sharing } });
}

export function createTabsFake(world: World) {
  return {
    TAB_ID_NONE: -1,
    ...world.events.tabs,
    query: async (queryInfo?: QueryInfo) => query(world, queryInfo),
    get: async (tabId: number) => world.snapshotTab(world.getTab(tabId)),
    create: async (props: browser.tabs._CreateCreateProperties = {}) => create(world, props),
    update: async (tabId: number, props: browser.tabs._UpdateUpdateProperties) =>
      update(world, tabId, props),
    remove: async (tabIds: number | number[]) => remove(world, toIds(tabIds)),
    discard: async (tabIds: number | number[]) => discard(world, toIds(tabIds)),
    ...createVisibilityMethods(world),
    /** Test helper, not part of the API. */
    setSharingState: (tabId: number, sharing: Partial<browser.tabs.SharingState>) =>
      setSharingState(world, tabId, sharing),
    /** Removes all tabs (windows stay, empty) and all tab listeners. */
    reset(): void {
      world.tabs.clear();
      for (const win of world.windows.values()) win.tabIds = [];
      for (const event of Object.values(world.events.tabs)) event.clear();
    },
  };
}

export type FakeTabs = ReturnType<typeof createTabsFake>;
