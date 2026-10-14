import { createGroup, deleteGroup, type GroupDeps } from "./groups";
import type { Group, GroupLayout } from "./layout";
import { tabsOfGroup, windowShowing, type PlannerState } from "./planner-state";
import { switchSteps, type SwitchSteps } from "./switch";

/**
 * Steps of closing a group, to be executed in field order (D14):
 * 1. if `createdGroup` is set, it is the new default group the window switches
 *    to; `layout` already contains it;
 * 2. if `switch` is set, run its steps first (the window keeps a visible tab,
 *    F5); they leave the closing group's tabs alone;
 * 3. `tabs.ungroup(ungroupTabIds)` (constitution: ungroup before remove);
 * 4. `tabs.remove(removeTabIds)` in one call;
 * 5. persist `layout`, which no longer contains the closed group.
 * Empty id arrays mean the call is skipped.
 */
export interface ClosePlan {
  readonly kind: "close";
  readonly groupId: string;
  readonly createdGroup: Group | undefined;
  readonly switch: SwitchSteps | undefined;
  readonly ungroupTabIds: readonly number[];
  readonly removeTabIds: readonly number[];
  readonly layout: GroupLayout;
}

/** Plans closing group `groupId`; an unknown group yields `{ kind: "none" }`. */
export function planClose(
  state: PlannerState,
  groupId: string,
  deps: GroupDeps,
): ClosePlan | { readonly kind: "none" } {
  if (!state.layout.groups.some((group) => group.id === groupId)) return { kind: "none" };
  let layout = deleteGroup(state.layout, groupId);
  let createdGroup: Group | undefined;
  let switchPlan: SwitchSteps | undefined;
  const windowId = windowShowing(state, groupId);
  if (windowId !== undefined) {
    let targetId = nextFreeGroup(state, groupId);
    if (targetId === undefined) {
      ({ layout, group: createdGroup } = createGroup(layout, deps));
      targetId = createdGroup.id;
    }
    // Planned against the layout without the closing group: its tabs are
    // removed below, so the switch neither ungroups nor hides them.
    switchPlan = switchSteps({ ...state, layout }, windowId, targetId);
  }
  const closing = tabsOfGroup(state, groupId);
  return {
    kind: "close",
    groupId,
    createdGroup,
    switch: switchPlan,
    ungroupTabIds: closing.filter((tab) => tab.nativeGrouped).map((tab) => tab.id),
    removeTabIds: closing.map((tab) => tab.id),
    layout,
  };
}

/**
 * The group the closing group's window switches to: the next group in list
 * order that is not active in any window, else the nearest previous one
 * (which covers the last row, D14).
 */
function nextFreeGroup(state: PlannerState, groupId: string): string | undefined {
  const groups = state.layout.groups;
  const index = groups.findIndex((group) => group.id === groupId);
  const free = (group: Group): boolean => windowShowing(state, group.id) === undefined;
  const after = groups.slice(index + 1).find(free);
  if (after !== undefined) return after.id;
  return groups.slice(0, index).reverse().find(free)?.id;
}
