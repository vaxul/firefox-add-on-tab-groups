import type { GroupLayout } from "./layout";

// Read-only snapshot the switch and close planners work on. The background
// reads it inside the operation lock; raw `sessions` values are passed as they
// are and validated against the layout here (D1, D4).

export interface PlannerTab {
  readonly id: number;
  readonly windowId: number;
  readonly index: number;
  readonly pinned: boolean;
  readonly hidden: boolean;
  readonly lastAccessed: number;
  /** True while the tab is in a native Firefox tab group (`groupId` !== -1). */
  readonly nativeGrouped: boolean;
  /** Raw `tgGroupId` value; may be missing or name an unknown group. */
  readonly groupId?: unknown;
}

export interface PlannerWindow {
  readonly id: number;
  /** Raw `tgActiveGroupId` value; may be missing or name an unknown group. */
  readonly activeGroupId?: unknown;
}

export interface PlannerState {
  readonly layout: GroupLayout;
  readonly windows: readonly PlannerWindow[];
  readonly tabs: readonly PlannerTab[];
}

/** Membership of a tab if it is valid; pinned tabs carry none (D7). */
export function memberOf(state: PlannerState, tab: PlannerTab): string | undefined {
  if (tab.pinned || typeof tab.groupId !== "string") return undefined;
  return hasGroup(state, tab.groupId) ? tab.groupId : undefined;
}

/** Active group of a window if it is valid. */
export function activeGroupOf(state: PlannerState, window: PlannerWindow): string | undefined {
  const value = window.activeGroupId;
  if (typeof value !== "string") return undefined;
  return hasGroup(state, value) ? value : undefined;
}

/** Non-pinned tabs with a valid membership in `groupId`, in window and index order. */
export function tabsOfGroup(state: PlannerState, groupId: string): PlannerTab[] {
  return state.tabs.filter((tab) => memberOf(state, tab) === groupId).sort(byPosition);
}

/** Id of a window other than `exceptWindowId` whose active group is `groupId`. */
export function windowShowing(
  state: PlannerState,
  groupId: string,
  exceptWindowId?: number,
): number | undefined {
  const found = state.windows.find(
    (window) => window.id !== exceptWindowId && activeGroupOf(state, window) === groupId,
  );
  return found?.id;
}

export function hasGroup(state: PlannerState, groupId: string): boolean {
  return state.layout.groups.some((group) => group.id === groupId);
}

function byPosition(a: PlannerTab, b: PlannerTab): number {
  return a.windowId - b.windowId || a.index - b.index;
}
