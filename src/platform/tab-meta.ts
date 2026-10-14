// Adapter for `sessions` tab and window values (spec-group-core D1): tab →
// group membership (`tgGroupId`) and window → active group (`tgActiveGroupId`).
// Values are returned raw (string or undefined); validation against the layout
// is core's job (`validGroupId`).
import { TAB_GROUP_KEY, WINDOW_ACTIVE_GROUP_KEY, type GroupLayout } from "../core/layout";
import type { PlannerState } from "../core/planner-state";

export interface TabSnapshot {
  readonly id: number;
  readonly windowId: number;
  readonly index: number;
  readonly pinned: boolean;
  readonly hidden: boolean;
  readonly active: boolean;
  readonly discarded: boolean;
  readonly lastAccessed: number;
  /** Native Firefox tab group id; read for ungrouping, never persisted. */
  readonly nativeGroupId: number;
  /** Stored `tgGroupId`, unvalidated. */
  readonly groupId: string | undefined;
}

export interface WindowSnapshot {
  readonly id: number;
  readonly focused: boolean;
  /** Stored `tgActiveGroupId`, unvalidated. */
  readonly activeGroupId: string | undefined;
  /** Tabs in strip order. */
  readonly tabs: readonly TabSnapshot[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function getTabGroup(tabId: number): Promise<string | undefined> {
  return asString(await browser.sessions.getTabValue(tabId, TAB_GROUP_KEY));
}

export async function setTabGroup(tabId: number, groupId: string): Promise<void> {
  await browser.sessions.setTabValue(tabId, TAB_GROUP_KEY, groupId);
}

export async function removeTabGroup(tabId: number): Promise<void> {
  await browser.sessions.removeTabValue(tabId, TAB_GROUP_KEY);
}

/** Writes one membership for many tabs, in parallel. */
export async function setTabsGroup(tabIds: readonly number[], groupId: string): Promise<void> {
  await Promise.all(tabIds.map((tabId) => setTabGroup(tabId, groupId)));
}

export async function getWindowActiveGroup(windowId: number): Promise<string | undefined> {
  return asString(await browser.sessions.getWindowValue(windowId, WINDOW_ACTIVE_GROUP_KEY));
}

export async function setWindowActiveGroup(windowId: number, groupId: string): Promise<void> {
  await browser.sessions.setWindowValue(windowId, WINDOW_ACTIVE_GROUP_KEY, groupId);
}

async function snapshotTab(tab: browser.tabs.Tab): Promise<TabSnapshot> {
  const id = tab.id as number;
  return {
    id,
    windowId: tab.windowId as number,
    index: tab.index,
    pinned: tab.pinned,
    hidden: tab.hidden === true,
    active: tab.active,
    discarded: tab.discarded === true,
    lastAccessed: tab.lastAccessed ?? 0,
    nativeGroupId: tab.groupId ?? -1,
    groupId: await getTabGroup(id),
  };
}

async function snapshotWindow(win: browser.windows.Window): Promise<WindowSnapshot> {
  const id = win.id as number;
  const [activeGroupId, tabs] = await Promise.all([
    getWindowActiveGroup(id),
    Promise.all((win.tabs ?? []).map(snapshotTab)),
  ]);
  return { id, focused: win.focused, activeGroupId, tabs };
}

/**
 * Reads every normal window with its tabs and all `sessions` values in
 * parallel (one round trip per value, no sequential awaits).
 */
export async function readWindows(): Promise<WindowSnapshot[]> {
  const windows = await browser.windows.getAll({ populate: true, windowTypes: ["normal"] });
  return Promise.all(windows.map(snapshotWindow));
}

/** Reads one window; `undefined` if it is gone or not a normal window. */
export async function readWindow(windowId: number): Promise<WindowSnapshot | undefined> {
  let win: browser.windows.Window;
  try {
    win = await browser.windows.get(windowId, { populate: true });
  } catch {
    return undefined;
  }
  return win.type === "normal" ? snapshotWindow(win) : undefined;
}

/** Maps window snapshots to the core planners' input (`src/core/planner-state.ts`). */
export function toPlannerState(
  layout: GroupLayout,
  windows: readonly WindowSnapshot[],
): PlannerState {
  return {
    layout,
    windows: windows.map(({ id, activeGroupId }) => ({ id, activeGroupId })),
    tabs: windows.flatMap((win) =>
      win.tabs.map((tab) => ({
        id: tab.id,
        windowId: tab.windowId,
        index: tab.index,
        pinned: tab.pinned,
        hidden: tab.hidden,
        lastAccessed: tab.lastAccessed,
        nativeGrouped: tab.nativeGroupId !== -1,
        groupId: tab.groupId,
      })),
    ),
  };
}

/** Reads the planner snapshot of all normal windows. */
export async function readPlannerState(layout: GroupLayout): Promise<PlannerState> {
  return toPlannerState(layout, await readWindows());
}
