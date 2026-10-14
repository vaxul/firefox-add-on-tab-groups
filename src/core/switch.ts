import {
  activeGroupOf,
  hasGroup,
  memberOf,
  tabsOfGroup,
  windowShowing,
  type PlannerState,
  type PlannerTab,
} from "./planner-state";

/**
 * Steps of a group switch in window `windowId` to group `groupId`, to be
 * executed in field order (D6):
 * 1. `tabs.move(moveTabIds, { windowId, index: -1 })` as one block, then
 *    re-write `tgGroupId` = `groupId` on the moved tabs (F3);
 * 2. `tabs.show(showTabIds)`;
 * 3. activate `activateTabId`, or create one tab without `url` in the window
 *    when it is `undefined` (empty group, F6);
 * 4. set the window's `tgActiveGroupId` = `groupId`;
 * 5. `tabs.ungroup(ungroupTabIds)`;
 * 6. `tabs.hide(hideTabIds)` — tabs it skips (F1, D8) keep their membership;
 * 7. update the window's tooltip.
 * Empty id arrays mean the call is skipped.
 */
export interface SwitchSteps {
  readonly windowId: number;
  readonly groupId: string;
  readonly moveTabIds: readonly number[];
  readonly showTabIds: readonly number[];
  readonly activateTabId: number | undefined;
  readonly ungroupTabIds: readonly number[];
  readonly hideTabIds: readonly number[];
}

export type SwitchPlan =
  /** Unknown group, or the group is already active in the window. */
  | { readonly kind: "none" }
  /** The group is active in another window: focus it, change nothing else (D6 step 1). */
  | { readonly kind: "focus"; readonly windowId: number }
  | ({ readonly kind: "switch" } & SwitchSteps);

/** Plans switching window `windowId` to group `groupId` (D6, D7, D8, D13). */
export function planSwitch(state: PlannerState, windowId: number, groupId: string): SwitchPlan {
  const window = state.windows.find((candidate) => candidate.id === windowId);
  if (window === undefined || !hasGroup(state, groupId)) return { kind: "none" };
  if (activeGroupOf(state, window) === groupId) return { kind: "none" };
  const elsewhere = windowShowing(state, groupId, windowId);
  if (elsewhere !== undefined) return { kind: "focus", windowId: elsewhere };
  return { kind: "switch", ...switchSteps(state, windowId, groupId) };
}

/**
 * Switch steps without the focus check; the caller guarantees that `groupId`
 * is not active in another window. Also used by the close planner (D14).
 */
export function switchSteps(state: PlannerState, windowId: number, groupId: string): SwitchSteps {
  const incoming = tabsOfGroup(state, groupId);
  const moveTabIds = incoming
    .filter((tab) => tab.windowId !== windowId && tab.hidden)
    .map((tab) => tab.id);
  const moved = new Set(moveTabIds);
  const showTabIds = incoming
    .filter((tab) => moved.has(tab.id) || (tab.windowId === windowId && tab.hidden))
    .map((tab) => tab.id);
  const outgoing = outgoingTabs(state, windowId, groupId);
  return {
    windowId,
    groupId,
    moveTabIds,
    showTabIds,
    activateTabId: mostRecent(
      incoming.filter((tab) => tab.windowId === windowId || moved.has(tab.id)),
    ),
    ungroupTabIds: outgoing.filter((tab) => tab.nativeGrouped).map((tab) => tab.id),
    hideTabIds: outgoing.map((tab) => tab.id),
  };
}

/**
 * Visible tabs in the window that belong to another group: the outgoing
 * group's tabs plus tabs an earlier hide skipped (D8). Pinned tabs and tabs
 * without a valid membership are never hidden (D7, D9 adopts the latter).
 */
function outgoingTabs(state: PlannerState, windowId: number, groupId: string): PlannerTab[] {
  return state.tabs.filter((tab) => {
    if (tab.windowId !== windowId || tab.hidden) return false;
    const member = memberOf(state, tab);
    return member !== undefined && member !== groupId;
  });
}

function mostRecent(tabs: readonly PlannerTab[]): number | undefined {
  let best: PlannerTab | undefined;
  for (const tab of tabs) {
    if (best === undefined || tab.lastAccessed > best.lastAccessed) best = tab;
  }
  return best?.id;
}
