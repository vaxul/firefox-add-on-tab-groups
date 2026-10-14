// `browser.tabs` methods that change visibility, position, or native groups:
// hide/show (F1), move incl. cross-window semantics (F3, F4), group/ungroup.
import {
  TAB_GROUP_ID_NONE,
  toIds as ids,
  type TabRecord,
  type WindowRecord,
  type World,
} from "./world";

type Tab = browser.tabs.Tab;

function isSharing(tab: TabRecord): boolean {
  return tab.sharing.camera || tab.sharing.microphone || tab.sharing.screen !== undefined;
}

/**
 * F1: skips the active tab, sharing tabs, pinned tabs, and already hidden tabs
 * (no-op); resolves with the ids it did hide.
 */
function hide(world: World, tabIds: number[]): number[] {
  const hidden: number[] = [];
  for (const tab of tabIds.map((id) => world.getTab(id))) {
    if (tab.hidden || tab.pinned || tab.active || isSharing(tab)) continue;
    world.setHidden(tab, true);
    hidden.push(tab.id);
  }
  return hidden;
}

function show(world: World, tabIds: number[]): void {
  for (const tab of tabIds.map((id) => world.getTab(id))) {
    if (tab.hidden) world.setHidden(tab, false);
  }
}

function moveWithin(world: World, tab: TabRecord, win: WindowRecord, index: number): void {
  const fromIndex = win.tabIds.indexOf(tab.id);
  win.tabIds.splice(fromIndex, 1);
  const toIndex = world.insertTab(win, tab, index);
  if (toIndex !== fromIndex) {
    world.events.tabs.onMoved.emitLater(tab.id, { windowId: win.id, fromIndex, toIndex });
  }
}

/**
 * F3: a cross-window move reveals a hidden tab unless it is discarded; a
 * discarded tab loses its `sessions` values. F4: detach and attach events are
 * delivered before the `move` promise resolves.
 */
export function moveAcross(world: World, tab: TabRecord, to: WindowRecord, index: number): void {
  const oldWindowId = tab.windowId;
  const oldPosition = world.detachTab(tab);
  world.events.tabs.onDetached.emit(tab.id, { oldWindowId, oldPosition });
  tab.groupId = TAB_GROUP_ID_NONE;
  if (tab.discarded) tab.values.clear();
  const newPosition = world.insertTab(to, tab, index);
  world.events.tabs.onAttached.emit(tab.id, { newWindowId: to.id, newPosition });
  if (tab.hidden && !tab.discarded) world.setHidden(tab, false);
}

function move(
  world: World,
  tabIds: number | number[],
  props: browser.tabs._MoveMoveProperties,
): Tab | Tab[] {
  const sources = new Set<WindowRecord>();
  let index = props.index;
  for (const id of ids(tabIds)) {
    const tab = world.getTab(id);
    const from = world.getWindow(tab.windowId);
    const to = props.windowId === undefined ? from : world.resolveWindow(props.windowId);
    if (from === to) {
      moveWithin(world, tab, to, index);
    } else {
      moveAcross(world, tab, to, index);
      sources.add(from);
    }
    if (index >= 0) index = world.indexOf(tab) + 1;
  }
  // F5 analogue: a source window left without a visible tab closes.
  for (const win of sources) world.closeIfNoVisibleTab(win);
  const moved = ids(tabIds).map((id) => world.snapshotTab(world.getTab(id)));
  return Array.isArray(tabIds) ? moved : (moved[0] as Tab);
}

function group(world: World, options: browser.tabs._GroupOptions): number {
  const tabs = ids(options.tabIds).map((id) => world.getTab(id));
  if (tabs.some((tab) => tab.pinned)) throw new Error("Cannot group pinned tabs");
  const groupId = options.groupId ?? world.nextGroupId++;
  for (const tab of tabs) tab.groupId = groupId;
  return groupId;
}

function ungroup(world: World, tabIds: number[]): void {
  for (const tab of tabIds.map((id) => world.getTab(id))) tab.groupId = TAB_GROUP_ID_NONE;
}

export function createVisibilityMethods(world: World) {
  return {
    hide: async (tabIds: number | number[]) => hide(world, ids(tabIds)),
    show: async (tabIds: number | number[]) => show(world, ids(tabIds)),
    move: async (tabIds: number | number[], props: browser.tabs._MoveMoveProperties) =>
      move(world, tabIds, props),
    group: async (options: browser.tabs._GroupOptions) => group(world, options),
    ungroup: async (tabIds: number | number[]) => ungroup(world, ids(tabIds)),
  };
}
